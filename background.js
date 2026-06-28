"use strict";

const JOB_STATE_KEY = "rpa_job_state";
const SETTINGS_KEY = "rpa_settings";
const TASK_INDEX_KEY = "rpa_task_index";
const TASK_KEY_PREFIX = "rpa_task_";
const PRODUCT_INDEX_KEY = "rpa_product_index";
const PRODUCT_KEY_PREFIX = "rpa_product_";
const DEFAULT_PRODUCTS_SEEDED_KEY = "rpa_default_products_seeded_v1";
const ACTIVITY_KEY = "rpa_activity";
const NEWS_CACHE_KEY = "rpa_news_cache";
const GPT_TAB_ID_KEY = "rpa_gpt_tab_id";

const MAX_QUEUE_SIZE = 20;
const MAX_TASKS = 80;
const MAX_PRODUCTS = 150;
const MAX_PRODUCT_LINKS = 30;
const MAX_ACTIVITY_ITEMS = 30;
const ACTIVE_JOB_TIMEOUT_MS = 6 * 60 * 1000;
const GPT_URL = "https://chatgpt.com/";

const DEFAULT_SETTINGS = {
  autoSendReplies: false,
  autoProcessTickets: true,
  theme: "light"
};

const DEFAULT_PRODUCTS = [
  {
    id: "default_dynamic_ajax_product_filter",
    name: "Dynamic Ajax Product Filter",
    keywords: [
      "dynamic ajax product filter",
      "dynamic ajax product filters",
      "ajax product filters",
      "dynamic ajax filters",
      "woocommerce product filter",
      "woocommerce filters",
      "dapf"
    ],
    resources: {
      githubUrl: "https://github.com/RaddN/dynamic-ajax-product-filters-for-woocommerce-pro",
      docsUrl: "https://plugincy.com/documentations/dynamic-ajax-product-filters-for-woocommerce/",
      landingUrl: "https://plugincy.com/dynamic-ajax-product-filters-for-woocommerce/",
      supportUrl: "",
      changelogUrl: "",
      customLinks: [
        {
          label: "Product website",
          url: "https://ajaxproductfilters.com/"
        }
      ]
    },
    notes:
      "Primary WooCommerce filter plugin. Use the GitHub repository, Plugincy landing page, product website, and documentation links when helpful."
  },
  {
    id: "default_one_page_quick_checkout",
    name: "One Page Quick Checkout",
    keywords: [
      "one page quick checkout",
      "one page checkout",
      "quick checkout",
      "all in one checkout",
      "checkout plugin",
      "woocommerce checkout"
    ],
    resources: {
      githubUrl: "https://github.com/RaddN/one-page-quick-checkout-for-woocommerce-pro/",
      docsUrl: "https://plugincy.com/documentations/one-page-quick-checkout-for-woocommerce/",
      landingUrl: "https://plugincy.com/one-page-checkout-for-woocommerce/",
      supportUrl: "",
      changelogUrl: "",
      customLinks: [
        {
          label: "Product website",
          url: "https://allinonecheckout.com/"
        }
      ]
    },
    notes:
      "WooCommerce one-page checkout plugin. Include docs, Plugincy landing page, and product website quick links when relevant."
  },
  {
    id: "default_multi_location_inventory",
    name: "Multi Location Product & Inventory Management for WooCommerce",
    keywords: [
      "multi location product",
      "multi location inventory",
      "multi location product inventory",
      "location wise product",
      "location-wise product",
      "location inventory",
      "woocommerce inventory"
    ],
    resources: {
      githubUrl: "https://github.com/RaddN/location-wise-product-for-wc",
      docsUrl:
        "https://plugincy.com/documentations/multi-location-product-inventory-management-for-woocommerce/",
      landingUrl:
        "https://plugincy.com/multi-location-product-and-inventory-management-for-woocommerce/",
      supportUrl: "",
      changelogUrl: "",
      customLinks: [
        {
          label: "Product website",
          url: "https://multilocationinventory.com/"
        }
      ]
    },
    notes:
      "WooCommerce multi-location inventory plugin. Use the repo, docs, Plugincy page, and product website as quick-link context."
  }
];

