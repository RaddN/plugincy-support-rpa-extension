"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const extensionPath = path.resolve(__dirname);
const userDataDir = path.resolve(
  process.env.CHROME_USER_DATA_DIR || defaultChromeUserDataDir()
);
const profileDirectory = process.env.CHROME_PROFILE_DIRECTORY || "Default";
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chromium";
const resultsDir = path.join(extensionPath, "test-results");
const screenshotPath = path.join(resultsDir, "newtab-dashboard.png");
const allowRunningChrome = process.env.RPA_ALLOW_RUNNING_CHROME === "1";

let context;

run().catch(async (error) => {
  console.error(`\nExtension test failed: ${error.message}`);
  if (context) {
    const page = context.pages().at(-1);
    if (page) {
      try {
        fs.mkdirSync(resultsDir, { recursive: true });
        await page.screenshot({
          path: path.join(resultsDir, "failure.png"),
          fullPage: true
        });
        console.error("Failure screenshot: test-results/failure.png");
      } catch {
        // The browser may already be closed.
      }
    }
    await context.close().catch(() => undefined);
  }
  process.exitCode = 1;
});

async function run() {
  assert.ok(fs.existsSync(path.join(extensionPath, "manifest.json")), "manifest.json is missing.");
  assert.ok(fs.existsSync(userDataDir), `Chrome user data directory not found: ${userDataDir}`);
  assert.ok(
    fs.existsSync(path.join(userDataDir, profileDirectory)),
    `Chrome profile directory not found: ${path.join(userDataDir, profileDirectory)}`
  );

  if (!allowRunningChrome && isChromeRunning()) {
    throw new Error(
      "Chrome is running. Close every Chrome window and background process before using its persistent profile. Set RPA_ALLOW_RUNNING_CHROME=1 only if you intentionally use a different unlocked profile."
    );
  }

  fs.mkdirSync(resultsDir, { recursive: true });

  console.log("Launching a persistent browser context.");
  console.log(`Profile root: ${userDataDir}`);
  console.log(`Profile directory: ${profileDirectory}`);
  console.log(`Extension: ${extensionPath}`);

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: browserChannel,
      headless: false,
      viewport: null,
      args: [
        `--profile-directory=${profileDirectory}`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check"
      ]
    });
  } catch (error) {
    throw new Error(
      [
        "The persistent Chrome profile could not be launched.",
        "Chrome 136+ may reject automation against its normal default User Data directory, and an open Chrome process also locks the profile.",
        "Close Chrome completely and retry. If policy still blocks the main profile, point CHROME_USER_DATA_DIR to a dedicated persistent automation profile and sign in there once.",
        `Original error: ${error.message}`
      ].join(" ")
    );
  }

  const dashboard = context.pages()[0] || (await context.newPage());
  await dashboard.goto("chrome://newtab/", { waitUntil: "domcontentloaded" });
  await dashboard.waitForSelector('body[data-rpa-dashboard="ready"]', {
    timeout: 30000
  });

  const serviceWorker = await findRpaServiceWorker(context);
  assert.ok(serviceWorker, "Plugincy Support RPA service worker was not registered.");

  const extensionId = new URL(serviceWorker.url()).host;
  assert.ok(extensionId, "Could not determine the extension ID.");
  assert.ok(
    dashboard.url().startsWith(`chrome-extension://${extensionId}/dashboard/newtab.html`),
    `New Tab did not resolve to the extension dashboard: ${dashboard.url()}`
  );

  await dashboard.locator("#page-title").waitFor({ state: "visible" });
  await dashboard.getByRole("heading", { name: "Today’s work" }).waitFor();
  await dashboard.getByRole("heading", { name: "Developer updates" }).waitFor();

  const smokeTask = `Playwright smoke task ${Date.now()}`;
  await dashboard.locator("#task-title").fill(smokeTask);
  await dashboard.locator("#task-priority").selectOption("low");
  await dashboard.getByRole("button", { name: "Add", exact: true }).click();

  const smokeRow = dashboard.locator(".task-row", {
    has: dashboard.getByText(smokeTask, { exact: true })
  });
  await smokeRow.waitFor({ state: "visible" });
  await smokeRow.getByRole("button", { name: `Complete ${smokeTask}` }).click();
  await smokeRow.getByRole("button", { name: `Delete ${smokeTask}` }).click();
  await smokeRow.waitFor({ state: "detached" });

  await dashboard.screenshot({
    path: screenshotPath,
    fullPage: true
  });

  const chatgpt = await context.newPage();
  await chatgpt.goto("https://chatgpt.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  assert.equal(new URL(chatgpt.url()).hostname, "chatgpt.com");

  const composerVisible = await chatgpt
    .locator("#prompt-textarea, textarea[data-testid='prompt-textarea']")
    .first()
    .isVisible()
    .catch(() => false);

  console.log(`Extension ID: ${extensionId}`);
  console.log("New Tab override: PASS");
  console.log("Synced task add/complete/delete: PASS");
  console.log(`ChatGPT opened: PASS (${composerVisible ? "composer detected" : "sign-in/UI check needed"})`);
  console.log(`Dashboard screenshot: ${screenshotPath}`);

  await context.close();
  context = null;
}

async function findRpaServiceWorker(browserContext) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    for (const worker of browserContext.serviceWorkers()) {
      try {
        const name = await worker.evaluate(() => chrome.runtime.getManifest().name);
        if (name === "Plugincy Support RPA") {
          return worker;
        }
      } catch {
        // Ignore service workers that belong to other installed extensions.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

function defaultChromeUserDataDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Google",
      "Chrome",
      "User Data"
    );
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome"
    );
  }

  return path.join(os.homedir(), ".config", "google-chrome");
}

function isChromeRunning() {
  try {
    if (process.platform === "win32") {
      const output = execFileSync("tasklist", ["/FI", "IMAGENAME eq chrome.exe"], {
        encoding: "utf8",
        windowsHide: true
      });
      return /\bchrome\.exe\b/i.test(output);
    }

    execFileSync("pgrep", ["-x", "chrome"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
