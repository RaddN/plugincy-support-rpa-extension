"use strict";

importScripts("shared/workflow-core.js");

const JOB_STATE_KEY = "rpa_job_state";
const SETTINGS_KEY = "rpa_settings";
const TASK_INDEX_KEY = "rpa_task_index";
const TASK_KEY_PREFIX = "rpa_task_";
const PRODUCT_INDEX_KEY = "rpa_product_index";
const PRODUCT_KEY_PREFIX = "rpa_product_";
const DRAFT_INDEX_KEY = "rpa_draft_index";
const DRAFT_KEY_PREFIX = "rpa_draft_";
const LOCAL_STORAGE_MIGRATED_KEY = "rpa_local_storage_migrated_v1";
const DEFAULT_PRODUCTS_SEEDED_KEY = "rpa_default_products_seeded_v1";
const ACTIVITY_KEY = "rpa_activity";
const NEWS_CACHE_KEY = "rpa_news_cache";
const RELEASE_CACHE_KEY = "rpa_release_cache";
const WEATHER_CACHE_KEY = "rpa_weather_cache";
const DIRECTORY_WATCH_KEY = "rpa_directory_watch";
const SOURCE_STATE_KEY = "rpa_source_state";
const NOTIFICATION_TARGETS_KEY = "rpa_notification_targets";
const GPT_TAB_ID_KEY = "rpa_gpt_tab_id";

const MAX_QUEUE_SIZE = 20;
const MAX_TASKS = 80;
const MAX_DRAFTS = 60;
const MAX_PRODUCTS = 150;
const MAX_PRODUCT_LINKS = 30;
const MAX_ACTIVITY_ITEMS = 30;
const MAX_NOTIFICATION_TARGETS = 40;
const ACTIVE_JOB_TIMEOUT_MS = 6 * 60 * 1000;
const RELEASE_CADENCE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const GPT_URL = "https://chatgpt.com/";
const DEFAULT_WEATHER_LOCATION = "Police Line, Cumilla";
const DEFAULT_WEATHER_COORDINATES = {
  name: "Police Line, Cumilla",
  country: "Bangladesh",
  latitude: 23.4665886,
  longitude: 91.1719966,
  timezone: "Asia/Dhaka"
};
const WEATHER_CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  autoSendReplies: false,
  autoProcessTickets: false,
  autoSendDelaySeconds: 8,
  sidebarCollapsed: false,
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
      reviewUrl:
        "https://wordpress.org/support/plugin/dynamic-ajax-product-filters-for-woocommerce/reviews/#new-post",
      customLinks: [
        {
          label: "Product website",
          url: "https://ajaxproductfilters.com/"
        }
      ]
    },
    notes:
      "Primary WooCommerce filter plugin. Inspect the repository for implementation details and use the documentation and product pages to verify supported behavior before drafting a reply."
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
      reviewUrl:
        "https://wordpress.org/support/plugin/one-page-quick-checkout-for-woocommerce/reviews/#new-post",
      customLinks: [
        {
          label: "Product website",
          url: "https://allinonecheckout.com/"
        }
      ]
    },
    notes:
      "WooCommerce one-page checkout plugin. Use the repository, documentation, and product pages as internal reference material for accurate replies."
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
      reviewUrl:
        "https://wordpress.org/support/plugin/multi-location-product-and-inventory-management/reviews/#new-post",
      customLinks: [
        {
          label: "Product website",
          url: "https://multilocationinventory.com/"
        }
      ]
    },
    notes:
      "WooCommerce multi-location inventory plugin. Inspect the repository and documentation when diagnosing behavior; product pages provide additional internal context."
  }
];

const LEGACY_DEFAULT_PRODUCT_NOTES = new Set([
  "Primary WooCommerce filter plugin. Use the GitHub repository, Plugincy landing page, product website, and documentation links when helpful.",
  "WooCommerce one-page checkout plugin. Include docs, Plugincy landing page, and product website quick links when relevant.",
  "WooCommerce multi-location inventory plugin. Use the repo, docs, Plugincy page, and product website as quick-link context."
]);

const SUPPORT_TAB_PATTERNS = [
  "https://hostinger.titan.email/*",
  "https://plugincy.com/wp-admin/admin.php*"
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

const MONITORED_PLUGINS = [
  {
    slug: "one-page-quick-checkout-for-woocommerce",
    name: "One Page Quick Checkout for WooCommerce",
    url: "https://wordpress.org/plugins/one-page-quick-checkout-for-woocommerce/"
  },
  {
    slug: "dynamic-ajax-product-filters-for-woocommerce",
    name: "Dynamic AJAX Product Filters for WooCommerce",
    url: "https://wordpress.org/plugins/dynamic-ajax-product-filters-for-woocommerce/"
  },
  {
    slug: "multi-location-product-and-inventory-management",
    name: "Multi Location Product & Inventory Management for WooCommerce",
    url: "https://wordpress.org/plugins/multi-location-product-and-inventory-management/"
  }
];

let jobStateChain = Promise.resolve();
let taskStateChain = Promise.resolve();
let draftStateChain = Promise.resolve();
let queueDispatchInProgress = false;

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rpa-news-refresh") {
    void refreshNewsCache();
  }

  if (alarm.name === "rpa-queue-watchdog") {
    void recoverQueue();
  }

  if (alarm.name === "rpa-release-refresh") {
    void refreshReleaseCache();
  }

  if (alarm.name === "rpa-weather-refresh") {
    void refreshWeatherCache().catch((error) => {
      console.warn("Weather refresh failed:", error);
    });
  }

  if (alarm.name === "rpa-directory-watch") {
    void refreshDirectoryWatch();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void openNotificationTarget(notificationId);
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  void openNotificationTarget(notificationId);
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
        autoProcessTickets: false,
        autoSendReplies: existingSettings.autoSendReplies === true,
        autoSendDelaySeconds: Math.min(
          30,
          Math.max(3, Number(existingSettings.autoSendDelaySeconds || 8))
        ),
        sidebarCollapsed: existingSettings.sidebarCollapsed === true,
        theme: existingSettings.theme === "dark" ? "dark" : "light"
      }
    });
  }

  await migrateDetailedRecordsToLocal();
  await ensureDefaultProducts();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(
    (error) => {
      console.warn("Could not configure the extension side panel:", error);
    }
  );

  await Promise.all([
    chrome.alarms.create("rpa-news-refresh", { periodInMinutes: 60 }),
    chrome.alarms.create("rpa-queue-watchdog", { periodInMinutes: 1 }),
    chrome.alarms.create("rpa-release-refresh", { periodInMinutes: 360 }),
    chrome.alarms.create("rpa-weather-refresh", { periodInMinutes: 180 }),
    chrome.alarms.create("rpa-directory-watch", { periodInMinutes: 15 })
  ]);

  const cacheResult = await chrome.storage.local.get([
    NEWS_CACHE_KEY,
    RELEASE_CACHE_KEY,
    WEATHER_CACHE_KEY,
    DIRECTORY_WATCH_KEY
  ]);
  const fetchedAt = Number(cacheResult[NEWS_CACHE_KEY]?.fetchedAt || 0);
  if (Date.now() - fetchedAt > 60 * 60 * 1000) {
    void refreshNewsCache();
  }

  const releasesFetchedAt = Number(cacheResult[RELEASE_CACHE_KEY]?.fetchedAt || 0);
  if (Date.now() - releasesFetchedAt > 6 * 60 * 60 * 1000) {
    void refreshReleaseCache();
  }

  const weatherFetchedAt = Number(cacheResult[WEATHER_CACHE_KEY]?.fetchedAt || 0);
  const cachedWeatherLocation = cleanText(cacheResult[WEATHER_CACHE_KEY]?.location?.name || "", 120);
  if (
    cachedWeatherLocation !== DEFAULT_WEATHER_COORDINATES.name ||
    Date.now() - weatherFetchedAt > WEATHER_CACHE_MAX_AGE_MS
  ) {
    void refreshWeatherCache().catch((error) => {
      console.warn("Weather refresh failed:", error);
    });
  }

  const directoryCheckedAt = Number(cacheResult[DIRECTORY_WATCH_KEY]?.checkedAt || 0);
  if (Date.now() - directoryCheckedAt > 15 * 60 * 1000) {
    void refreshDirectoryWatch();
  }

  void recoverQueue();
}