const SUPPORT_TAB_PATTERNS = [
  "https://hostinger.titan.email/*",
  "https://plugincy.com/wp-admin/*"
];

const FEEDS = [
  {
    id: "wordpress",
    name: "WordPress News",
    url: "https://wordpress.org/news/feed/"
  },
  {
    id: "woocommerce",
    name: "WooCommerce Developer Blog",
    url: "https://developer.woocommerce.com/feed/"
  }
];

let jobStateChain = Promise.resolve();
let taskStateChain = Promise.resolve();
let queueDispatchInProgress = false;

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/newtab.html") });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rpa-news-refresh") {
    void refreshNewsCache();
  }

  if (alarm.name === "rpa-queue-watchdog") {
    void recoverQueue();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("Plugincy Support RPA message error:", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected extension error."
      });
    });

  return true;
});

void initializeExtension();

async function initializeExtension() {
  const settingsResult = await chrome.storage.sync.get(SETTINGS_KEY);
  const existingSettings =
    settingsResult[SETTINGS_KEY] && typeof settingsResult[SETTINGS_KEY] === "object"
      ? settingsResult[SETTINGS_KEY]
      : {};

  if (
    !settingsResult[SETTINGS_KEY] ||
    Object.keys(DEFAULT_SETTINGS).some((key) => !(key in existingSettings))
  ) {
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: {
        ...DEFAULT_SETTINGS,
        ...existingSettings,
        autoSendReplies: Boolean(existingSettings.autoSendReplies),
        autoProcessTickets:
          existingSettings.autoProcessTickets === undefined
            ? DEFAULT_SETTINGS.autoProcessTickets
            : Boolean(existingSettings.autoProcessTickets),
        theme: existingSettings.theme === "dark" ? "dark" : "light"
      }
    });
  }

  await ensureDefaultProducts();

  await Promise.all([
    chrome.alarms.create("rpa-news-refresh", { periodInMinutes: 60 }),
    chrome.alarms.create("rpa-queue-watchdog", { periodInMinutes: 1 })
  ]);

  const cacheResult = await chrome.storage.local.get(NEWS_CACHE_KEY);
  const fetchedAt = Number(cacheResult[NEWS_CACHE_KEY]?.fetchedAt || 0);
  if (Date.now() - fetchedAt > 60 * 60 * 1000) {
    void refreshNewsCache();
  }

  void recoverQueue();
}

