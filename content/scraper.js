(() => {
  "use strict";

  if (globalThis.__plugincySupportRpaScraperLoaded) {
    return;
  }
  globalThis.__plugincySupportRpaScraperLoaded = true;

  const core = globalThis.PlugincyWorkflowCore;
  const PLATFORM =
    location.hostname === "hostinger.titan.email" ? "titan-mail" : "fluent-support";
  const UI_HOST_ID = "plugincy-support-rpa-launcher";
  const MAX_CAPTURE_LENGTH = 200000;

  let ui = null;
  let captureInProgress = false;
  let lastRoute = location.href;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "RPA_SUPPORT_PING") {
      sendResponse({
        ready: true,
        source: PLATFORM,
        authenticated: detectAuthenticatedState(),
        detailOpen: isLikelyTicketDetailOpen()
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
    syncRouteUi();
    window.addEventListener("hashchange", syncRouteUi);
    setInterval(() => {
      if (lastRoute !== location.href || !ui) {
        lastRoute = location.href;
        syncRouteUi();
      }
    }, 1000);
  }

  async function captureAndQueue() {
    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }
    if (!isLikelyTicketDetailOpen()) {
      throw new Error(
        PLATFORM === "fluent-support"
          ? "Open a Fluent Support ticket detail route before processing."
          : "Open a Titan email before processing."
      );
    }

    captureInProgress = true;
    setUiState("working", "Reading ticket...");

    try {
      await safeRuntimeSendMessage({ type: "RPA_OPEN_SIDE_PANEL" });
      await prepareConversationForCapture();
      const ticket = scrapeCurrentTicket({ requireDetail: true });
      setUiState("queued", "Queued");
      const response = await safeRuntimeSendMessage({
        type: "RPA_PROCESS_TICKET",
        ticket
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "The ticket could not be queued.");
      }

      if (response.escalated) {
        setUiState("escalated", "Manual task created");
      } else {
        setUiState("processing", "Processing");
      }

      return {
        accepted: true,
        source: ticket.source,
        escalated: Boolean(response.escalated),
        status: response.status || "queued"
      };
    } catch (error) {
      setUiState("error", error instanceof Error ? error.message : "Ticket automation failed.");
      throw error;
    } finally {
      captureInProgress = false;
    }
  }

  async function createFixedReplyDraft() {
    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }
    if (!isLikelyTicketDetailOpen()) {
      throw new Error(
        PLATFORM === "fluent-support"
          ? "Open a Fluent Support ticket detail route before processing."
          : "Open a Titan email before processing."
      );
    }

    captureInProgress = true;
    setUiState("working", "Reading ticket...");

    try {
      await safeRuntimeSendMessage({ type: "RPA_OPEN_SIDE_PANEL" });
      await prepareConversationForCapture();
      const ticket = scrapeCurrentTicket({ requireDetail: true });
      const response = await safeRuntimeSendMessage({
        type: "RPA_CREATE_FIXED_REPLY",
        ticket
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "The fixed reply could not be created.");
      }

      setUiState("draft", "Fixed reply ready");
      return {
        accepted: true,
        source: ticket.source,
        status: response.status || "draft_ready"
      };
    } catch (error) {
      setUiState("error", error instanceof Error ? error.message : "Fixed reply failed.");
      throw error;
    } finally {
      captureInProgress = false;
    }
  }

  async function createReviewRequestDraft() {
    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }
    if (!isLikelyTicketDetailOpen()) {
      throw new Error(
        PLATFORM === "fluent-support"
          ? "Open a Fluent Support ticket detail route before processing."
          : "Open a Titan email before processing."
      );
    }

    captureInProgress = true;
    setUiState("working", "Reading ticket...");

    try {
      await safeRuntimeSendMessage({ type: "RPA_OPEN_SIDE_PANEL" });
      await prepareConversationForCapture();
      const ticket = scrapeCurrentTicket({ requireDetail: true });
      const response = await safeRuntimeSendMessage({
        type: "RPA_CREATE_REVIEW_REQUEST",
        ticket
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "The review request could not be created.");
      }

      setUiState("draft", "Review request ready");
      return {
        accepted: true,
        source: ticket.source,
        status: response.status || "draft_ready"
      };
    } catch (error) {
      setUiState("error", error instanceof Error ? error.message : "Review request failed.");
      throw error;
    } finally {
      captureInProgress = false;
    }
  }

  async function createCustomReplyDraft() {
    const customReplyText = normalizeMultiline(
      window.prompt("Type your rough reply for ChatGPT to polish:") || ""
    ).slice(0, 3000);
    if (!customReplyText) {
      setUiState("ready", "Ready");
      return { accepted: false, cancelled: true };
    }

    if (captureInProgress) {
      return {
        accepted: false,
        error: "This ticket is already being processed."
      };
    }
    if (!isLikelyTicketDetailOpen()) {
      throw new Error(
        PLATFORM === "fluent-support"
          ? "Open a Fluent Support ticket detail route before processing."
          : "Open a Titan email before processing."
      );
    }

    captureInProgress = true;
    setUiState("working", "Reading ticket...");

    try {
      await safeRuntimeSendMessage({ type: "RPA_OPEN_SIDE_PANEL" });
      await prepareConversationForCapture();
      const ticket = scrapeCurrentTicket({ requireDetail: true });
      setUiState("queued", "Queued");
      const response = await safeRuntimeSendMessage({
        type: "RPA_PROCESS_CUSTOM_REPLY",
        ticket,
        customReplyText
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "The custom reply could not be queued.");
      }

      setUiState("processing", "Processing");
      return {
        accepted: true,
        source: ticket.source,
        status: response.status || "queued"
      };
    } catch (error) {
      setUiState("error", error instanceof Error ? error.message : "Custom reply failed.");
      throw error;
    } finally {
      captureInProgress = false;
    }
  }

  function scrapeCurrentTicket({ requireDetail = true } = {}) {
    if (requireDetail && !isLikelyTicketDetailOpen()) {
      throw new Error("A readable ticket detail view is not open.");
    }

    const subject =
      PLATFORM === "titan-mail" ? extractTitanSubject() : extractFluentSubject();
    const messages =
      PLATFORM === "titan-mail" ? extractTitanMessages(subject) : extractFluentMessages();
    const text =
      core?.formatConversationMessages(messages) ||
      (PLATFORM === "titan-mail" ? extractTitanConversation() : extractFluentConversation());
    if (!text || text.length < 8) {
      throw new Error("No readable ticket conversation was found on this page.");
    }
    const secretResult = core?.detectSecrets(subject, text) || {
      found: false,
      types: []
    };

    return {
      subject: normalizeMultiline(subject || "Customer support ticket").slice(0, 1000),
      text: normalizeMultiline(text).slice(0, MAX_CAPTURE_LENGTH),
      githubUrl: extractGithubUrl(`${subject}\n${text}`),
      source: PLATFORM,
      ticketId: extractTicketId(),
      customer: extractCustomer(),
      messages,
      secretTypes: secretResult.found ? secretResult.types : [],
      pageUrl: location.href
    };
  }

  function isLikelyTicketDetailOpen() {
    if (PLATFORM === "fluent-support") {
      return Boolean(
        core?.isFluentSupportTicketUrl(location.href) &&
          document.querySelector(
            ".fs_ticket_body .fs_ticket_title, .fs_threads_container .fs_conversation_message"
          )
      );
    }

    return Boolean(
      document.querySelector(
        "[data-testid='message-subject'], [data-testid='message-item-area'], .message-item-area, .message-subject"
      ) &&
        (document.querySelector(
          "[data-testid='message-item-area'], .message-item-area, .message-item-wrap"
        ) ||
          collectReadableIframeText())
    );
  }

  function extractFluentSubject() {
    return (
      firstText([
        ".fs_ticket_body .fs_ticket_title span",
        ".fs_ticket_body .fs_ticket_title",
        "[data-testid='ticket-title']",
        "[data-testid='ticket-subject']"
      ]) || cleanDocumentTitle()
    );
  }

  function extractTitanSubject() {
    return (
      firstText([
        "[data-testid='message-subject']",
        "[data-testid='thread-subject-text']",
        ".message-subject",
        ".message-subject-wrap .subject",
        "[class*='message-subject']"
      ]) || cleanDocumentTitle()
    );
  }

  function extractFluentConversation() {
    return (core?.formatConversationMessages(extractFluentMessages()) || "").slice(
      0,
      MAX_CAPTURE_LENGTH
    );
  }

  function extractFluentMessages() {
    const messages = [];
    const nodes = [
      ...document.querySelectorAll(
        ".fs_threads_container .fs_conversation_message, article.fs_conversation_message"
      )
    ].filter(isMeaningfullyVisible);

    for (const node of nodes) {
      const body = node.querySelector(".fs_message_body");
      const text = normalizeMultiline(body?.innerText || body?.textContent || "");
      if (text.length < 3) {
        continue;
      }
      const name = normalizeText(
        node.querySelector(".fs_message_name")?.textContent || "Conversation"
      );
      const role = normalizeText(node.querySelector(".fs_message_role")?.textContent || "");
      messages.push({
        role: normalizeConversationRole(role, name),
        author: name,
        sentAt: extractMessageTime(node),
        text
      });
    }

    return dedupeMessages(messages);
  }

  function extractTitanConversation() {
    return (core?.formatConversationMessages(extractTitanMessages()) || "").slice(
      0,
      MAX_CAPTURE_LENGTH
    );
  }

  function extractTitanMessages(subject = "") {
    const bodies = [];
    const wraps = [
      ...document.querySelectorAll(
        "[data-testid='message-item-wrap'], .message-item-wrap"
      )
    ].filter((node, index, nodes) => nodes.indexOf(node) === index);

    for (const wrap of wraps) {
      if (!isMeaningfullyVisible(wrap)) {
        continue;
      }
      const author = extractTitanMessageSender(wrap) || extractCustomer();
      const iframeText = collectReadableIframeText(wrap);
      const area =
        wrap.querySelector("[data-testid='message-item-area'], .message-item-area") ||
        wrap;
      const fallbackBody = area.querySelector(
        "[data-testid='message-body'], [data-testid*='message-content'], .message-body, .mail-message-body"
      );
      const clone = fallbackBody ? cloneTitanBody(fallbackBody) : null;
      const fallbackText = clone
        ? core?.cleanTitanText(clone.innerText || clone.textContent || "")
        : "";
      const text = iframeText || fallbackText;
      if (text?.length < 3) {
        continue;
      }
      bodies.push({
        role: normalizeTitanMessageRole(author, wrap),
        author,
        sentAt: extractMessageTime(wrap),
        text
      });
    }

    if (!wraps.length) {
      const iframeText = collectReadableIframeText();
      if (iframeText) {
        const author = extractCustomer();
        bodies.push({
          role: normalizeTitanMessageRole(author, document.body),
          author,
          sentAt: "",
          text: iframeText
        });
      }
    }

    if (!bodies.length && subject) {
      return [];
    }

    return dedupeMessages(bodies);
  }

  function cloneTitanBody(node) {
    const clone = node.cloneNode(true);
    for (const unwanted of clone.querySelectorAll(
      [
        "script",
        "style",
        "button",
        "nav",
        "footer",
        "blockquote",
        "[data-testid*='tracking']",
        "[class*='tracking']",
        "[class*='signature']",
        "[class*='quoted']",
        "[class*='task']",
        "[data-testid='message-header-right']",
        "[data-testid='message-actions-wrap']",
        "[data-testid='reply-with-ai-container']",
        "[data-testid='message-add-to-task-button']",
        "[data-testid='footer-container']",
        "[data-testid='header-container']",
        "[data-testid='iframe-container']",
        "iframe",
        "[aria-label*='tracking' i]",
        "img[width='1']",
        "img[height='1']"
      ].join(",")
    )) {
      unwanted.remove();
    }
    return clone;
  }

  function collectReadableIframeText(root = document) {
    const parts = [];
    const frames =
      root === document
        ? document.querySelectorAll(
            "[data-testid='message-item-wrap'] [data-testid='iframe-container'] iframe, .message-item-wrap .iframe-container iframe"
          )
        : root.querySelectorAll(
            "[data-testid='iframe-container'] iframe, .iframe-container iframe"
          );
    for (const frame of frames) {
      try {
        const body = frame.contentDocument?.body;
        if (!body) {
          continue;
        }
        const clone = cloneTitanBody(body);
        const text = core?.cleanTitanText(clone.innerText || clone.textContent || "");
        if (text?.length >= 3) {
          parts.push(text);
        }
      } catch {
        // Cross-origin message frames are intentionally ignored.
      }
    }
    return dedupeTextBlocks(parts).join("\n\n");
  }

  async function prepareConversationForCapture() {
    if (PLATFORM !== "titan-mail") {
      return;
    }

    const collapsed = [
      ...document.querySelectorAll(
        "[data-testid='message-item-wrap'].collapsed, .message-item-wrap.collapsed"
      )
    ].filter(isMeaningfullyVisible);
    for (const wrap of collapsed) {
      const opener =
        wrap.querySelector("[data-testid='message-item-area'], .message-item-area") ||
        wrap;
      opener.click();
      await waitFor(
        () =>
          !wrap.isConnected ||
          !wrap.classList.contains("collapsed") ||
          wrap.querySelector("[data-testid='iframe-container'] iframe"),
        2500
      );
      await delay(150);
    }
  }

  function extractCustomer() {
    if (PLATFORM === "fluent-support") {
      const starter =
        document.querySelector(".fs_conversation_message.fs_thread_starter") ||
        [...document.querySelectorAll(".fs_conversation_message")].find((node) =>
          /\(customer\)/i.test(node.querySelector(".fs_message_role")?.textContent || "")
        );
      return (
        normalizeText(starter?.querySelector(".fs_message_name")?.textContent || "") ||
        firstText([".fs_client_info_body .fs_client_name", ".fs_ticket_sidebar .fs_client_email"])
      );
    }

    return firstText([
      "[data-testid='from-contact-email']",
      ".from-contact-email",
      ".message-participants .email-address",
      ".thread-participant-item"
    ]);
  }

  function extractTicketId() {
    if (PLATFORM === "fluent-support") {
      return core?.getFluentSupportTicketId(location.href) || "";
    }
    const match = location.href.match(/(?:thread|message|mail)[/=:_-]([a-z0-9_-]{4,})/i);
    return match?.[1] || "";
  }

  function normalizeConversationRole(role, author) {
    const text = `${normalizeText(role)} ${normalizeText(author)}`;
    if (/\b(?:support|agent|staff|admin|administrator|operator|developer|team)\b/i.test(text)) {
      return "support";
    }
    if (/\b(?:customer|client|user|requester|sender|visitor|buyer)\b/i.test(text)) {
      return "customer";
    }
    return "unknown";
  }

  function normalizeTitanMessageRole(author, node) {
    const context = normalizeText(
      [
        author,
        node?.getAttribute?.("class"),
        node?.getAttribute?.("data-direction"),
        node?.getAttribute?.("aria-label")
      ].join(" ")
    );
    if (
      /(?:@plugincy\.com\b|\bplugincy support\b|\boutgoing\b|\bsent by me\b|\bfrom me\b)/i.test(
        context
      )
    ) {
      return "support";
    }
    return "customer";
  }

  function extractMessageTime(node) {
    const selectors = [
      "time",
      "[datetime]",
      ".fs_message_time",
      ".fs_message_date",
      ".fs_thread_time",
      ".fs_thread_date",
      "[class*='time']",
      "[class*='date']"
    ];
    for (const selector of selectors) {
      const match = node.querySelector(selector);
      if (!match || !isMeaningfullyVisible(match)) {
        continue;
      }
      const value =
        match.getAttribute("datetime") ||
        match.getAttribute("title") ||
        match.getAttribute("aria-label") ||
        match.textContent ||
        "";
      const text = normalizeText(value);
      if (text && text.length <= 120) {
        return text;
      }
    }
    return "";
  }

  function extractTitanMessageSender(node) {
    const selectors = [
      "[data-testid='from-contact-email']",
      "[data-testid*='sender' i]",
      "[data-testid*='from' i]",
      ".from-contact-email",
      ".message-participants .email-address",
      ".thread-participant-item",
      "[class*='sender' i]",
      "[class*='from' i]"
    ];
    for (const selector of selectors) {
      const text = firstTextWithin(node, selector);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function firstTextWithin(root, selector) {
    for (const node of root.querySelectorAll(selector)) {
      if (!isMeaningfullyVisible(node)) {
        continue;
      }
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text.length >= 2 && text.length <= 160) {
        return text;
      }
    }
    return "";
  }

  function dedupeMessages(messages) {
    const output = [];
    const seen = new Set();
    for (const message of messages) {
      const text = normalizeMultiline(message?.text || "");
      const key = normalizeText(text).toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      output.push({
        role: ["customer", "support", "unknown"].includes(message.role)
          ? message.role
          : "unknown",
        author: normalizeText(message.author || "").slice(0, 120),
        sentAt: normalizeText(message.sentAt || "").slice(0, 120),
        text: text.slice(0, MAX_CAPTURE_LENGTH)
      });
    }
    return output;
  }

  async function handleAutomationResult(message) {
    if (message.status === "escalated") {
      setUiState("escalated", "Manual task created");
      return { handled: true, escalated: true };
    }
    if (message.status === "error") {
      setUiState("error", message.error || "Drafting failed");
      return { handled: true, error: true };
    }
    if (message.status !== "draft") {
      return { handled: false };
    }

    if (!message.autoSend) {
      setUiState("draft", "Draft ready in Draft Inbox");
      return { handled: true, drafted: true, inserted: false, sent: false };
    }
    if (!message.response || !message.signature || !message.draftId) {
      throw new Error("Auto-send payload is incomplete. The saved draft was not sent.");
    }

    const delaySeconds = Math.min(30, Math.max(3, Number(message.autoSendDelaySeconds || 8)));
    for (let remaining = delaySeconds; remaining > 0; remaining -= 1) {
      setUiState("working", `Auto-send validation: ${remaining}s`);
      await delay(1000);
    }

    try {
      const currentTicket = scrapeCurrentTicket({ requireDetail: true });
      const currentSignature = core?.createTicketSignature(currentTicket);
      if (currentSignature !== message.signature) {
        throw new Error("The open ticket changed before sending. Draft kept for review.");
      }

      await insertAndSendReply(message.response, message.signature);
      setUiState("sent", "Reply sent");
      await safeRuntimeSendMessage({
        type: "RPA_AUTO_SEND_RESULT",
        draftId: message.draftId,
        sent: true
      });
      return { handled: true, drafted: true, inserted: true, sent: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Automatic sending stopped safely.";
      setUiState("error", errorMessage);
      await safeRuntimeSendMessage({
        type: "RPA_AUTO_SEND_RESULT",
        draftId: message.draftId,
        sent: false,
        error: errorMessage
      });
      return { handled: true, drafted: true, inserted: false, sent: false };
    }
  }

  async function insertAndSendReply(response, expectedSignature) {
    let editor = findReplyEditor();
    if (!editor) {
      const opener = findReplyOpener();
      if (!opener) {
        throw new Error("The reply editor could not be opened. Draft kept for review.");
      }
      opener.click();
      editor = await waitFor(findReplyEditor, 10000);
    }
    if (!editor) {
      throw new Error("The reply editor did not become ready. Draft kept for review.");
    }

    const existingEditorText = normalizeText(editor.innerText || editor.value || "");
    if (existingEditorText) {
      throw new Error(
        "The reply editor already contains unsent text. Auto-send stopped to avoid overwriting it."
      );
    }

    setEditorValue(editor, response);
    const currentTicket = scrapeCurrentTicket({ requireDetail: true });
    if (core?.createTicketSignature(currentTicket) !== expectedSignature) {
      throw new Error("The open ticket changed during editor setup. Draft kept for review.");
    }

    const sendButton = await waitFor(() => findReplySubmitButton(editor), 8000);
    if (!sendButton) {
      throw new Error("A safe reply submit button was not found. Draft kept for review.");
    }
    const previousMessageCount = document.querySelectorAll(
      ".fs_threads_container .fs_conversation_message, [data-testid='message-item-area'], .message-item-area"
    ).length;
    sendButton.click();

    const confirmed = await waitFor(() => {
      const editorText = normalizeText(editor.innerText || editor.value || "");
      const messageCount = document.querySelectorAll(
        ".fs_threads_container .fs_conversation_message, [data-testid='message-item-area'], .message-item-area"
      ).length;
      return !editor.isConnected || !isMeaningfullyVisible(editor) || !editorText ||
        messageCount > previousMessageCount
        ? true
        : null;
    }, 15000);
    if (!confirmed) {
      throw new Error(
        "The reply button was clicked, but the page did not confirm submission. Inspect the ticket before retrying."
      );
    }
  }

  function findReplyOpener() {
    const selectors =
      PLATFORM === "fluent-support"
        ? [".fs_ticket_header button", ".fs_header_left_group button"]
        : [
            "[data-testid='reply-tooltip']",
            "[data-testid='reply-all-tooltip']",
            "[data-testid='reply-icon']",
            "[data-testid='footer-reply-area']",
            ".footer-reply-area",
            "[data-testid*='reply-button']"
          ];
    for (const selector of selectors) {
      const button = [...document.querySelectorAll(selector)].find(
        (node) =>
          isMeaningfullyVisible(node) &&
          (["reply-tooltip", "reply-all-tooltip", "reply-icon"].includes(
            node.getAttribute("data-testid")
          ) ||
            /^(?:reply|reply all)$/i.test(normalizeText(node.textContent)))
      );
      if (button) {
        return button;
      }
    }
    return null;
  }

  function findReplyEditor() {
    const selectors =
      PLATFORM === "fluent-support"
        ? [
            ".fs_reply_box [contenteditable='true']",
            ".fs_response_editor [contenteditable='true']",
            ".ql-editor[contenteditable='true']",
            "[role='textbox'][contenteditable='true']",
            ".fs_reply_box textarea"
          ]
        : [
            "[data-testid='composer-body'][contenteditable='true']",
            "[data-testid*='composer'] [contenteditable='true']",
            ".composer [contenteditable='true']",
            "[role='textbox'][contenteditable='true']",
            "textarea[data-testid*='composer']"
          ];
    return firstVisibleElement(selectors);
  }

  function findReplySubmitButton(editor) {
    if (PLATFORM === "titan-mail") {
      const titanSend = firstVisibleElement([
        "[data-testid='send-action-btn']",
        "button.btn-send",
        "[data-testid*='composer'] button[type='submit']"
      ]);
      if (
        titanSend &&
        !titanSend.disabled &&
        titanSend.getAttribute("aria-disabled") !== "true"
      ) {
        return titanSend;
      }
    }

    let container = editor;
    for (let depth = 0; depth < 6 && container?.parentElement; depth += 1) {
      container = container.parentElement;
      const candidates = [...container.querySelectorAll("button")].filter(
        (button) =>
          isMeaningfullyVisible(button) &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true" &&
          /^(?:send|send reply|reply|reply and close ticket)$/i.test(
            normalizeText(button.textContent || button.getAttribute("aria-label"))
          )
      );
      if (candidates.length === 1) {
        return candidates[0];
      }
    }
    return null;
  }

  function setEditorValue(editor, value) {
    const text = String(value || "").trim();
    editor.focus();
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const prototype =
        editor instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(editor, text);
    } else {
      editor.replaceChildren();
      for (const line of text.split("\n")) {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        if (!line) {
          paragraph.append(document.createElement("br"));
        }
        editor.append(paragraph);
      }
    }
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      })
    );
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncRouteUi() {
    const shouldMount = isLikelyTicketDetailOpen();
    if (!shouldMount) {
      document.getElementById(UI_HOST_ID)?.remove();
      ui = null;
      return;
    }
    if (!ui) {
      mountLauncher();
    }
  }

  function mountLauncher() {
    document.getElementById(UI_HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = UI_HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.right = "20px";
    host.style.bottom = "20px";
    host.style.zIndex = "2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .wrap {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          max-width: min(92vw, 720px);
          padding: 7px;
          border: 1px solid rgba(255,255,255,.38);
          border-radius: 15px;
          background: rgba(7,27,58,.96);
          box-shadow: 0 18px 44px rgba(7,27,58,.28);
          color: #fff;
          font: 600 12px/1.3 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button {
          min-height: 38px;
          padding: 0 14px;
          border: 0;
          border-radius: 10px;
          background: #2f7df4;
          color: #fff;
          cursor: pointer;
          font: 750 12px/1 inherit;
        }
        button.secondary {
          background: rgba(255,255,255,.12);
          color: #fff;
        }
        button.secondary:hover { background: rgba(255,255,255,.18); }
        button.review {
          background: #16a34a;
          color: #fff;
        }
        button.review:hover { background: #15803d; }
        button.custom {
          background: #7c3aed;
          color: #fff;
        }
        button.custom:hover { background: #6d28d9; }
        button:disabled { cursor: wait; opacity: .66; }
        button:focus-visible { outline: 3px solid rgba(99,168,255,.55); outline-offset: 2px; }
        .status { max-width: 220px; padding-right: 8px; color: #c8d7eb; }
        .wrap[data-state="draft"] .status,
        .wrap[data-state="sent"] .status { color: #79e2b4; }
        .wrap[data-state="error"] .status { color: #ffb3ad; }
        .wrap[data-state="escalated"] .status { color: #ffd28a; }
      </style>
      <div class="wrap" data-state="ready">
        <button class="primary" type="button">Generate GPT reply</button>
        <button class="secondary" type="button">Fixed</button>
        <button class="review" type="button">5-star</button>
        <button class="custom" type="button">Custom</button>
        <span class="status" aria-live="polite">Ready</span>
      </div>
    `;
    document.documentElement.append(host);
    ui = {
      host,
      wrap: shadow.querySelector(".wrap"),
      primaryButton: shadow.querySelector("button.primary"),
      fixedButton: shadow.querySelector("button.secondary"),
      reviewButton: shadow.querySelector("button.review"),
      customButton: shadow.querySelector("button.custom"),
      status: shadow.querySelector(".status")
    };
    ui.primaryButton.addEventListener("click", () => {
      void captureAndQueue();
    });
    ui.fixedButton.addEventListener("click", () => {
      void createFixedReplyDraft();
    });
    ui.reviewButton.addEventListener("click", () => {
      void createReviewRequestDraft();
    });
    ui.customButton.addEventListener("click", () => {
      void createCustomReplyDraft();
    });
  }

  function setUiState(state, status) {
    if (!ui) {
      syncRouteUi();
    }
    if (!ui) {
      return;
    }
    ui.wrap.dataset.state = state;
    ui.status.textContent = status;
    const isBusy = ["working", "queued", "processing"].includes(state);
    ui.primaryButton.disabled = isBusy;
    ui.fixedButton.disabled = isBusy;
    ui.reviewButton.disabled = isBusy;
    ui.customButton.disabled = isBusy;
    ui.primaryButton.textContent =
      state === "processing" ? "Processing..." : "Generate GPT reply";
    ui.fixedButton.textContent = "Fixed";
    ui.reviewButton.textContent = "5-star";
    ui.customButton.textContent = "Custom";
  }

  function detectAuthenticatedState() {
    if (PLATFORM === "fluent-support") {
      return Boolean(document.querySelector("#wpadminbar, #wpwrap, #wpbody-content"));
    }
    return !document.querySelector(
      "form[action*='login'], input[type='password'], [data-testid*='login']"
    );
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!isMeaningfullyVisible(node)) {
          continue;
        }
        const text = normalizeText(node.innerText || node.textContent || "");
        if (text.length >= 2 && text.length <= 1000) {
          return text;
        }
      }
    }
    return "";
  }

  function firstVisibleElement(selectors) {
    for (const selector of selectors) {
      const node = [...document.querySelectorAll(selector)].find(isMeaningfullyVisible);
      if (node) {
        return node;
      }
    }
    return null;
  }

  function cleanDocumentTitle() {
    return normalizeText(document.title)
      .replace(/\s*[|–—-]\s*(?:WordPress|Titan|Hostinger|Fluent Support).*$/i, "")
      .slice(0, 1000);
  }

  function extractGithubUrl(text) {
    const match = String(text || "").match(/https:\/\/github\.com\/[^\s<>"')\]]+/i);
    return match?.[0]?.replace(/[.,;:!?]+$/, "").slice(0, 600) || "";
  }

  function normalizeText(value) {
    return core?.normalizeText(value) || String(value || "").trim();
  }

  function normalizeMultiline(value) {
    return core?.normalizeMultiline(value) || String(value || "").trim();
  }

  function dedupeTextBlocks(values) {
    return core?.dedupeTextBlocks(values) || values;
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

  globalThis.PlugincyScraperTest = {
    collectReadableIframeText,
    extractFluentConversation,
    extractTitanConversation,
    findReplyEditor,
    findReplyOpener,
    findReplySubmitButton,
    insertAndSendReply,
    isLikelyTicketDetailOpen,
    prepareConversationForCapture,
    scrapeCurrentTicket,
    setEditorValue
  };
})();
