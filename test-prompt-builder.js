"use strict";

const assert = require("node:assert/strict");
const { buildPrompt } = require("./content/prompt-builder.js");

const prompt = buildPrompt({
  subject: "Facing issues with product filter.",
  text: "Filter by category is not working.",
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
assert.match(prompt, /ask only for the exact missing details needed/);
assert.match(prompt, /temporary staging or WordPress admin access/);
assert.match(prompt, /Missing information .* is not by itself an escalation/);
assert.doesNotMatch(prompt, /Quick links available for the reply/);
assert.doesNotMatch(prompt, /If product quick links are available/);

console.log("Prompt builder test passed.");