async function routeMessage(message, sender) {
  if (!message || typeof message.type !== "string") {
    throw new Error("Invalid extension message.");
  }

  switch (message.type) {
    case "RPA_PROCESS_TICKET":
      assertSupportSender(sender);
      return processTicket(message.ticket, sender.tab);

    case "RPA_GPT_RESULT":
      assertChatGptSender(sender);
      return handleGptResult(message, sender.tab);

    case "RPA_GPT_ERROR":
      assertChatGptSender(sender);
      return handleGptError(message);

    case "RPA_PROCESS_CURRENT_TICKET":
      return processCurrentSupportTab();

    case "RPA_GET_SESSION_HEALTH":
      return { services: await getSessionHealth() };

    case "RPA_GET_QUEUE_STATUS":
      return getQueueStatus();

    case "RPA_REFRESH_NEWS":
      await refreshNewsCache();
      return { refreshed: true };

    case "RPA_ENSURE_DEFAULT_PRODUCTS":
      await ensureDefaultProducts();
      return {
        products: (await loadProducts()).length
      };

    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

function assertSupportSender(sender) {
  const url = sender.tab?.url || "";
  if (
    !url.startsWith("https://hostinger.titan.email/") &&
    !url.startsWith("https://plugincy.com/wp-admin/")
  ) {
    throw new Error("Ticket processing is only allowed from configured support pages.");
  }
}

function assertChatGptSender(sender) {
  if (!sender.tab?.url?.startsWith("https://chatgpt.com/")) {
    throw new Error("ChatGPT results are only accepted from chatgpt.com.");
  }
}

async function processTicket(rawTicket, originTab) {
  const ticket = await enrichTicketWithProduct(normalizeTicket(rawTicket, originTab));

  if (containsCredentials(ticket.text)) {
    const task = await createEscalationTask({
      summary: `Temporary WordPress access details detected in “${ticket.subject}”. Review the ticket manually; no credential values were copied.`,
      ticket,
      reason: "credentials"
    });

    await logActivity({
      status: "escalated",
      title: ticket.subject,
      detail: "Credentials detected locally; ticket was not sent to ChatGPT.",
      source: ticket.source,
      sourceUrl: ticket.pageUrl
    });

    await notifyOrigin(ticket.originTabId, {
      status: "escalated",
      summary: task.title,
      reason: "credentials"
    });

    return {
      accepted: true,
      escalated: true,
      reason: "credentials",
      taskId: task.id
    };
  }

  const job = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    originTabId: ticket.originTabId,
    ticket
  };

  await mutateJobState((state) => {
    if (state.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error("The automation queue is full. Finish the current ticket first.");
    }

    state.queue.push(job);
  });

  await logActivity({
    status: "ready",
    title: ticket.subject,
    detail: "Ticket queued for ChatGPT drafting.",
    source: ticket.source,
    sourceUrl: ticket.pageUrl
  });

  void dispatchNextJob();

  return {
    accepted: true,
    escalated: false,
    jobId: job.id
  };
}

function normalizeTicket(rawTicket, originTab) {
  if (!rawTicket || typeof rawTicket !== "object") {
    throw new Error("No ticket data was supplied.");
  }

  const text = cleanText(rawTicket.text, 24000);
  if (text.length < 8) {
    throw new Error("The current ticket body could not be detected.");
  }

  const source = ["fluent-support", "titan-mail"].includes(rawTicket.source)
    ? rawTicket.source
    : originTab?.url?.includes("hostinger.titan.email")
      ? "titan-mail"
      : "fluent-support";

  const subject = cleanText(rawTicket.subject || "Customer support ticket", 160);
  const githubUrl = normalizeGithubUrl(rawTicket.githubUrl);
  const pageUrl = normalizeSupportUrl(rawTicket.pageUrl || originTab?.url || "");

  return {
    subject,
    text,
    githubUrl,
    productId: cleanText(rawTicket.productId || "", 80),
    source,
    ticketId: cleanText(rawTicket.ticketId || "", 80),
    pageUrl,
    originTabId: Number(originTab?.id || rawTicket.originTabId || 0)
  };
}

async function enrichTicketWithProduct(ticket) {
  const products = await loadProducts();
  const explicitProduct = products.find((product) => product.id === ticket.productId);
  const matchedProduct =
    explicitProduct ||
    matchProductForTicket(products, `${ticket.subject}\n${ticket.text}\n${ticket.pageUrl}`);

  if (!matchedProduct) {
    return {
      ...ticket,
      product: null
    };
  }

  return {
    ...ticket,
    productId: matchedProduct.id,
    product: {
      id: matchedProduct.id,
      name: matchedProduct.name,
      keywords: matchedProduct.keywords,
      resources: matchedProduct.resources,
      notes: matchedProduct.notes
    },
    githubUrl: ticket.githubUrl || matchedProduct.resources.githubUrl || ""
  };
}

async function loadProducts() {
  const data = await chrome.storage.sync.get(null);
  const index = Array.isArray(data[PRODUCT_INDEX_KEY])
    ? data[PRODUCT_INDEX_KEY].filter((id) => typeof id === "string")
    : [];

  return index
    .map((id) => normalizeProduct(data[`${PRODUCT_KEY_PREFIX}${id}`]))
    .filter(Boolean)
    .slice(0, MAX_PRODUCTS);
}

async function ensureDefaultProducts() {
  const data = await chrome.storage.sync.get(null);
  const currentIndex = Array.isArray(data[PRODUCT_INDEX_KEY])
    ? data[PRODUCT_INDEX_KEY].filter((id) => typeof id === "string")
    : [];
  const existingProducts = currentIndex
    .map((id) => normalizeProduct(data[`${PRODUCT_KEY_PREFIX}${id}`]))
    .filter(Boolean);
  const writes = {
    [DEFAULT_PRODUCTS_SEEDED_KEY]: true
  };
  const nextIndex = [...currentIndex];
  const now = Date.now();

  for (const defaultProduct of DEFAULT_PRODUCTS) {
    const product = normalizeProduct({
      ...defaultProduct,
      createdAt: now,
      updatedAt: now
    });
    if (!product) {
      continue;
    }

    const existing = existingProducts.find((candidate) =>
      isSameProductRecord(candidate, product)
    );

    if (existing) {
      const merged = mergeDefaultProduct(existing, product);
      writes[`${PRODUCT_KEY_PREFIX}${existing.id}`] = merged;
      const existingIndex = existingProducts.findIndex((item) => item.id === existing.id);
      if (existingIndex >= 0) {
        existingProducts[existingIndex] = merged;
      }
      if (!nextIndex.includes(existing.id)) {
        nextIndex.unshift(existing.id);
      }
      continue;
    }

    writes[`${PRODUCT_KEY_PREFIX}${product.id}`] = product;
    nextIndex.unshift(product.id);
    existingProducts.push(product);
  }

  writes[PRODUCT_INDEX_KEY] = uniqueStrings(nextIndex).slice(0, MAX_PRODUCTS);
  await chrome.storage.sync.set(writes);
}

function isSameProductRecord(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.id === b.id ||
    a.name.toLowerCase() === b.name.toLowerCase() ||
    Boolean(a.resources.githubUrl && a.resources.githubUrl === b.resources.githubUrl)
  );
}