async function getSettings() {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  const stored =
    result[SETTINGS_KEY] && typeof result[SETTINGS_KEY] === "object"
      ? result[SETTINGS_KEY]
      : {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    autoSendReplies: stored.autoSendReplies === true,
    autoProcessTickets: false,
    autoSendDelaySeconds: Math.min(
      30,
      Math.max(3, Number(stored.autoSendDelaySeconds || 8))
    ),
    sidebarCollapsed: stored.sidebarCollapsed === true,
    theme: stored.theme === "dark" ? "dark" : "light"
  };
}

async function migrateDetailedRecordsToLocal() {
  const local = await chrome.storage.local.get(null);
  if (local[LOCAL_STORAGE_MIGRATED_KEY]) {
    return;
  }

  const synced = await chrome.storage.sync.get(null);
  const localWrites = {};
  const syncRemovals = [];
  for (const [key, value] of Object.entries(synced)) {
    if (
      key === TASK_INDEX_KEY ||
      key.startsWith(TASK_KEY_PREFIX) ||
      key === PRODUCT_INDEX_KEY ||
      key.startsWith(PRODUCT_KEY_PREFIX) ||
      key === DEFAULT_PRODUCTS_SEEDED_KEY
    ) {
      if (!(key in local)) {
        localWrites[key] = value;
      }
      syncRemovals.push(key);
    }
  }

  await chrome.storage.local.set({
    ...localWrites,
    [LOCAL_STORAGE_MIGRATED_KEY]: true
  });
  if (syncRemovals.length) {
    await chrome.storage.sync.remove(syncRemovals);
  }
}

function withDraftLock(operation) {
  const next = draftStateChain.then(operation, operation);
  draftStateChain = next.catch(() => undefined);
  return next;
}

function saveDraftRecord(record) {
  return withDraftLock(() => saveDraftRecordUnlocked(record));
}

async function saveDraftRecordUnlocked(record) {
  const draft = {
    id: cleanText(record.id, 80),
    signature: cleanText(record.signature, 180),
    status: [
      "queued",
      "processing",
      "draft_ready",
      "failed",
      "escalated",
      "auto_sent"
    ].includes(record.status)
      ? record.status
      : "failed",
    ticketUrl: normalizeSupportUrl(record.ticketUrl),
    ticketId: cleanText(record.ticketId, 80),
    customer: cleanText(record.customer, 160),
    subject: cleanText(record.subject || "Customer support ticket", 160),
    product: cleanText(record.product, 160),
    source: ["fluent-support", "titan-mail"].includes(record.source)
      ? record.source
      : "fluent-support",
    ticket: record.ticket && typeof record.ticket === "object" ? record.ticket : null,
    draftText: cleanText(record.draftText, 30000),
    draftHtml: cleanDraftHtml(record.draftHtml, 60000),
    error: cleanText(record.error, 800),
    attempts: Math.max(1, Number(record.attempts || 1)),
    createdAt: Number(record.createdAt || Date.now()),
    updatedAt: Number(record.updatedAt || Date.now()),
    sentAt: Number(record.sentAt || 0)
  };
  if (!draft.id) {
    throw new Error("Draft record is missing an ID.");
  }

  const result = await chrome.storage.local.get(DRAFT_INDEX_KEY);
  const currentIndex = Array.isArray(result[DRAFT_INDEX_KEY])
    ? result[DRAFT_INDEX_KEY].filter((id) => typeof id === "string")
    : [];
  const nextIndex = [draft.id, ...currentIndex.filter((id) => id !== draft.id)].slice(
    0,
    MAX_DRAFTS
  );
  await chrome.storage.local.set({
    [DRAFT_INDEX_KEY]: nextIndex,
    [`${DRAFT_KEY_PREFIX}${draft.id}`]: draft
  });

  const removed = currentIndex.filter((id) => !nextIndex.includes(id));
  if (removed.length) {
    await chrome.storage.local.remove(removed.map((id) => `${DRAFT_KEY_PREFIX}${id}`));
  }
  return draft;
}

async function updateDraftRecord(draftId, changes) {
  return withDraftLock(async () => {
    const key = `${DRAFT_KEY_PREFIX}${cleanText(draftId, 80)}`;
    const result = await chrome.storage.local.get(key);
    const current = result[key];
    if (!current || typeof current !== "object") {
      return null;
    }
    return saveDraftRecordUnlocked({
      ...current,
      ...changes,
      id: current.id,
      updatedAt: Date.now()
    });
  });
}

async function findDraftBySignature(signature) {
  const data = await chrome.storage.local.get(null);
  const index = Array.isArray(data[DRAFT_INDEX_KEY]) ? data[DRAFT_INDEX_KEY] : [];
  return (
    index
      .map((id) => data[`${DRAFT_KEY_PREFIX}${id}`])
      .find((draft) => draft?.signature === signature) || null
  );
}

async function deleteDraft(draftId) {
  const id = cleanText(draftId, 80);
  if (!id) {
    throw new Error("Draft ID is required.");
  }
  return withDraftLock(async () => {
    const result = await chrome.storage.local.get(DRAFT_INDEX_KEY);
    const index = Array.isArray(result[DRAFT_INDEX_KEY]) ? result[DRAFT_INDEX_KEY] : [];
    await Promise.all([
      chrome.storage.local.set({
        [DRAFT_INDEX_KEY]: index.filter((candidate) => candidate !== id)
      }),
      chrome.storage.local.remove(`${DRAFT_KEY_PREFIX}${id}`)
    ]);
    return { deleted: true };
  });
}

async function retryDraft(draftId) {
  const id = cleanText(draftId, 80);
  const key = `${DRAFT_KEY_PREFIX}${id}`;
  const result = await chrome.storage.local.get(key);
  const draft = result[key];
  if (!draft?.ticket) {
    throw new Error("The saved ticket context is unavailable for retry.");
  }
  if (["queued", "processing"].includes(draft.status)) {
    throw new Error("This draft is already queued or processing.");
  }

  const response = await processTicket(draft.ticket, null, { forceRetry: true });
  await deleteDraft(id);
  return response;
}

async function handleAutoSendResult(message) {
  const draftId = cleanText(message.draftId, 80);
  if (!draftId) {
    throw new Error("Auto-reply result is missing its draft ID.");
  }
  const sent = message.sent === true;
  const updated = await updateDraftRecord(draftId, {
    status: sent ? "auto_sent" : "draft_ready",
    error: sent ? "" : cleanText(message.error || "Automatic sending failed.", 800),
    sentAt: sent ? Date.now() : 0
  });
  if (updated) {
    await logActivity({
      status: sent ? "sent" : "error",
      title: updated.subject,
      detail: sent
        ? "The reviewed automation path inserted and sent the reply."
        : `Auto-send stopped safely: ${updated.error}`,
      source: updated.source,
      sourceUrl: updated.ticketUrl
    });
  }
  return { updated: Boolean(updated), sent };
}

