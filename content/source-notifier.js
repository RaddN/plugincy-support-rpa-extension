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
    const fingerprints = collectUnreadFingerprints();
    const titleCount = extractUnreadCount(document.title);

    if (!fingerprints.length && titleCount > 0) {
      for (let index = 1; index <= Math.min(titleCount, MAX_FINGERPRINTS); index += 1) {
        fingerprints.push(`title-count-${index}`);
      }
    }

    const stateSignature = `${SOURCE}|${fingerprints.join("|")}`;
    if (stateSignature === lastStateSignature) {
      return;
    }
    lastStateSignature = stateSignature;

    await safeRuntimeSendMessage({
      type: "RPA_REPORT_SOURCE_STATE",
      source: SOURCE,
      fingerprints,
      pageUrl: location.href
    });
  }

  function collectUnreadFingerprints() {
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

        const row =
          node.closest("a[href], [role='row'], tr, li") ||
          node.parentElement ||
          node;
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
})();
