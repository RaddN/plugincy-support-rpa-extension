import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "manifest.json",
  "background.js",
  "shared/workflow-core.js",
  "content/scraper.js",
  "content/source-notifier.js",
  "content/prompt-builder.js",
  "content/gpt-controller.js",
  "sidepanel/sidepanel.html",
  "sidepanel/sidepanel.css",
  "sidepanel/sidepanel.js",
  "dashboard/newtab.html",
  "dashboard/newtab.css",
  "dashboard/newtab.js",
  "brand_logo.png",
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "test-workflow.js",
  "test-workflow-browser.js",
  "test-extension.js"
];

const missingFiles = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missingFiles.length) {
  throw new Error(`Missing required files: ${missingFiles.join(", ")}`);
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const expectedPermissions = [
  "activeTab",
  "tabs",
  "storage",
  "scripting",
  "alarms",
  "notifications",
  "sidePanel"
];
const expectedHosts = [
  "https://chatgpt.com/*",
  "https://hostinger.titan.email/*",
  "https://plugincy.com/wp-admin/admin.php*",
  "https://wordpress.org/*",
  "https://api.wordpress.org/*",
  "https://api.open-meteo.com/*",
  "https://geocoding-api.open-meteo.com/*"
];

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
}

for (const permission of expectedPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`Missing manifest permission: ${permission}`);
  }
}

for (const host of expectedHosts) {
  if (!manifest.host_permissions?.includes(host)) {
    throw new Error(`Missing manifest host permission: ${host}`);
  }
}

if (manifest.background?.service_worker !== "background.js") {
  throw new Error("The MV3 service worker must be background.js.");
}

for (const size of ["16", "32", "48", "128"]) {
  if (manifest.icons?.[size] !== `assets/icons/icon-${size}.png`) {
    throw new Error(`Missing or incorrect manifest icon for ${size}px.`);
  }
}

if (manifest.chrome_url_overrides?.newtab !== "dashboard/newtab.html") {
  throw new Error("The New Tab override must point to dashboard/newtab.html.");
}

if (manifest.side_panel?.default_path !== "sidepanel/sidepanel.html") {
  throw new Error("The native side panel must point to sidepanel/sidepanel.html.");
}

for (const file of [
  "background.js",
  "shared/workflow-core.js",
  "content/scraper.js",
  "content/source-notifier.js",
  "content/prompt-builder.js",
  "content/gpt-controller.js",
  "sidepanel/sidepanel.js",
  "dashboard/newtab.js",
  "test-prompt-builder.js",
  "test-workflow.js",
  "test-workflow-browser.js",
  "test-extension.js"
]) {
  execFileSync(process.execPath, ["--check", join(root, file)], {
    stdio: "pipe"
  });
}

console.log("Validation passed: manifest, required files, and JavaScript syntax are valid.");
