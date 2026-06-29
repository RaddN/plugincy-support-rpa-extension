(() => {
  "use strict";

  if (globalThis.__plugincyTodoOverlayLoaded) {
    return;
  }
  globalThis.__plugincyTodoOverlayLoaded = true;

  const HOST_ID = "plugincy-todo-overlay-host";
  const TASK_INDEX_KEY = "rpa_task_index";
  const TASK_KEY_PREFIX = "rpa_task_";
  const MAX_TASKS = 80;

  let host = null;
  let ui = null;
  let tasks = [];
  let isOpen = false;
  let saveChain = Promise.resolve();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "RPA_TODO_TOGGLE") {
      return false;
    }

    void toggleOverlay()
      .then(() => sendResponse({ handled: true, open: isOpen }))
      .catch((error) =>
        sendResponse({
          handled: false,
          error: error instanceof Error ? error.message : "Could not open To-Do."
        })
      );
    return true;
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
  });

  async function toggleOverlay() {
    ensureUi();
    isOpen = !isOpen;
    host.dataset.open = String(isOpen);
    host.hidden = false;

    if (isOpen) {
      await loadTasks();
      ui.title.focus();
    }
  }

  function ensureUi() {
    if (host) {
      return;
    }

    host = document.getElementById(HOST_ID);
    if (host) {
      host.remove();
    }

    host = document.createElement("div");
    host.id = HOST_ID;
    host.hidden = true;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0 0 0 auto";
    host.style.zIndex = "2147483647";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: light; }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(6, 19, 36, .28);
          opacity: 0;
          pointer-events: none;
          transition: opacity 160ms ease;
        }
        :host([data-open="true"]) .backdrop {
          opacity: 1;
          pointer-events: auto;
        }
        .panel {
          position: fixed;
          top: 16px;
          right: 16px;
          bottom: 16px;
          display: grid;
          width: min(430px, calc(100vw - 32px));
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          overflow: hidden;
          border: 1px solid #d7deea;
          border-radius: 22px;
          background:
            radial-gradient(circle at top right, rgba(9, 103, 232, .14), transparent 34%),
            #ffffff;
          box-shadow: 0 26px 70px rgba(8, 28, 63, .26);
          color: #10213d;
          font: 500 13px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          transform: translateX(calc(100% + 24px));
          transition: transform 180ms ease;
        }
        :host([data-open="true"]) .panel {
          transform: translateX(0);
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 18px 12px;
        }
        h2 {
          margin: 0;
          font-size: 18px;
          letter-spacing: -0.03em;
          line-height: 1.1;
        }
        .subtitle {
          margin: 4px 0 0;
          color: #61728c;
          font-size: 12px;
        }
        button {
          border: 0;
          border-radius: 11px;
          cursor: pointer;
          font: 750 12px/1.2 inherit;
        }
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        select:focus-visible {
          outline: 3px solid rgba(9, 103, 232, .22);
          outline-offset: 2px;
        }
        .close {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          background: #f2f5f9;
          color: #44546a;
          font-size: 18px;
        }
        form {
          display: grid;
          gap: 10px;
          padding: 0 18px 16px;
        }
        input,
        textarea,
        select {
          box-sizing: border-box;
          width: 100%;
          border: 1px solid #d7deea;
          border-radius: 12px;
          background: #ffffff;
          color: #10213d;
          font: 500 13px/1.45 inherit;
        }
        input,
        select {
          min-height: 40px;
          padding: 0 12px;
        }
        textarea {
          min-height: 96px;
          max-height: 260px;
          padding: 10px 12px;
          resize: vertical;
        }
        .form-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 118px;
          gap: 8px;
        }
        .add {
          min-height: 42px;
          background: #0967e8;
          color: #ffffff;
        }
        .add:hover {
          background: #0759ca;
        }
        .status {
          min-height: 18px;
          color: #61728c;
          font-size: 11px;
        }
        .list {
          overflow: auto;
          border-top: 1px solid #e8edf5;
          border-bottom: 1px solid #e8edf5;
          background: rgba(248, 250, 253, .72);
        }
        .task {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          padding: 13px 18px;
          border-bottom: 1px solid #e8edf5;
        }
        .task:last-child {
          border-bottom: 0;
        }
        .check {
          display: grid;
          width: 22px;
          height: 22px;
          place-items: center;
          border: 1.5px solid #b9c5d7;
          background: #ffffff;
          color: transparent;
        }
        .check[aria-pressed="true"] {
          border-color: #087a55;
          background: #087a55;
          color: #ffffff;
        }
        .copy {
          min-width: 0;
        }
        .title {
          margin: 0;
          color: #10213d;
          font-weight: 750;
          overflow-wrap: anywhere;
        }
        .notes {
          margin: 4px 0 0;
          color: #61728c;
          font-size: 12px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .pill {
          border-radius: 999px;
          padding: 3px 7px;
          background: #eef4ff;
          color: #0967e8;
          font-size: 10px;
          font-weight: 750;
        }
        .pill[data-priority="high"] {
          background: #fff0ed;
          color: #b42318;
        }
        .pill[data-priority="low"] {
          background: #ecfdf5;
          color: #087a55;
        }
        .delete {
          width: 30px;
          height: 30px;
          background: transparent;
          color: #8a98ad;
          font-size: 17px;
        }
        .delete:hover {
          background: #fff0ed;
          color: #b42318;
        }
        .empty {
          padding: 34px 24px;
          color: #61728c;
          text-align: center;
        }
        footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 18px;
          color: #61728c;
          font-size: 11px;
        }
        .dashboard {
          padding: 8px 11px;
          border: 1px solid #d7deea;
          background: #ffffff;
          color: #0967e8;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 750;
        }
      </style>
      <div class="backdrop" part="backdrop"></div>
      <section class="panel" role="dialog" aria-modal="false" aria-labelledby="plugincy-todo-title">
        <header>
          <div>
            <h2 id="plugincy-todo-title">Plugincy To-Do</h2>
            <p class="subtitle">Synced support and development work from any tab.</p>
          </div>
          <button class="close" type="button" aria-label="Close To-Do">×</button>
        </header>
        <form>
          <input class="task-title" type="text" placeholder="Task title" autocomplete="off" required>
          <textarea class="task-notes" placeholder="Task details — no app-level character limit"></textarea>
          <div class="form-row">
            <select class="task-priority" aria-label="Priority">
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="low">Low priority</option>
            </select>
            <button class="add" type="submit">Add task</button>
          </div>
          <div class="status" aria-live="polite">Loading synced tasks…</div>
        </form>
        <div class="list" aria-live="polite"></div>
        <footer>
          <span class="sync-note">Uses chrome.storage.sync.</span>
          <a class="dashboard" href="${chrome.runtime.getURL("dashboard/newtab.html")}" target="_blank" rel="noreferrer">Open dashboard</a>
        </footer>
      </section>
    `;

    document.documentElement.append(host);

    ui = {
      backdrop: shadow.querySelector(".backdrop"),
      close: shadow.querySelector(".close"),
      form: shadow.querySelector("form"),
      title: shadow.querySelector(".task-title"),
      notes: shadow.querySelector(".task-notes"),
      priority: shadow.querySelector(".task-priority"),
      status: shadow.querySelector(".status"),
      list: shadow.querySelector(".list")
    };

    ui.backdrop.addEventListener("click", closeOverlay);
    ui.close.addEventListener("click", closeOverlay);
    ui.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void addTask();
    });
  }

  function closeOverlay() {
    isOpen = false;
    host.dataset.open = "false";
  }

  async function loadTasks() {
    if (!ui) {
      return;
    }

    const data = await chrome.storage.sync.get(null);
    const index = Array.isArray(data[TASK_INDEX_KEY])
      ? data[TASK_INDEX_KEY].filter((id) => typeof id === "string")
      : [];

    tasks = index
      .map((id) => data[`${TASK_KEY_PREFIX}${id}`])
      .filter(isValidTask)
      .slice(0, MAX_TASKS);
    renderTasks();
  }

  function renderTasks() {
    const openCount = tasks.filter((task) => task.status !== "done").length;
    ui.status.textContent = `${openCount} open ${openCount === 1 ? "task" : "tasks"} synced.`;
    ui.list.replaceChildren();

    const sorted = [...tasks].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "open" ? -1 : 1;
      }
      return priorityWeight(b.priority) - priorityWeight(a.priority) ||
        Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });

    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No tasks yet. Add the next support or plugin-development item.";
      ui.list.append(empty);
      return;
    }

    for (const task of sorted) {
      ui.list.append(createTaskRow(task));
    }
  }

  function createTaskRow(task) {
    const row = document.createElement("article");
    row.className = "task";

    const check = document.createElement("button");
    check.className = "check";
    check.type = "button";
    check.textContent = "✓";
    check.setAttribute("aria-pressed", String(task.status === "done"));
    check.setAttribute(
      "aria-label",
      task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`
    );
    check.addEventListener("click", () => {
      const completed = task.status !== "done";
      void updateTask(task, {
        status: completed ? "done" : "open",
        completedAt: completed ? Date.now() : null
      });
    });

    const copy = document.createElement("div");
    copy.className = "copy";
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = task.title;
    const notes = document.createElement("p");
    notes.className = "notes";
    notes.textContent = normalizeMultiline(task.notes) || "No details added.";
    const meta = document.createElement("div");
    meta.className = "meta";
    const priority = document.createElement("span");
    priority.className = "pill";
    priority.dataset.priority = normalizePriority(task.priority);
    priority.textContent = `${capitalize(priority.dataset.priority)} priority`;
    const source = document.createElement("span");
    source.className = "pill";
    source.textContent = sourceName(task.source);
    meta.append(priority, source);
    copy.append(title, notes, meta);

    const remove = document.createElement("button");
    remove.className = "delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${task.title}`);
    remove.addEventListener("click", () => {
      void deleteTask(task);
    });

    row.append(check, copy, remove);
    return row;
  }

  async function addTask() {
    const title = normalizeText(ui.title.value).slice(0, 160);
    if (!title) {
      ui.title.focus();
      return;
    }

    const task = {
      id: crypto.randomUUID(),
      title,
      notes: normalizeMultiline(ui.notes.value),
      priority: normalizePriority(ui.priority.value),
      status: "open",
      source: "manual",
      sourceUrl: "",
      reason: "",
      createdAt: Date.now(),
      completedAt: null
    };

    await withSaveLock(async () => {
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
    });

    ui.form.reset();
    ui.priority.value = "medium";
    await loadTasks();
    ui.status.textContent = "Task added and synced.";
    ui.title.focus();
  }

  async function updateTask(task, changes) {
    const updated = {
      ...task,
      ...changes
    };

    await withSaveLock(async () => {
      await chrome.storage.sync.set({
        [`${TASK_KEY_PREFIX}${task.id}`]: updated
      });
    });
    tasks = tasks.map((item) => (item.id === task.id ? updated : item));
    renderTasks();
  }

  async function deleteTask(task) {
    await withSaveLock(async () => {
      const result = await chrome.storage.sync.get(TASK_INDEX_KEY);
      const currentIndex = Array.isArray(result[TASK_INDEX_KEY])
        ? result[TASK_INDEX_KEY].filter((id) => typeof id === "string")
        : [];

      await Promise.all([
        chrome.storage.sync.set({
          [TASK_INDEX_KEY]: currentIndex.filter((id) => id !== task.id)
        }),
        chrome.storage.sync.remove(`${TASK_KEY_PREFIX}${task.id}`)
      ]);
    });
    tasks = tasks.filter((item) => item.id !== task.id);
    renderTasks();
  }

  function withSaveLock(operation) {
    const next = saveChain.then(operation, operation);
    saveChain = next.catch(() => undefined);
    return next;
  }

  function isValidTask(task) {
    return Boolean(
      task &&
        typeof task === "object" &&
        typeof task.id === "string" &&
        typeof task.title === "string"
    );
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

  function normalizePriority(value) {
    return ["high", "medium", "low"].includes(value) ? value : "medium";
  }

  function priorityWeight(priority) {
    return {
      high: 3,
      medium: 2,
      low: 1
    }[normalizePriority(priority)];
  }

  function sourceName(source) {
    return {
      "fluent-support": "Fluent Support",
      "titan-mail": "Titan Mail",
      manual: "Manual"
    }[source] || "Workbench";
  }

  function capitalize(value) {
    const text = normalizeText(value);
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }
})();
