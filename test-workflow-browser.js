"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const fluentFixture =
  "C:\\Users\\GM Team\\Downloads\\Elementor Loop Grid – AJAX filter state is not reset + YITH Wishlist not working after AJAX filtering.html";
const titanFixture = "C:\\Users\\GM Team\\Downloads\\Inbox (1) - Mail.html";
const attachedTitanListFixture = "C:\\Users\\GM Team\\Downloads\\Inbox - Mail.html";
const attachedTitanDetailFixture =
  "C:\\Users\\GM Team\\Downloads\\Inbox after open a mail- Mail.html";
const attachedTitanReplyFixture =
  "C:\\Users\\GM Team\\Downloads\\Inbox after click reply - Mail.html";
const attachedFluentListFixture = "C:\\Users\\GM Team\\Downloads\\All Tickets.html";

function stripExecutableScripts(html) {
  return String(html || "").replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

async function serveSavedPage(page, pattern, html, frameDocuments = {}) {
  await page.route(pattern, async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: stripExecutableScripts(html)
      });
    }
    if (request.isNavigationRequest()) {
      const fileName = decodeURIComponent(
        new URL(request.url()).pathname.split("/").pop() || ""
      );
      if (frameDocuments[fileName]) {
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: stripExecutableScripts(frameDocuments[fileName])
        });
      }
    }
    return route.abort();
  });
}

async function addChromeMock(page) {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        id: "workflow-test",
        onMessage: { addListener() {} },
        async sendMessage() {
          return { ok: true, accepted: true };
        }
      }
    };
  });
}

async function injectScraper(page) {
  await page.addScriptTag({ path: join(root, "shared", "workflow-core.js") });
  await page.addScriptTag({ path: join(root, "content", "scraper.js") });
}

async function testFluentFixture(browser) {
  const html = await readFile(fluentFixture, "utf8");
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await serveSavedPage(page, "https://plugincy.com/**", html);
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/61/view",
    { waitUntil: "domcontentloaded" }
  );
  await injectScraper(page);

  const ticket = await page.evaluate(() =>
    window.PlugincyScraperTest.scrapeCurrentTicket({ requireDetail: true })
  );
  assert.equal(ticket.ticketId, "61");
  assert.equal(ticket.customer, "Mario Beslic");
  assert.match(ticket.subject, /Elementor Loop Grid/);
  assert.match(ticket.text, /YITH WooCommerce Wishlist/i);
  assert.doesNotMatch(ticket.text, /Filtered Tickets|Upgrade to Pro/i);

  await context.close();
}