function mergeDefaultProduct(existing, defaults) {
  return {
    ...existing,
    keywords: uniqueStrings([...existing.keywords, ...defaults.keywords]).slice(0, 20),
    resources: {
      githubUrl: existing.resources.githubUrl || defaults.resources.githubUrl,
      docsUrl: existing.resources.docsUrl || defaults.resources.docsUrl,
      landingUrl: existing.resources.landingUrl || defaults.resources.landingUrl,
      supportUrl: existing.resources.supportUrl || defaults.resources.supportUrl,
      changelogUrl: existing.resources.changelogUrl || defaults.resources.changelogUrl,
      customLinks: mergeCustomLinks(
        existing.resources.customLinks,
        defaults.resources.customLinks
      )
    },
    notes: existing.notes || defaults.notes,
    updatedAt: Date.now()
  };
}

function mergeCustomLinks(existingLinks, defaultLinks) {
  const seen = new Set();
  const links = [];

  for (const link of [...existingLinks, ...defaultLinks]) {
    if (!link?.url || seen.has(link.url)) {
      continue;
    }
    seen.add(link.url);
    links.push({
      label: cleanText(link.label || "Resource", 80) || "Resource",
      url: link.url
    });
  }

  return links.slice(0, MAX_PRODUCT_LINKS);
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeProduct(product) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const id = cleanText(product.id, 80);
  const name = cleanText(product.name, 160);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    keywords: normalizeKeywordList(product.keywords),
    resources: normalizeProductResources(product.resources || product),
    notes: cleanText(product.notes, 1000),
    createdAt: Number(product.createdAt || Date.now()),
    updatedAt: Number(product.updatedAt || product.createdAt || Date.now())
  };
}

function normalizeKeywordList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  const seen = new Set();
  const keywords = [];

  for (const item of raw) {
    const keyword = cleanText(item, 80).toLowerCase();
    if (keyword.length < 2 || seen.has(keyword)) {
      continue;
    }
    seen.add(keyword);
    keywords.push(keyword);
  }

  return keywords.slice(0, 20);
}

