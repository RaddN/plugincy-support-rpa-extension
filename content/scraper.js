(() => {
  "use strict";

  if (globalThis.__plugincySupportRpaScraperLoaded) {
    return;
  }
  globalThis.__plugincySupportRpaScraperLoaded = true;

  const PLATFORM = location.hostname === "hostinger.titan.email" ? "titan-mail" : "fluent-support";
  const UI_HOST_ID = "plugincy-support-rpa-host";
  const MAX_TICKET_LENGTH = 24000;

  let ui = null;
  let captureInProgress = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "RPA_SUPPORT_PING") {
      sendResponse({
        ready: true,
        source: PLATFORM,
        authenticated: detectAuthenticatedState()
      });
      return false;
    }

    if (message.type === "RPA_CAPTURE_TICKET") {
      void captureAndQueue()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            accepted: false,
            error: error instanceof Error ? error.message : "Ticket capture failed."
          })
        );
      return true;
    }

    if (message.type === "RPA_AUTOMATION_RESULT") {
      void handleAutomationResult(message)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            handled: false,
            error: error instanceof Error ? error.message : "Could not apply the reply."
          })
        );
      return true;
    }

    return false;
  });

  if (window.top === window) {
    mountLauncher();
  }

  async function captureAndQueue() {
    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }

    captureInProgress = true;
    setUiState("working", "Reading the current ticket…");

    try {
      const ticket = scrapeCurrentTicket();
      setUiState("working", "Queued for ChatGPT…");

      const response = await chrome.runtime.sendMessage({
        type: "RPA_PROCESS_TICKET",
        ticket
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "The ticket could not be queued.");
      }

      if (response.escalated) {
        setUiState("escalated", "Credentials found — added to Today’s work.");
      } else {
        setUiState("working", "ChatGPT is preparing a draft…");
      }

      return {
        accepted: true,
        source: ticket.source,
        escalated: Boolean(response.escalated)
      };
    } finally {
      captureInProgress = false;
    }
  }

  function scrapeCurrentTicket() {
    const subject =
      PLATFORM === "titan-mail" ? extractTitanSubject() : extractFluentSubject();
    const text =
      PLATFORM === "titan-mail" ? extractTitanConversation() : extractFluentConversation();

    if (!text || text.length < 8) {
      setUiState("error", "Open a ticket or email before running automation.");
      throw new Error("No readable ticket conversation was found on this page.");
    }

    const githubUrl = extractGithubUrl(`${subject}\n${text}`);
    const ticketId = extractTicketId();

    return {
      subject: normalizeText(subject || "Customer support ticket").slice(0, 160),
      text: normalizeText(text).slice(0, MAX_TICKET_LENGTH),
      githubUrl,
      source: PLATFORM,
      ticketId,
      pageUrl: location.href
    };
  }

  function extractFluentSubject() {
    return firstText([
      "[data-testid='ticket-title']",
      "[data-testid='ticket-subject']",
      ".fs_ticket_title",
      ".fs-ticket-title",
      ".ticket_subject",
      ".ticket-subject",
      ".fluent-support-ticket-title",
      ".ticket-header h1",
      ".ticket-header h2",
      "#wpbody-content h1",
      "#wpbody-content h2"
    ]) || cleanDocumentTitle();
  }

  function extractTitanSubject() {
    return firstText([
      "[data-testid='message-subject']",
      "[data-testid*='subject']",
      "[aria-label*='Subject' i]",
      "[class*='mail-subject']",
      "[class*='message-subject']",
      "[class*='subject-line']",
      "main h1",
      "main h2"
    ]) || cleanDocumentTitle();
  }

  function extractFluentConversation() {
    const selectorGroups = [
      [
        "[data-testid='conversation-message']",
        "[data-testid*='ticket-message']",
        ".fs_conversation_item",
        ".fs-conversation-item",
        ".fs_thread_item",
        ".fs-thread-item",
        ".ticket_conversation .conversation",
        ".ticket-conversation .conversation",
        ".fluent-support-conversation",
        "[class*='conversation-item']",
        "[class*='conversation_item']",
        "[class*='ticket-message']",
        "[class*='ticket_message']"
      ],
      [
        ".fs_ticket_body",
        ".fs-ticket-body",
        ".ticket_content",
        ".ticket-content",
        "[class*='conversation']",
        "[class*='ticket-thread']"
      ]
    ];

    for (const selectors of selectorGroups) {
      const content = collectConversationText(selectors);
      if (content.length >= 20) {
        return content;
      }
    }

    return fallbackMainText();
  }

  function extractTitanConversation() {
    const iframeText = collectReadableIframeText();
    const content = collectConversationText([
      "[data-testid='message-body']",
      "[data-testid*='message-content']",
      "[data-testid*='mail-body']",
      "[class*='message-body']",
      "[class*='message-content']",
      "[class*='mail-content']",
      "[class*='mail-body']",
      "[class*='message-view'] [role='document']",
      "[role='main'] [role='document']"
    ]);

    if (content.length >= 20 && iframeText.length >= 20) {
      return `${content}\n\n${iframeText}`;
    }

    return content || iframeText || fallbackMainText();
  }

  function collectConversationText(selectors) {
    const nodes = [];
    const seenNodes = new Set();

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!seenNodes.has(node) && isMeaningfullyVisible(node)) {
          seenNodes.add(node);
          nodes.push(node);
        }
      }
    }

    nodes.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const texts = [];
    const seenTexts = new Set();
    for (const node of nodes.slice(0, 80)) {
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text.length < 3 || text.length > MAX_TICKET_LENGTH) {
        continue;
      }

      const key = text.toLowerCase();
      if (seenTexts.has(key)) {
        continue;
      }

      seenTexts.add(key);
      texts.push(text);
    }

    return removeNestedDuplicates(texts).join("\n\n").slice(0, MAX_TICKET_LENGTH);
  }

  function removeNestedDuplicates(texts) {
    return texts.filter((text, index) => {
      return !texts.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.length > text.length * 1.25 &&
          other.includes(text)
      );
    });
  }

  function collectReadableIframeText() {
    const parts = [];

    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const body = frame.contentDocument?.body;
        const text = normalizeText(body?.innerText || body?.textContent || "");
        if (text.length >= 20) {
          parts.push(text);
        }
      } catch {
        // Cross-origin message frames cannot be read by a content script.
      }
    }

    return parts.join("\n\n").slice(0, MAX_TICKET_LENGTH);
  }

  function fallbackMainText() {
    const root =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("#wpbody-content");

    if (!root) {
      return "";
    }

    const clone = root.cloneNode(true);
    for (const unwanted of clone.querySelectorAll(
      "nav, header, footer, aside, script, style, form, button, [role='navigation']"
    )) {
      unwanted.remove();
    }

    return normalizeText(clone.innerText || clone.textContent || "").slice(
      0,
      MAX_TICKET_LENGTH
    );
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!isMeaningfullyVisible(node)) {
          continue;
        }

        const text = normalizeText(node.innerText || node.textContent || "");
        if (text.length >= 2 && text.length <= 300) {
          return text;
        }
      }
    }

    return "";
  }

  function cleanDocumentTitle() {
    return normalizeText(document.title)
      .replace(/\s*[|–—-]\s*(?:WordPress|Titan|Hostinger|Fluent Support).*$/i, "")
      .slice(0, 160);
  }

  function extractGithubUrl(text) {
    const matches = String(text || "").match(/https:\/\/github\.com\/[^\s<>"')\]]+/gi);
    if (!matches?.length) {
      return "";
    }

    return matches[0].replace(/[.,;:!?]+$/, "").slice(0, 600);
  }

  function extractTicketId() {
    const urlMatch = location.href.match(/(?:tickets?|ticket)[/=/-](\d+)/i);
    if (urlMatch) {
      return urlMatch[1];
    }

    const visibleMatch = firstText([
      "[data-testid='ticket-id']",
      ".ticket-id",
      ".fs_ticket_id",
      "[class*='ticket-number']"
    ]).match(/#?\s*(\d{2,})/);

    return visibleMatch?.[1] || "";
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isMeaningfullyVisible(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  async function handleAutomationResult(message) {
    if (message.status === "escalated") {
      setUiState("escalated", "Escalated to Today’s work for developer review.");
      return { handled: true, escalated: true };
    }

    if (message.status === "error") {
      setUiState("error", message.error || "Automation stopped before drafting.");
      return { handled: true, error: true };
    }

    if (message.status !== "draft" || !message.response) {
      return { handled: false };
    }

    setUiState("working", "Inserting the draft reply…");
    const editor = await findOrOpenReplyEditor();
    if (!editor) {
      setUiState("error", "Draft ready, but the reply editor was not found.");
      throw new Error("The reply editor could not be found. Open Reply and try again.");
    }

    setEditorValue(editor, message.response);

    const settingsResult = await chrome.storage.sync.get("rpa_settings");
    const autoSend = Boolean(settingsResult.rpa_settings?.autoSendReplies);
    if (autoSend) {
      const sent = await clickSupportSendButton();
      if (!sent) {
        setUiState("draft", "Draft inserted. Review and send it manually.");
        return { handled: true, drafted: true, sent: false };
      }

      setUiState("success", "Reply sent automatically.");
      return { handled: true, drafted: true, sent: true };
    }

    setUiState("draft", "Draft inserted. Review before sending.");
    return { handled: true, drafted: true, sent: false };
  }

  async function findOrOpenReplyEditor() {
    let editor = findReplyEditor();
    if (editor) {
      return editor;
    }

    const replyButton = findButtonBySelectorsOrText(
      [
        "[data-testid='reply-button']",
        "button[aria-label*='Reply' i]",
        "button[class*='reply']",
        "[role='button'][aria-label*='Reply' i]"
      ],
      ["reply", "respond"]
    );

    if (replyButton) {
      replyButton.click();
      editor = await waitFor(findReplyEditor, 8000);
    }

    return editor;
  }

  function findReplyEditor() {
    const selectors =
      PLATFORM === "titan-mail"
        ? [
            "[data-testid='composer'] [contenteditable='true']",
            "[data-testid*='reply'] [contenteditable='true']",
            "[class*='composer'] [contenteditable='true']",
            "[class*='reply'] [contenteditable='true']",
            "textarea[aria-label*='message' i]",
            "textarea[placeholder*='reply' i]"
          ]
        : [
            "[data-testid='reply-editor'] [contenteditable='true']",
            ".fs_reply_box textarea",
            ".fs-reply-box textarea",
            ".ticket-reply textarea",
            ".ql-editor[contenteditable='true']",
            ".ProseMirror[contenteditable='true']",
            "[class*='reply'] textarea",
            "[class*='reply'] [contenteditable='true']"
          ];

    for (const selector of selectors) {
      for (const candidate of document.querySelectorAll(selector)) {
        if (
          (candidate instanceof HTMLTextAreaElement ||
            candidate instanceof HTMLInputElement ||
            candidate instanceof HTMLElement) &&
          isMeaningfullyVisible(candidate) &&
          !candidate.hasAttribute("disabled")
        ) {
          return candidate;
        }
      }
    }

    return null;
  }

  function setEditorValue(editor, value) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const prototype =
        editor instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(editor, value);
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || normalizeText(editor.innerText).length < normalizeText(value).length * 0.8) {
      editor.replaceChildren();
      const lines = String(value).split("\n");
      lines.forEach((line, index) => {
        if (index > 0) {
          editor.append(document.createElement("br"));
        }
        editor.append(document.createTextNode(line));
      });
    }

    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
      })
    );
  }

  async function clickSupportSendButton() {
    await delay(250);
    const sendButton = findButtonBySelectorsOrText(
      [
        "[data-testid='send-reply-button']",
        "[data-testid='send-button']",
        "button[aria-label*='Send' i]",
        ".fs_reply_box button[type='submit']",
        ".fs-reply-box button[type='submit']",
        "[class*='reply'] button[type='submit']",
        "[class*='composer'] button[type='submit']"
      ],
      ["send reply", "submit reply", "send"]
    );

    if (!sendButton || sendButton.disabled || sendButton.getAttribute("aria-disabled") === "true") {
      return false;
    }

    sendButton.click();
    return true;
  }

  function findButtonBySelectorsOrText(selectors, labels) {
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find(
        (candidate) =>
          candidate instanceof HTMLElement &&
          isMeaningfullyVisible(candidate) &&
          candidate.getAttribute("aria-disabled") !== "true"
      );
      if (element) {
        return element;
      }
    }

    const normalizedLabels = labels.map((label) => label.toLowerCase());
    return [...document.querySelectorAll("button, [role='button']")].find((candidate) => {
      if (!(candidate instanceof HTMLElement) || !isMeaningfullyVisible(candidate)) {
        return false;
      }
      const text = normalizeText(
        candidate.getAttribute("aria-label") || candidate.textContent || ""
      ).toLowerCase();
      return normalizedLabels.some((label) => text === label || text.startsWith(`${label} `));
    });
  }

  function detectAuthenticatedState() {
    if (PLATFORM === "fluent-support") {
      return Boolean(document.querySelector("#wpadminbar, #wpwrap, #wpbody-content"));
    }

    return !Boolean(
      document.querySelector(
        "form[action*='login'], input[type='password'], [data-testid*='login']"
      )
    );
  }

  function mountLauncher() {
    if (document.getElementById(UI_HOST_ID)) {
      return;
    }

    const host = document.createElement("div");
    host.id = UI_HOST_ID;
    host.style.position = "fixed";
    host.style.right = "20px";
    host.style.bottom = "20px";
    host.style.zIndex = "2147483647";
    host.style.all = "initial";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; }
        .panel {
          width: 260px;
          box-sizing: border-box;
          padding: 10px;
          border: 1px solid #d7deea;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 18px 42px rgba(8, 28, 63, 0.18);
          color: #10213d;
          font: 500 13px/1.4 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .row { display: flex; align-items: center; gap: 10px; }
        .mark {
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 10px;
          background: #082b59;
          color: #ffffff;
          font-weight: 800;
          letter-spacing: -0.03em;
        }
        .copy { min-width: 0; flex: 1; }
        .title { margin: 0; font-weight: 750; font-size: 13px; color: #10213d; }
        .status {
          overflow: hidden;
          margin: 2px 0 0;
          color: #607089;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        button {
          width: 100%;
          margin-top: 9px;
          padding: 9px 12px;
          border: 0;
          border-radius: 9px;
          background: #0967e8;
          color: white;
          cursor: pointer;
          font: 700 12px/1.2 inherit;
          transition: background 140ms ease, transform 140ms ease;
        }
        button:hover { background: #0759ca; }
        button:active { transform: translateY(1px); }
        button:focus-visible { outline: 3px solid rgba(9, 103, 232, .25); outline-offset: 2px; }
        button:disabled { cursor: wait; opacity: .68; }
        .panel[data-state="success"] .mark,
        .panel[data-state="draft"] .mark { background: #087a55; }
        .panel[data-state="escalated"] .mark { background: #b56806; }
        .panel[data-state="error"] .mark { background: #b42318; }
      </style>
      <section class="panel" data-state="ready" aria-live="polite">
        <div class="row">
          <span class="mark" aria-hidden="true">P</span>
          <div class="copy">
            <p class="title">Support RPA</p>
            <p class="status">Ready to draft this ticket.</p>
          </div>
        </div>
        <button type="button">Draft with ChatGPT</button>
      </section>
    `;

    document.documentElement.append(host);
    ui = {
      panel: shadow.querySelector(".panel"),
      status: shadow.querySelector(".status"),
      button: shadow.querySelector("button")
    };

    ui.button.addEventListener("click", () => {
      void captureAndQueue().catch((error) => {
        setUiState(
          "error",
          error instanceof Error ? error.message : "Ticket automation failed."
        );
      });
    });
  }

  function setUiState(state, status) {
    if (!ui) {
      return;
    }

    ui.panel.dataset.state = state;
    ui.status.textContent = status;
    ui.button.disabled = state === "working";
    ui.button.textContent = state === "working" ? "Working…" : "Draft with ChatGPT";
  }

  async function waitFor(getValue, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = getValue();
      if (value) {
        return value;
      }
      await delay(200);
    }
    return null;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
})();
