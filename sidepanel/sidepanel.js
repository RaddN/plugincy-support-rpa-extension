(() => {
  "use strict";

  const SETTINGS_KEY = "rpa_settings";
  const TASK_INDEX_KEY = "rpa_task_index";
  const TASK_KEY_PREFIX = "rpa_task_";
  const DRAFT_INDEX_KEY = "rpa_draft_index";
  const DRAFT_KEY_PREFIX = "rpa_draft_";
  const MAX_TASKS = 80;
  const DROP_DRAFT_TAGS = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE"]);
  const SAFE_DRAFT_TAGS = new Set([
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

  const state = {
    drafts: [],
    tasks: [],
    settings: {
      autoSendReplies: false,
      autoProcessTickets: false,
      autoSendDelaySeconds: 8,
      sidebarCollapsed: false,
      theme: "light"
    }
  };

  const elements = {
    openDashboard: document.getElementById("open-dashboard"),
    processTicket: document.getElementById("process-ticket"),
    openChatgpt: document.getElementById("open-chatgpt"),
    queueDot: document.getElementById("queue-dot"),
    queueStatus: document.getElementById("queue-status"),
    automationTitle: document.getElementById("automation-title"),
    autosendToggle: document.getElementById("autosend-toggle"),
    autosendCopy: document.getElementById("autosend-copy"),
    draftCount: document.getElementById("draft-count"),
    draftList: document.getElementById("draft-list"),
    refreshDrafts: document.getElementById("refresh-drafts"),
    taskCount: document.getElementById("task-count"),
    taskList: document.getElementById("task-list"),
    taskForm: document.getElementById("task-form"),
    taskTitle: document.getElementById("task-title"),
    taskNotes: document.getElementById("task-notes"),
    taskPriority: document.getElementById("task-priority"),
    taskDue: document.getElementById("task-due"),
    taskSearch: document.getElementById("task-search"),
    toast: document.getElementById("toast")
  };

  initialize();

  async function initialize() {
    bindEvents();
    await Promise.allSettled([loadSettings(), loadDrafts(), loadTasks(), loadQueue()]);
  }

  function bindEvents() {
    for (const tab of document.querySelectorAll("[data-tab]")) {
      tab.addEventListener("click", () => selectTab(tab.dataset.tab));
    }

    elements.openDashboard.addEventListener("click", () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/newtab.html") });
    });
    elements.processTicket.addEventListener("click", () => void processCurrentTicket());
    elements.openChatgpt.addEventListener("click", () =>
      void chrome.runtime.sendMessage({ type: "RPA_OPEN_CHATGPT" })
    );
    elements.refreshDrafts.addEventListener("click", () => void loadDrafts());
    elements.autosendToggle.addEventListener("change", () => void updateAutoSend());
    elements.taskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void addTask();
    });
    elements.taskSearch.addEventListener("input", renderTasks);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      const keys = Object.keys(changes);
      if (
        areaName === "local" &&
        keys.some((key) => key === DRAFT_INDEX_KEY || key.startsWith(DRAFT_KEY_PREFIX))
      ) {
        void loadDrafts();
        void loadQueue();
      }
      if (
        areaName === "local" &&
        keys.some((key) => key === TASK_INDEX_KEY || key.startsWith(TASK_KEY_PREFIX))
      ) {
        void loadTasks();
      }
      if (areaName === "sync" && changes[SETTINGS_KEY]) {
        void loadSettings();
      }
    });
  }

  function selectTab(name) {
    for (const tab of document.querySelectorAll("[data-tab]")) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const panel of document.querySelectorAll("[data-panel]")) {
      const active = panel.dataset.panel === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    }
  }

  async function loadSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const stored = result[SETTINGS_KEY] || {};
    state.settings = {
      ...state.settings,
      ...stored,
      autoSendReplies: stored.autoSendReplies === true
    };
    elements.autosendToggle.checked = state.settings.autoSendReplies;
    elements.autosendCopy.textContent = state.settings.autoSendReplies
      ? `On — validates the same ticket, waits ${Number(
          state.settings.autoSendDelaySeconds || 8
        )} seconds, then sends.`
      : "Off — drafts stay in Draft Inbox for review.";
  }

  async function updateAutoSend() {
    const enabling = elements.autosendToggle.checked;
    if (
      enabling &&
      !window.confirm(
        "Enable automatic sending? Replies will only send after the open ticket is revalidated and the safety delay completes. Failed validation keeps the draft for review."
      )
    ) {
      elements.autosendToggle.checked = false;
      return;
    }

    state.settings.autoSendReplies = enabling;
    await chrome.storage.sync.set({
      [SETTINGS_KEY]: {
        ...state.settings,
        autoSendReplies: enabling,
        autoProcessTickets: false
      }
    });
    await loadSettings();
    showToast(enabling ? "Professional auto-reply enabled." : "Manual review mode enabled.");
  }

  async function processCurrentTicket() {
    setWorking(elements.processTicket, true, "Starting...");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "RPA_PROCESS_CURRENT_TICKET"
      });
      if (!response?.ok || !response.accepted) {
        throw new Error(response?.error || "No open support ticket was found.");
      }
      showToast("Ticket queued. ChatGPT opened for drafting.");
      await Promise.all([loadDrafts(), loadQueue()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Ticket processing failed.");
    } finally {
      setWorking(elements.processTicket, false, "Process ticket");
    }
  }

  async function loadQueue() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "RPA_GET_QUEUE_STATUS" });
      if (!response?.ok) {
        throw new Error(response?.error || "Queue unavailable");
      }
      const queued = Number(response.queued || 0);
      if (response.active) {
        elements.queueDot.dataset.state = "busy";
        elements.automationTitle.textContent = "Processing";
        elements.queueStatus.textContent = `${response.active.subject}${
          queued ? ` · ${queued} queued` : ""
        }`;
      } else if (queued) {
        elements.queueDot.dataset.state = "busy";
        elements.automationTitle.textContent = "Queued";
        elements.queueStatus.textContent = `${queued} draft${queued === 1 ? "" : "s"} waiting`;
      } else {
        elements.queueDot.dataset.state = "ready";
        elements.automationTitle.textContent = "Ready";
        elements.queueStatus.textContent = "No active draft";
      }
    } catch {
      elements.queueDot.dataset.state = "error";
      elements.automationTitle.textContent = "Needs attention";
      elements.queueStatus.textContent = "Queue status unavailable";
    }
  }

  async function loadDrafts() {
    const data = await chrome.storage.local.get(null);
    const index = Array.isArray(data[DRAFT_INDEX_KEY]) ? data[DRAFT_INDEX_KEY] : [];
    state.drafts = index
      .map((id) => data[`${DRAFT_KEY_PREFIX}${id}`])
      .filter((draft) => draft?.id && draft?.subject);
    renderDrafts();
  }

  function renderDrafts() {
    elements.draftCount.textContent = String(state.drafts.length);
    elements.draftList.replaceChildren();
    if (!state.drafts.length) {
      elements.draftList.append(createEmpty("No drafts yet. Process an open support ticket."));
      return;
    }
    for (const draft of state.drafts) {
      elements.draftList.append(createDraftCard(draft));
    }
  }

  function createDraftCard(draft) {
    const card = document.createElement("article");
    card.className = "record";

    const head = document.createElement("div");
    head.className = "record-head";
    const copy = document.createElement("div");
    const title = document.createElement("div");
    title.className = "record-title";
    title.textContent = draft.subject;
    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.textContent = [
      draft.customer || "Unknown customer",
      draft.product || sourceLabel(draft.source),
      relativeTime(draft.updatedAt)
    ].join(" · ");
    copy.append(title, meta);
    const status = document.createElement("span");
    status.className = "status-pill";
    status.dataset.status = draft.status;
    status.textContent = statusLabel(draft.status);
    head.append(copy, status);
    card.append(head);

    let editor = null;
    let preview = null;
    let editAction = null;
    if (draft.draftText) {
      preview = document.createElement("div");
      preview.className = "draft-preview";
      preview.setAttribute("aria-label", `Draft preview for ${draft.subject}`);
      renderDraftPreview(preview, draft.draftHtml, draft.draftText);

      editor = document.createElement("textarea");
      editor.className = "draft-editor";
      editor.value = draft.draftText;
      editor.setAttribute("aria-label", `Edit draft for ${draft.subject}`);
      editor.hidden = true;
      card.append(preview, editor);
    }
    if (draft.error) {
      const error = document.createElement("p");
      error.className = "record-error";
      error.textContent = draft.error;
      card.append(error);
    }

    const actions = document.createElement("div");
    actions.className = "record-actions";
    if (draft.draftText) {
      editAction = createAction("Edit", () => {
        if (editor.hidden) {
          preview.hidden = true;
          editor.hidden = false;
          editAction.textContent = "Save";
          editor.focus();
          return;
        }
        void saveEditedDraft(draft, editor.value);
      });
      actions.append(
        createAction("Copy", () =>
          void copyDraft({
            text: editor.hidden ? draft.draftText : editor.value,
            html: editor.hidden ? draft.draftHtml : ""
          })
        ),
        editAction,
        createAction("Create task", () => void createTaskFromDraft(draft))
      );
    }
    if (draft.ticketUrl) {
      const open = document.createElement("a");
      open.href = draft.ticketUrl;
      open.target = "_blank";
      open.rel = "noreferrer";
      open.textContent = "Open ticket";
      actions.append(open);
    }
    if (["failed", "draft_ready", "escalated"].includes(draft.status)) {
      actions.append(createAction("Retry", () => void retryDraft(draft)));
    }
    const remove = createAction("Delete", () => void deleteDraft(draft));
    remove.classList.add("danger");
    actions.append(remove);
    card.append(actions);
    return card;
  }

  async function saveEditedDraft(draft, value) {
    const updated = {
      ...draft,
      draftText: String(value || "").trim().slice(0, 30000),
      draftHtml: "",
      updatedAt: Date.now()
    };
    await chrome.storage.local.set({
      [`${DRAFT_KEY_PREFIX}${draft.id}`]: updated
    });
    showToast("Draft saved locally.");
  }

  async function retryDraft(draft) {
    const response = await chrome.runtime.sendMessage({
      type: "RPA_RETRY_DRAFT",
      draftId: draft.id
    });
    if (!response?.ok) {
      showToast(response?.error || "Draft retry failed.");
      return;
    }
    showToast("Draft queued for retry.");
    await Promise.all([loadDrafts(), loadQueue()]);
  }

  async function deleteDraft(draft) {
    const response = await chrome.runtime.sendMessage({
      type: "RPA_DELETE_DRAFT",
      draftId: draft.id
    });
    if (!response?.ok) {
      showToast(response?.error || "Draft could not be deleted.");
      return;
    }
    await loadDrafts();
    showToast("Draft deleted.");
  }

  async function loadTasks() {
    const data = await chrome.storage.local.get(null);
    const index = Array.isArray(data[TASK_INDEX_KEY]) ? data[TASK_INDEX_KEY] : [];
    state.tasks = index
      .map((id) => data[`${TASK_KEY_PREFIX}${id}`])
      .filter((task) => task?.id && task?.title)
      .slice(0, MAX_TASKS);
    renderTasks();
  }

  function renderTasks() {
    const query = normalizeText(elements.taskSearch.value).toLowerCase();
    const tasks = [...state.tasks]
      .filter((task) => !query || `${task.title} ${task.notes}`.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(a.status === "done") - Number(b.status === "done") ||
          Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );
    elements.taskCount.textContent = String(
      state.tasks.filter((task) => task.status !== "done").length
    );
    elements.taskList.replaceChildren();
    if (!tasks.length) {
      elements.taskList.append(createEmpty(query ? "No matching tasks." : "No tasks yet."));
      return;
    }
    for (const task of tasks) {
      elements.taskList.append(createTaskCard(task));
    }
  }

  function createTaskCard(task) {
    const card = document.createElement("article");
    card.className = "record task-record";
    card.classList.toggle("is-done", task.status === "done");
    const title = document.createElement("div");
    title.className = "record-title";
    title.textContent = task.title;
    const meta = document.createElement("div");
    meta.className = "record-meta";
    meta.textContent = [
      `${capitalize(task.priority || "medium")} priority`,
      task.dueAt ? `Due ${formatDate(task.dueAt)}` : "No due date",
      sourceLabel(task.source)
    ].join(" · ");
    const notes = document.createElement("p");
    notes.className = "record-meta";
    notes.textContent = task.notes || "No details";
    const actions = document.createElement("div");
    actions.className = "record-actions";
    actions.append(
      createAction(task.status === "done" ? "Reopen" : "Complete", () =>
        void updateTask(task, {
          status: task.status === "done" ? "open" : "done",
          completedAt: task.status === "done" ? null : Date.now()
        })
      )
    );
    const remove = createAction("Delete", () => void deleteTask(task));
    remove.classList.add("danger");
    actions.append(remove);
    card.append(title, meta, notes, actions);
    return card;
  }

  async function addTask() {
    const title = normalizeText(elements.taskTitle.value).slice(0, 160);
    if (!title) {
      elements.taskTitle.focus();
      return;
    }
    await persistNewTask({
      id: crypto.randomUUID(),
      title,
      notes: String(elements.taskNotes.value || "").trim(),
      priority: elements.taskPriority.value,
      dueAt: elements.taskDue.value
        ? new Date(elements.taskDue.value).getTime()
        : null,
      status: "open",
      source: "manual",
      sourceUrl: "",
      reason: "",
      createdAt: Date.now(),
      completedAt: null
    });
    elements.taskForm.reset();
    elements.taskPriority.value = "medium";
    await loadTasks();
    showToast("Task added locally.");
  }

  async function createTaskFromDraft(draft) {
    await persistNewTask({
      id: crypto.randomUUID(),
      title: `Follow up: ${draft.subject}`.slice(0, 160),
      notes: `Customer: ${draft.customer || "Unknown"}\nProduct: ${
        draft.product || "Unmatched"
      }\nTicket: ${draft.ticketUrl}`,
      priority: "medium",
      dueAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
      status: "open",
      source: draft.source,
      sourceUrl: draft.ticketUrl,
      reason: "draft-follow-up",
      createdAt: Date.now(),
      completedAt: null
    });
    await loadTasks();
    selectTab("tasks");
    showToast("Follow-up task created.");
  }

  async function persistNewTask(task) {
    const result = await chrome.storage.local.get(TASK_INDEX_KEY);
    const index = Array.isArray(result[TASK_INDEX_KEY]) ? result[TASK_INDEX_KEY] : [];
    const next = [task.id, ...index.filter((id) => id !== task.id)].slice(0, MAX_TASKS);
    await chrome.storage.local.set({
      [TASK_INDEX_KEY]: next,
      [`${TASK_KEY_PREFIX}${task.id}`]: task
    });
  }

  async function updateTask(task, changes) {
    await chrome.storage.local.set({
      [`${TASK_KEY_PREFIX}${task.id}`]: {
        ...task,
        ...changes
      }
    });
    await loadTasks();
  }

  async function deleteTask(task) {
    const result = await chrome.storage.local.get(TASK_INDEX_KEY);
    const index = Array.isArray(result[TASK_INDEX_KEY]) ? result[TASK_INDEX_KEY] : [];
    await Promise.all([
      chrome.storage.local.set({
        [TASK_INDEX_KEY]: index.filter((id) => id !== task.id)
      }),
      chrome.storage.local.remove(`${TASK_KEY_PREFIX}${task.id}`)
    ]);
    await loadTasks();
  }

  function createAction(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function createEmpty(text) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(value);
    showToast("Draft copied.");
  }

  async function copyDraft({ text, html }) {
    const plainText = String(text || "").trim();
    const safeHtml = buildSafeDraftHtml(html, plainText);
    if (
      safeHtml &&
      typeof ClipboardItem === "function" &&
      typeof navigator.clipboard.write === "function"
    ) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plainText], { type: "text/plain" }),
            "text/html": new Blob([safeHtml], { type: "text/html" })
          })
        ]);
        showToast("Formatted draft copied.");
        return;
      } catch {
        // Some browsers only allow plain-text clipboard writes from extension pages.
      }
    }
    await copyText(plainText);
  }

  function renderDraftPreview(target, html, text) {
    target.replaceChildren();
    const fragment = sanitizeDraftHtml(html);
    if (fragment.childNodes.length) {
      target.classList.remove("is-plain");
      target.append(fragment);
      return;
    }
    target.classList.add("is-plain");
    target.textContent = String(text || "");
  }

  function buildSafeDraftHtml(html, text) {
    const wrapper = document.createElement("div");
    const fragment = sanitizeDraftHtml(html);
    if (fragment.childNodes.length) {
      wrapper.append(fragment);
      return wrapper.innerHTML;
    }

    for (const block of String(text || "").split(/\n{2,}/)) {
      const paragraph = document.createElement("p");
      const lines = block.split("\n");
      lines.forEach((line, index) => {
        if (index > 0) {
          paragraph.append(document.createElement("br"));
        }
        paragraph.append(document.createTextNode(line));
      });
      wrapper.append(paragraph);
    }
    return wrapper.innerHTML;
  }

  function sanitizeDraftHtml(value) {
    const fragment = document.createDocumentFragment();
    if (!value) {
      return fragment;
    }

    const parsed = new DOMParser().parseFromString(String(value), "text/html");
    appendSafeDraftChildren(parsed.body, fragment);
    return fragment;
  }

  function appendSafeDraftChildren(source, target) {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(child.textContent || ""));
        continue;
      }
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (DROP_DRAFT_TAGS.has(child.tagName)) {
        continue;
      }
      if (!SAFE_DRAFT_TAGS.has(child.tagName)) {
        appendSafeDraftChildren(child, target);
        continue;
      }

      const safe = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === "A") {
        const href = normalizeDraftLink(child.getAttribute("href"));
        if (href) {
          safe.href = href;
          safe.target = "_blank";
          safe.rel = "noreferrer";
        }
      }
      appendSafeDraftChildren(child, safe);
      target.append(safe);
    }
  }

  function normalizeDraftLink(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href.slice(0, 2000) : "";
    } catch {
      return "";
    }
  }

  function setWorking(button, working, label) {
    button.disabled = working;
    button.textContent = label;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      elements.toast.hidden = true;
    }, 3500);
  }

  function statusLabel(value) {
    return {
      queued: "Queued",
      processing: "Processing",
      draft_ready: "Draft ready",
      failed: "Failed",
      escalated: "Escalated",
      auto_sent: "Sent"
    }[value] || "Saved";
  }

  function sourceLabel(value) {
    return {
      "fluent-support": "Fluent Support",
      "titan-mail": "Titan Mail",
      manual: "Manual"
    }[value] || "Support";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function capitalize(value) {
    const text = normalizeText(value);
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
  }

  function relativeTime(value) {
    const timestamp = Number(value || 0);
    if (!timestamp) {
      return "Just now";
    }
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) {
      return "Just now";
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(Number(value));
  }

  globalThis.PlugincySidepanelTest = {
    buildSafeDraftHtml,
    sanitizeDraftHtml
  };
})();