function normalizeProductResources(resources) {
  return {
    githubUrl: normalizeGithubUrl(resources.githubUrl),
    docsUrl: normalizeHttpsUrl(resources.docsUrl, 1000),
    landingUrl: normalizeHttpsUrl(resources.landingUrl, 1000),
    supportUrl: normalizeHttpsUrl(resources.supportUrl, 1000),
    changelogUrl: normalizeHttpsUrl(resources.changelogUrl, 1000),
    customLinks: normalizeCustomLinks(resources.customLinks)
  };
}

function normalizeCustomLinks(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const links = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const url = normalizeHttpsUrl(item.url, 1000);
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({
      label: cleanText(item.label || "Resource", 80) || "Resource",
      url
    });
  }

  return links.slice(0, MAX_PRODUCT_LINKS);
}

function matchProductForTicket(products, text) {
  const haystack = String(text || "").toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    let score = 0;
    const name = product.name.toLowerCase();
    if (name && haystack.includes(name)) {
      score += 12;
    }

    for (const token of name.split(/[^a-z0-9]+/).filter((item) => item.length >= 4)) {
      if (haystack.includes(token)) {
        score += 1;
      }
    }

    for (const keyword of product.keywords) {
      if (keyword && haystack.includes(keyword)) {
        score += keyword.length > 8 ? 7 : 4;
      }
    }

    const resourceUrls = [
      ...Object.entries(product.resources)
        .filter(([key]) => key !== "customLinks")
        .map(([, value]) => value),
      ...product.resources.customLinks.map((link) => link.url)
    ];

    for (const resourceUrl of resourceUrls) {
      const resourceSlug = extractUsefulUrlSlug(resourceUrl);
      if (resourceSlug && haystack.includes(resourceSlug)) {
        score += 4;
      }
    }

    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  return bestScore >= 4 ? best : null;
}

function extractUsefulUrlSlug(value) {
  try {
    const url = new URL(String(value || ""));
    return url.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]+/g, " ")
      .toLowerCase()
      .slice(0, 80);
  } catch {
    return "";
  }
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizeGithubUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname === "github.com"
      ? url.href.slice(0, 600)
      : "";
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value, maxLength = 1000) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href.slice(0, maxLength) : "";
  } catch {
    return "";
  }
}

function normalizeSupportUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const allowed =
      url.protocol === "https:" &&
      (url.hostname === "hostinger.titan.email" || url.hostname === "plugincy.com");
    return allowed ? url.href.slice(0, 1000) : "";
  } catch {
    return "";
  }
}

function containsCredentials(text) {
  const value = String(text || "");
  const passwordMatch = value.match(
    /\b(?:password|passcode|passwd|pwd|temporary password|admin password)\b\s*(?:is|:|=|-)\s*([^\s,;]+)/i
  );
  const passwordSignal = Boolean(
    passwordMatch &&
      !/^(?:not|wrong|incorrect|invalid|missing|unknown|expired|reset|changed|working)$/i.test(
        passwordMatch[1]
      )
  );
  const usernameSignal =
    /\b(?:username|user name|admin user|login user|wp user)\b\s*(?:is|:|=|-)\s*\S+/i.test(
      value
    );
  const loginSignal =
    /(?:\/wp-admin\/?|\/wp-login\.php|wordpress\s+(?:admin|login)|temporary\s+(?:admin|login)|login\s+details)/i.test(
      value
    );
  const credentialBlock =
    /\b(?:credentials?|login details?|admin access)\b[\s\S]{0,240}\b(?:password|passwd|pwd)\b/i.test(
      value
    );

  return passwordSignal || credentialBlock || (usernameSignal && loginSignal);
}

