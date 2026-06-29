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
    await testAutoReplyDom(browser);
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
