(() => {
  "use strict";

  if (globalThis.__plugincySupportRpaGptControllerLoaded) {
    return;
  }
  globalThis.__plugincySupportRpaGptControllerLoaded = true;

  const RESPONSE_TIMEOUT_MS = 4 * 60 * 1000;
  const COMPLETION_STABLE_MS = 2200;
  const GENERATION_FINISHED_STABLE_MS = 3500;
  const VISIBLE_FALLBACK_STABLE_MS = 10000;
  const HIDDEN_FALLBACK_STABLE_MS = 15000;
  const VISIBLE_CAPTURE_STABLE_MS = 1800;
  const MIN_COMPLETED_RESPONSE_CHARS = 20;
  const FOCUS_REQUEST_INTERVAL_MS = 3000;
  const MAX_RESPONSE_HTML_LENGTH = 60000;
  const DROP_RESPONSE_TAGS = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE"]);
  const SAFE_RESPONSE_TAGS = new Set([
    "A",
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "DEL",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "I",
    "LI",
    "OL",
    "P",
    "PRE",
    "S",
    "STRONG",
    "TABLE",
    "TBODY",
    "TD",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL"
  ]);
  let activeJobId = null;
  let lastFocusRequestAt = 0;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "RPA_GPT_PING") {
      sendResponse({
        ready: true,
        authenticated: Boolean(findPromptComposer())
      });
      return false;
    }

    if (message.type === "RPA_GPT_RUN") {
      if (activeJobId) {
        sendResponse({
          accepted: false,
          error: "The ChatGPT controller is already processing another ticket."
        });
        return false;
      }

      if (!message.job?.id || !message.job?.ticket?.text) {
        sendResponse({
          accepted: false,
          error: "The ChatGPT job is incomplete."
        });
        return false;
      }

      activeJobId = message.job.id;
      sendResponse({ accepted: true });
      void runJob(message.job);
      return false;
    }

    return false;
  });

  async function runJob(job) {
    try {
      await prepareFreshConversation();
      const composer = await waitFor(findPromptComposer, 20000);
      if (!composer) {
        throw new Error("ChatGPT is not ready. Sign in, reload chatgpt.com, and try again.");
      }

      const baseline = getAssistantSnapshot();
      const prompt = buildPrompt(job.ticket);
      await injectAndSubmitPrompt(composer, prompt);
      const response = await waitForCompletedResponse(baseline);

      activeJobId = null;
      await safeRuntimeSendMessage({
        type: "RPA_GPT_RESULT",
        jobId: job.id,
        response: response.text,
        responseHtml: response.html
      });
    } catch (error) {
      if (activeJobId === job.id) {
        activeJobId = null;
      }
      await safeRuntimeSendMessage({
        type: "RPA_GPT_ERROR",
        jobId: job.id,
        error: error instanceof Error ? error.message : "ChatGPT automation failed."
      });
    }
  }

  function buildPrompt(ticket) {
    if (!globalThis.PlugincyPromptBuilder?.buildPrompt) {
      throw new Error("The support prompt builder is unavailable. Reload the extension.");
    }

    return globalThis.PlugincyPromptBuilder.buildPrompt(ticket);
  }

  async function safeRuntimeSendMessage(payload) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) {
        return false;
      }
      await chrome.runtime.sendMessage(payload);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (!/Extension context invalidated|context invalidated|Receiving end does not exist/i.test(message)) {
        console.warn("Plugincy Support RPA could not contact the service worker:", error);
      }
      return false;
    }
  }

  async function prepareFreshConversation() {
    const hasConversation = getConversationElementCount() > 0;
    if (!hasConversation) {
      return;
    }

    const newChatButton = findVisibleElement([
      "[data-testid='create-new-chat-button']",
      "a[aria-label='New chat']",
      "button[aria-label='New chat']",
      "nav a[href='/']"
    ]);

    if (!newChatButton) {
      throw new Error(
        "A fresh ChatGPT conversation could not be confirmed. Start a new chat and retry; this ticket was not added to the existing conversation."
      );
    }

    newChatButton.click();
    const freshComposer = await waitFor(() => {
      const composer = findPromptComposer();
      return composer && getConversationElementCount() === 0 ? composer : null;
    }, 10000);
    if (!freshComposer) {
      throw new Error(
        "ChatGPT did not confirm a new empty conversation. This ticket was stopped to prevent cross-customer context."
      );
    }
  }

  async function injectAndSubmitPrompt(composer, prompt) {
    setComposerValue(composer, prompt);

    const sendButton = await waitFor(() => {
      const button = findSendButton();
      if (
        button &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
      ) {
        return button;
      }
      return null;
    }, 10000);

    if (!sendButton) {
      throw new Error("ChatGPT's send button did not become available.");
    }

    sendButton.click();

    const cleared = await waitFor(() => {
      const current = findPromptComposer();
      return current && normalizeText(current.innerText || current.value || "").length === 0
        ? true
        : null;
    }, 10000);

    if (!cleared) {
      throw new Error("ChatGPT did not accept the prompt.");
    }
  }

  function setComposerValue(composer, prompt) {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(composer, prompt);
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: prompt
        })
      );
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inserted = document.execCommand("insertText", false, prompt);
    if (!inserted || normalizeText(composer.innerText).length < prompt.length * 0.8) {
      composer.replaceChildren();
      const lines = prompt.split("\n");
      lines.forEach((line, index) => {
        const paragraph = document.createElement("p");
        if (line) {
          paragraph.textContent = line;
        } else {
          paragraph.append(document.createElement("br"));
        }
        composer.append(paragraph);
        if (index === lines.length - 1) {
          paragraph.dataset.rpaEnd = "true";
        }
      });
    }

    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: prompt
      })
    );
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function waitForCompletedResponse(baseline) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let latestText = "";
      let stableSince = 0;
      let visibleSince = document.hidden ? 0 : Date.now();
      let sawGeneration = false;
      let settled = false;

      const cleanup = () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        clearInterval(interval);
        clearTimeout(timeout);
      };

      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback(value);
      };

      const handleVisibilityChange = () => {
        if (!document.hidden) {
          visibleSince = Date.now();
        }
        evaluate();
      };

      const evaluate = () => {
        const elements = getAssistantElements();
        const latestElement = elements[elements.length - 1];
        const currentText = extractAssistantText(latestElement);
        const isNewResponse =
          elements.length > baseline.count ||
          (currentText && currentText !== baseline.lastText);
        const generating = Boolean(findStopButton());

        if (generating) {
          sawGeneration = true;
        }

        if (!isNewResponse || currentText.length < 2) {
          return;
        }

        if (currentText !== latestText) {
          latestText = currentText;
          stableSince = Date.now();
          return;
        }

        const stableFor = Date.now() - stableSince;
        const sendButton = findSendButton();
        const sendReady = Boolean(
          sendButton &&
            !sendButton.disabled &&
            sendButton.getAttribute("aria-disabled") !== "true"
        );
        const completionVisible = hasCompletedTurnAction(latestElement);
        const generationFinished = sawGeneration && !generating;
        const fallbackStableMs = document.hidden
          ? HIDDEN_FALLBACK_STABLE_MS
          : VISIBLE_FALLBACK_STABLE_MS;
        const completed =
          (completionVisible && stableFor >= COMPLETION_STABLE_MS) ||
          (generationFinished && stableFor >= GENERATION_FINISHED_STABLE_MS) ||
          (sendReady && stableFor >= fallbackStableMs);

        if (!generating && completed) {
          const response = extractAssistantResponse(latestElement);
          if (!isCompleteResponseCandidate(response.text)) {
            return;
          }

          if (document.hidden) {
            requestChatGptTabFocus();
            stableSince = Date.now();
            return;
          }

          if (!visibleSince || Date.now() - visibleSince < VISIBLE_CAPTURE_STABLE_MS) {
            return;
          }

          finish(resolve, response);
        }
      };

      const observer = new MutationObserver(() => {
        evaluate();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled", "data-testid"]
      });

      const interval = setInterval(evaluate, 800);
      const timeout = setTimeout(() => {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        finish(
          reject,
          new Error(`ChatGPT did not finish within ${elapsedSeconds} seconds.`)
        );
      }, RESPONSE_TIMEOUT_MS);

      document.addEventListener("visibilitychange", handleVisibilityChange);
      evaluate();
    });
  }

  function getAssistantSnapshot() {
    const elements = getAssistantElements();
    return {
      count: elements.length,
      lastText: extractAssistantText(elements[elements.length - 1])
    };
  }

  function getAssistantElements() {
    const explicit = [
      ...document.querySelectorAll("[data-message-author-role='assistant']")
    ].filter(isVisible);
    if (explicit.length) {
      return explicit;
    }

    return [
      ...document.querySelectorAll(
        "article[data-testid^='conversation-turn-'] .markdown, main article .markdown"
      )
    ].filter(isVisible);
  }

  function getConversationElementCount() {
    const explicit = document.querySelectorAll("[data-message-author-role]").length;
    return explicit || document.querySelectorAll("article[data-testid^='conversation-turn-']").length;
  }

  function extractAssistantText(element) {
    return extractAssistantResponse(element).text;
  }

  function extractAssistantResponse(element) {
    if (!(element instanceof HTMLElement)) {
      return {
        text: "",
        html: ""
      };
    }

    const content =
      element.querySelector(".markdown, [class*='markdown'], [data-message-content]") ||
      element;
    const safeContainer = document.createElement("div");
    appendSafeResponseChildren(content, safeContainer);
    const html = safeContainer.innerHTML.trim();

    return {
      text: structuredResponseText(content),
      html: html.length <= MAX_RESPONSE_HTML_LENGTH ? html : ""
    };
  }

  function appendSafeResponseChildren(source, target) {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(child.textContent || ""));
        continue;
      }
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (DROP_RESPONSE_TAGS.has(child.tagName)) {
        continue;
      }

      if (!SAFE_RESPONSE_TAGS.has(child.tagName)) {
        appendSafeResponseChildren(child, target);
        continue;
      }

      const safe = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === "A") {
        const href = normalizeSafeLink(child.getAttribute("href"));
        if (href) {
          safe.setAttribute("href", href);
        }
      }
      appendSafeResponseChildren(child, safe);
      target.append(safe);
    }
  }

  function normalizeSafeLink(value) {
    try {
      const url = new URL(String(value || ""), location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 2000) : "";
    } catch {
      return "";
    }
  }

  function structuredResponseText(root) {
    return normalizeDraftText(formatResponseNode(root));
  }

  function formatResponseNode(node, depth = 0) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (!(node instanceof HTMLElement)) {
      return "";
    }

    if (node.tagName === "BR") {
      return "\n";
    }
    if (node.tagName === "PRE") {
      const code = String(node.textContent || "").replace(/\r\n?/g, "\n").trimEnd();
      return code ? `\n\`\`\`\n${code}\n\`\`\`\n\n` : "";
    }
    if (node.tagName === "OL" || node.tagName === "UL") {
      const ordered = node.tagName === "OL";
      const items = [...node.children].filter((child) => child.tagName === "LI");
      return `${items
        .map((item, index) => {
          const indent = "  ".repeat(depth);
          const marker = ordered ? `${index + 1}.` : "-";
          const direct = normalizeInlineText(
            [...item.childNodes]
              .filter(
                (child) =>
                  !(child instanceof HTMLElement) ||
                  !["OL", "UL"].includes(child.tagName)
              )
              .map((child) => formatResponseNode(child, depth))
              .join("")
          );
          const nested = [...item.children]
            .filter((child) => ["OL", "UL"].includes(child.tagName))
            .map((child) => formatResponseNode(child, depth + 1).trimEnd())
            .filter(Boolean)
            .join("\n");
          return `${indent}${marker} ${direct}${nested ? `\n${nested}` : ""}`.trimEnd();
        })
        .join("\n")}\n\n`;
    }
    if (node.tagName === "TABLE") {
      return `${[...node.querySelectorAll("tr")]
        .map((row) =>
          [...row.querySelectorAll(":scope > th, :scope > td")]
            .map((cell) => normalizeInlineText(cell.textContent || ""))
            .join(" | ")
        )
        .filter(Boolean)
        .join("\n")}\n\n`;
    }

    const content = [...node.childNodes]
      .map((child) => formatResponseNode(child, depth))
      .join("");
    if (node.tagName === "BLOCKQUOTE") {
      return `${normalizeDraftText(content)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    }
    if (
      ["P", "DIV", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "H5", "H6"].includes(
        node.tagName
      )
    ) {
      return `${content}\n\n`;
    }
    if (node.tagName === "HR") {
      return "\n---\n\n";
    }
    return content;
  }

  function normalizeInlineText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function normalizeDraftText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function hasCompletedTurnAction(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    const turn = element.closest("article") || element;
    return Boolean(
      [
        "button[data-testid='copy-turn-action-button']",
        "button[aria-label='Copy response']",
        "button[aria-label*='Good response' i]",
        "button[aria-label*='Bad response' i]"
      ].some((selector) => [...turn.querySelectorAll(selector)].some(isVisible))
    );
  }

  function isCompleteResponseCandidate(text) {
    return normalizeDraftText(text).length >= MIN_COMPLETED_RESPONSE_CHARS;
  }

  function requestChatGptTabFocus() {
    const now = Date.now();
    if (now - lastFocusRequestAt < FOCUS_REQUEST_INTERVAL_MS) {
      return;
    }
    lastFocusRequestAt = now;
    void safeRuntimeSendMessage({
      type: "RPA_GPT_FOCUS_REQUIRED",
      jobId: activeJobId || ""
    });
  }

  function findPromptComposer() {
    return findVisibleElement([
      "#prompt-textarea",
      "textarea[data-testid='prompt-textarea']",
      "textarea[placeholder*='Message' i]",
      "main [contenteditable='true'][role='textbox']",
      "form [contenteditable='true']"
    ]);
  }

  function findSendButton() {
    return findVisibleElement([
      "button[data-testid='send-button']",
      "button[aria-label='Send prompt']",
      "button[aria-label*='Send message' i]",
      "form button[type='submit']"
    ]);
  }

  function findStopButton() {
    return findVisibleElement([
      "button[data-testid='stop-button']",
      "button[aria-label*='Stop generating' i]",
      "button[aria-label*='Stop streaming' i]",
      "button[data-testid*='stop']"
    ]);
  }

  function findVisibleElement(selectors) {
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find(isVisible);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 1 &&
      rect.height > 1
    );
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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

  globalThis.PlugincyGptControllerTest = {
    extractAssistantResponse,
    getAssistantSnapshot,
    hasCompletedTurnAction,
    prepareFreshConversation,
    waitForCompletedResponse
  };
})();
