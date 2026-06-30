"use strict";

const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const fluentFixture =
  "C:\\Users\\GM Team\\Downloads\\Elementor Loop Grid – AJAX filter state is not reset + YITH Wishlist not working after AJAX filtering.html";
const titanFixture = "C:\\Users\\GM Team\\Downloads\\Inbox (1) - Mail.html";

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
  await page.route("https://plugincy.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html })
  );
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
  const context = await browser.newContext();
  const page = await context.newPage();
  await addChromeMock(page);
  await page.route("https://hostinger.titan.email/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html })
  );
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
      reply.textContent = "A stable professional support response.";
      document.querySelector("main").append(reply);
    }, 150);
    return window.PlugincyGptControllerTest.waitForCompletedResponse(baseline);
  });
  assert.equal(
    await responsePromise,
    "A stable professional support response."
  );
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await testFluentFixture(browser);
    await testTitanFixture(browser);
    await testSourceNotifierIgnoresOldTitanMail(browser);
    await testAutoReplyDom(browser);
    await testFixedReplyLauncher(browser);
    await testReviewRequestLauncher(browser);
    await testCustomReplyLauncher(browser);
    await testChatGptFreshConversationGuard(browser);
    await testChatGptResponseDetection(browser);
    console.log("Workflow browser tests passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
