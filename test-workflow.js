"use strict";

const assert = require("node:assert/strict");
const {
  classifyEmail,
  cleanTitanText,
  createTicketSignature,
  detectSecrets,
  findDuplicateJob,
  getFluentSupportTicketId,
  recoverTimedOutJob
} = require("./shared/workflow-core.js");

const ticketUrl =
  "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/tickets/61/view";
assert.equal(getFluentSupportTicketId(ticketUrl), "61");
assert.equal(
  getFluentSupportTicketId(
    "https://plugincy.com/wp-admin/admin.php?page=fluent-support#/settings"
  ),
  ""
);
assert.equal(
  getFluentSupportTicketId("https://plugincy.com/wp-admin/plugins.php"),
  ""
);

for (const sample of [
  ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secretpayload", "authorization-header"],
  ["Repository token: ghp_1234567890abcdefghijklmnop", "known-api-token"],
  ["License key: ABCD-EFGH-IJKL-MNOP", "license-key"],
  ["https://admin:supersecret@example.com/wp-admin/", "basic-auth-url"],
  ["DB username: store_user\nDB password: secret123", "password"],
  ["-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----", "private-key"]
]) {
  const result = detectSecrets(sample[0]);
  assert.equal(result.found, true, `Expected secret detection for ${sample[0]}`);
  assert.ok(result.types.includes(sample[1]));
}
assert.equal(
  detectSecrets("Subject: Password reset is not working\nThe password is invalid.").found,
  false
);
assert.equal(
  detectSecrets("Subject: API token: sk-proj-1234567890abcdefghijklmnop", "").found,
  true,
  "Secrets in the subject must be detected"
);

const cleanedTitan = cleanTitanText(`
Titan Tasks
Manage your to-dos

Hello Plugincy,

The checkout plugin fails after an AJAX refresh.

Best regards,
Customer Name
Company legal footer

On Thu, Jun 25, 2026 wrote:
> Earlier duplicated message
https://tracking.example.com/open/pixel
`);
assert.equal(
  cleanedTitan,
  "Hello Plugincy,\n\nThe checkout plugin fails after an AJAX refresh."
);
assert.doesNotMatch(cleanedTitan, /Titan Tasks|quoted|tracking|Customer Name/i);

assert.equal(
  classifyEmail({
    subject: "Is This You?",
    text: "Just checking in to see your thoughts on the video in my previous email."
  }).isSupport,
  false
);
assert.equal(
  classifyEmail({
    subject: "Checkout plugin not working",
    text: "WooCommerce checkout fails after enabling the plugin."
  }).isSupport,
  true
);

const ticket = {
  source: "fluent-support",
  ticketId: "61",
  subject: "Filter issue",
  pageUrl: ticketUrl,
  text: "The filter does not reset after AJAX."
};
const signature = createTicketSignature(ticket);
assert.equal(signature, createTicketSignature({ ...ticket }));
assert.notEqual(signature, createTicketSignature({ ...ticket, ticketId: "62" }));
assert.equal(
  findDuplicateJob({ active: { signature }, queue: [] }, signature).status,
  "processing"
);
assert.equal(
  findDuplicateJob({ active: null, queue: [{ signature }] }, signature).status,
  "queued"
);

const active = { id: "job-1", startedAt: 1000 };
const recovery = recoverTimedOutJob(
  { active, queue: [{ id: "job-2" }] },
  1000 + 6 * 60 * 1000 + 1,
  6 * 60 * 1000
);
assert.equal(recovery.timedOutJob.id, "job-1");
assert.equal(recovery.state.active, null);
assert.equal(recovery.state.queue.length, 1);

console.log("Workflow core tests passed.");