async function testTitanFixture(browser) {
  const html = await readFile(titanFixture, "utf8");
  const messageFrame = await readFile(
    "C:\\Users\\GM Team\\Downloads\\Inbox (1) - Mail_files\\saved_resource.html",
    "utf8"
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await serveSavedPage(page, "https://hostinger.titan.email/**", html, {
    "saved_resource.html": messageFrame
  });
  await page.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await injectScraper(page);

  const snapshot = await page.evaluate(() => {
    const detailOpen = window.PlugincyScraperTest.isLikelyTicketDetailOpen();
    const ticket = detailOpen
      ? window.PlugincyScraperTest.scrapeCurrentTicket({ requireDetail: true })
      : null;
    const subject =
      document.querySelector("[data-testid='thread-subject-text']")?.textContent || "";
    const visibleText = window.PlugincyWorkflowCore.cleanTitanText(
      document.querySelector(".message-item-area")?.textContent || ""
    );
    return {
      subject: subject.trim(),
      visibleText,
      detailOpen,
      ticket,
      classification: window.PlugincyWorkflowCore.classifyEmail({
        subject,
        text: visibleText
      })
    };
  });
  assert.match(snapshot.subject, /Is This You/i);
  assert.equal(snapshot.classification.isSupport, false);
  assert.doesNotMatch(snapshot.visibleText, /Titan TasksManage your to-dos/i);
  if (snapshot.detailOpen) {
    assert.match(snapshot.ticket.subject, /Elementor compatibility/i);
    assert.ok(snapshot.ticket.text.length > 20);
    assert.doesNotMatch(snapshot.ticket.text, /Titan TasksManage your to-dos/i);
  }

  await context.close();
}

async function testSourceNotifierIgnoresOldTitanMail(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rpaSourceReports = [];
    window.chrome = {
      runtime: {
        id: "workflow-test",
        async sendMessage(payload) {
          window.__rpaSourceReports.push(payload);
          return { ok: true };
        }
      }
    };
  });
  await page.route("https://hostinger.titan.email/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Inbox (1) - Mail</title></head><body>
        <main>
          <button type="button" aria-label="Mark as unread">Mark as unread</button>
          <article class="message-item-area unread" aria-label="Unread message detail">An already opened customer email.</article>
        </main>
      </body></html>`
    })
  );
  await page.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await page.addScriptTag({ path: join(root, "content", "source-notifier.js") });
  assert.deepEqual(
    await page.evaluate(() =>
      window.PlugincySourceNotifierTest.collectUnreadFingerprints()
    ),
    []
  );
  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.isNotificationListView()),
    false
  );
  await page.waitForTimeout(2800);
  const reports = await page.evaluate(() => window.__rpaSourceReports);
  assert.ok(reports.some((report) => report.type === "RPA_REPORT_SOURCE_STATE"));
  const report = reports.find((item) => item.type === "RPA_REPORT_SOURCE_STATE");
  assert.deepEqual(report?.fingerprints, []);
  assert.equal(report?.baselineOnly, true);
  assert.equal(report?.listView, false);

  await context.close();
}

async function testSourceNotifierIgnoresTitanSubjectDetail(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rpaSourceReports = [];
    window.chrome = {
      runtime: {
        id: "workflow-test",
        async sendMessage(payload) {
          window.__rpaSourceReports.push(payload);
          return { ok: true };
        }
      }
    };
  });
  await page.route("https://hostinger.titan.email/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Inbox - Mail</title></head><body>
        <main>
          <h1 data-testid="message-subject">Old support thread</h1>
          <button type="button" aria-label="Mark as unread">Mark as unread</button>
          <div role="row" class="unread" aria-label="Unread old selected thread">Old selected thread</div>
        </main>
      </body></html>`
    })
  );
  await page.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await page.addScriptTag({ path: join(root, "content", "source-notifier.js") });

  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.isNotificationListView()),
    false
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.PlugincySourceNotifierTest.collectUnreadFingerprints()
    ),
    []
  );
  await page.waitForTimeout(2800);
  const report = await page.evaluate(() =>
    window.__rpaSourceReports.find((item) => item.type === "RPA_REPORT_SOURCE_STATE")
  );
  assert.equal(report?.listView, false);
  assert.deepEqual(report?.fingerprints, []);

  await context.close();
}