async function routeMessage(message, sender) {
  if (!message || typeof message.type !== "string") {
    throw new Error("Invalid extension message.");
  }

  switch (message.type) {
    case "RPA_PROCESS_TICKET":
      assertSupportSender(sender);
      return processTicket(message.ticket, sender.tab);

    case "RPA_CREATE_FIXED_REPLY":
      assertSupportSender(sender);
      return createFixedReplyDraft(message.ticket, sender.tab);

    case "RPA_CREATE_REVIEW_REQUEST":
      assertSupportSender(sender);
      return createReviewRequestDraft(message.ticket, sender.tab);

    case "RPA_PROCESS_CUSTOM_REPLY":
      assertSupportSender(sender);
      return processCustomReply(message.ticket, message.customReplyText, sender.tab);

    case "RPA_GPT_RESULT":
      assertChatGptSender(sender);
      return handleGptResult(message, sender.tab);

    case "RPA_GPT_ERROR":
      assertChatGptSender(sender);
      return handleGptError(message);

    case "RPA_GPT_FOCUS_REQUIRED":
      assertChatGptSender(sender);
      await focusTab(sender.tab);
      return { focused: true };

    case "RPA_PROCESS_CURRENT_TICKET":
      return processCurrentSupportTab();

    case "RPA_OPEN_SIDE_PANEL":
      assertSupportSender(sender, { requireTicket: false });
      await openSidePanel(sender.tab);
      return { opened: true };

    case "RPA_OPEN_CHATGPT":
      await findOrCreateChatGptTab({ active: true });
      return { opened: true };

    case "RPA_RETRY_DRAFT":
      return retryDraft(message.draftId);

    case "RPA_OPEN_DRAFT_SOURCE":
      return openDraftSource(message.draftId);

    case "RPA_DELETE_DRAFT":
      return deleteDraft(message.draftId);

    case "RPA_AUTO_SEND_RESULT":
      assertSupportSender(sender);
      return handleAutoSendResult(message);

    case "RPA_GET_SESSION_HEALTH":
      return { services: await getSessionHealth() };

    case "RPA_GET_QUEUE_STATUS":
      return getQueueStatus();

    case "RPA_REFRESH_NEWS":
      await refreshNewsCache();
      return { refreshed: true };

    case "RPA_REFRESH_RELEASES":
      await Promise.all([refreshReleaseCache(), refreshDirectoryWatch()]);
      return { refreshed: true };

    case "RPA_REFRESH_WEATHER":
      return {
        refreshed: true,
        weather: await refreshWeatherCache(message.location)
      };

    case "RPA_REPORT_SOURCE_STATE":
      assertSupportSender(sender, { requireTicket: false });
      return handleSourceStateReport(message, sender.tab);

    case "RPA_ENSURE_DEFAULT_PRODUCTS":
      await ensureDefaultProducts();
      return {
        products: (await loadProducts()).length
      };

    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function openSidePanel(tab) {
  const windowId = Number(tab?.windowId || 0);
  if (!windowId) {
    throw new Error("The support window could not be identified.");
  }
  await chrome.sidePanel.open({ windowId });
}

async function focusTab(tab, updateProperties = {}) {
  const tabId = Number(tab?.id || 0);
  if (!tabId) {
    throw new Error("The tab could not be identified.");
  }
  const updated = await chrome.tabs.update(tabId, {
    ...updateProperties,
    active: true
  });
  if (Number.isInteger(updated.windowId)) {
    await chrome.windows.update(updated.windowId, { focused: true });
  }
  return updated;
}

async function openDraftSource(draftId) {
  const id = cleanText(draftId, 80);
  if (!id) {
    throw new Error("Draft ID is required.");
  }

  const key = `${DRAFT_KEY_PREFIX}${id}`;
  const result = await chrome.storage.local.get(key);
  const draft = result[key];
  if (!draft || typeof draft !== "object") {
    throw new Error("The saved draft could not be found.");
  }

  const source = draft.source === "titan-mail" ? "titan-mail" : "fluent-support";
  const ticketUrl =
    normalizeSupportUrl(draft.ticketUrl) ||
    (source === "titan-mail"
      ? "https://hostinger.titan.email/mail/"
      : "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets");
  const originTabId = Number(draft.ticket?.originTabId || 0);

  if (originTabId > 0) {
    try {
      const originTab = await chrome.tabs.get(originTabId);
      const expectedHost =
        source === "titan-mail"
          ? "https://hostinger.titan.email/"
          : "https://plugincy.com/wp-admin/admin.php";
      if (originTab.url?.startsWith(expectedHost)) {
        const update =
          source === "fluent-support" && ticketUrl ? { url: ticketUrl } : {};
        await focusTab(originTab, update);
        return {
          opened: true,
          source,
          exact: source === "fluent-support"
        };
      }
    } catch {
      // The original support tab was closed; fall back to the best available URL.
    }
  }

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    if (source === "titan-mail") {
      return tab.url?.startsWith("https://hostinger.titan.email/");
    }
    return ticketUrl && tab.url === ticketUrl;
  });

  if (existing?.id) {
    await focusTab(existing, source === "fluent-support" ? { url: ticketUrl } : {});
  } else {
    const created = await chrome.tabs.create({
      url: ticketUrl,
      active: true
    });
    if (Number.isInteger(created.windowId)) {
      await chrome.windows.update(created.windowId, { focused: true });
    }
  }

  return {
    opened: true,
    source,
    exact: source === "fluent-support"
  };
}

