(() => {
  "use strict";

  if (globalThis.__plugincySupportRpaSourceNotifierLoaded || window.top !== window) {
    return;
  }
  globalThis.__plugincySupportRpaSourceNotifierLoaded = true;

  const SOURCE =
    location.hostname === "hostinger.titan.email" ? "titan-mail" : "fluent-support";
  const MAX_FINGERPRINTS = 50;
  const SCAN_INTERVAL_MS = 15000;

  let scanTimer = 0;
  let lastStateSignature = "";
  let baselineReported = false;

  const observer = new MutationObserver(() => {
    scheduleScan(1200);
  });

  start();

  function start() {
    const root = document.body || document.documentElement;
    if (!root) {
      window.setTimeout(start, 500);
      return;
    }

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "aria-live",
        "class",
        "data-status",
        "data-testid",
        "data-unread"
      ]
    });

    scheduleScan(2500);
    window.setInterval(() => scheduleScan(0), SCAN_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        scheduleScan(500);
      }
    });
  }

  function scheduleScan(delay) {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      void reportSourceState();
    }, delay);
  }

  async function reportSourceState() {
    const listView = isNotificationListView();
    const fingerprints = listView ? collectUnreadFingerprints() : [];
    const baselineOnly = !baselineReported;
    baselineReported = true;

    const stateSignature = `${SOURCE}|${listView ? "list" : "detail"}|${fingerprints.join("|")}`;
    if (stateSignature === lastStateSignature) {
      return;
    }
    lastStateSignature = stateSignature;

    await safeRuntimeSendMessage({
      type: "RPA_REPORT_SOURCE_STATE",
      source: SOURCE,
      fingerprints,
      baselineOnly,
      listView,
      pageUrl: location.href
    });
  }

  function collectUnreadFingerprints() {
    if (!isNotificationListView()) {
      return [];
    }

    const selectors =
      SOURCE === "titan-mail"
        ? [
            "[data-testid*='unread' i]",
            "[data-unread='true']",
            "[aria-label*='unread' i]",
            "[aria-label*='new mail' i]",
            "[class~='unread']",
            "[class*='is-unread' i]"
          ]
        : [
            "[data-testid*='unread' i]",
            "[data-testid*='new-ticket' i]",
            "[data-unread='true']",
            "[data-status='new']",
            "[data-status='unread']",
            "[aria-label*='unread' i]",
            "[aria-label*='new ticket' i]",
            "[class~='unread']",
            "[class*='is-unread' i]",
            "[class*='new-ticket' i]"
          ];

    const fingerprints = new Set();
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        continue;
      }

      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !isElementVisible(node)) {
          continue;
        }
        if (!isUnreadIndicatorNode(node)) {
          continue;
        }

        const row =
          node.closest("[role='row'], tr, li, a[href], [data-testid*='row' i]") ||
          node.parentElement ||
          node;
        if (!isNotificationRow(row, node)) {
          continue;
        }
        const sourceKey = [
          row.getAttribute("href") || "",
          row.id || "",
          row.getAttribute("data-id") || "",
          row.getAttribute("data-testid") || "",
          normalizeText(row.innerText || row.textContent || "").slice(0, 240)
        ].join("|");

        if (sourceKey.replace(/\|/g, "").length < 2) {
          continue;
        }

        fingerprints.add(hashText(sourceKey));
        if (fingerprints.size >= MAX_FINGERPRINTS) {
          return [...fingerprints];
        }
      }
    }

    return [...fingerprints];
  }

  function isNotificationListView() {
    if (SOURCE === "titan-mail") {
      if (
        hasVisibleElement([
          "[data-testid='message-item-area']",
          ".message-item-area",
          ".message-item-wrap",
          "[data-testid='message-body']",
          "[data-testid*='message-content' i]"
        ])
      ) {
        return false;
      }

      return hasVisibleElement([
        "[data-testid*='thread' i]",
        "[data-testid*='mail-list' i]",
        "[role='row']",
        "tr"
      ]);
    }

    if (/^#\/tickets\/\d+\/view(?:[/?]|$)/i.test(location.hash || "")) {
      return false;
    }

    return hasVisibleElement([
      "[data-testid*='ticket' i]",
      "[data-status='new']",
      "[data-status='unread']",
      "[role='row']",
      "tr"
    ]);
  }

  function isNotificationRow(row, markerNode) {
    if (!(row instanceof HTMLElement) || !isElementVisible(row)) {
      return false;
    }
    if (row.closest("header, nav, footer, [role='toolbar'], [role='menubar']")) {
      return false;
    }

    const label = normalizeText(
      [
        row.getAttribute("aria-label"),
        row.getAttribute("title"),
        row.getAttribute("data-testid"),
        row.innerText || row.textContent
      ].join(" ")
    );
    const markerLabel = normalizeText(
      [
        markerNode?.getAttribute?.("aria-label"),
        markerNode?.getAttribute?.("title"),
        markerNode?.getAttribute?.("data-testid"),
        markerNode?.getAttribute?.("class"),
        markerNode?.textContent
      ].join(" ")
    );
    if (
      /\b(?:mark as unread|show unread|unread only|filter unread|no unread|read receipt|compose|settings|folder|folders)\b/i.test(label) ||
      /\b(?:mark as unread|show unread|unread only|filter unread|no unread|read receipt|compose|settings|folder|folders)\b/i.test(markerLabel)
    ) {
      return false;
    }

    const hasUnreadSignal =
      row.getAttribute("data-unread") === "true" ||
      markerNode?.getAttribute?.("data-unread") === "true" ||
      /\b(?:unread|is-unread|new mail|new ticket)\b/i.test(`${label} ${markerLabel}`);

    if (SOURCE === "titan-mail") {
      return hasUnreadSignal && /\b(?:subject|from|sender|inbox|mail|thread|unread)\b/i.test(
        `${label} ${markerLabel}`
      );
    }

    return hasUnreadSignal && /\b(?:ticket|subject|customer|unread|new|open|waiting)\b/i.test(
      `${label} ${markerLabel}`
    );
  }

  function isUnreadIndicatorNode(node) {
    const label = normalizeText(
      [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.getAttribute("data-testid"),
        node.textContent
      ].join(" ")
    );
    if (
      /\b(?:mark as unread|show unread|unread only|filter unread|no unread|read receipt)\b/i.test(
        label
      )
    ) {
      return false;
    }
    if (
      node.matches("button, [role='button'], input, textarea, select") ||
      node.closest("button, [role='button']")
    ) {
      return node.getAttribute("data-unread") === "true";
    }
    return true;
  }

  function extractUnreadCount(value) {
    const title = String(value || "");
    const match =
      title.match(/^\s*\((\d{1,4})\)/) ||
      title.match(/\((\d{1,4})\)\s*(?:unread|new|[-|])/i) ||
      title.match(/\b(\d{1,4})\s+(?:unread|new)\b/i);
    return Math.min(Number(match?.[1] || 0), MAX_FINGERPRINTS);
  }

  function hashText(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return `${SOURCE}-${Math.abs(hash)}`;
  }

  function isElementVisible(node) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function hasVisibleElement(selectors) {
    for (const selector of selectors) {
      try {
        for (const node of document.querySelectorAll(selector)) {
          if (node instanceof HTMLElement && isElementVisible(node)) {
            return true;
          }
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function safeRuntimeSendMessage(payload) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) {
        return;
      }
      await chrome.runtime.sendMessage(payload);
    } catch {
      // Extension reloads invalidate existing content-script contexts.
    }
  }

  globalThis.PlugincySourceNotifierTest = {
    collectUnreadFingerprints,
    extractUnreadCount,
    isNotificationListView
  };
})();