async function testAttachedTitanViewsAndReplySelectors(browser) {
  const listContext = await browser.newContext();
  const listPage = await listContext.newPage();
  await listPage.addInitScript(() => {
    window.chrome = {
      runtime: {
        id: "workflow-test",
        async sendMessage() {
          return { ok: true };
        }
      }
    };
  });
  await serveSavedPage(
    listPage,
    "https://hostinger.titan.email/**",
    await readFile(attachedTitanListFixture, "utf8")
  );
  await listPage.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await listPage.addScriptTag({ path: join(root, "content", "source-notifier.js") });
  assert.equal(
    await listPage.evaluate(() =>
      window.PlugincySourceNotifierTest.isNotificationListView()
    ),
    true
  );
  assert.equal(
    await listPage.evaluate(() => window.PlugincySourceNotifierTest.getUnreadCount()),
    0
  );
  await listContext.close();

  const detailContext = await browser.newContext();
  const detailPage = await detailContext.newPage();
  await addChromeMock(detailPage);
  await serveSavedPage(
    detailPage,
    "https://hostinger.titan.email/**",
    await readFile(attachedTitanDetailFixture, "utf8")
  );
  await detailPage.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await injectScraper(detailPage);
  const detailResult = await detailPage.evaluate(() => ({
    detailOpen: window.PlugincyScraperTest.isLikelyTicketDetailOpen(),
    openerTestId:
      window.PlugincyScraperTest.findReplyOpener()?.getAttribute("data-testid") || ""
  }));
  assert.equal(detailResult.detailOpen, true);
  assert.match(detailResult.openerTestId, /^reply-(?:tooltip|all-tooltip|icon)$/);
  await detailContext.close();

  const replyContext = await browser.newContext();
  const replyPage = await replyContext.newPage();
  await addChromeMock(replyPage);
  await serveSavedPage(
    replyPage,
    "https://hostinger.titan.email/**",
    await readFile(attachedTitanReplyFixture, "utf8")
  );
  await replyPage.goto("https://hostinger.titan.email/mail/", {
    waitUntil: "domcontentloaded"
  });
  await injectScraper(replyPage);
  const replyResult = await replyPage.evaluate(() => {
    const editor = window.PlugincyScraperTest.findReplyEditor();
    const send = editor
      ? window.PlugincyScraperTest.findReplySubmitButton(editor)
      : null;
    return {
      editorTestId: editor?.getAttribute("data-testid") || "",
      sendTestId: send?.getAttribute("data-testid") || ""
    };
  });
  assert.equal(replyResult.editorTestId, "composer-editor");
  assert.equal(replyResult.sendTestId, "send-action-btn");
  await replyContext.close();
}

async function testAttachedFluentRefresh(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__refreshClicks = 0;
    window.chrome = {
      runtime: {
        id: "workflow-test",
        async sendMessage() {
          return { ok: true };
        }
      }
    };
  });
  await serveSavedPage(
    page,
    "https://plugincy.com/**",
    await readFile(attachedFluentListFixture, "utf8")
  );
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets",
    { waitUntil: "domcontentloaded" }
  );
  await page.evaluate(() => {
    document.querySelector(".fs_refresh_btn").addEventListener("click", () => {
      window.__refreshClicks += 1;
    });
  });
  await page.addScriptTag({ path: join(root, "content", "source-notifier.js") });
  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.isNotificationListView()),
    true
  );
  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.refreshFluentSupport()),
    true
  );
  assert.equal(await page.evaluate(() => window.__refreshClicks), 1);

  await page.evaluate(() => {
    const editor = document.createElement("div");
    editor.className = "fs_reply_box";
    editor.innerHTML = '<div class="ql-editor" contenteditable="true"></div>';
    document.body.append(editor);
  });
  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.hasOpenFluentReplyEditor()),
    true
  );
  assert.equal(
    await page.evaluate(() => window.PlugincySourceNotifierTest.refreshFluentSupport()),
    false
  );
  assert.equal(await page.evaluate(() => window.__refreshClicks), 1);
  await context.close();
}

