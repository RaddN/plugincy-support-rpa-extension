(() => {
  "use strict";

  if (globalThis.__plugincySupportRpaGptControllerLoaded) {
    return;
  }
  globalThis.__plugincySupportRpaGptControllerLoaded = true;

  const RESPONSE_TIMEOUT_MS = 4 * 60 * 1000;
  let activeJobId = null;

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
        response
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
      let sawGeneration = false;
      let settled = false;

      const cleanup = () => {
        observer.disconnect();
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
        if (!generating && stableFor >= 2200 && (sawGeneration || sendReady)) {
          finish(resolve, currentText);
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
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const content =
      element.querySelector(".markdown, [class*='markdown'], [data-message-content]") ||
      element;
    return normalizeText(content.innerText || content.textContent || "");
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
    getAssistantSnapshot,
    prepareFreshConversation,
    waitForCompletedResponse
  };
})();
