# Plugincy Support RPA

A Manifest V3 Chrome extension for a WordPress/WooCommerce developer support workflow. It reads the exact open Fluent Support ticket or Titan email only after you click, uses a logged-in `chatgpt.com` tab to draft a response, saves every result in a local Draft Inbox, and escalates sensitive or runtime-only work into a local task list.

No API key is used. The extension operates through page DOM content scripts in your own logged-in browser session.

## What is included

- Professional New Tab workbench with:
  - Detailed tasks, drafts, ticket context, and product resources stored in `chrome.storage.local`; only compact preferences sync.
  - Add, complete, reprioritize, filter, and delete actions.
  - Up to 12 WordPress and WooCommerce developer RSS updates with a short-summary share action (or clipboard fallback).
  - A WordPress.org checker for the three Plugincy plugins, with a 30-day release deadline, active installs, ratings, support totals, and recent new support/rating activity.
  - Desktop notifications for newly detected Fluent Support tickets, Titan unread mail, and new WordPress.org plugin ratings/reviews or support topics.
  - Recent automation activity.
  - Open-tab/session health indicators.
  - Police Line, Cumilla weather and umbrella dates when rain probability is above 40%.
  - Navigation links to Fluent Support, Titan Mail, ChatGPT, and WordPress Admin.
  - Light and dark themes.
- Support-page scraper for:
  - `https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets`
  - `https://hostinger.titan.email/mail/`
- ChatGPT DOM controller with a serialized job queue and completion `MutationObserver`.
- Product repositories, documentation, landing pages, and other configured URLs are analysis references. The prompt uses them to verify code and product behavior; it does not automatically expose them as customer-facing quick links.
- Secret detection for credentials, API tokens, license keys, authorization headers, basic-auth URLs, database/hosting access, and private keys. Subject and full conversation are scanned before truncation.
- AI escalation handling. `ESCALATE_TO_HUMAN: ...` results become high-priority local tasks instead of replies.
- Persistent native Chrome side panel with Draft Inbox, editable replies, copy/retry/delete actions, ticket links, and local tasks.
- Professional auto-reply is opt-in and off by default. It revalidates the same open ticket, waits through a safety delay, and keeps the draft when insertion or sending cannot be confirmed safely.
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
2. Select **Generate GPT reply** in the compact support-page launcher, or use **Process ticket** in the native side panel.
3. ChatGPT opens in its real browser tab so you can review, edit, or continue prompting there.
4. The completed result is saved in **Draft Inbox**. Copy/edit it there, or enable professional auto-reply in preferences.

If temporary WordPress credentials are detected, the ticket is escalated locally and no ticket text is sent to ChatGPT. `ESCALATE_TO_HUMAN: ...` is reserved for tickets where a safe customer-facing draft cannot be produced because sensitive access details are already present, immediate internal/manual action is required, or another genuine safety boundary applies.

Brief or incomplete reports are not escalated by default. The generated reply asks for the exact missing diagnostic details. When hands-on investigation is reasonably required, it asks the customer to provide minimum temporary staging/admin access through the approved secure support channel.

## Notifications and release checks

- Fluent Support and Titan notifications are detected from unread/new markers exposed by their open browser tabs. Keep those services open for source notifications; DOM changes in either service may require selector maintenance.
- WordPress.org support and review feeds are checked every 15 minutes. The first successful check establishes a baseline so existing topics and reviews do not trigger a notification flood.
- Release metadata is read from the official WordPress.org Plugins API every six hours and on manual refresh. Each monitored plugin is due 30 days after its reported `last_updated` value.
- Selecting a desktop notification focuses an existing matching tab or opens the target in a new tab.

## Draft and auto-reply safety

Automatic ticket drafting on visit is disabled. Opening a Titan email or Fluent Support ticket no longer sends anything to ChatGPT.

Auto-reply remains off until explicitly enabled. When enabled, the support content script verifies that the ticket signature is unchanged before and after opening the editor, waits through the configured safety delay, and only clicks a uniquely identified reply submit button. Any mismatch or missing selector stops sending and preserves the saved draft.

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
6. Adds, completes, and deletes a temporary local task.
7. Verifies the default product library records and custom reference-link CRUD.
8. Verifies the plugin release checker is present.
9. Opens `chatgpt.com` and reports whether the prompt composer is visible.
10. Writes `test-results/newtab-dashboard.png`.

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
npm run test:unit
npm run test:workflow
```

Validation checks the manifest contract, side-panel configuration, required files, permissions/hosts, New Tab override, service worker entry, and JavaScript syntax. Workflow tests cover the supplied Fluent Support and Titan exports, secret blocking, triage, duplicate signatures, timeout recovery, auto-reply insertion, and the ChatGPT fresh-conversation guard.

## Security boundaries

- Credential detection runs before ChatGPT dispatch.
- Credential values are never copied into task summaries or activity logs.
- Dynamic RSS and ticket text are rendered with `textContent`, not HTML.
- Source notifications store only local hashed unread-item fingerprints; ticket and email body content is not copied into notification state.
- No external scripts, CDNs, analytics, API keys, or remote code are used.
- Queue state, detailed tasks, drafts, and ticket/customer context stay in `chrome.storage.local`. Only preferences use `chrome.storage.sync`.
- Fluent Support capture is accepted only on `admin.php?page=fluent-support#/tickets/<id>/view`; other WordPress admin routes cannot be processed.

## Expected maintenance

ChatGPT, Fluent Support, and Titan are third-party DOMs. When an interface changes, update the ordered selectors in:

- `content/gpt-controller.js`
- `content/scraper.js`

Keep selectors semantic (`data-testid`, `aria-label`, stable editor roles) before falling back to class-name fragments.