async function testAutoReplyDom(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await page.route("https://plugincy.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div id="wpwrap"></div>
        <div class="fs_ticket_body">
          <h2 class="fs_ticket_title"><span>Filter issue</span></h2>
          <div class="fs_threads_container">
            <article class="fs_conversation_message fs_thread_starter">
              <span class="fs_message_name">Customer</span>
              <span class="fs_message_role">(Customer)</span>
              <div class="fs_message_body">The filter does not reset after AJAX.</div>
            </article>
          </div>
          <div class="fs_reply_box">
            <div class="ql-editor" contenteditable="true" role="textbox"></div>
            <button id="send-reply" type="button">Send Reply</button>
          </div>
        </div>
      </body></html>`
    })
  );
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/61/view"
  );
  await injectScraper(page);
  await page.evaluate(() => {
    document.querySelector("#send-reply").addEventListener("click", () => {
      document.body.dataset.sent = "true";
      document.body.dataset.submitted = document.querySelector(".ql-editor").innerText;
      document.querySelector(".ql-editor").replaceChildren();
    });
  });
  const signature = await page.evaluate(() =>
    window.PlugincyWorkflowCore.createTicketSignature(
      window.PlugincyScraperTest.scrapeCurrentTicket({ requireDetail: true })
    )
  );
  await page.evaluate(
    ({ signature }) =>
      window.PlugincyScraperTest.insertAndSendReply(
        "Hello,\n\nPlease try the updated selector.",
        signature
      ),
    { signature }
  );
  assert.equal(await page.locator("body").getAttribute("data-sent"), "true");
  assert.match(await page.locator("body").getAttribute("data-submitted"), /updated selector/);

  await context.close();
}

async function testFixedReplyLauncher(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rpaMessages = [];
    window.chrome = {
      runtime: {
        id: "workflow-test",
        onMessage: { addListener() {} },
        async sendMessage(payload) {
          window.__rpaMessages.push(payload);
          if (payload.type === "RPA_CREATE_FIXED_REPLY") {
            return { ok: true, accepted: true, status: "draft_ready" };
          }
          return { ok: true, accepted: true, opened: true };
        }
      }
    };
  });
  await page.route("https://plugincy.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div id="wpwrap"></div>
        <div class="fs_ticket_body">
          <h2 class="fs_ticket_title"><span>Filter issue</span></h2>
          <div class="fs_threads_container">
            <article class="fs_conversation_message fs_thread_starter">
              <span class="fs_message_name">Customer</span>
              <span class="fs_message_role">(Customer)</span>
              <div class="fs_message_body">The filter does not reset after AJAX.</div>
            </article>
          </div>
        </div>
      </body></html>`
    })
  );
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/61/view"
  );
  await injectScraper(page);

  const labels = await page.evaluate(() => {
    const root = document.getElementById("plugincy-support-rpa-launcher")?.shadowRoot;
    return [...root.querySelectorAll("button")].map((button) => button.textContent.trim());
  });
  assert.deepEqual(labels, ["Generate GPT reply", "Fixed", "5-star", "Custom"]);
  await page.evaluate(() => {
    document
      .getElementById("plugincy-support-rpa-launcher")
      .shadowRoot.querySelector("button.secondary")
      .click();
  });
  await page.waitForFunction(() =>
    window.__rpaMessages.some((message) => message.type === "RPA_CREATE_FIXED_REPLY")
  );
  const fixedMessage = await page.evaluate(() =>
    window.__rpaMessages.find((message) => message.type === "RPA_CREATE_FIXED_REPLY")
  );
  assert.match(fixedMessage.ticket.subject, /Filter issue/);
  assert.match(fixedMessage.ticket.text, /filter does not reset/i);
  const postClickLabels = await page.evaluate(() => {
    const root = document.getElementById("plugincy-support-rpa-launcher")?.shadowRoot;
    return [...root.querySelectorAll("button")].map((button) => button.textContent.trim());
  });
  assert.deepEqual(postClickLabels, ["Generate GPT reply", "Fixed", "5-star", "Custom"]);

  await context.close();
}

