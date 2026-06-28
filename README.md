# Plugincy Support RPA

A Manifest V3 Chrome extension for a WordPress/WooCommerce developer support workflow. It reads the open Fluent Support ticket or Titan email, uses a logged-in `chatgpt.com` tab to draft a response, inserts the result back into the support editor, and escalates sensitive or runtime-only work into a synced task list.

No API key is used. The extension operates through page DOM content scripts in your own logged-in browser session.

## What is included

- Professional New Tab workbench with:
  - To-do items stored as separate `chrome.storage.sync` records to stay within per-item sync quotas.
  - Add, complete, reprioritize, filter, and delete actions.
  - WordPress and WooCommerce developer RSS updates.
  - Recent automation activity.
  - Open-tab/session health indicators.
  - Quick links to Fluent Support, Titan Mail, ChatGPT, and WordPress Admin.
  - Light and dark themes.
- Support-page scraper for:
  - `https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets`
  - `https://hostinger.titan.email/mail/`
- ChatGPT DOM controller with a serialized job queue and completion `MutationObserver`.
- Local credential detection. Tickets containing likely usernames/passwords or WordPress admin access details are not sent to ChatGPT.
- AI escalation handling. `ESCALATE_TO_HUMAN: ...` results become high-priority synced tasks instead of replies.
- Draft-only insertion by default. Automatic submission is an explicit dashboard opt-in.
- Persistent-profile Playwright smoke test.

## Install the unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project directory:

   `C:\Users\GM Team\OneDrive\Desktop\plugincy-support-rpa-extension`

5. Reload any ChatGPT, Fluent Support, or Titan tabs that were already open.
6. Open a new tab to see **Plugincy Workbench**.

The extension creates and reuses its own pinned ChatGPT tab during ticket processing. Keep ChatGPT signed in. The first run may require you to finish a login or consent screen manually.

## Daily workflow

1. Open a Fluent Support ticket or Titan email.
2. Select **Draft with ChatGPT** in the small support-page launcher, or open a new tab and select **Process current ticket**.
3. Leave the pinned ChatGPT tab available while the response is generated.
4. Review the inserted draft and send it.

If temporary WordPress credentials are detected, the ticket is escalated locally and no ticket text is sent to ChatGPT. If ChatGPT cannot resolve the issue from the provided code or determines that runtime access is needed, the response must use `ESCALATE_TO_HUMAN: ...`; the extension converts that summary into a high-priority to-do.

## Auto-send safety

**Auto-send replies** is off by default. When it is off, the extension only inserts a draft. Turning it on allows the content script to click a matching Send/Reply button after inserting a response.

Keep auto-send off until the selectors have been checked against the current Fluent Support and Titan interfaces. Those products can change their DOM without notice.

## Install test dependencies

Use Node.js 20 or newer:

```powershell
cd "C:\Users\GM Team\OneDrive\Desktop\plugincy-support-rpa-extension"
npm install
npm run validate
```

## Run the persistent-profile Playwright test

Close every Chrome window first. Chrome locks its profile while running.

```powershell
cd "C:\Users\GM Team\OneDrive\Desktop\plugincy-support-rpa-extension"
$env:CHROME_USER_DATA_DIR = "$env:LOCALAPPDATA\Google\Chrome\User Data"
$env:CHROME_PROFILE_DIRECTORY = "Default"
npm run test:extension
```

The test:

1. Uses `chromium.launchPersistentContext`—it never creates a normal clean browser context.
2. Points at the configured local Chrome user-data directory.
3. Loads only this unpacked extension with `--disable-extensions-except` and `--load-extension`.
4. Opens `chrome://newtab/` and verifies the dashboard override.
5. Finds the MV3 service worker and extension ID.
6. Adds, completes, and deletes a temporary synced task.
7. Verifies the default product library records and custom quick-link CRUD.
8. Opens `chatgpt.com` and reports whether the prompt composer is visible.
9. Writes `test-results/newtab-dashboard.png`.

Optional variables:

```powershell
$env:CHROME_PROFILE_DIRECTORY = "Profile 1"
$env:PLAYWRIGHT_BROWSER_CHANNEL = "msedge"
```

The default Playwright channel is `chrome`, so the test targets installed Google Chrome and the configured Chrome profile. Use another channel only when you intentionally test a different persistent browser profile.

### Chrome profile limitation

Current Chrome versions may reject automation against Chrome's normal default `User Data` directory, even when Chrome is closed. This is a browser policy limitation, not a Playwright-context choice. The script intentionally tries the real local profile because retained sessions were requested and emits a precise error if Chrome blocks it.

If the policy blocks the main profile, create a dedicated persistent automation profile, sign in to ChatGPT/Hostinger/WordPress once, and keep using that same directory:

```powershell
$env:CHROME_USER_DATA_DIR = "$env:LOCALAPPDATA\PlugincyRPA\BrowserProfile"
$env:CHROME_PROFILE_DIRECTORY = "Default"
npm run test:extension
```

That fallback remains persistent between test runs; it is not a clean or disposable context.

## Validation

```powershell
npm run validate
```

This validates the manifest contract, required files, requested permissions/hosts, New Tab override, service worker entry, and JavaScript syntax.

## Security boundaries

- Credential detection runs before ChatGPT dispatch.
- Credential values are never copied into task summaries or activity logs.
- Dynamic RSS and ticket text are rendered with `textContent`, not HTML.
- No external scripts, CDNs, analytics, API keys, or remote code are used.
- Job state is held in `chrome.storage.session`; task data uses `chrome.storage.sync`; activity/news caches use `chrome.storage.local`.
- Ticket automation is accepted only from the configured Hostinger and Plugincy support origins.

## Expected maintenance

ChatGPT, Fluent Support, and Titan are third-party DOMs. When an interface changes, update the ordered selectors in:

- `content/gpt-controller.js`
- `content/scraper.js`

Keep selectors semantic (`data-testid`, `aria-label`, stable editor roles) before falling back to class-name fragments.
