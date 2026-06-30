"use strict";

const assert = require("node:assert/strict");
const { buildPrompt } = require("./content/prompt-builder.js");

const prompt = buildPrompt({
  subject: "Facing issues with product filter.",
  text:
    "[Customer | Mario]\nFilter by category is not working.\n\n[Support | Plugincy]\nPlease update the plugin.\n\n[Customer | Mario]\nIt still fails after the update.",
  conversationText:
    "[Customer | Mario]\nFilter by category is not working.\n\n[Support | Plugincy]\nPlease update the plugin.\n\n[Customer | Mario]\nIt still fails after the update.",
  pendingText: "[Customer | Mario]\nIt still fails after the update.",
  pendingMessageCount: 1,
  product: {
    name: "Dynamic Ajax Product Filter",
    resources: {
      githubUrl:
        "https://github.com/RaddN/dynamic-ajax-product-filters-for-woocommerce-pro",
      docsUrl:
        "https://plugincy.com/documentations/dynamic-ajax-product-filters-for-woocommerce/",
      landingUrl: "https://plugincy.com/dynamic-ajax-product-filters-for-woocommerce/",
      customLinks: [
        {
          label: "Product website",
          url: "https://ajaxproductfilters.com/"
        }
      ]
    },
    notes: "Primary WooCommerce filter plugin."
  }
});

assert.match(prompt, /Reference resources for analysis:/);
assert.match(prompt, /Use repository links to inspect relevant code/);
assert.match(prompt, /Do not automatically include them in the reply/);
assert.match(prompt, /UNREPLIED_CUSTOMER_MESSAGES/);
assert.match(prompt, /Customer messages before the latest support reply have already been answered/);
assert.match(prompt, /ask only for the exact missing details needed/);
assert.match(prompt, /temporary staging or WordPress admin access/);
assert.match(prompt, /Missing information .* is not by itself an escalation/);
assert.match(prompt, /access details are allowed in this support workflow/);
assert.doesNotMatch(prompt, /Quick links available for the reply/);
assert.doesNotMatch(prompt, /If product quick links are available/);

const customPrompt = buildPrompt({
  subject: "Follow-up",
  text: "[Customer]\nThanks, it works now.",
  conversationText: "[Customer]\nThanks, it works now.",
  pendingText: "[Customer]\nThanks, it works now.",
  customReplyText: "tell them we fixed and they can check now",
  product: {
    name: "One Page Quick Checkout",
    resources: {}
  }
});

assert.match(customPrompt, /CUSTOM_REPLY_DRAFT/);
assert.match(customPrompt, /tell them we fixed and they can check now/);
assert.match(customPrompt, /Rewrite the rough custom reply/i);
assert.match(customPrompt, /Return only the polished reply/);
assert.doesNotMatch(customPrompt, /Use 'ESCALATE_TO_HUMAN/);

console.log("Prompt builder test passed.");