async function testReviewRequestLauncher(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rpaMessages = [];
    window.chrome = {
      runtime: {
        id: "workflow-test",
        onMessage: { addListener() {} },
        async sendMessage(payload) {
          window.__rpaMessages.push(payload);
          if (payload.type === "RPA_CREATE_REVIEW_REQUEST") {
            return { ok: true, accepted: true, status: "draft_ready" };
          }
          return { ok: true, accepted: true, opened: true };
        }
      }
    };
  });
  await page.route("https://plugincy.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div id="wpwrap"></div>
        <div class="fs_ticket_body">
          <h2 class="fs_ticket_title"><span>Dynamic Ajax Product Filter support</span></h2>
          <div class="fs_threads_container">
            <article class="fs_conversation_message fs_thread_starter">
              <span class="fs_message_name">Customer</span>
              <span class="fs_message_role">(Customer)</span>
              <div class="fs_message_body">Dynamic Ajax Product Filter is working now. Thanks.</div>
            </article>
          </div>
        </div>
      </body></html>`
    })
  );
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/62/view"
  );
  await injectScraper(page);
  await page.evaluate(() => {
    document
      .getElementById("plugincy-support-rpa-launcher")
      .shadowRoot.querySelector("button.review")
      .click();
  });
  await page.waitForFunction(() =>
    window.__rpaMessages.some((message) => message.type === "RPA_CREATE_REVIEW_REQUEST")
  );
  const reviewMessage = await page.evaluate(() =>
    window.__rpaMessages.find((message) => message.type === "RPA_CREATE_REVIEW_REQUEST")
  );
  assert.match(reviewMessage.ticket.subject, /Dynamic Ajax Product Filter/);
  assert.match(reviewMessage.ticket.text, /working now/i);

  await context.close();
}

async function testCustomReplyLauncher(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__rpaMessages = [];
    window.prompt = () => "tell them I checked and fixed it";
    window.chrome = {
      runtime: {
        id: "workflow-test",
        onMessage: { addListener() {} },
        async sendMessage(payload) {
          window.__rpaMessages.push(payload);
          if (payload.type === "RPA_PROCESS_CUSTOM_REPLY") {
            return { ok: true, accepted: true, status: "queued" };
          }
          return { ok: true, accepted: true, opened: true };
        }
      }
    };
  });
  await page.route("https://plugincy.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <div id="wpwrap"></div>
        <div class="fs_ticket_body">
          <h2 class="fs_ticket_title"><span>Checkout follow-up</span></h2>
          <div class="fs_threads_container">
            <article class="fs_conversation_message fs_thread_starter">
              <span class="fs_message_name">Customer</span>
              <span class="fs_message_role">(Customer)</span>
              <div class="fs_message_body">Can you confirm if this is fixed?</div>
            </article>
          </div>
        </div>
      </body></html>`
    })
  );
  await page.goto(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/63/view"
  );
  await injectScraper(page);
  await page.evaluate(() => {
    document
      .getElementById("plugincy-support-rpa-launcher")
      .shadowRoot.querySelector("button.custom")
      .click();
  });
  await page.waitForFunction(() =>
    window.__rpaMessages.some((message) => message.type === "RPA_PROCESS_CUSTOM_REPLY")
  );
  const customMessage = await page.evaluate(() =>
    window.__rpaMessages.find((message) => message.type === "RPA_PROCESS_CUSTOM_REPLY")
  );
  assert.equal(customMessage.customReplyText, "tell them I checked and fixed it");
  assert.match(customMessage.ticket.subject, /Checkout follow-up/);

  await context.close();
}