async function dispatchNextJob() {
  if (queueDispatchInProgress) {
    return;
  }

  queueDispatchInProgress = true;

  try {
    const job = await mutateJobState((state) => {
      if (state.active || state.queue.length === 0) {
        return null;
      }

      const nextJob = state.queue.shift();
      state.active = {
        ...nextJob,
        startedAt: Date.now()
      };
      return state.active;
    });

    if (!job) {
      return;
    }

    try {
      const gptTab = await findOrCreateChatGptTab();
      await ensureContentScript(gptTab.id, "content/gpt-controller.js", "RPA_GPT_PING");

      const acknowledgement = await chrome.tabs.sendMessage(gptTab.id, {
        type: "RPA_GPT_RUN",
        job: {
          id: job.id,
          ticket: job.ticket
        }
      });

      if (!acknowledgement?.accepted) {
        throw new Error(acknowledgement?.error || "ChatGPT did not accept the ticket.");
      }

      await logActivity({
        status: "processing",
        title: job.ticket.subject,
        detail: "ChatGPT is preparing a draft.",
        source: job.ticket.source,
        sourceUrl: job.ticket.pageUrl
      });
    } catch (error) {
      await failActiveJob(
        job.id,
        error instanceof Error ? error.message : "Unable to start ChatGPT automation."
      );
    }
  } finally {
    queueDispatchInProgress = false;
  }
}

async function findOrCreateChatGptTab() {
  const stored = await chrome.storage.session.get(GPT_TAB_ID_KEY);
  const storedTabId = Number(stored[GPT_TAB_ID_KEY] || 0);
  let tab = null;

  if (storedTabId > 0) {
    try {
      const candidate = await chrome.tabs.get(storedTabId);
      if (candidate.url?.startsWith("https://chatgpt.com/")) {
        tab = candidate;
      }
    } catch {
      // The dedicated tab was closed; create a replacement below.
    }
  }

  if (!tab) {
    tab = await chrome.tabs.create({
      url: GPT_URL,
      active: false,
      pinned: true
    });
    await chrome.storage.session.set({ [GPT_TAB_ID_KEY]: tab.id });
  } else if (!tab.pinned) {
    tab = await chrome.tabs.update(tab.id, { pinned: true });
  }

  await waitForTabComplete(tab.id);
  return chrome.tabs.get(tab.id);
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out while loading chatgpt.com."));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureContentScript(tabId, file, pingType) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: pingType });
    if (response?.ready) {
      return;
    }
  } catch {
    // Existing tabs may predate extension installation; inject once below.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file]
  });

  await delay(250);
  const response = await chrome.tabs.sendMessage(tabId, { type: pingType });
  if (!response?.ready) {
    throw new Error("The required page controller is not ready.");
  }
}

async function handleGptResult(message) {
  const responseText = cleanText(message.response, 30000);
  if (!responseText) {
    throw new Error("ChatGPT returned an empty response.");
  }

  const job = await takeActiveJob(message.jobId);
  if (!job) {
    return { ignored: true };
  }

  const escalation = parseEscalation(responseText);
  if (escalation) {
    const task = await createEscalationTask({
      summary: escalation,
      ticket: job.ticket,
      reason: "ai"
    });

    await logActivity({
      status: "escalated",
      title: job.ticket.subject,
      detail: escalation,
      source: job.ticket.source,
      sourceUrl: job.ticket.pageUrl
    });

    await notifyOrigin(job.originTabId, {
      status: "escalated",
      summary: escalation,
      reason: "ai",
      taskId: task.id
    });
  } else {
    await notifyOrigin(job.originTabId, {
      status: "draft",
      response: responseText,
      jobId: job.id
    });

    await logActivity({
      status: "draft",
      title: job.ticket.subject,
      detail: "AI response inserted as a support draft.",
      source: job.ticket.source,
      sourceUrl: job.ticket.pageUrl
    });
  }

  void dispatchNextJob();
  return { handled: true, escalated: Boolean(escalation) };
}

async function handleGptError(message) {
  const error = cleanText(message.error || "ChatGPT automation failed.", 500);
  await failActiveJob(message.jobId, error);
  return { handled: true };
}

async function takeActiveJob(jobId) {
  return mutateJobState((state) => {
    if (!state.active || state.active.id !== jobId) {
      return null;
    }

    const job = state.active;
    state.active = null;
    return job;
  });
}

async function failActiveJob(jobId, errorMessage) {
  const job = await takeActiveJob(jobId);
  if (!job) {
    return;
  }

  await notifyOrigin(job.originTabId, {
    status: "error",
    error: errorMessage
  });

  await logActivity({
    status: "error",
    title: job.ticket.subject,
    detail: errorMessage,
    source: job.ticket.source,
    sourceUrl: job.ticket.pageUrl
  });

  void dispatchNextJob();
}