function assertSupportSender(sender, { requireTicket = true } = {}) {
  const url = sender.tab?.url || "";
  const isTitan = url.startsWith("https://hostinger.titan.email/");
  const isFluentPage = /^https:\/\/plugincy\.com\/wp-admin\/admin\.php(?:[?#]|$)/i.test(url);
  const isFluentTicket = PlugincyWorkflowCore.isFluentSupportTicketUrl(url);

  if (!isTitan && !(requireTicket ? isFluentTicket : isFluentPage)) {
    throw new Error("Ticket processing is only allowed from configured support pages.");
  }
}

function assertChatGptSender(sender) {
  if (!sender.tab?.url?.startsWith("https://chatgpt.com/")) {
    throw new Error("ChatGPT results are only accepted from chatgpt.com.");
  }
}

async function processTicket(rawTicket, originTab, { forceRetry = false } = {}) {
  if (!rawTicket || typeof rawTicket !== "object") {
    throw new Error("No ticket data was supplied.");
  }

  const rawSubject = String(rawTicket.subject || "");
  const rawText = String(rawTicket.text || "");

  if (
    rawTicket.source === "titan-mail" ||
    originTab?.url?.includes("hostinger.titan.email")
  ) {
    const classification = PlugincyWorkflowCore.classifyEmail({
      subject: rawSubject,
      text: rawText
    });
    if (!classification.isSupport) {
      await logActivity({
        status: "ignored",
        title: cleanText(rawSubject || "Titan email", 160),
        detail: `${classification.reason}; it was not sent to ChatGPT.`,
        source: "titan-mail",
        sourceUrl: rawTicket.pageUrl || originTab?.url || ""
      });
      throw new Error(`${classification.reason}. This email was excluded from support drafting.`);
    }
  }

  const ticket = await enrichTicketWithProduct(normalizeTicket(rawTicket, originTab));
  const replyState = PlugincyWorkflowCore.getPendingReplyState(ticket);
  if (!replyState.hasPendingCustomer) {
    await logActivity({
      status: "ignored",
      title: ticket.subject,
      detail: "No unreplied customer message was found after the latest support reply.",
      source: ticket.source,
      sourceUrl: ticket.pageUrl
    });
    throw new Error("There is no new customer message after the latest support reply.");
  }

  const ticketForJob = {
    ...ticket,
    conversationText: replyState.conversationText,
    pendingText: replyState.pendingText,
    pendingMessageCount: replyState.pendingMessageCount,
    lastSupportAt: replyState.lastSupportAt,
    messages: replyState.messages
  };
  const pendingSecrets = PlugincyWorkflowCore.detectSecrets(replyState.pendingText);
  const secretTypes = uniqueStrings(pendingSecrets.types);
  const pendingEscalation = PlugincyWorkflowCore.extractEscalationMarker(
    replyState.pendingText
  );

  if (pendingEscalation || pendingSecrets.found || secretTypes.length > 0) {
    const reason = pendingEscalation ? "human-marker" : "credentials";
    const summary =
      pendingEscalation ||
      `Customer sent ${secretTypes.join(
        ", "
      )} access details. Create a manual follow-up and do not send an automated reply.`;
    const task = await createEscalationTask({
      summary,
      ticket: ticketForJob,
      reason
    });

    await logActivity({
      status: "escalated",
      title: ticketForJob.subject,
      detail:
        reason === "credentials"
          ? "Customer access details were accepted for support and converted into a manual task."
          : "An ESCALATE_TO_HUMAN marker was found in the unreplied customer message.",
      source: ticketForJob.source,
      sourceUrl: ticketForJob.pageUrl
    });

    await notifyOrigin(ticketForJob.originTabId, {
      status: "escalated",
      summary: task.title,
      reason,
      taskId: task.id
    });

    return {
      accepted: true,
      escalated: true,
      reason,
      taskId: task.id
    };
  }

  const signature = PlugincyWorkflowCore.createReplySignature(ticketForJob);
  const settings = await getSettings();
  const existingDraft = forceRetry ? null : await findDraftBySignature(signature);
  if (existingDraft) {
    throw new Error(
      existingDraft.status === "draft_ready" || existingDraft.status === "auto_sent"
        ? "A draft already exists for this ticket. Open Draft Inbox or use Retry."
        : existingDraft.status === "failed" || existingDraft.status === "escalated"
          ? "This ticket already has a saved failed or escalated record. Use Retry in Draft Inbox."
          : `This ticket is already ${
              existingDraft.status === "queued" ? "queued" : "being processed"
            }.`
    );
  }

  const job = {
    id: crypto.randomUUID(),
    signature,
    createdAt: Date.now(),
    originTabId: ticketForJob.originTabId,
    autoSend: settings.autoSendReplies === true,
    ticket: ticketForJob
  };

  const duplicate = await mutateJobState((state) => {
    const existing = PlugincyWorkflowCore.findDuplicateJob(state, signature);
    if (existing && !forceRetry) {
      return existing;
    }
    if (state.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error("The automation queue is full. Finish the current ticket first.");
    }
    state.queue.push(job);
    return null;
  });

  if (duplicate) {
    throw new Error(
      duplicate.status === "processing"
        ? "This ticket is already being processed."
        : "This ticket is already queued."
    );
  }

  await saveDraftRecord({
    id: job.id,
    signature,
    status: "queued",
    ticketUrl: ticketForJob.pageUrl,
    ticketId: ticketForJob.ticketId,
    customer: ticketForJob.customer,
    subject: ticketForJob.subject,
    product: ticketForJob.product?.name || "",
    source: ticketForJob.source,
    ticket: ticketForJob,
    draftText: "",
    error: "",
    attempts: Number(existingDraft?.attempts || 0) + 1,
    createdAt: Number(existingDraft?.createdAt || Date.now()),
    updatedAt: Date.now()
  });

  await logActivity({
    status: "queued",
    title: ticketForJob.subject,
    detail: "Ticket queued for ChatGPT drafting.",
    source: ticketForJob.source,
    sourceUrl: ticketForJob.pageUrl
  });

  void dispatchNextJob();

  return {
    accepted: true,
    escalated: false,
    jobId: job.id,
    draftId: job.id,
    status: "queued"
  };
}

async function createFixedReplyDraft(rawTicket, originTab) {
  if (!rawTicket || typeof rawTicket !== "object") {
    throw new Error("No ticket data was supplied.");
  }

  const rawSubject = String(rawTicket.subject || "");
  const rawText = String(rawTicket.text || "");
  if (
    rawTicket.source === "titan-mail" ||
    originTab?.url?.includes("hostinger.titan.email")
  ) {
    const classification = PlugincyWorkflowCore.classifyEmail({
      subject: rawSubject,
      text: rawText
    });
    if (!classification.isSupport) {
      await logActivity({
        status: "ignored",
        title: cleanText(rawSubject || "Titan email", 160),
        detail: `${classification.reason}; a fixed reply was not created.`,
        source: "titan-mail",
        sourceUrl: rawTicket.pageUrl || originTab?.url || ""
      });
      throw new Error(`${classification.reason}. This email was excluded from support drafting.`);
    }
  }

  const ticket = await enrichTicketWithProduct(normalizeTicket(rawTicket, originTab));
  const replyState = PlugincyWorkflowCore.getPendingReplyState(ticket);
  const ticketForDraft = {
    ...ticket,
    conversationText: replyState.conversationText,
    pendingText: replyState.pendingText,
    pendingMessageCount: replyState.pendingMessageCount,
    lastSupportAt: replyState.lastSupportAt,
    messages: replyState.messages
  };
  const signature = `${PlugincyWorkflowCore.createReplySignature(ticketForDraft)}:fixed`;
  const existingDraft = await findDraftBySignature(signature);
  if (existingDraft) {
    throw new Error("A fixed reply draft already exists for this ticket. Open Draft Inbox.");
  }

  const draftId = crypto.randomUUID();
  const draftText = buildFixedReplyText(ticketForDraft);
  await saveDraftRecord({
    id: draftId,
    signature,
    status: "draft_ready",
    ticketUrl: ticketForDraft.pageUrl,
    ticketId: ticketForDraft.ticketId,
    customer: ticketForDraft.customer,
    subject: ticketForDraft.subject,
    product: ticketForDraft.product?.name || "",
    source: ticketForDraft.source,
    ticket: ticketForDraft,
    draftText,
    error: "",
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  await notifyOrigin(ticketForDraft.originTabId, {
    status: "draft",
    response: "",
    draftId,
    signature,
    autoSend: false
  });

  await logActivity({
    status: "draft",
    title: ticketForDraft.subject,
    detail: "Fixed-status reply saved in the persistent Draft Inbox.",
    source: ticketForDraft.source,
    sourceUrl: ticketForDraft.pageUrl
  });

  return {
    accepted: true,
    escalated: false,
    draftId,
    status: "draft_ready"
  };
}

async function createReviewRequestDraft(rawTicket, originTab) {
  if (!rawTicket || typeof rawTicket !== "object") {
    throw new Error("No ticket data was supplied.");
  }

  const rawSubject = String(rawTicket.subject || "");
  const rawText = String(rawTicket.text || "");
  if (
    rawTicket.source === "titan-mail" ||
    originTab?.url?.includes("hostinger.titan.email")
  ) {
    const classification = PlugincyWorkflowCore.classifyEmail({
      subject: rawSubject,
      text: rawText
    });
    if (!classification.isSupport) {
      await logActivity({
        status: "ignored",
        title: cleanText(rawSubject || "Titan email", 160),
        detail: `${classification.reason}; a review request was not created.`,
        source: "titan-mail",
        sourceUrl: rawTicket.pageUrl || originTab?.url || ""
      });
      throw new Error(`${classification.reason}. This email was excluded from support drafting.`);
    }
  }

  const ticket = await enrichTicketWithProduct(normalizeTicket(rawTicket, originTab));
  const reviewUrl = ticket.product?.resources?.reviewUrl || "";
  if (!reviewUrl) {
    throw new Error("No WordPress.org review link is configured for this matched product.");
  }

  const replyState = PlugincyWorkflowCore.getPendingReplyState(ticket);
  const ticketForDraft = {
    ...ticket,
    conversationText: replyState.conversationText,
    pendingText: replyState.pendingText,
    pendingMessageCount: replyState.pendingMessageCount,
    lastSupportAt: replyState.lastSupportAt,
    messages: replyState.messages
  };
  const signature = `${PlugincyWorkflowCore.createReplySignature(ticketForDraft)}:review`;
  const existingDraft = await findDraftBySignature(signature);
  if (existingDraft) {
    throw new Error("A review request draft already exists for this ticket. Open Draft Inbox.");
  }

  const draftId = crypto.randomUUID();
  const draftText = buildReviewRequestText(ticketForDraft, reviewUrl);
  await saveDraftRecord({
    id: draftId,
    signature,
    status: "draft_ready",
    ticketUrl: ticketForDraft.pageUrl,
    ticketId: ticketForDraft.ticketId,
    customer: ticketForDraft.customer,
    subject: ticketForDraft.subject,
    product: ticketForDraft.product?.name || "",
    source: ticketForDraft.source,
    ticket: ticketForDraft,
    draftText,
    error: "",
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  await notifyOrigin(ticketForDraft.originTabId, {
    status: "draft",
    response: "",
    draftId,
    signature,
    autoSend: false
  });

  await logActivity({
    status: "draft",
    title: ticketForDraft.subject,
    detail: "Product-specific WordPress.org review request saved in Draft Inbox.",
    source: ticketForDraft.source,
    sourceUrl: ticketForDraft.pageUrl
  });

  return {
    accepted: true,
    escalated: false,
    draftId,
    status: "draft_ready"
  };
}

async function processCustomReply(rawTicket, customReplyText, originTab) {
  if (!rawTicket || typeof rawTicket !== "object") {
    throw new Error("No ticket data was supplied.");
  }

  const customText = PlugincyWorkflowCore.normalizeMultiline(customReplyText).slice(
    0,
    3000
  );
  if (customText.length < 2) {
    throw new Error("Type a short custom reply before using this action.");
  }

  const rawSubject = String(rawTicket.subject || "");
  const rawText = String(rawTicket.text || "");
  if (
    rawTicket.source === "titan-mail" ||
    originTab?.url?.includes("hostinger.titan.email")
  ) {
    const classification = PlugincyWorkflowCore.classifyEmail({
      subject: rawSubject,
      text: rawText
    });
    if (!classification.isSupport) {
      await logActivity({
        status: "ignored",
        title: cleanText(rawSubject || "Titan email", 160),
        detail: `${classification.reason}; a custom reply was not sent to ChatGPT.`,
        source: "titan-mail",
        sourceUrl: rawTicket.pageUrl || originTab?.url || ""
      });
      throw new Error(`${classification.reason}. This email was excluded from support drafting.`);
    }
  }

  const ticket = await enrichTicketWithProduct(normalizeTicket(rawTicket, originTab));
  const replyState = PlugincyWorkflowCore.getPendingReplyState(ticket);
  const ticketForJob = {
    ...ticket,
    conversationText: replyState.conversationText,
    pendingText: replyState.pendingText,
    pendingMessageCount: replyState.pendingMessageCount,
    lastSupportAt: replyState.lastSupportAt,
    messages: replyState.messages,
    customReplyText: customText,
    draftMode: "custom"
  };
  const signature = `${PlugincyWorkflowCore.createTicketSignature({
    ...ticketForJob,
    text: customText
  })}:custom`;
  const settings = await getSettings();
  const existingDraft = await findDraftBySignature(signature);
  if (existingDraft) {
    throw new Error("A custom polished draft already exists for this ticket. Open Draft Inbox or change the custom text.");
  }

  const job = {
    id: crypto.randomUUID(),
    signature,
    createdAt: Date.now(),
    originTabId: ticketForJob.originTabId,
    autoSend: settings.autoSendReplies === true,
    ticket: ticketForJob
  };

  const duplicate = await mutateJobState((state) => {
    const existing = PlugincyWorkflowCore.findDuplicateJob(state, signature);
    if (existing) {
      return existing;
    }
    if (state.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error("The automation queue is full. Finish the current ticket first.");
    }
    state.queue.push(job);
    return null;
  });

  if (duplicate) {
    throw new Error(
      duplicate.status === "processing"
        ? "This custom reply is already being processed."
        : "This custom reply is already queued."
    );
  }

  await saveDraftRecord({
    id: job.id,
    signature,
    status: "queued",
    ticketUrl: ticketForJob.pageUrl,
    ticketId: ticketForJob.ticketId,
    customer: ticketForJob.customer,
    subject: ticketForJob.subject,
    product: ticketForJob.product?.name || "",
    source: ticketForJob.source,
    ticket: ticketForJob,
    draftText: "",
    error: "",
    attempts: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  await logActivity({
    status: "queued",
    title: ticketForJob.subject,
    detail: "Custom reply queued for ChatGPT polishing.",
    source: ticketForJob.source,
    sourceUrl: ticketForJob.pageUrl
  });

  void dispatchNextJob();

  return {
    accepted: true,
    escalated: false,
    jobId: job.id,
    draftId: job.id,
    status: "queued"
  };
}

function buildFixedReplyText(ticket) {
  const name = getCustomerGreetingName(ticket?.customer);
  return [
    `Hi${name ? ` ${name}` : ""},`,
    "",
    "We have fixed the issue and checked it from our end. You can check now and let us know if everything looks good.",
    "",
    "Best regards,",
    "Plugincy Support"
  ].join("\n");
}

function buildReviewRequestText(ticket, reviewUrl) {
  const name = getCustomerGreetingName(ticket?.customer);
  const productName = cleanText(ticket?.product?.name || "our plugin", 160);
  return [
    `Hi${name ? ` ${name}` : ""},`,
    "",
    `If you are happy with our support and ${productName}, a 5-star review on WordPress.org would mean a lot to us.`,
    "",
    `You can leave the review here: ${reviewUrl}`,
    "",
    "Thank you for supporting our work.",
    "",
    "Best regards,",
    "Plugincy Support Team"
  ].join("\n");
}

function getCustomerGreetingName(value) {
  const text = cleanText(value, 80);
  if (!text || /@/.test(text)) {
    return "";
  }
  return text.split(/\s+/)[0].replace(/[^a-z.'-]/gi, "").slice(0, 40);
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
    customer: cleanText(rawTicket.customer || "", 160),
    pageUrl,
    originTabId: Number(originTab?.id || rawTicket.originTabId || 0),
    messages: PlugincyWorkflowCore.normalizeConversationMessages(rawTicket.messages, text)
      .slice(0, 80)
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
  const data = await chrome.storage.local.get(null);
  const index = Array.isArray(data[PRODUCT_INDEX_KEY])
    ? data[PRODUCT_INDEX_KEY].filter((id) => typeof id === "string")
    : [];

  return index
    .map((id) => normalizeProduct(data[`${PRODUCT_KEY_PREFIX}${id}`]))
    .filter(Boolean)
    .slice(0, MAX_PRODUCTS);
}

async function ensureDefaultProducts() {
  const data = await chrome.storage.local.get(null);
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
  await chrome.storage.local.set(writes);
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
      reviewUrl: existing.resources.reviewUrl || defaults.resources.reviewUrl,
      customLinks: mergeCustomLinks(
        existing.resources.customLinks,
        defaults.resources.customLinks
      )
    },
    notes:
      !existing.notes || LEGACY_DEFAULT_PRODUCT_NOTES.has(existing.notes)
        ? defaults.notes
        : existing.notes,
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
    reviewUrl: normalizeHttpsUrl(resources.reviewUrl, 1000),
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

function cleanDraftHtml(value, maxLength) {
  const html = String(value || "")
    .replace(/\u0000/g, "")
    .trim();
  return html.length <= maxLength ? html : "";
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
      await updateDraftRecord(job.id, {
        status: "processing",
        error: ""
      });
      const gptTab = await findOrCreateChatGptTab({ active: true });
      await ensureContentScript(
        gptTab.id,
        ["content/prompt-builder.js", "content/gpt-controller.js"],
        "RPA_GPT_PING"
      );

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

async function findOrCreateChatGptTab({ active = false } = {}) {
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
      active,
      pinned: true
    });
    tab = await chrome.tabs.update(tab.id, {
      pinned: true,
      active,
      autoDiscardable: false
    });
    await chrome.storage.session.set({ [GPT_TAB_ID_KEY]: tab.id });
  } else {
    tab = await chrome.tabs.update(tab.id, {
      pinned: true,
      active,
      autoDiscardable: false
    });
  }

  if (active && Number.isInteger(tab.windowId)) {
    await chrome.windows.update(tab.windowId, { focused: true });
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
    files: Array.isArray(file) ? file : [file]
  });

  await delay(250);
  const response = await chrome.tabs.sendMessage(tabId, { type: pingType });
  if (!response?.ready) {
    throw new Error("The required page controller is not ready.");
  }
}

async function handleGptResult(message) {
  const responseText = cleanText(message.response, 30000);
  const responseHtml = cleanDraftHtml(message.responseHtml, 60000);
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
    await updateDraftRecord(job.id, {
      status: "escalated",
      draftText: "",
      error: escalation
    });
  } else {
    await updateDraftRecord(job.id, {
      status: "draft_ready",
      draftText: responseText,
      draftHtml: responseHtml,
      error: ""
    });

    const settings = await getSettings();
    const delivered = await notifyOrigin(job.originTabId, {
      status: "draft",
      response: job.autoSend ? responseText : "",
      jobId: job.id,
      draftId: job.id,
      signature: job.signature,
      autoSend: job.autoSend,
      autoSendDelaySeconds: settings.autoSendDelaySeconds
    });
    if (job.autoSend && !delivered) {
      await updateDraftRecord(job.id, {
        status: "draft_ready",
        error: "The original support tab was closed, so auto-send was skipped."
      });
    }

    await logActivity({
      status: "draft",
      title: job.ticket.subject,
      detail: job.autoSend
        ? "Draft saved; the support page is validating the auto-send target."
        : "Draft saved in the persistent Draft Inbox.",
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
  await updateDraftRecord(job.id, {
    status: "failed",
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
  return PlugincyWorkflowCore.extractEscalationMarker(responseText);
}

function redactCredentialValues(text) {
  return PlugincyWorkflowCore.redactSecrets(text);
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
    ticketId: cleanText(ticket.ticketId || "", 80),
    reason,
    dedupeKey: createTaskDedupeKey(ticket, reason),
    createdAt: Date.now(),
    completedAt: null
  };

  return upsertLocalTask(task);
}

async function upsertLocalTask(task) {
  return withTaskLock(async () => {
    const result = await chrome.storage.local.get(null);
    const currentIndex = Array.isArray(result[TASK_INDEX_KEY])
      ? result[TASK_INDEX_KEY].filter((id) => typeof id === "string")
      : [];
    const existingId = currentIndex.find((id) => {
      const candidate = result[`${TASK_KEY_PREFIX}${id}`];
      if (!candidate || candidate.status === "done") {
        return false;
      }
      if (task.dedupeKey && candidate.dedupeKey === task.dedupeKey) {
        return true;
      }
      return (
        candidate.reason === task.reason &&
        candidate.source === task.source &&
        candidate.sourceUrl &&
        candidate.sourceUrl === task.sourceUrl
      );
    });
    const existingTask = existingId ? result[`${TASK_KEY_PREFIX}${existingId}`] : null;
    const taskToSave = existingTask
      ? {
          ...existingTask,
          ...task,
          id: existingTask.id,
          createdAt: Number(existingTask.createdAt || task.createdAt),
          completedAt: null,
          status: "open"
        }
      : task;

    const nextIndex = [taskToSave.id, ...currentIndex.filter((id) => id !== taskToSave.id)].slice(
      0,
      MAX_TASKS
    );

    await chrome.storage.local.set({
      [TASK_INDEX_KEY]: nextIndex,
      [`${TASK_KEY_PREFIX}${taskToSave.id}`]: taskToSave
    });

    const removedIds = currentIndex.filter((id) => !nextIndex.includes(id));
    if (removedIds.length) {
      await chrome.storage.local.remove(
        removedIds.map((id) => `${TASK_KEY_PREFIX}${id}`)
      );
    }
    return taskToSave;
  });
}

function createTaskDedupeKey(ticket, reason) {
  return cleanText(
    [
      "support-escalation",
      reason,
      ticket.source,
      ticket.ticketId || "",
      ticket.pageUrl || ticket.subject
    ].join("|"),
    500
  );
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
  const candidates = tabs
    .filter(
      (tab) =>
        tab.url?.startsWith("https://hostinger.titan.email/") ||
        PlugincyWorkflowCore.isFluentSupportTicketUrl(tab.url)
    )
    .sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0);
    });

  if (!candidates.length) {
    throw new Error("Open a Fluent Support ticket or Titan email first.");
  }

  let lastConnectionError = null;
  for (const target of candidates) {
    let health;
    try {
      await ensureContentScript(
        target.id,
        ["shared/workflow-core.js", "content/scraper.js", "content/source-notifier.js"],
        "RPA_SUPPORT_PING"
      );
      health = await chrome.tabs.sendMessage(target.id, {
        type: "RPA_SUPPORT_PING"
      });
    } catch (error) {
      lastConnectionError = error;
      console.warn("Support tab was not ready for capture:", error);
      continue;
    }
    if (!health?.detailOpen) {
      continue;
    }

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

  if (lastConnectionError && candidates.length === 1) {
    throw lastConnectionError;
  }
  throw new Error("Open a Fluent Support ticket detail or a readable Titan email first.");
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
      patterns: ["https://plugincy.com/wp-admin/admin.php*"],
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
            ? ["content/prompt-builder.js", "content/gpt-controller.js"]
            : [
                "shared/workflow-core.js",
                "content/scraper.js",
                "content/source-notifier.js"
              ],
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
    const recovery = PlugincyWorkflowCore.recoverTimedOutJob(
      state,
      Date.now(),
      ACTIVE_JOB_TIMEOUT_MS
    );
    state.queue = recovery.state.queue;
    state.active = recovery.state.active;
    return recovery.timedOutJob;
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
    await updateDraftRecord(timedOutJob.id, {
      status: "failed",
      error: "ChatGPT did not finish within six minutes."
    });
  }

  void dispatchNextJob();
}

async function readJobState() {
  const result = await chrome.storage.local.get(JOB_STATE_KEY);
  return normalizeJobState(result[JOB_STATE_KEY]);
}

function mutateJobState(mutator) {
  const operation = jobStateChain.then(async () => {
    const state = await readJobState();
    const result = await mutator(state);
    await chrome.storage.local.set({ [JOB_STATE_KEY]: state });
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

async function refreshWeatherCache(locationName = DEFAULT_WEATHER_LOCATION) {
  const requestedLocation = cleanText(locationName || DEFAULT_WEATHER_LOCATION, 120);
  const place = isDefaultWeatherLocation(requestedLocation)
    ? DEFAULT_WEATHER_COORDINATES
    : await lookupWeatherLocation(requestedLocation);

  const forecastEndpoint = new URL("https://api.open-meteo.com/v1/forecast");
  forecastEndpoint.searchParams.set("latitude", String(place.latitude));
  forecastEndpoint.searchParams.set("longitude", String(place.longitude));
  forecastEndpoint.searchParams.set(
    "current",
    "temperature_2m,precipitation,rain,weather_code"
  );
  forecastEndpoint.searchParams.set(
    "daily",
    "precipitation_probability_max,precipitation_sum,weather_code"
  );
  forecastEndpoint.searchParams.set("forecast_days", "7");
  forecastEndpoint.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastEndpoint.href, {
    method: "GET",
    credentials: "omit",
    cache: "no-cache",
    headers: {
      Accept: "application/json"
    }
  });

  if (!forecastResponse.ok) {
    throw new Error(`Weather forecast failed with HTTP ${forecastResponse.status}.`);
  }

  const forecast = await forecastResponse.json();
  const times = Array.isArray(forecast?.daily?.time) ? forecast.daily.time : [];
  const probabilities = Array.isArray(forecast?.daily?.precipitation_probability_max)
    ? forecast.daily.precipitation_probability_max
    : [];
  const precipitation = Array.isArray(forecast?.daily?.precipitation_sum)
    ? forecast.daily.precipitation_sum
    : [];
  const weatherCodes = Array.isArray(forecast?.daily?.weather_code)
    ? forecast.daily.weather_code
    : [];
  const daily = times.map((date, index) => ({
    date: cleanText(date, 20),
    rainProbability: Math.max(0, Number(probabilities[index] || 0)),
    precipitationSum: Math.max(0, Number(precipitation[index] || 0)),
    weatherCode: Number(weatherCodes[index] || 0)
  }));

  const cache = {
    fetchedAt: Date.now(),
    provider: "Open-Meteo",
    requestedLocation,
    location: {
      name: cleanText(place.name || requestedLocation, 120),
      country: cleanText(place.country || "", 80),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      timezone: cleanText(forecast.timezone || place.timezone || "", 80)
    },
    current: {
      temperature: Number(forecast?.current?.temperature_2m ?? NaN),
      precipitation: Number(forecast?.current?.precipitation ?? 0),
      rain: Number(forecast?.current?.rain ?? 0),
      weatherCode: Number(forecast?.current?.weather_code || 0),
      observedAt: cleanText(forecast?.current?.time || "", 40)
    },
    daily,
    umbrellaDays: daily.filter((day) => Number(day.rainProbability) > 40)
  };

  await chrome.storage.local.set({
    [WEATHER_CACHE_KEY]: cache
  });

  return cache;
}

function isDefaultWeatherLocation(value) {
  const normalized = cleanText(value, 120).toLowerCase();
  return (
    !normalized ||
    normalized === DEFAULT_WEATHER_LOCATION.toLowerCase() ||
    normalized === "police lines, cumilla" ||
    normalized === "police line cumilla"
  );
}

async function lookupWeatherLocation(requestedLocation) {
  const geocodeEndpoint = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeEndpoint.searchParams.set("name", requestedLocation);
  geocodeEndpoint.searchParams.set("count", "1");
  geocodeEndpoint.searchParams.set("language", "en");
  geocodeEndpoint.searchParams.set("format", "json");

  const geocodeResponse = await fetch(geocodeEndpoint.href, {
    method: "GET",
    credentials: "omit",
    cache: "no-cache",
    headers: {
      Accept: "application/json"
    }
  });

  if (!geocodeResponse.ok) {
    throw new Error(`Weather location lookup failed with HTTP ${geocodeResponse.status}.`);
  }

  const geocode = await geocodeResponse.json();
  const place = Array.isArray(geocode?.results) ? geocode.results[0] : null;
  if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
    throw new Error(`Weather location "${requestedLocation}" was not found.`);
  }

  return place;
}

async function refreshReleaseCache() {
  const stored = await chrome.storage.local.get(RELEASE_CACHE_KEY);
  const previousPlugins = Array.isArray(stored[RELEASE_CACHE_KEY]?.plugins)
    ? stored[RELEASE_CACHE_KEY].plugins
    : [];
  const plugins = await Promise.all(
    MONITORED_PLUGINS.map(async (plugin) => {
      try {
        const endpoint = new URL("https://api.wordpress.org/plugins/info/1.2/");
        endpoint.searchParams.set("action", "plugin_information");
        endpoint.searchParams.set("request[slug]", plugin.slug);

        const response = await fetch(endpoint.href, {
          method: "GET",
          credentials: "omit",
          cache: "no-cache",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data || typeof data !== "object" || data.error) {
          throw new Error("WordPress.org returned an invalid plugin record.");
        }

        const lastUpdatedAt = parseWordPressOrgDate(data.last_updated);
        if (!lastUpdatedAt) {
          throw new Error("The last update date was unavailable.");
        }

        const activeInstalls = Math.max(0, Number(data.active_installs || 0));
        const rating = Math.max(0, Math.min(100, Number(data.rating || 0)));
        const numRatings = Math.max(0, Number(data.num_ratings || 0));
        const supportThreads = Math.max(0, Number(data.support_threads || 0));
        const supportThreadsResolved = Math.max(
          0,
          Number(data.support_threads_resolved || 0)
        );
        const previousPlugin = previousPlugins.find(
          (candidate) => candidate.slug === plugin.slug
        );
        const newRatings =
          typeof previousPlugin?.numRatings === "number"
            ? Math.max(0, numRatings - previousPlugin.numRatings)
            : 0;
        const newSupportThreads =
          typeof previousPlugin?.supportThreads === "number"
            ? Math.max(0, supportThreads - previousPlugin.supportThreads)
            : 0;
        const previousRecentMetrics = previousPlugin?.recentMetrics;
        const recentMetrics =
          newRatings || newSupportThreads
            ? {
                newRatings,
                newSupportThreads,
                detectedAt: Date.now()
              }
            : previousRecentMetrics &&
                Date.now() - Number(previousRecentMetrics.detectedAt || 0) < 7 * DAY_MS
              ? previousRecentMetrics
              : null;
        const deadlineAt = lastUpdatedAt + RELEASE_CADENCE_DAYS * DAY_MS;
        return {
          ...plugin,
          ok: true,
          name: decodeXmlEntities(cleanText(data.name || plugin.name, 180)),
          version: cleanText(data.version || "", 40),
          activeInstalls,
          rating,
          numRatings,
          supportThreads,
          supportThreadsResolved,
          recentMetrics,
          lastUpdatedAt,
          deadlineAt,
          daysRemaining: Math.ceil((deadlineAt - Date.now()) / DAY_MS)
        };
      } catch (error) {
        return {
          ...plugin,
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "The WordPress.org release check failed."
        };
      }
    })
  );

  await chrome.storage.local.set({
    [RELEASE_CACHE_KEY]: {
      fetchedAt: Date.now(),
      cadenceDays: RELEASE_CADENCE_DAYS,
      plugins
    }
  });
}

function parseWordPressOrgDate(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(am|pm)\s+GMT$/i
    );
  if (!match) {
    return 0;
  }

  let hour = Number(match[4]);
  const meridiem = match[6].toLowerCase();
  if (hour === 12) {
    hour = 0;
  }
  if (meridiem === "pm") {
    hour += 12;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hour,
    Number(match[5])
  );
}

async function refreshDirectoryWatch() {
  const stored = await chrome.storage.local.get(DIRECTORY_WATCH_KEY);
  const previous =
    stored[DIRECTORY_WATCH_KEY] && typeof stored[DIRECTORY_WATCH_KEY] === "object"
      ? stored[DIRECTORY_WATCH_KEY]
      : {};
  const previousFeeds =
    previous.feeds && typeof previous.feeds === "object" ? previous.feeds : {};

  const results = await Promise.all(
    MONITORED_PLUGINS.flatMap((plugin) =>
      [
        {
          kind: "support",
          label: "support topic",
          pluralLabel: "support topics",
          url: `https://wordpress.org/support/plugin/${plugin.slug}/feed/`
        },
        {
          kind: "review",
          label: "rating/review",
          pluralLabel: "ratings/reviews",
          url: `https://wordpress.org/support/plugin/${plugin.slug}/reviews/feed/`
        }
      ].map(async (feed) => {
        const key = `${plugin.slug}:${feed.kind}`;
        try {
          const response = await fetch(feed.url, {
            method: "GET",
            credentials: "omit",
            cache: "no-cache",
            headers: {
              Accept: "application/rss+xml, text/xml"
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const xml = (await response.text()).slice(0, 500000);
          return {
            ...feed,
            key,
            plugin,
            ok: true,
            items: extractRssItems(xml, 8)
          };
        } catch (error) {
          return {
            ...feed,
            key,
            plugin,
            ok: false,
            error: error instanceof Error ? error.message : "Feed request failed."
          };
        }
      })
    )
  );

  const nextFeeds = { ...previousFeeds };
  const pendingNotifications = [];

  for (const result of results) {
    if (!result.ok) {
      nextFeeds[result.key] = {
        ...previousFeeds[result.key],
        error: result.error,
        checkedAt: Date.now()
      };
      continue;
    }

    const ids = result.items.map((item) => item.id).filter(Boolean);
    const previousFeed = previousFeeds[result.key];
    const previousIds = Array.isArray(previousFeed?.ids) ? previousFeed.ids : [];
    const newItems = previousFeed
      ? result.items.filter((item) => item.id && !previousIds.includes(item.id))
      : [];

    const previousRecent = previousFeed?.recent;
    const recent =
      newItems.length > 0
        ? {
            count: newItems.length,
            title: newItems[0].title,
            link: newItems[0].link,
            detectedAt: Date.now()
          }
        : previousRecent &&
            Date.now() - Number(previousRecent.detectedAt || 0) < 7 * DAY_MS
          ? previousRecent
          : null;

    nextFeeds[result.key] = {
      ids,
      error: "",
      checkedAt: Date.now(),
      latest: result.items[0] || null,
      recent
    };

    if (newItems.length) {
      const latest = newItems[0];
      pendingNotifications.push({
        category: `directory-${result.kind}-${result.plugin.slug}`,
        title:
          newItems.length === 1
            ? `New WordPress.org ${result.label}`
            : `${newItems.length} new WordPress.org ${result.pluralLabel}`,
        message: `${result.plugin.name}: ${latest.title}`,
        targetUrl: latest.link || result.url
      });
    }
  }

  await chrome.storage.local.set({
    [DIRECTORY_WATCH_KEY]: {
      checkedAt: Date.now(),
      feeds: nextFeeds
    }
  });

  await Promise.all(
    pendingNotifications.map((notification) =>
      createWorkbenchNotification(notification)
    )
  );
}

function extractRssItems(xml, limit) {
  const items = [];
  const matches = String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi);

  for (const match of matches) {
    const itemXml = match[1];
    const link = normalizeHttpsUrl(extractXmlElement(itemXml, "link"), 1000);
    const id = cleanText(extractXmlElement(itemXml, "guid") || link, 1000);
    const title = cleanText(
      stripXmlMarkup(extractXmlElement(itemXml, "title")) || "New forum activity",
      220
    );

    if (!id || !link) {
      continue;
    }

    items.push({ id, link, title });
    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function extractXmlElement(xml, tagName) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const match = String(xml || "").match(pattern);
  return String(match?.[1] || "")
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, "$1")
    .trim();
}

function stripXmlMarkup(value) {
  return decodeXmlEntities(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeXmlEntities(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\"",
    "#39": "'"
  };

  return String(value || "").replace(
    /&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot|#39);/gi,
    (match, entity) => {
      const normalized = entity.toLowerCase();
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }
      return entities[normalized] || match;
    }
  );
}

async function handleSourceStateReport(message, tab) {
  const source = ["fluent-support", "titan-mail"].includes(message.source)
    ? message.source
    : "";
  if (!source) {
    throw new Error("Unknown support notification source.");
  }

  const fingerprints = uniqueStrings(
    Array.isArray(message.fingerprints)
      ? message.fingerprints.map((value) => cleanText(value, 120))
      : []
  ).slice(0, 50);
  const stored = await chrome.storage.local.get(SOURCE_STATE_KEY);
  const state =
    stored[SOURCE_STATE_KEY] && typeof stored[SOURCE_STATE_KEY] === "object"
      ? stored[SOURCE_STATE_KEY]
      : {};
  const previous = state[source];
  const previousFingerprints = Array.isArray(previous?.fingerprints)
    ? previous.fingerprints
    : [];
  const rawReportedUnreadCount = Number(message.unreadCount ?? fingerprints.length);
  const rawPreviousUnreadCount = Number(
    previous?.unreadCount ?? previousFingerprints.length
  );
  const reportedUnreadCount = Number.isFinite(rawReportedUnreadCount)
    ? Math.min(50, Math.max(0, rawReportedUnreadCount))
    : fingerprints.length;
  const previousUnreadCount = Number.isFinite(rawPreviousUnreadCount)
    ? Math.min(50, Math.max(0, rawPreviousUnreadCount))
    : previousFingerprints.length;
  const baselineOnly = message.baselineOnly === true || message.listView === false;
  const newFingerprints = previous && !baselineOnly
    ? fingerprints.filter((fingerprint) => !previousFingerprints.includes(fingerprint))
    : [];
  const newItemCount = baselineOnly
    ? 0
    : Math.max(newFingerprints.length, reportedUnreadCount - previousUnreadCount);

  state[source] = {
    fingerprints:
      message.listView === false && previous
        ? previousFingerprints
        : fingerprints.length || !previous
          ? fingerprints
          : previousFingerprints,
    unreadCount:
      message.listView === false && previous
        ? previousUnreadCount
        : reportedUnreadCount,
    listView: message.listView !== false,
    observedAt: Date.now()
  };
  await chrome.storage.local.set({ [SOURCE_STATE_KEY]: state });

  if (newItemCount > 0) {
    const isMail = source === "titan-mail";
    await createWorkbenchNotification({
      category: source,
      title: isMail ? "New Titan mail" : "New Fluent Support ticket",
      message:
        newItemCount === 1
          ? isMail
            ? "A new unread email was detected."
            : "A new unread support ticket was detected."
          : `${newItemCount} new unread ${
              isMail ? "emails were" : "support tickets were"
            } detected.`,
      targetUrl:
        normalizeSupportUrl(message.pageUrl || tab?.url || "") ||
        (isMail
          ? "https://hostinger.titan.email/mail/"
          : "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets")
    });
  }

  return {
    baseline: !previous || baselineOnly,
    newItems: newItemCount
  };
}

async function createWorkbenchNotification({
  category,
  title,
  message,
  targetUrl
}) {
  const normalizedTarget = normalizeHttpsUrl(targetUrl, 1200);
  const notificationId = `rpa-${cleanText(category, 80).replace(/[^a-z0-9_-]+/gi, "-")}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const stored = await chrome.storage.local.get(NOTIFICATION_TARGETS_KEY);
  const current =
    stored[NOTIFICATION_TARGETS_KEY] &&
    typeof stored[NOTIFICATION_TARGETS_KEY] === "object"
      ? stored[NOTIFICATION_TARGETS_KEY]
      : {};
  const entries = Object.entries(current)
    .filter(([, value]) => Date.now() - Number(value?.createdAt || 0) < 7 * DAY_MS)
    .slice(-(MAX_NOTIFICATION_TARGETS - 1));
  const targets = Object.fromEntries(entries);
  targets[notificationId] = {
    url: normalizedTarget,
    createdAt: Date.now()
  };

  await chrome.storage.local.set({ [NOTIFICATION_TARGETS_KEY]: targets });
  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icons/icon-128.png"),
    title: cleanText(title, 120),
    message: cleanText(message, 240),
    priority: 1,
    requireInteraction: true,
    buttons: normalizedTarget ? [{ title: "Open" }] : []
  });
}

async function openNotificationTarget(notificationId) {
  const stored = await chrome.storage.local.get(NOTIFICATION_TARGETS_KEY);
  const targets =
    stored[NOTIFICATION_TARGETS_KEY] &&
    typeof stored[NOTIFICATION_TARGETS_KEY] === "object"
      ? stored[NOTIFICATION_TARGETS_KEY]
      : {};
  const targetUrl = normalizeHttpsUrl(targets[notificationId]?.url, 1200);

  if (targetUrl) {
    const target = new URL(targetUrl);
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => {
      try {
        const candidate = new URL(tab.url || "");
        return (
          candidate.origin === target.origin &&
          candidate.pathname === target.pathname
        );
      } catch {
        return false;
      }
    });

    if (existing?.id) {
      await chrome.tabs.update(existing.id, {
        active: true,
        url: targetUrl
      });
      if (Number.isInteger(existing.windowId)) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: targetUrl, active: true });
    }
  }

  delete targets[notificationId];
  await Promise.all([
    chrome.storage.local.set({ [NOTIFICATION_TARGETS_KEY]: targets }),
    chrome.notifications.clear(notificationId)
  ]);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