async function testFormattedDraftInbox(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sidepanelHtml = (await readFile(
    join(root, "sidepanel", "sidepanel.html"),
    "utf8"
  ))
    .replace(/<script[^>]*sidepanel\.js[^>]*><\/script>/i, "")
    .replace(/<link[^>]*sidepanel\.css[^>]*>/i, "");
  await page.setContent(sidepanelHtml);
  await page.evaluate(() => {
    const draft = {
      id: "draft-1",
      subject: "Formatting test",
      customer: "Customer",
      source: "titan-mail",
      status: "draft_ready",
      draftText:
        "Hi,\n\n1. First item\n2. Second item\n\n```\nconst ready = true;\n```",
      draftHtml:
        '<p>Hi,</p><ol><li>First item</li><li>Second <strong>item</strong></li></ol><pre><code>const ready = true;</code></pre><img src="x"><script>unsafe()</script>',
      updatedAt: Date.now()
    };
    window.chrome = {
      runtime: {
        async sendMessage(message) {
          if (message.type === "RPA_GET_QUEUE_STATUS") {
            return { ok: true, active: null, queued: 0 };
          }
          return { ok: true };
        },
        getURL(value) {
          return value;
        }
      },
      tabs: {
        async create() {}
      },
      storage: {
        local: {
          async get(key) {
            if (key === null) {
              return {
                rpa_draft_index: ["draft-1"],
                "rpa_draft_draft-1": draft
              };
            }
            return {};
          },
          async set() {},
          async remove() {}
        },
        sync: {
          async get() {
            return {};
          },
          async set() {}
        },
        onChanged: {
          addListener() {}
        }
      }
    };
  });
  await page.addScriptTag({ path: join(root, "sidepanel", "sidepanel.js") });
  await page.waitForSelector(".draft-preview ol");
  await page.evaluate(() => {
    window.__clipboardCapture = null;
    window.ClipboardItem = class ClipboardItem {
      constructor(items) {
        this.items = items;
        this.types = Object.keys(items);
      }

      async getType(type) {
        return this.items[type];
      }
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async write(items) {
          const item = items[0];
          window.__clipboardCapture = {
            types: item.types,
            html: await (await item.getType("text/html")).text(),
            text: await (await item.getType("text/plain")).text()
          };
        },
        async writeText(text) {
          window.__clipboardCapture = {
            types: ["text/plain"],
            html: "",
            text
          };
        }
      }
    });
  });
  await page.getByRole("button", { name: "Copy" }).click();
  await page.waitForFunction(() => window.__clipboardCapture !== null);

  const result = await page.evaluate(() => ({
    previewHtml: document.querySelector(".draft-preview").innerHTML,
    editorHidden: document.querySelector(".draft-editor").hidden,
    clipboard: window.__clipboardCapture,
    sanitized: window.PlugincySidepanelTest.buildSafeDraftHtml(
      "<p>Safe</p><img src=x><script>unsafe()</script>",
      "fallback"
    )
  }));
  assert.match(result.previewHtml, /<ol>/);
  assert.match(result.previewHtml, /<strong>/);
  assert.match(result.previewHtml, /<pre><code>/);
  assert.doesNotMatch(result.previewHtml, /<img|<script|unsafe\(\)/);
  assert.equal(result.editorHidden, true);
  assert.deepEqual(result.clipboard.types.sort(), ["text/html", "text/plain"]);
  assert.match(result.clipboard.html, /<ol>/);
  assert.match(result.clipboard.html, /<strong>/);
  assert.match(result.clipboard.html, /<pre><code>/);
  assert.doesNotMatch(result.clipboard.html, /<img|<script|unsafe\(\)/);
  assert.match(result.clipboard.text, /1\. First item/);
  assert.equal(result.sanitized, "<p>Safe</p>");
  await context.close();
}

async function testChatGptFreshConversationGuard(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main>
          <article data-message-author-role="assistant">Previous customer context</article>
          <form><div id="prompt-textarea" contenteditable="true" role="textbox"></div></form>
        </main>
      </body></html>`
    })
  );
  await page.goto("https://chatgpt.com/c/previous");
  await page.addScriptTag({ path: join(root, "content", "prompt-builder.js") });
  await page.addScriptTag({ path: join(root, "content", "gpt-controller.js") });
  const error = await page.evaluate(async () => {
    try {
      await window.PlugincyGptControllerTest.prepareFreshConversation();
      return "";
    } catch (caught) {
      return caught.message;
    }
  });
  assert.match(error, /fresh ChatGPT conversation could not be confirmed/i);

  await context.close();
}

async function testChatGptResponseDetection(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main><form>
          <div id="prompt-textarea" contenteditable="true" role="textbox"></div>
          <button data-testid="send-button" type="button">Send</button>
        </form></main>
      </body></html>`
    })
  );
  await page.goto("https://chatgpt.com/");
  await page.addScriptTag({ path: join(root, "content", "prompt-builder.js") });
  await page.addScriptTag({ path: join(root, "content", "gpt-controller.js") });
  const responsePromise = page.evaluate(() => {
    const baseline = window.PlugincyGptControllerTest.getAssistantSnapshot();
    setTimeout(() => {
      const reply = document.createElement("article");
      reply.dataset.messageAuthorRole = "assistant";
      reply.innerHTML = `
        <div class="markdown">
          <p>A stable professional support response.</p>
        </div>
        <button data-testid="copy-turn-action-button" type="button">Copy</button>
      `;
      document.querySelector("main").append(reply);
    }, 150);
    return window.PlugincyGptControllerTest.waitForCompletedResponse(baseline);
  });
  const response = await responsePromise;
  assert.equal(response.text, "A stable professional support response.");
  assert.equal(
    response.html,
    "<p>A stable professional support response.</p>"
  );
  await context.close();
}