function parseEscalation(responseText) {
  const match = String(responseText).match(/ESCALATE_TO_HUMAN:\s*([\s\S]+)/i);
  if (!match) {
    return "";
  }

  return redactCredentialValues(cleanText(match[1], 500)) || "Manual developer review required.";
}

function redactCredentialValues(text) {
  return String(text || "")
    .replace(
      /(\b(?:password|passcode|passwd|pwd|username|user name|login)\b\s*(?:is|:|=|-)\s*)\S+/gi,
      "$1[redacted]"
    )
    .replace(/https?:\/\/[^/\s]+:[^@\s]+@[^\s]+/gi, "[redacted credential URL]");
}

async function createEscalationTask({ summary, ticket, reason }) {
  const safeSummary = redactCredentialValues(cleanText(summary, 500));
  const task = {
    id: crypto.randomUUID(),
    title: cleanText(`Review support escalation: ${ticket.subject}`, 160),
    notes: safeSummary,
    priority: "high",
    status: "open",
    source: ticket.source,
    sourceUrl: ticket.pageUrl,
    reason,
    createdAt: Date.now(),
    completedAt: null
  };

  await upsertSyncedTask(task);
  return task;
}

async function upsertSyncedTask(task) {
  return withTaskLock(async () => {
    const result = await chrome.storage.sync.get(TASK_INDEX_KEY);
    const currentIndex = Array.isArray(result[TASK_INDEX_KEY])
      ? result[TASK_INDEX_KEY].filter((id) => typeof id === "string")
      : [];

    const nextIndex = [task.id, ...currentIndex.filter((id) => id !== task.id)].slice(
      0,
      MAX_TASKS
    );

    await chrome.storage.sync.set({
      [TASK_INDEX_KEY]: nextIndex,
      [`${TASK_KEY_PREFIX}${task.id}`]: task
    });

    const removedIds = currentIndex.filter((id) => !nextIndex.includes(id));
    if (removedIds.length) {
      await chrome.storage.sync.remove(
        removedIds.map((id) => `${TASK_KEY_PREFIX}${id}`)
      );
    }
  });
}

function withTaskLock(operation) {
  const next = taskStateChain.then(operation, operation);
  taskStateChain = next.catch(() => undefined);
  return next;
}

async function notifyOrigin(tabId, payload) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "RPA_AUTOMATION_RESULT",
      ...payload
    });
    return true;
  } catch (error) {
    console.warn("Original support tab is no longer available:", error);
    return false;
  }
}

async function processCurrentSupportTab() {
  const tabs = await chrome.tabs.query({ url: SUPPORT_TAB_PATTERNS });
  const target = tabs.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
  })[0];

  if (!target?.id) {
    throw new Error("Open a Fluent Support ticket or Titan email first.");
  }

  await ensureContentScript(target.id, "content/scraper.js", "RPA_SUPPORT_PING");
  const result = await chrome.tabs.sendMessage(target.id, {
    type: "RPA_CAPTURE_TICKET"
  });

  if (!result?.accepted) {
    throw new Error(result?.error || "The support ticket could not be captured.");
  }

  return {
    accepted: true,
    sourceTabId: target.id,
    source: result.source
  };
}

