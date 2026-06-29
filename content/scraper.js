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

  async function captureAndQueue(options = {}) {
    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }

    captureInProgress = true;
    openDraftSidebar();
    setDraftResponse("");
    setUiState("working", "Reading the current ticket…");

    try {
      const ticket = options.ticket || scrapeCurrentTicket();
      setUiState("working", "Queued for ChatGPT…");

      const response = await safeRuntimeSendMessage({
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

  function scrapeCurrentTicket(options = {}) {
    if (options.requireDetail && !isLikelyTicketDetailOpen()) {
      throw new Error("A readable ticket detail view is not open yet.");
    }

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

  function isLikelyTicketDetailOpen() {
    const selectors =
      PLATFORM === "titan-mail"
        ? [
            "[data-testid='message-subject']",
            "[data-testid='message-body']",
            "[data-testid*='message-content']",
            "[class*='message-subject']",
            "[class*='message-body']",
            "[class*='message-view'] [role='document']",
            "[role='main'] [role='document']"
          ]
        : [
            "[data-testid='ticket-title']",
            "[data-testid='ticket-subject']",
            "[data-testid='conversation-message']",
            "[data-testid*='ticket-message']",
            ".fs_conversation_item",
            ".fs-conversation-item",
            ".fs_thread_item",
            ".fs-thread-item",
            ".ticket_conversation .conversation",
            ".ticket-conversation .conversation",
            ".fluent-support-conversation",
            ".fs_ticket_body",
            ".fs-ticket-body",
            ".ticket_content",
            ".ticket-content",
            ".ticket-reply",
            ".fs_reply_box",
            ".fs-reply-box"
          ];

    const hasVisibleDetailNode = selectors.some((selector) =>
      [...document.querySelectorAll(selector)].some(isMeaningfullyVisible)
    );
    if (hasVisibleDetailNode) {
      return true;
    }

    if (PLATFORM === "fluent-support") {
      return /#\/tickets\/[^/?#]+/i.test(location.hash);
    }

    return /\/mail\//i.test(location.pathname) && collectReadableIframeText().length >= 30;
  }

  function createTicketSignature(ticket) {
    const sourceKey = [
      ticket.source,
      ticket.ticketId,
      ticket.subject,
      ticket.pageUrl,
      ticket.text.slice(0, 500)
    ].join("|");

    let hash = 0;
    for (let index = 0; index < sourceKey.length; index += 1) {
      hash = (hash << 5) - hash + sourceKey.charCodeAt(index);
      hash |= 0;
    }

    return `${ticket.source}:${ticket.ticketId || "ticket"}:${Math.abs(hash)}`;
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
      const content = collectConversationBlocks(selectors, "Conversation message");
      if (content.length >= 20) {
        return content;
      }
    }

    return fallbackMainText();
  }

  function extractTitanConversation() {
    const iframeText = collectReadableIframeText();
    const content = collectConversationBlocks([
      "[data-testid='message-body']",
      "[data-testid*='message-content']",
      "[data-testid*='mail-body']",
      "[class*='message-body']",
      "[class*='message-content']",
      "[class*='mail-content']",
      "[class*='mail-body']",
      "[class*='message-view'] [role='document']",
      "[role='main'] [role='document']"
    ], "Email message");
    const iframeBlock = iframeText ? `[Email body iframe]\n${iframeText}` : "";

    if (content.length >= 20 && iframeBlock.length >= 20) {
      return `${content}\n\n${iframeBlock}`;
    }

    return content || iframeBlock || fallbackMainText();
  }

  function collectConversationBlocks(selectors, label) {
    const content = collectConversationText(selectors);
    if (content.length < 20) {
      return content;
    }

    const parts = content
      .split(/\n{2,}/)
      .map((part) => normalizeText(part))
      .filter((part) => part.length >= 3);

    if (parts.length <= 1) {
      return `[${label} 1]\n${content}`.slice(0, MAX_TICKET_LENGTH);
    }

    return parts
      .map((part, index) => `[${label} ${index + 1}]\n${part}`)
      .join("\n\n")
      .slice(0, MAX_TICKET_LENGTH);
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
      openDraftSidebar();
      setDraftResponse(message.summary || "This ticket was added to To-Do for developer review.");
      setUiState("escalated", "Escalated to Today’s work for developer review.");
      return { handled: true, escalated: true };
    }

    if (message.status === "error") {
      openDraftSidebar();
      setUiState("error", message.error || "Automation stopped before drafting.");
      return { handled: true, error: true };
    }

    if (message.status !== "draft" || !message.response) {
      return { handled: false };
    }

    openDraftSidebar();
    setDraftResponse(message.response);
    setUiState("draft", "Draft ready. Copy it from the sidebar.");
    return { handled: true, drafted: true, copied: false, inserted: false, sent: false };

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

    mountSupportSidebar();
  }

  function mountSupportSidebar() {
    const host = document.createElement("div");
    host.id = UI_HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0 0 0 auto";
    host.style.zIndex = "2147483647";
    host.dataset.open = "false";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; }
        .launcher {
          position: fixed;
          right: 20px;
          bottom: 20px;
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          gap: 9px;
          padding: 0 16px;
          border: 0;
          border-radius: 999px;
          background: #0967e8;
          box-shadow: 0 18px 42px rgba(9, 103, 232, .28);
          color: #ffffff;
          cursor: pointer;
          font: 800 13px/1 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: -0.01em;
        }
        .launcher:hover { background: #0759ca; }
        .launcher:disabled { cursor: wait; opacity: .68; }
        .launcher:focus-visible,
        .copy-button:focus-visible,
        .regenerate-button:focus-visible,
        .close-button:focus-visible {
          outline: 3px solid rgba(9, 103, 232, .24);
          outline-offset: 3px;
        }
        .sidebar {
          position: fixed;
          top: 18px;
          right: 18px;
          bottom: 18px;
          display: grid;
          width: min(430px, calc(100vw - 36px));
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          overflow: hidden;
          border: 1px solid #d7deea;
          border-radius: 22px;
          background: radial-gradient(circle at 90% 0%, rgba(9, 103, 232, .14), transparent 30%), #ffffff;
          box-shadow: 0 26px 70px rgba(8, 28, 63, .26);
          color: #10213d;
          font: 500 13px/1.5 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          transform: translateX(calc(100% + 24px));
          transition: transform 180ms ease;
        }
        :host([data-open="true"]) .sidebar { transform: translateX(0); }
        :host([data-open="true"]) .launcher { display: none; }
        header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 18px 12px;
          border-bottom: 1px solid #e8edf5;
        }
        h2 {
          margin: 0;
          color: #10213d;
          font-size: 18px;
          letter-spacing: -0.03em;
          line-height: 1.15;
        }
        .subtitle {
          margin: 5px 0 0;
          color: #61728c;
          font-size: 12px;
        }
        .close-button {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 0;
          border-radius: 10px;
          background: #f2f5f9;
          color: #44546a;
          cursor: pointer;
          font-size: 18px;
        }
        .status-card {
          margin: 14px 18px;
          padding: 12px;
          border: 1px solid #d7deea;
          border-radius: 14px;
          background: #f8fbff;
        }
        .status-label {
          margin: 0;
          color: #0967e8;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        .status {
          margin: 4px 0 0;
          color: #44546a;
          font-size: 12px;
        }
        .draft-wrap {
          min-height: 0;
          margin: 0 18px 14px;
          overflow: auto;
          border: 1px solid #d7deea;
          border-radius: 15px;
          background: #ffffff;
        }
        .draft {
          min-height: 220px;
          margin: 0;
          padding: 14px;
          color: #10213d;
          font: 500 13px/1.58 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .draft.is-empty {
          display: grid;
          place-items: center;
          color: #8a98ad;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          text-align: center;
        }
        footer {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 10px;
          padding: 0 18px 18px;
        }
        footer button {
          min-height: 40px;
          border: 0;
          border-radius: 11px;
          cursor: pointer;
          font: 800 12px/1 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .copy-button {
          background: #0967e8;
          color: #ffffff;
        }
        .copy-button:disabled {
          cursor: not-allowed;
          opacity: .52;
        }
        .regenerate-button {
          background: #eef4ff;
          color: #0967e8;
        }
        .panel[data-state="draft"] .status-label,
        .panel[data-state="success"] .status-label { color: #087a55; }
        .panel[data-state="escalated"] .status-label { color: #b56806; }
        .panel[data-state="error"] .status-label { color: #b42318; }
      </style>
      <button class="launcher" type="button">Generate GPT reply</button>
      <aside class="sidebar panel" data-state="ready" aria-live="polite" aria-label="ChatGPT support draft">
        <header>
          <div>
            <h2>ChatGPT draft sidebar</h2>
            <p class="subtitle">Generates only after you click. Copy the reply when it is ready.</p>
          </div>
          <button class="close-button" type="button" aria-label="Close draft sidebar">×</button>
        </header>
        <section class="status-card">
          <p class="status-label">Ready</p>
          <p class="status">Open a ticket or email, then generate a reply.</p>
        </section>
        <div class="draft-wrap">
          <pre class="draft is-empty">No draft yet. Click Generate to send the full visible conversation to ChatGPT.</pre>
        </div>
        <footer>
          <button class="copy-button" type="button" disabled>Copy draft</button>
          <button class="regenerate-button" type="button">Generate again</button>
        </footer>
      </aside>
    `;

    document.documentElement.append(host);
    ui = {
      host,
      panel: shadow.querySelector(".panel"),
      statusLabel: shadow.querySelector(".status-label"),
      status: shadow.querySelector(".status"),
      button: shadow.querySelector(".launcher"),
      regenerateButton: shadow.querySelector(".regenerate-button"),
      copyButton: shadow.querySelector(".copy-button"),
      closeButton: shadow.querySelector(".close-button"),
      draft: shadow.querySelector(".draft"),
      lastDraft: ""
    };

    const runGeneration = () => {
      openDraftSidebar();
      void captureAndQueue().catch((error) => {
        setUiState("error", error instanceof Error ? error.message : "Ticket automation failed.");
      });
    };

    ui.button.addEventListener("click", runGeneration);
    ui.regenerateButton.addEventListener("click", runGeneration);
    ui.copyButton.addEventListener("click", () => {
      void copyDraftToClipboard();
    });
    ui.closeButton.addEventListener("click", () => {
      ui.host.dataset.open = "false";
    });
  }

  function openDraftSidebar() {
    if (!ui) {
      mountLauncher();
    }
    if (ui?.host) {
      ui.host.dataset.open = "true";
    }
  }

  function setDraftResponse(value) {
    if (!ui?.draft) {
      return;
    }

    const draft = String(value || "").trim();
    ui.lastDraft = draft;
    ui.draft.textContent = draft || "Waiting for ChatGPT response...";
    ui.draft.classList.toggle("is-empty", !draft);
    if (ui.copyButton) {
      ui.copyButton.disabled = !draft;
    }
  }

  async function copyDraftToClipboard() {
    const draft = String(ui?.lastDraft || "").trim();
    if (!draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);
      setUiState("success", "Draft copied. Paste it into the support reply editor when ready.");
    } catch {
      setUiState("error", "Copy failed. Select the draft text and copy manually.");
    }
  }

  function setUiState(state, status) {
    if (!ui) {
      return;
    }

    ui.panel.dataset.state = state;
    if (ui.statusLabel) {
      ui.statusLabel.textContent =
        state === "working"
          ? "Working"
          : state === "draft"
            ? "Draft ready"
            : state === "success"
              ? "Copied"
              : state === "escalated"
                ? "Escalated"
                : state === "error"
                  ? "Needs attention"
                  : "Ready";
    }
    ui.status.textContent = status;
    ui.button.disabled = state === "working";
    ui.button.textContent = state === "working" ? "Working..." : "Generate GPT reply";
    if (ui.regenerateButton) {
      ui.regenerateButton.disabled = state === "working";
      ui.regenerateButton.textContent = state === "working" ? "Generating..." : "Generate again";
    }
  }

  async function safeRuntimeSendMessage(payload) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) {
        return {
          ok: false,
          error: "Extension context was reloaded. Reload this support tab and try again."
        };
      }
      return await chrome.runtime.sendMessage(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (/Extension context invalidated|context invalidated/i.test(message)) {
        return {
          ok: false,
          error: "Extension context was reloaded. Reload this support tab and try again."
        };
      }
      return {
        ok: false,
        error: message || "The extension service worker could not be reached."
      };
    }
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
