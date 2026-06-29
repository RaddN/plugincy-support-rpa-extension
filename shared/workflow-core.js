((root, factory) => {
  "use strict";

  const api = factory();
  root.PlugincyWorkflowCore = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const SECRET_PATTERNS = [
    {
      type: "private-key",
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i
    },
    {
      type: "authorization-header",
      pattern: /\bauthorization\s*:\s*(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}/i
    },
    {
      type: "basic-auth-url",
      pattern: /https?:\/\/[^/\s:@]+:[^@\s/]+@[^\s<>"']+/i
    },
    {
      type: "known-api-token",
      pattern:
        /\b(?:sk-(?:proj-)?[a-z0-9_-]{20,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|xox[baprs]-[a-z0-9-]{16,}|AKIA[0-9A-Z]{16})\b/i
    },
    {
      type: "api-token",
      pattern:
        /\b(?:api[\s_-]?(?:key|token|secret)|access[\s_-]?token|client[\s_-]?secret|secret[\s_-]?key)\b\s*(?:is|:|=|-)\s*["']?([a-z0-9._~+/=-]{12,})/i
    },
    {
      type: "license-key",
      pattern:
        /\b(?:license|licence|activation|purchase)\s*(?:key|code)\b\s*(?:is|:|=|-)\s*["']?([a-z0-9]{4,}(?:-[a-z0-9]{4,}){2,})/i
    },
    {
      type: "password",
      pattern:
        /\b(?:password|passcode|passwd|pwd|database password|db password|ftp password|sftp password|cPanel password)\b\s*(?:is|:|=|-)\s*["']?([^\s,;]{4,})/i
    },
    {
      type: "hosting-credentials",
      pattern:
        /\b(?:cPanel|FTP|SFTP|SSH|database|DB)\s+(?:credentials?|login|access|username|user)\b[\s\S]{0,220}\b(?:password|passwd|pwd|host|port)\b/i
    },
    {
      type: "database-url",
      pattern: /\b(?:mysql|mariadb|postgres(?:ql)?):\/\/[^:\s/]+:[^@\s]+@[^\s<>"']+/i
    },
    {
      type: "wordpress-login",
      pattern:
        /\b(?:credentials?|login details?|admin access|temporary access)\b[\s\S]{0,240}\b(?:password|passwd|pwd)\b/i
    }
  ];

  const NON_SECRET_VALUES =
    /^(?:not|none|unknown|missing|invalid|incorrect|wrong|expired|reset|changed|hidden|redacted|example|test|your[-_ ]?(?:key|token|password)|n\/a|\*+)$/i;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeMultiline(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function detectSecrets(...values) {
    const text = values.map((value) => String(value || "")).join("\n");
    const types = [];

    for (const entry of SECRET_PATTERNS) {
      const match = text.match(entry.pattern);
      if (!match) {
        continue;
      }

      const capturedValue = normalizeText(match[1] || "").replace(/[.!?]+$/, "");
      if (capturedValue && NON_SECRET_VALUES.test(capturedValue)) {
        continue;
      }
      types.push(entry.type);
    }

    const usernameSignal =
      /\b(?:username|user name|admin user|login user|wp user)\b\s*(?:is|:|=|-)\s*\S+/i.test(
        text
      );
    const loginSignal =
      /(?:\/wp-admin\/?|\/wp-login\.php|wordpress\s+(?:admin|login)|temporary\s+(?:admin|login)|login\s+details)/i.test(
        text
      );
    if (usernameSignal && loginSignal) {
      types.push("wordpress-username");
    }

    return {
      found: types.length > 0,
      types: [...new Set(types)]
    };
  }

  function redactSecrets(value) {
    return String(value || "")
      .replace(
        /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi,
        "[redacted private key]"
      )
      .replace(
        /(\bauthorization\s*:\s*(?:bearer|basic)\s+)[a-z0-9._~+/=-]+/gi,
        "$1[redacted]"
      )
      .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@[^\s<>"']+/gi, "[redacted credential URL]")
      .replace(
        /(\b(?:password|passcode|passwd|pwd|username|user name|login|api[\s_-]?(?:key|token|secret)|access[\s_-]?token|client[\s_-]?secret|license|licence|activation|purchase)\b[\w\s_-]{0,24}\s*(?:is|:|=|-)\s*)["']?[^\s,;]+/gi,
        "$1[redacted]"
      )
      .replace(
        /\b(?:sk-(?:proj-)?[a-z0-9_-]{20,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|xox[baprs]-[a-z0-9-]{16,}|AKIA[0-9A-Z]{16})\b/gi,
        "[redacted token]"
      );
  }

  function getFluentSupportTicketId(value) {
    try {
      const url = new URL(String(value || ""));
      if (
        url.protocol !== "https:" ||
        url.hostname !== "plugincy.com" ||
        url.pathname !== "/wp-admin/admin.php" ||
        url.searchParams.get("page") !== "fluent-support"
      ) {
        return "";
      }

      return url.hash.match(/^#\/tickets\/(\d+)\/view(?:[/?]|$)/i)?.[1] || "";
    } catch {
      return "";
    }
  }

  function isFluentSupportTicketUrl(value) {
    return Boolean(getFluentSupportTicketId(value));
  }

  function createTicketSignature(ticket) {
    const sourceKey = [
      normalizeText(ticket?.source),
      normalizeText(ticket?.ticketId),
      normalizeText(ticket?.subject),
      normalizeText(ticket?.pageUrl),
      normalizeText(ticket?.text).slice(0, 1200)
    ].join("|");

    let hash = 2166136261;
    for (let index = 0; index < sourceKey.length; index += 1) {
      hash ^= sourceKey.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `${normalizeText(ticket?.source) || "support"}:${
      normalizeText(ticket?.ticketId) || "ticket"
    }:${(hash >>> 0).toString(36)}`;
  }

  function classifyEmail({ subject = "", text = "" } = {}) {
    const subjectText = normalizeText(subject);
    const bodyText = normalizeText(text);
    const haystack = `${subjectText}\n${bodyText}`.toLowerCase();

    const systemPattern =
      /\b(?:delivery status notification|mail delivery failed|undeliverable|password reset|security alert|verify your email|one[- ]time password|login code|invoice generated|payment receipt)\b/i;
    const newsletterPattern =
      /\b(?:unsubscribe|view in browser|manage preferences|weekly newsletter|daily digest|product updates?|marketing email)\b/i;
    const outreachPattern =
      /\b(?:just checking in|following up on my previous email|thoughts on the video|quick question about your business|guest post|seo services?|link building|lead generation|book a call|schedule a demo|partnership opportunity)\b/i;
    const spamSubjectPattern =
      /\b(?:is this you|quick question|following up|collaboration|business proposal|guest post)\??\s*$/i;
    const supportSignal =
      /\b(?:error|issue|problem|bug|not working|failed|help|support|plugin|wordpress|woocommerce|license|activation|checkout|filter|wishlist|site|dashboard)\b/i;

    if (systemPattern.test(haystack)) {
      return { kind: "system", isSupport: false, reason: "System-generated email" };
    }
    if (spamSubjectPattern.test(subjectText) || outreachPattern.test(haystack)) {
      return { kind: "outreach", isSupport: false, reason: "Sales or outreach email" };
    }
    if (newsletterPattern.test(haystack) && !supportSignal.test(haystack)) {
      return { kind: "newsletter", isSupport: false, reason: "Newsletter or bulk email" };
    }

    return {
      kind: supportSignal.test(haystack) ? "support" : "unknown",
      isSupport: true,
      reason: supportSignal.test(haystack) ? "Support request" : "Needs manual review"
    };
  }

  function cleanTitanText(value) {
    let text = normalizeMultiline(value)
      .replace(/https?:\/\/\S*(?:track|pixel|open|click)\S*/gi, "")
      .replace(/\[(?:tracking|open tracking|read receipt)[^\]]*\]/gi, "");

    const quoteMarkers = [
      /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
      /^\s*On .{3,160} wrote:\s*$/im,
      /^\s*From:\s+.+\n\s*(?:Sent|Date|To|Subject):/im,
      /^\s*>+\s*/m
    ];
    const quoteIndexes = quoteMarkers
      .map((pattern) => text.search(pattern))
      .filter((index) => index >= 0);
    if (quoteIndexes.length) {
      text = text.slice(0, Math.min(...quoteIndexes));
    }

    const lines = text.split("\n");
    const cleaned = [];
    for (const line of lines) {
      const normalized = normalizeText(line);
      if (!normalized) {
        if (cleaned[cleaned.length - 1] !== "") {
          cleaned.push("");
        }
        continue;
      }

      if (
        /^(?:Titan Tasks|Tasks\s*Manage your to-dos|Manage your to-dos|Add to Tasks|Open tracking|Read receipt)$/i.test(
          normalized
        ) ||
        /^(?:unsubscribe|manage preferences|view (?:this )?email in (?:your )?browser|privacy policy|terms of service)$/i.test(
          normalized
        ) ||
        /^(?:this (?:email|message) (?:and any attachments )?is confidential|confidentiality notice|please consider the environment before printing)/i.test(
          normalized
        )
      ) {
        continue;
      }
      cleaned.push(normalized);
    }

    text = normalizeMultiline(cleaned.join("\n"));
    const signatureMatch = text.match(
      /\n(?:best(?: regards)?|kind regards|warm regards|regards|sincerely|thanks(?: again)?|sent from my (?:iphone|android))[,!]*\s*\n/i
    );
    if (signatureMatch && signatureMatch.index > Math.min(40, text.length * 0.35)) {
      text = text.slice(0, signatureMatch.index);
    }

    return normalizeMultiline(text);
  }

  function dedupeTextBlocks(values) {
    const output = [];
    const seen = new Set();

    for (const value of values || []) {
      const text = normalizeMultiline(value);
      const key = normalizeText(text).toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }

      if (
        output.some((existing) => {
          const existingKey = normalizeText(existing).toLowerCase();
          return (
            existingKey.includes(key) ||
            (key.length > existingKey.length * 1.2 && key.includes(existingKey))
          );
        })
      ) {
        if (output.length && key.length > normalizeText(output[output.length - 1]).length) {
          output[output.length - 1] = text;
        }
        continue;
      }

      seen.add(key);
      output.push(text);
    }

    return output;
  }

  function findDuplicateJob(state, signature) {
    if (!signature) {
      return null;
    }
    if (state?.active?.signature === signature) {
      return { status: "processing", job: state.active };
    }
    const queued = Array.isArray(state?.queue)
      ? state.queue.find((job) => job?.signature === signature)
      : null;
    return queued ? { status: "queued", job: queued } : null;
  }

  function recoverTimedOutJob(state, now, timeoutMs) {
    const normalized = {
      queue: Array.isArray(state?.queue) ? [...state.queue] : [],
      active: state?.active && typeof state.active === "object" ? state.active : null
    };
    if (
      !normalized.active ||
      now - Number(normalized.active.startedAt || normalized.active.createdAt || 0) <=
        timeoutMs
    ) {
      return { state: normalized, timedOutJob: null };
    }

    const timedOutJob = normalized.active;
    normalized.active = null;
    return { state: normalized, timedOutJob };
  }

  return {
    classifyEmail,
    cleanTitanText,
    createTicketSignature,
    dedupeTextBlocks,
    detectSecrets,
    findDuplicateJob,
    getFluentSupportTicketId,
    isFluentSupportTicketUrl,
    normalizeMultiline,
    normalizeText,
    recoverTimedOutJob,
    redactSecrets
  };
});
