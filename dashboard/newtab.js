(() => {
  "use strict";

  const TASK_INDEX_KEY = "rpa_task_index";
  const TASK_KEY_PREFIX = "rpa_task_";
  const SETTINGS_KEY = "rpa_settings";
  const ACTIVITY_KEY = "rpa_activity";
  const NEWS_CACHE_KEY = "rpa_news_cache";
  const MAX_TASKS = 80;

  const state = {
    tasks: [],
    filter: "all",
    settings: {
      autoSendReplies: false,
      theme: "light"
    }
  };

  const elements = {
    body: document.body,
    currentDate: document.getElementById("current-date"),
    currentDay: document.getElementById("current-day"),
    pageTitle: document.getElementById("page-title"),
    reviewStateCopy: document.getElementById("review-state-copy"),
    taskForm: document.getElementById("task-form"),
    taskTitle: document.getElementById("task-title"),
    taskPriority: document.getElementById("task-priority"),
    taskList: document.getElementById("task-list"),
    taskSummary: document.getElementById("task-summary"),
    syncState: document.getElementById("sync-state"),
    processTicket: document.getElementById("process-ticket"),
    autosendToggle: document.getElementById("autosend-toggle"),
    autosendHelper: document.getElementById("autosend-helper"),
    themeToggle: document.getElementById("theme-toggle"),
    focusSettings: document.getElementById("focus-settings"),
    activityList: document.getElementById("activity-list"),
    refreshActivity: document.getElementById("refresh-activity"),
    newsList: document.getElementById("news-list"),
    refreshNews: document.getElementById("refresh-news"),
    healthList: document.getElementById("health-list"),
    refreshHealth: document.getElementById("refresh-health"),
    toastRegion: document.getElementById("toast-region")
  };

  initialize();

  async function initialize() {
    setDateAndGreeting();
    bindEvents();

    await Promise.allSettled([
      loadSettings(),
      loadTasks(),
      loadActivity(),
      loadNews(),
      loadSessionHealth()
    ]);

    document.body.dataset.rpaDashboard = "ready";
  }

  function bindEvents() {
    elements.taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void addTaskFromForm();
    });

    for (const button of document.querySelectorAll("[data-filter]")) {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter || "all";
        for (const peer of document.querySelectorAll("[data-filter]")) {
          const selected = peer === button;
          peer.classList.toggle("is-active", selected);
          peer.setAttribute("aria-pressed", String(selected));
        }
        renderTasks();
      });
    }

    elements.processTicket.addEventListener("click", () => {
      void processCurrentTicket();
    });

    elements.autosendToggle.addEventListener("change", () => {
      state.settings.autoSendReplies = elements.autosendToggle.checked;
      applySettingsToUi();
      void saveSettings();
    });

    elements.themeToggle.addEventListener("click", () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      applySettingsToUi();
      void saveSettings();
    });

    elements.focusSettings.addEventListener("click", () => {
      document.getElementById("settings-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      elements.autosendToggle.focus();
    });

    elements.refreshActivity.addEventListener("click", () => {
      void loadActivity();
    });

    elements.refreshNews.addEventListener("click", () => {
      void loadNews({ force: true });
    });

    elements.refreshHealth.addEventListener("click", () => {
      void loadSessionHealth();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "sync" &&
        Object.keys(changes).some(
          (key) => key === TASK_INDEX_KEY || key.startsWith(TASK_KEY_PREFIX)
        )
      ) {
        void loadTasks();
      }

      if (areaName === "sync" && changes[SETTINGS_KEY]) {
        void loadSettings();
      }

      if (areaName === "local" && changes[ACTIVITY_KEY]) {
        void loadActivity();
      }

      if (areaName === "local" && changes[NEWS_CACHE_KEY]) {
        void renderNewsCache(changes[NEWS_CACHE_KEY].newValue);
      }
    });
  }

  function setDateAndGreeting() {
    const now = new Date();
    elements.currentDate.textContent = new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(now);
    elements.currentDay.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long"
    }).format(now);

    const hour = now.getHours();
    const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
    elements.pageTitle.textContent = `${greeting} Keep support moving.`;
  }

  async function loadSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const stored = result[SETTINGS_KEY];
    if (stored && typeof stored === "object") {
      state.settings = {
        autoSendReplies: Boolean(stored.autoSendReplies),
        theme: stored.theme === "dark" ? "dark" : "light"
      };
    }
    applySettingsToUi();
  }

  async function saveSettings() {
    setSyncWorking(true);
    try {
      await chrome.storage.sync.set({
        [SETTINGS_KEY]: {
          autoSendReplies: state.settings.autoSendReplies,
          theme: state.settings.theme
        }
      });
      showToast("Preferences synced across Chrome.", "success");
    } catch (error) {
      showToast(getErrorMessage(error, "Preferences could not be saved."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  function applySettingsToUi() {
    const isDark = state.settings.theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    elements.themeToggle.setAttribute("aria-pressed", String(isDark));
    elements.autosendToggle.checked = state.settings.autoSendReplies;

    if (state.settings.autoSendReplies) {
      elements.autosendHelper.textContent = "Replies send after drafting";
      elements.reviewStateCopy.textContent = "Auto-send enabled";
    } else {
      elements.autosendHelper.textContent = "Drafts require review";
      elements.reviewStateCopy.textContent = "Review before send";
    }
  }

  async function loadTasks() {
    setSyncWorking(true);
    try {
      const data = await chrome.storage.sync.get(null);
      const index = Array.isArray(data[TASK_INDEX_KEY])
        ? data[TASK_INDEX_KEY].filter((id) => typeof id === "string")
        : [];

      state.tasks = index
        .map((id) => data[`${TASK_KEY_PREFIX}${id}`])
        .filter(isValidTask)
        .slice(0, MAX_TASKS);

      renderTasks();
    } catch (error) {
      showToast(getErrorMessage(error, "Tasks could not be loaded."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  function isValidTask(task) {
    return Boolean(
      task &&
        typeof task === "object" &&
        typeof task.id === "string" &&
        typeof task.title === "string"
    );
  }

  async function addTaskFromForm() {
    const title = normalizeText(elements.taskTitle.value).slice(0, 160);
    if (!title) {
      elements.taskTitle.focus();
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      notes: "",
      priority: normalizePriority(elements.taskPriority.value),
      status: "open",
      source: "manual",
      sourceUrl: "",
      reason: "",
      createdAt: Date.now(),
      completedAt: null
    };

    setSyncWorking(true);
    try {
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

      const removed = currentIndex.filter((id) => !nextIndex.includes(id));
      if (removed.length) {
        await chrome.storage.sync.remove(
          removed.map((id) => `${TASK_KEY_PREFIX}${id}`)
        );
      }

      elements.taskForm.reset();
      elements.taskPriority.value = "medium";
      elements.taskTitle.focus();
      showToast("Task added to your synced work list.", "success");
      await loadTasks();
    } catch (error) {
      showToast(getErrorMessage(error, "The task could not be added."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  async function updateTask(task, changes) {
    const updated = {
      ...task,
      ...changes
    };

    setSyncWorking(true);
    try {
      await chrome.storage.sync.set({
        [`${TASK_KEY_PREFIX}${task.id}`]: updated
      });
      state.tasks = state.tasks.map((item) => (item.id === task.id ? updated : item));
      renderTasks();
    } catch (error) {
      showToast(getErrorMessage(error, "The task could not be updated."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  async function deleteTask(task) {
    setSyncWorking(true);
    try {
      const result = await chrome.storage.sync.get(TASK_INDEX_KEY);
      const currentIndex = Array.isArray(result[TASK_INDEX_KEY])
        ? result[TASK_INDEX_KEY]
        : [];

      await Promise.all([
        chrome.storage.sync.set({
          [TASK_INDEX_KEY]: currentIndex.filter((id) => id !== task.id)
        }),
        chrome.storage.sync.remove(`${TASK_KEY_PREFIX}${task.id}`)
      ]);

      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      renderTasks();
      showToast("Task deleted.");
    } catch (error) {
      showToast(getErrorMessage(error, "The task could not be deleted."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  function renderTasks() {
    const sorted = [...state.tasks].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "open" ? -1 : 1;
      }
      const priorityDifference = priorityWeight(b.priority) - priorityWeight(a.priority);
      return priorityDifference || Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    const visible = sorted.filter((task) => {
      if (state.filter === "open") {
        return task.status !== "done";
      }
      if (state.filter === "done") {
        return task.status === "done";
      }
      return true;
    });

    const openCount = state.tasks.filter((task) => task.status !== "done").length;
    elements.taskSummary.textContent = `${openCount} open ${openCount === 1 ? "task" : "tasks"}`;
    elements.taskList.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const wrapper = document.createElement("div");
      const title = document.createElement("strong");
      const copy = document.createElement("p");

      if (state.filter === "done") {
        title.textContent = "No completed tasks yet";
        copy.textContent = "Finished work will remain here until you delete it.";
      } else if (state.filter === "open") {
        title.textContent = "Your open list is clear";
        copy.textContent = "Add a task or process a support ticket.";
      } else {
        title.textContent = "Start with the next concrete task";
        copy.textContent = "Escalated support tickets will appear here automatically.";
      }

      wrapper.append(title, copy);
      empty.append(wrapper);
      elements.taskList.append(empty);
      return;
    }

    visible.forEach((task, index) => {
      elements.taskList.append(createTaskRow(task, index));
    });
  }

  function createTaskRow(task, index) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.classList.toggle("is-complete", task.status === "done");
    row.style.animationDelay = `${Math.min(index * 25, 125)}ms`;

    const completeButton = document.createElement("button");
    completeButton.className = "task-check";
    completeButton.type = "button";
    completeButton.setAttribute("aria-pressed", String(task.status === "done"));
    completeButton.setAttribute(
      "aria-label",
      task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`
    );
    completeButton.append(createIcon("check"));
    completeButton.addEventListener("click", () => {
      const completing = task.status !== "done";
      void updateTask(task, {
        status: completing ? "done" : "open",
        completedAt: completing ? Date.now() : null
      });
    });

    const copy = document.createElement("div");
    copy.className = "task-copy";
    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;
    title.title = task.title;
    const note = document.createElement("p");
    note.className = "task-note";
    note.textContent =
      normalizeText(task.notes) || (task.reason ? "Developer review required" : "Manual work item");
    note.title = note.textContent;
    copy.append(title, note);

    const priority = document.createElement("select");
    priority.className = "priority-select";
    priority.setAttribute("aria-label", `Priority for ${task.title}`);
    for (const value of ["high", "medium", "low"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = capitalize(value);
      priority.append(option);
    }
    priority.value = normalizePriority(task.priority);
    priority.dataset.priority = priority.value;
    priority.addEventListener("change", () => {
      priority.dataset.priority = priority.value;
      void updateTask(task, { priority: normalizePriority(priority.value) });
    });

    const source = document.createElement(task.sourceUrl ? "a" : "span");
    source.className = "task-source";
    if (task.sourceUrl && source instanceof HTMLAnchorElement) {
      source.href = safeHttpsUrl(task.sourceUrl);
      source.target = "_blank";
      source.rel = "noreferrer";
    }
    const sourceMark = document.createElement("span");
    sourceMark.className = "source-mark";
    sourceMark.textContent = sourceInitial(task.source);
    const sourceLabel = document.createElement("span");
    sourceLabel.className = "task-source-label";
    sourceLabel.textContent = sourceName(task.source);
    source.append(sourceMark, sourceLabel);

    const time = document.createElement("time");
    time.className = "task-time";
    time.dateTime = new Date(Number(task.createdAt || Date.now())).toISOString();
    time.textContent = relativeDate(Number(task.createdAt || Date.now()));

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-task";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
    deleteButton.append(createIcon("trash"));
    deleteButton.addEventListener("click", () => {
      void deleteTask(task);
    });

    row.append(completeButton, copy, priority, source, time, deleteButton);
    return row;
  }

  async function processCurrentTicket() {
    setButtonWorking(elements.processTicket, true, "Starting automation…");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "RPA_PROCESS_CURRENT_TICKET"
      });

      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "No support ticket could be processed.");
      }

      showToast(
        response.source === "titan-mail"
          ? "Titan email queued for drafting."
          : "Fluent Support ticket queued for drafting.",
        "success"
      );
      await loadActivity();
    } catch (error) {
      showToast(
        getErrorMessage(error, "Open a support ticket or Titan email first."),
        "error"
      );
    } finally {
      setButtonWorking(elements.processTicket, false);
    }
  }

  async function loadActivity() {
    elements.activityList.replaceChildren(createLoadingRow("Loading recent automation…"));

    try {
      const [activityResult, queueResponse] = await Promise.all([
        chrome.storage.local.get(ACTIVITY_KEY),
        chrome.runtime.sendMessage({ type: "RPA_GET_QUEUE_STATUS" })
      ]);

      const activity = Array.isArray(activityResult[ACTIVITY_KEY])
        ? activityResult[ACTIVITY_KEY]
        : [];
      renderActivity(activity.slice(0, 4), queueResponse);
    } catch (error) {
      elements.activityList.replaceChildren(
        createLoadingRow(getErrorMessage(error, "Automation activity is unavailable."))
      );
    }
  }

  function renderActivity(activity, queueResponse) {
    elements.activityList.replaceChildren();
    const rows = [...activity];

    if (queueResponse?.ok && queueResponse.active) {
      const activeExists = rows.some(
        (item) =>
          item.status === "processing" &&
          item.title === queueResponse.active.subject
      );
      if (!activeExists) {
        rows.unshift({
          id: queueResponse.active.id,
          status: "processing",
          title: queueResponse.active.subject,
          detail: "ChatGPT is preparing a draft.",
          createdAt: queueResponse.active.startedAt
        });
      }
    }

    if (!rows.length) {
      const placeholder = {
        status: "ready",
        title: "Support automation is ready",
        detail: "Open a ticket, then select Process current ticket.",
        createdAt: Date.now()
      };
      elements.activityList.append(createActivityRow(placeholder));
      return;
    }

    rows.slice(0, 4).forEach((entry) => {
      elements.activityList.append(createActivityRow(entry));
    });
  }

  function createActivityRow(entry) {
    const row = document.createElement("div");
    row.className = "activity-row";

    const dot = document.createElement("span");
    dot.className = "activity-dot";
    dot.dataset.status = entry.status || "ready";

    const status = document.createElement("span");
    status.className = "activity-status";
    status.dataset.status = entry.status || "ready";
    status.textContent = activityStatusLabel(entry.status);

    const copy = document.createElement("div");
    copy.className = "activity-copy";
    const title = document.createElement("strong");
    title.textContent = normalizeText(entry.title) || "Support automation";
    const detail = document.createElement("span");
    detail.textContent = normalizeText(entry.detail) || "Ready";
    detail.title = detail.textContent;
    copy.append(title, detail);

    const time = document.createElement("time");
    time.className = "activity-time";
    const createdAt = Number(entry.createdAt || Date.now());
    time.dateTime = new Date(createdAt).toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit"
    }).format(createdAt);

    row.append(dot, status, copy, time);
    return row;
  }

  async function loadNews({ force = false } = {}) {
    setIconButtonWorking(elements.refreshNews, true);
    elements.newsList.replaceChildren(createLoadingRow("Loading developer updates…"));

    try {
      if (force) {
        const response = await chrome.runtime.sendMessage({
          type: "RPA_REFRESH_NEWS"
        });
        if (!response?.ok) {
          throw new Error(response?.error || "News refresh failed.");
        }
      }

      let result = await chrome.storage.local.get(NEWS_CACHE_KEY);
      let cache = result[NEWS_CACHE_KEY];
      if (!cache?.sources?.length) {
        const response = await chrome.runtime.sendMessage({
          type: "RPA_REFRESH_NEWS"
        });
        if (!response?.ok) {
          throw new Error(response?.error || "News refresh failed.");
        }
        result = await chrome.storage.local.get(NEWS_CACHE_KEY);
        cache = result[NEWS_CACHE_KEY];
      }

      renderNewsCache(cache);
      if (force) {
        showToast("Developer updates refreshed.", "success");
      }
    } catch (error) {
      elements.newsList.replaceChildren(
        createLoadingRow(getErrorMessage(error, "Developer updates are unavailable."))
      );
    } finally {
      setIconButtonWorking(elements.refreshNews, false);
    }
  }

  function renderNewsCache(cache) {
    const articles = [];

    for (const source of Array.isArray(cache?.sources) ? cache.sources : []) {
      if (!source.ok || typeof source.xml !== "string") {
        continue;
      }
      articles.push(...parseFeed(source));
    }

    articles.sort((a, b) => b.publishedAt - a.publishedAt);
    elements.newsList.replaceChildren();

    if (!articles.length) {
      elements.newsList.append(
        createLoadingRow("No feed items are available. Use refresh to try again.")
      );
      return;
    }

    articles.slice(0, 6).forEach((article) => {
      elements.newsList.append(createNewsItem(article));
    });
  }

  function parseFeed(source) {
    const documentNode = new DOMParser().parseFromString(source.xml, "text/xml");
    if (documentNode.querySelector("parsererror")) {
      return [];
    }

    const nodes = [
      ...documentNode.querySelectorAll("item"),
      ...documentNode.querySelectorAll("entry")
    ];

    return nodes.slice(0, 10).flatMap((node) => {
      const title = normalizeText(node.querySelector("title")?.textContent).slice(0, 220);
      const linkNode = node.querySelector("link");
      const link = safeHttpsUrl(
        linkNode?.getAttribute("href") || linkNode?.textContent || ""
      );
      const dateText =
        node.querySelector("pubDate")?.textContent ||
        node.querySelector("published")?.textContent ||
        node.querySelector("updated")?.textContent ||
        "";
      const publishedAt = Date.parse(dateText) || 0;

      if (!title || !link) {
        return [];
      }

      return [
        {
          title,
          link,
          sourceId: source.id,
          sourceName: source.name,
          publishedAt
        }
      ];
    });
  }

  function createNewsItem(article) {
    const item = document.createElement("a");
    item.className = "news-item";
    item.href = article.link;
    item.target = "_blank";
    item.rel = "noreferrer";

    const mark = document.createElement("span");
    mark.className = "news-mark";
    if (article.sourceId === "woocommerce") {
      mark.classList.add("is-woo");
      mark.textContent = "WOO";
    } else {
      mark.textContent = "WP";
    }

    const copy = document.createElement("div");
    copy.className = "news-copy";
    const title = document.createElement("p");
    title.className = "news-title";
    title.textContent = article.title;
    const meta = document.createElement("div");
    meta.className = "news-meta";
    const source = document.createElement("span");
    source.textContent = article.sourceName;
    const date = document.createElement("time");
    if (article.publishedAt) {
      date.dateTime = new Date(article.publishedAt).toISOString();
      date.textContent = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric"
      }).format(article.publishedAt);
    } else {
      date.textContent = "Recent";
    }
    meta.append(source, date);
    copy.append(title, meta);
    item.append(mark, copy);
    return item;
  }

  async function loadSessionHealth() {
    setIconButtonWorking(elements.refreshHealth, true);
    elements.healthList.replaceChildren(createLoadingRow("Checking open sessions…"));

    try {
      const response = await chrome.runtime.sendMessage({
        type: "RPA_GET_SESSION_HEALTH"
      });

      if (!response?.ok || !Array.isArray(response.services)) {
        throw new Error(response?.error || "Session status is unavailable.");
      }

      elements.healthList.replaceChildren();
      response.services.forEach((service) => {
        elements.healthList.append(createHealthRow(service));
      });
    } catch (error) {
      elements.healthList.replaceChildren(
        createLoadingRow(getErrorMessage(error, "Session status is unavailable."))
      );
    } finally {
      setIconButtonWorking(elements.refreshHealth, false);
    }
  }

  function createHealthRow(service) {
    const row = document.createElement("div");
    row.className = "health-row";

    const icon = document.createElement("span");
    icon.className = "health-icon";
    icon.textContent =
      service.id === "chatgpt" ? "AI" : service.id === "titan-mail" ? "TM" : "FS";

    const copy = document.createElement("div");
    copy.className = "health-copy";
    const label = document.createElement("strong");
    label.textContent = service.label;
    const detail = document.createElement("span");
    detail.textContent = service.detail;
    copy.append(label, detail);

    const status = document.createElement("span");
    status.className = "health-state";
    status.dataset.state = service.state;
    status.title = service.detail;

    row.append(icon, copy, status);
    return row;
  }

  function createLoadingRow(text) {
    const row = document.createElement("div");
    row.className = "loading-row";
    row.textContent = text;
    return row;
  }

  function createIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const paths = {
      check: ["m5 12 4 4L19 6"],
      trash: [
        "M4 7h16",
        "M9 7V4h6v3",
        "m7 7-1 13H8L7 7",
        "M10 11v5M14 11v5"
      ]
    };

    for (const pathData of paths[name] || []) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      svg.append(path);
    }

    return svg;
  }

  function setSyncWorking(working) {
    elements.syncState.classList.toggle("is-working", working);
    elements.syncState.lastChild.textContent = working ? " Syncing…" : " Synced";
  }

  function setIconButtonWorking(button, working) {
    button.classList.toggle("is-working", working);
    button.disabled = working;
  }

  function setButtonWorking(button, working, text = "") {
    const label = button.querySelector("span");
    if (!button.dataset.defaultLabel && label) {
      button.dataset.defaultLabel = label.textContent;
    }
    button.disabled = working;
    if (label) {
      label.textContent = working ? text : button.dataset.defaultLabel;
    }
  }

  function showToast(message, kind = "info") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.kind = kind;
    toast.textContent = message;
    elements.toastRegion.append(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePriority(value) {
    return ["high", "medium", "low"].includes(value) ? value : "medium";
  }

  function priorityWeight(value) {
    return value === "high" ? 3 : value === "low" ? 1 : 2;
  }

  function capitalize(value) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  function sourceName(value) {
    if (value === "fluent-support") {
      return "Fluent Support";
    }
    if (value === "titan-mail") {
      return "Titan Mail";
    }
    return "Manual";
  }

  function sourceInitial(value) {
    if (value === "fluent-support") {
      return "FS";
    }
    if (value === "titan-mail") {
      return "TM";
    }
    return "M";
  }

  function activityStatusLabel(value) {
    if (value === "processing") {
      return "Drafting";
    }
    if (value === "draft") {
      return "Draft inserted";
    }
    return normalizeText(value) || "Ready";
  }

  function relativeDate(timestamp) {
    const then = new Date(timestamp);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startThen = new Date(
      then.getFullYear(),
      then.getMonth(),
      then.getDate()
    ).getTime();
    const dayDifference = Math.round((startToday - startThen) / 86400000);

    if (dayDifference === 0) {
      return "Today";
    }
    if (dayDifference === 1) {
      return "Yesterday";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric"
    }).format(then);
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function getErrorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
})();
