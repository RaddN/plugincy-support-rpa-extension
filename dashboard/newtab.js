(() => {
  "use strict";

  const TASK_INDEX_KEY = "rpa_task_index";
  const TASK_KEY_PREFIX = "rpa_task_";
  const PRODUCT_INDEX_KEY = "rpa_product_index";
  const PRODUCT_KEY_PREFIX = "rpa_product_";
  const SETTINGS_KEY = "rpa_settings";
  const ACTIVITY_KEY = "rpa_activity";
  const NEWS_CACHE_KEY = "rpa_news_cache";
  const MAX_TASKS = 80;
  const MAX_PRODUCTS = 150;
  const MAX_PRODUCT_LINKS = 30;

  const state = {
    tasks: [],
    products: [],
    filter: "all",
    preferencesOpen: false,
    settings: {
      autoSendReplies: false,
      autoProcessTickets: true,
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
    preferencesSection: document.getElementById("preferences-section"),
    closePreferences: document.getElementById("close-preferences"),
    autoprocessToggle: document.getElementById("autoprocess-toggle"),
    preferencesAutosendToggle: document.getElementById("preferences-autosend-toggle"),
    autosendHelper: document.getElementById("autosend-helper"),
    themeToggle: document.getElementById("theme-toggle"),
    focusSettings: document.getElementById("focus-settings"),
    productForm: document.getElementById("product-form"),
    productId: document.getElementById("product-id"),
    productName: document.getElementById("product-name"),
    productKeywords: document.getElementById("product-keywords"),
    productGithub: document.getElementById("product-github"),
    productDocs: document.getElementById("product-docs"),
    productLanding: document.getElementById("product-landing"),
    productSupport: document.getElementById("product-support"),
    productCustomLinks: document.getElementById("product-custom-links"),
    productNotes: document.getElementById("product-notes"),
    productSave: document.getElementById("product-save"),
    productCancel: document.getElementById("product-cancel"),
    productList: document.getElementById("product-list"),
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

    await ensureDefaultProducts();

    await Promise.allSettled([
      loadSettings(),
      loadTasks(),
      loadProducts(),
      loadActivity(),
      loadNews(),
      loadSessionHealth()
    ]);

    document.body.dataset.rpaDashboard = "ready";
  }

  async function ensureDefaultProducts() {
    try {
      await chrome.runtime.sendMessage({
        type: "RPA_ENSURE_DEFAULT_PRODUCTS"
      });
    } catch {
      // Product loading below will still render any existing synced records.
    }
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

    elements.preferencesAutosendToggle.addEventListener("change", () => {
      state.settings.autoSendReplies = elements.preferencesAutosendToggle.checked;
      applySettingsToUi();
      void saveSettings();
    });

    elements.autoprocessToggle.addEventListener("change", () => {
      state.settings.autoProcessTickets = elements.autoprocessToggle.checked;
      applySettingsToUi();
      void saveSettings();
    });

    elements.themeToggle.addEventListener("click", () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      applySettingsToUi();
      void saveSettings();
    });

    elements.focusSettings.addEventListener("click", () => {
      openPreferences();
      elements.preferencesSection?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      elements.autoprocessToggle.focus();
    });

    elements.closePreferences.addEventListener("click", () => {
      closePreferences();
    });

    elements.productForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void saveProductFromForm();
    });

    elements.productCancel.addEventListener("click", () => {
      resetProductForm();
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

      if (
        areaName === "sync" &&
        Object.keys(changes).some(
          (key) => key === PRODUCT_INDEX_KEY || key.startsWith(PRODUCT_KEY_PREFIX)
        )
      ) {
        void loadProducts();
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
        autoProcessTickets:
          stored.autoProcessTickets === undefined
            ? true
            : Boolean(stored.autoProcessTickets),
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
          autoProcessTickets: state.settings.autoProcessTickets,
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
    elements.preferencesAutosendToggle.checked = state.settings.autoSendReplies;
    elements.autoprocessToggle.checked = state.settings.autoProcessTickets;

    if (state.settings.autoSendReplies) {
      elements.autosendHelper.textContent = "Replies send after drafting";
      elements.reviewStateCopy.textContent = "Auto-send enabled";
    } else if (state.settings.autoProcessTickets) {
      elements.autosendHelper.textContent = "Auto-draft enabled";
      elements.reviewStateCopy.textContent = "Auto-draft, review before send";
    } else {
      elements.autosendHelper.textContent = "Drafts require review";
      elements.reviewStateCopy.textContent = "Review before send";
    }
  }

  function openPreferences() {
    state.preferencesOpen = true;
    elements.preferencesSection.hidden = false;
  }

  function closePreferences() {
    state.preferencesOpen = false;
    elements.preferencesSection.hidden = true;
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

  async function loadProducts() {
    setSyncWorking(true);
    try {
      const data = await chrome.storage.sync.get(null);
      const index = Array.isArray(data[PRODUCT_INDEX_KEY])
        ? data[PRODUCT_INDEX_KEY].filter((id) => typeof id === "string")
        : [];

      state.products = index
        .map((id) => normalizeProduct(data[`${PRODUCT_KEY_PREFIX}${id}`]))
        .filter(Boolean)
        .slice(0, MAX_PRODUCTS);

      renderProducts();
    } catch (error) {
      showToast(getErrorMessage(error, "Products could not be loaded."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  function normalizeProduct(product) {
    if (!product || typeof product !== "object") {
      return null;
    }

    const id = normalizeText(product.id).slice(0, 80);
    const name = normalizeText(product.name).slice(0, 160);
    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      keywords: normalizeKeywords(product.keywords),
      resources: {
        githubUrl: safeHttpsUrl(product.resources?.githubUrl || product.githubUrl),
        docsUrl: safeHttpsUrl(product.resources?.docsUrl || product.docsUrl),
        landingUrl: safeHttpsUrl(product.resources?.landingUrl || product.landingUrl),
        supportUrl: safeHttpsUrl(product.resources?.supportUrl || product.supportUrl),
        changelogUrl: safeHttpsUrl(product.resources?.changelogUrl || product.changelogUrl),
        customLinks: normalizeCustomLinks(product.resources?.customLinks)
      },
      notes: normalizeMultiline(product.notes).slice(0, 1000),
      createdAt: Number(product.createdAt || Date.now()),
      updatedAt: Number(product.updatedAt || product.createdAt || Date.now())
    };
  }

  async function saveProductFromForm() {
    const existingId = normalizeText(elements.productId.value).slice(0, 80);
    const currentProduct = existingId
      ? state.products.find((product) => product.id === existingId)
      : null;
    const name = normalizeText(elements.productName.value).slice(0, 160);

    if (!name) {
      elements.productName.focus();
      return;
    }

    const product = {
      id: existingId || crypto.randomUUID(),
      name,
      keywords: normalizeKeywords(elements.productKeywords.value),
      resources: {
        githubUrl: safeHttpsUrl(elements.productGithub.value),
        docsUrl: safeHttpsUrl(elements.productDocs.value),
        landingUrl: safeHttpsUrl(elements.productLanding.value),
        supportUrl: safeHttpsUrl(elements.productSupport.value),
        changelogUrl: "",
        customLinks: parseCustomLinks(elements.productCustomLinks.value)
      },
      notes: normalizeMultiline(elements.productNotes.value).slice(0, 1000),
      createdAt: currentProduct?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    setSyncWorking(true);
    try {
      const result = await chrome.storage.sync.get(PRODUCT_INDEX_KEY);
      const currentIndex = Array.isArray(result[PRODUCT_INDEX_KEY])
        ? result[PRODUCT_INDEX_KEY].filter((id) => typeof id === "string")
        : [];
      const nextIndex = [product.id, ...currentIndex.filter((id) => id !== product.id)].slice(
        0,
        MAX_PRODUCTS
      );

      await chrome.storage.sync.set({
        [PRODUCT_INDEX_KEY]: nextIndex,
        [`${PRODUCT_KEY_PREFIX}${product.id}`]: product
      });

      const removed = currentIndex.filter((id) => !nextIndex.includes(id));
      if (removed.length) {
        await chrome.storage.sync.remove(
          removed.map((id) => `${PRODUCT_KEY_PREFIX}${id}`)
        );
      }

      resetProductForm();
      showToast("Product resources saved and synced.", "success");
      await loadProducts();
    } catch (error) {
      showToast(getErrorMessage(error, "Product resources could not be saved."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  async function deleteProduct(product) {
    setSyncWorking(true);
    try {
      const result = await chrome.storage.sync.get(PRODUCT_INDEX_KEY);
      const currentIndex = Array.isArray(result[PRODUCT_INDEX_KEY])
        ? result[PRODUCT_INDEX_KEY]
        : [];

      await Promise.all([
        chrome.storage.sync.set({
          [PRODUCT_INDEX_KEY]: currentIndex.filter((id) => id !== product.id)
        }),
        chrome.storage.sync.remove(`${PRODUCT_KEY_PREFIX}${product.id}`)
      ]);

      if (elements.productId.value === product.id) {
        resetProductForm();
      }
      state.products = state.products.filter((item) => item.id !== product.id);
      renderProducts();
      showToast("Product removed.");
    } catch (error) {
      showToast(getErrorMessage(error, "Product could not be deleted."), "error");
    } finally {
      setSyncWorking(false);
    }
  }

  function editProduct(product) {
    openPreferences();
    elements.productId.value = product.id;
    elements.productName.value = product.name;
    elements.productKeywords.value = product.keywords.join(", ");
    elements.productGithub.value = product.resources.githubUrl;
    elements.productDocs.value = product.resources.docsUrl;
    elements.productLanding.value = product.resources.landingUrl;
    elements.productSupport.value = product.resources.supportUrl || product.resources.changelogUrl;
    elements.productCustomLinks.value = serializeCustomLinks(product.resources.customLinks);
    elements.productNotes.value = product.notes;
    elements.productSave.textContent = "Update product";
    elements.productCancel.hidden = false;
    elements.productName.focus();
  }

  function resetProductForm() {
    elements.productForm.reset();
    elements.productId.value = "";
    elements.productSave.textContent = "Save product";
    elements.productCancel.hidden = true;
  }

  function renderProducts() {
    elements.productList.replaceChildren();

    if (!state.products.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const wrapper = document.createElement("div");
      const title = document.createElement("strong");
      const copy = document.createElement("p");
      title.textContent = "Add your first plugin resource";
      copy.textContent =
        "ChatGPT will use configured GitHub, docs, landing and support links when drafting replies.";
      wrapper.append(title, copy);
      empty.append(wrapper);
      elements.productList.append(empty);
      return;
    }

    [...state.products]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((product) => {
        elements.productList.append(createProductCard(product));
      });
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    card.className = "product-card";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = product.name;

    const meta = document.createElement("p");
    meta.textContent = product.keywords.length
      ? `Matches: ${product.keywords.join(", ")}`
      : "Matches by product name";

    const links = document.createElement("div");
    links.className = "product-links";
    for (const [label, url] of productLinks(product)) {
      if (!url) {
        continue;
      }
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = label;
      links.append(link);
    }

    if (product.notes) {
      const chip = document.createElement("span");
      chip.className = "product-chip";
      chip.textContent = "Notes";
      links.append(chip);
    }

    copy.append(title, meta, links);

    const actions = document.createElement("div");
    actions.className = "product-card-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      editProduct(product);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      void deleteProduct(product);
    });

    actions.append(editButton, deleteButton);
    card.append(copy, actions);
    return card;
  }

  function productLinks(product) {
    return [
      ["GitHub", product.resources.githubUrl],
      ["Docs", product.resources.docsUrl],
      ["Landing", product.resources.landingUrl],
      ["Support", product.resources.supportUrl],
      ["Changelog", product.resources.changelogUrl],
      ...product.resources.customLinks.map((link) => [link.label, link.url])
    ];
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

  function normalizeMultiline(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeKeywords(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
    const seen = new Set();
    const keywords = [];

    for (const item of raw) {
      const keyword = normalizeText(item).toLowerCase().slice(0, 80);
      if (keyword.length < 2 || seen.has(keyword)) {
        continue;
      }
      seen.add(keyword);
      keywords.push(keyword);
    }

    return keywords.slice(0, 20);
  }

  function parseCustomLinks(value) {
    const lines = normalizeMultiline(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const links = [];

    for (const line of lines) {
      const urlMatch = line.match(/https:\/\/[^\s]+/i);
      if (!urlMatch) {
        continue;
      }

      const url = safeHttpsUrl(urlMatch[0].replace(/[.,;!?]+$/, ""));
      if (!url) {
        continue;
      }

      const beforeUrl = line
        .slice(0, urlMatch.index)
        .trim()
        .replace(/[:\-\u2013\u2014|]+$/, "");
      const afterUrl = line.slice((urlMatch.index || 0) + urlMatch[0].length).trim();
      const label =
        normalizeText(beforeUrl) ||
        normalizeText(afterUrl.replace(/^[-:\u2013\u2014|]+/, "")) ||
        inferLinkLabel(url);

      links.push({
        label: label.slice(0, 80) || "Resource",
        url
      });
    }

    return normalizeCustomLinks(links);
  }

  function normalizeCustomLinks(value) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set();
    const links = [];

    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const url = safeHttpsUrl(item.url);
      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      links.push({
        label: (normalizeText(item.label) || inferLinkLabel(url)).slice(0, 80),
        url
      });
    }

    return links.slice(0, MAX_PRODUCT_LINKS);
  }

  function serializeCustomLinks(links) {
    return normalizeCustomLinks(links)
      .map((link) => `${link.label}: ${link.url}`)
      .join("\n");
  }

  function inferLinkLabel(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, "");
      const slug = url.pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, " ");
      return normalizeText(slug || host) || "Resource";
    } catch {
      return "Resource";
    }
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