async function getSessionHealth() {
  const definitions = [
    {
      id: "chatgpt",
      label: "ChatGPT",
      patterns: ["https://chatgpt.com/*"],
      ping: "RPA_GPT_PING"
    },
    {
      id: "fluent-support",
      label: "Fluent Support",
      patterns: ["https://plugincy.com/wp-admin/*"],
      ping: "RPA_SUPPORT_PING"
    },
    {
      id: "titan-mail",
      label: "Titan Mail",
      patterns: ["https://hostinger.titan.email/*"],
      ping: "RPA_SUPPORT_PING"
    }
  ];

  return Promise.all(
    definitions.map(async (definition) => {
      const tabs = await chrome.tabs.query({ url: definition.patterns });
      const tab = tabs[0];
      if (!tab?.id) {
        return {
          id: definition.id,
          label: definition.label,
          state: "closed",
          detail: "Not open"
        };
      }

      try {
        await ensureContentScript(
          tab.id,
          definition.id === "chatgpt"
            ? "content/gpt-controller.js"
            : "content/scraper.js",
          definition.ping
        );
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: definition.ping
        });

        return {
          id: definition.id,
          label: definition.label,
          state: response?.authenticated === false ? "attention" : "connected",
          detail: response?.authenticated === false ? "Sign-in required" : "Connected"
        };
      } catch {
        return {
          id: definition.id,
          label: definition.label,
          state: "attention",
          detail: "Reload page"
        };
      }
    })
  );
}

async function getQueueStatus() {
  const state = await readJobState();
  return {
    active: state.active
      ? {
          id: state.active.id,
          subject: state.active.ticket.subject,
          startedAt: state.active.startedAt
        }
      : null,
    queued: state.queue.length
  };
}

async function recoverQueue() {
  const timedOutJob = await mutateJobState((state) => {
    if (
      state.active &&
      Date.now() - Number(state.active.startedAt || state.active.createdAt || 0) >
        ACTIVE_JOB_TIMEOUT_MS
    ) {
      const job = state.active;
      state.active = null;
      return job;
    }

    return null;
  });

  if (timedOutJob) {
    await notifyOrigin(timedOutJob.originTabId, {
      status: "error",
      error: "ChatGPT did not finish within six minutes. The ticket was not sent."
    });

    await logActivity({
      status: "error",
      title: timedOutJob.ticket.subject,
      detail: "ChatGPT timed out after six minutes.",
      source: timedOutJob.ticket.source,
      sourceUrl: timedOutJob.ticket.pageUrl
    });
  }

  void dispatchNextJob();
}

async function readJobState() {
  const result = await chrome.storage.session.get(JOB_STATE_KEY);
  return normalizeJobState(result[JOB_STATE_KEY]);
}

function mutateJobState(mutator) {
  const operation = jobStateChain.then(async () => {
    const state = await readJobState();
    const result = await mutator(state);
    await chrome.storage.session.set({ [JOB_STATE_KEY]: state });
    return result;
  });

  jobStateChain = operation.catch(() => undefined);
  return operation;
}

function normalizeJobState(value) {
  return {
    queue: Array.isArray(value?.queue) ? value.queue.slice(0, MAX_QUEUE_SIZE) : [],
    active: value?.active && typeof value.active === "object" ? value.active : null
  };
}

async function logActivity(entry) {
  const result = await chrome.storage.local.get(ACTIVITY_KEY);
  const current = Array.isArray(result[ACTIVITY_KEY]) ? result[ACTIVITY_KEY] : [];
  const item = {
    id: crypto.randomUUID(),
    status: entry.status,
    title: cleanText(entry.title, 160),
    detail: redactCredentialValues(cleanText(entry.detail, 500)),
    source: cleanText(entry.source, 40),
    sourceUrl: normalizeSupportUrl(entry.sourceUrl),
    createdAt: Date.now()
  };

  await chrome.storage.local.set({
    [ACTIVITY_KEY]: [item, ...current].slice(0, MAX_ACTIVITY_ITEMS)
  });
}

async function refreshNewsCache() {
  const sources = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const response = await fetch(feed.url, {
          method: "GET",
          credentials: "omit",
          cache: "no-cache",
          headers: {
            Accept: "application/rss+xml, application/atom+xml, text/xml"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const xml = (await response.text()).slice(0, 750000);
        return {
          ...feed,
          ok: true,
          xml
        };
      } catch (error) {
        return {
          ...feed,
          ok: false,
          error: error instanceof Error ? error.message : "Feed request failed."
        };
      }
    })
  );

  await chrome.storage.local.set({
    [NEWS_CACHE_KEY]: {
      fetchedAt: Date.now(),
      sources
    }
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