async function testChatGptStructuredResponseAndPartialStreamGuard(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await page.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <main><form>
          <div id="prompt-textarea" contenteditable="true" role="textbox"></div>
          <button data-testid="send-button" type="button">Send</button>
        </form></main>
      </body></html>`
    })
  );
  await page.goto("https://chatgpt.com/");
  await page.addScriptTag({ path: join(root, "content", "prompt-builder.js") });
  await page.addScriptTag({ path: join(root, "content", "gpt-controller.js") });

  const structured = await page.evaluate(() => {
    const reply = document.createElement("article");
    reply.dataset.messageAuthorRole = "assistant";
    reply.innerHTML = `
      <div class="markdown">
        <p>Hi,</p>
        <p>Please check:</p>
        <ol>
          <li>The affected page URL.</li>
          <li>Any recent <strong>theme or plugin changes</strong>.</li>
        </ol>
        <pre><code>const ready = true;</code></pre>
      </div>
    `;
    document.querySelector("main").append(reply);
    return window.PlugincyGptControllerTest.extractAssistantResponse(reply);
  });
  assert.match(structured.text, /1\. The affected page URL\./);
  assert.match(structured.text, /2\. Any recent theme or plugin changes\./);
  assert.match(structured.text, /```\nconst ready = true;\n```/);
  assert.match(structured.html, /<ol>/);
  assert.match(structured.html, /<strong>/);
  assert.match(structured.html, /<pre><code>/);

  const streamed = await page.evaluate(async () => {
    document.querySelector("[data-message-author-role='assistant']")?.remove();
    const baseline = window.PlugincyGptControllerTest.getAssistantSnapshot();
    setTimeout(() => {
      const reply = document.createElement("article");
      reply.dataset.messageAuthorRole = "assistant";
      reply.textContent = "Hi";
      document.querySelector("main").append(reply);
      setTimeout(() => {
        reply.innerHTML = `
          <div class="markdown"><p>Hi, this is the complete response.</p></div>
          <button data-testid="copy-turn-action-button" type="button">Copy</button>
        `;
      }, 4000);
    }, 100);
    const startedAt = Date.now();
    const response = await window.PlugincyGptControllerTest.waitForCompletedResponse(
      baseline
    );
    return {
      response,
      elapsed: Date.now() - startedAt
    };
  });
  assert.equal(streamed.response.text, "Hi, this is the complete response.");
  assert.ok(streamed.elapsed >= 6000);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await testFluentFixture(browser);
    await testTitanFixture(browser);
    await testSourceNotifierIgnoresOldTitanMail(browser);
    await testSourceNotifierIgnoresTitanSubjectDetail(browser);
    await testAttachedTitanViewsAndReplySelectors(browser);
    await testAttachedFluentRefresh(browser);
    await testAutoReplyDom(browser);
    await testFixedReplyLauncher(browser);
    await testReviewRequestLauncher(browser);
    await testCustomReplyLauncher(browser);
    await testFormattedDraftInbox(browser);
    await testChatGptFreshConversationGuard(browser);
    await testChatGptResponseDetection(browser);
    await testChatGptStructuredResponseAndPartialStreamGuard(browser);
    console.log("Workflow browser tests passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
