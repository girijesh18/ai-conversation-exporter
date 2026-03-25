/**
 * ChatGPT Conversation Saver - content.js
 *
 * Injects a save button into ChatGPT and exports conversations
 * locally in multiple formats. No network requests. No tracking.
 *
 * Supported formats: TXT · Markdown · JSON · HTML
 */

(function () {
  "use strict";

  // ─── Constants ───────────────────────────────────────────────────────────────

  const EXTENSION_ID = "ccs-ext";
  const BTN_ID       = `${EXTENSION_ID}-btn`;
  const MODAL_ID     = `${EXTENSION_ID}-modal`;
  const TOAST_ID     = `${EXTENSION_ID}-toast`;

  /** Multiple selector attempts for each role — ChatGPT's DOM changes often. */
  const SELECTORS = {
    // Ordered by specificity; first match wins
    messages: [
      'article[data-testid^="conversation-turn"]',
      '[data-message-author-role]',
    ],
    role: "data-message-author-role",
    // Containers that hold rendered Markdown
    prose: [
      ".markdown.prose",
      ".markdown",
      ".prose",
      "[class*='prose']",
      "[class*='markdown']",
    ],
    // Fallback: direct text container
    textFallback: [".whitespace-pre-wrap", "p", "div"],
    title: [
      'nav [class*="truncate"]',    // sidebar active item
      'title',                       // document title (cleaned)
    ],
  };

  // ─── DOM helpers ─────────────────────────────────────────────────────────────

  /** Returns the first element found from a list of CSS selectors. */
  function queryFirst(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /** Safely escape text for use inside HTML attributes / content. */
  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ─── Conversation extraction ──────────────────────────────────────────────────

  /**
   * Returns the conversation title, sanitised for use as a filename.
   */
  function getTitle() {
    // Try sidebar active link text first
    const nav = document.querySelector(
      'nav a[class*="active"], nav a[aria-current="page"]'
    );
    if (nav && nav.textContent.trim()) {
      return nav.textContent.trim();
    }

    // Fall back to document.title (format: "message – ChatGPT")
    const raw = document.title || "conversation";
    return raw.replace(/\s*[–—-]\s*(ChatGPT|OpenAI).*/i, "").trim() || "conversation";
  }

  /** Sanitise a string for use as a filename. */
  function sanitiseFilename(name) {
    return name
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 100)
      .trim() || "conversation";
  }

  /**
   * Converts an HTML element's content to clean plain text,
   * preserving newlines around block elements and code blocks.
   */
  function elementToText(el) {
    const clone = el.cloneNode(true);

    // Preserve code blocks verbatim
    clone.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      const lang = code
        ? (code.className.match(/language-(\w+)/) || [])[1] || ""
        : "";
      const content = (code ? code : pre).textContent;
      pre.replaceWith(`\n\`\`\`${lang}\n${content}\n\`\`\`\n`);
    });

    // Add newlines after block elements
    clone.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, br, div").forEach((el) => {
      el.append(document.createTextNode("\n"));
    });

    return clone.textContent.replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Convert an HTML element's content to Markdown.
   * Handles headings, bold, italic, inline code, code blocks,
   * ordered/unordered lists, and links.
   */
  function elementToMarkdown(el) {
    function nodeToMd(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag  = node.tagName.toLowerCase();
      const kids = Array.from(node.childNodes).map(nodeToMd).join("");

      switch (tag) {
        case "h1": return `\n# ${kids}\n`;
        case "h2": return `\n## ${kids}\n`;
        case "h3": return `\n### ${kids}\n`;
        case "h4": return `\n#### ${kids}\n`;
        case "h5": return `\n##### ${kids}\n`;
        case "h6": return `\n###### ${kids}\n`;
        case "strong":
        case "b":  return `**${kids}**`;
        case "em":
        case "i":  return `*${kids}*`;
        case "s":
        case "del":return `~~${kids}~~`;
        case "a": {
          const href = node.getAttribute("href");
          return href ? `[${kids}](${href})` : kids;
        }
        case "code": {
          // inline code only — pre > code is handled below
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") {
            return node.textContent; // handled by "pre"
          }
          return `\`${node.textContent}\``;
        }
        case "pre": {
          const codeEl = node.querySelector("code");
          const lang   = codeEl
            ? (codeEl.className.match(/language-(\w+)/) || [])[1] || ""
            : "";
          const body   = (codeEl || node).textContent;
          return `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
        }
        case "ul": {
          const items = Array.from(node.children)
            .filter((c) => c.tagName.toLowerCase() === "li")
            .map((li) => `- ${nodeToMd(li).trim()}`)
            .join("\n");
          return `\n${items}\n`;
        }
        case "ol": {
          const items = Array.from(node.children)
            .filter((c) => c.tagName.toLowerCase() === "li")
            .map((li, i) => `${i + 1}. ${nodeToMd(li).trim()}`)
            .join("\n");
          return `\n${items}\n`;
        }
        case "li":  return kids;
        case "br":  return "\n";
        case "hr":  return "\n---\n";
        case "blockquote": return kids.split("\n").map((l) => `> ${l}`).join("\n");
        case "p":   return `\n${kids}\n`;
        case "div":
        case "section":
        case "article": return `\n${kids}\n`;
        default:    return kids;
      }
    }

    const md = nodeToMd(el);
    return md.replace(/\n{3,}/g, "\n\n").trim();
  }

  /**
   * Extract all messages from the current ChatGPT page.
   * Returns an array of { role: string, textContent: string, htmlContent: string }.
   */
  function extractMessages() {
    const messages = [];

    // Try each message selector until one returns results
    let turns = [];
    for (const sel of SELECTORS.messages) {
      turns = Array.from(document.querySelectorAll(sel));
      if (turns.length) break;
    }

    if (!turns.length) return messages;

    // If we matched by role attribute directly, de-duplicate by ancestor
    // article elements when possible
    if (!turns[0].matches('article[data-testid^="conversation-turn"]')) {
      // Wrap results that aren't already deduplicated
      const seen = new Set();
      turns = turns.filter((el) => {
        if (seen.has(el)) return false;
        seen.add(el);
        return true;
      });
    }

    for (const turn of turns) {
      // Determine role
      const roleEl = turn.hasAttribute(SELECTORS.role)
        ? turn
        : turn.querySelector(`[${SELECTORS.role}]`);

      if (!roleEl) continue;

      const role = roleEl.getAttribute(SELECTORS.role) || "unknown";

      // Find the prose/content container
      let contentEl = queryFirst(SELECTORS.prose, turn);
      if (!contentEl) {
        // Fallback: the role element itself
        contentEl = roleEl;
      }

      // Skip empty turns (e.g. tool-use internals)
      const rawText = contentEl.textContent.trim();
      if (!rawText) continue;

      messages.push({
        role,
        textContent: elementToText(contentEl),
        markdownContent: elementToMarkdown(contentEl),
        htmlContent: contentEl.innerHTML,
      });
    }

    return messages;
  }

  // ─── Auto-scroll ─────────────────────────────────────────────────────────────

  /**
   * Scrolls through the conversation to trigger lazy loading,
   * then resolves once scrolling stabilises.
   */
  async function autoScroll() {
    const scrollable =
      document.querySelector("main") ||
      document.querySelector('[class*="overflow-y-auto"]') ||
      document.documentElement;

    return new Promise((resolve) => {
      let lastHeight = 0;
      let stable     = 0;

      function step() {
        scrollable.scrollTop = scrollable.scrollHeight;
        const h = scrollable.scrollHeight;

        if (h === lastHeight) {
          stable++;
          if (stable >= 3) {
            resolve();
            return;
          }
        } else {
          stable = 0;
          lastHeight = h;
        }

        setTimeout(step, 300);
      }

      step();
    });
  }

  // ─── Formatters ──────────────────────────────────────────────────────────────

  function formatTXT(messages, title) {
    const lines = [
      `ChatGPT Conversation — ${title}`,
      `Exported: ${new Date().toLocaleString()}`,
      "═".repeat(60),
      "",
    ];
    for (const msg of messages) {
      const label = msg.role === "user" ? "USER" : "ASSISTANT";
      lines.push(`[${label}]`, msg.textContent, "─".repeat(60), "");
    }
    return lines.join("\n");
  }

  function formatMarkdown(messages, title) {
    const lines = [
      `# ${title}`,
      `*Exported ${new Date().toLocaleString()} via ChatGPT Conversation Saver*`,
      "",
      "---",
      "",
    ];
    for (const msg of messages) {
      const heading = msg.role === "user" ? "### 👤 User" : "### 🤖 Assistant";
      lines.push(heading, "", msg.markdownContent, "", "---", "");
    }
    return lines.join("\n");
  }

  function formatJSON(messages, title) {
    const data = {
      title,
      exportedAt: new Date().toISOString(),
      source:     window.location.href,
      messages:   messages.map(({ role, textContent }) => ({
        role,
        content: textContent,
      })),
    };
    return JSON.stringify(data, null, 2);
  }

  function formatHTML(messages, title) {
    const rows = messages
      .map(({ role, htmlContent }) => {
        const cls     = role === "user" ? "user" : "assistant";
        const label   = role === "user" ? "User" : "Assistant";
        const safeLabel = escapeHTML(label);
        return `
      <article class="message ${cls}">
        <header class="role-label">${safeLabel}</header>
        <div class="body">${htmlContent}</div>
      </article>`;
      })
      .join("\n");

    const safeTitle = escapeHTML(title);
    const exportDate = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.65;
      background: #f9f9f9;
      color: #1a1a1a;
      padding: 2rem 1rem;
    }
    .wrapper {
      max-width: 780px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: .25rem;
      word-break: break-word;
    }
    .meta {
      font-size: .85rem;
      color: #666;
      margin-bottom: 2rem;
    }
    .message {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.05);
    }
    .message.user   { border-left: 4px solid #10a37f; }
    .message.assistant { border-left: 4px solid #6e6e6e; }
    .role-label {
      font-size: .75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin-bottom: .75rem;
      color: #555;
    }
    .message.user .role-label   { color: #10a37f; }
    .body p  { margin-bottom: .85rem; }
    .body p:last-child { margin-bottom: 0; }
    .body pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      font-family: "Fira Code", "Cascadia Code", Consolas, monospace;
      font-size: .875rem;
      line-height: 1.5;
      margin: .75rem 0;
    }
    .body code {
      background: #f0f0f0;
      padding: .15em .35em;
      border-radius: 4px;
      font-family: "Fira Code", Consolas, monospace;
      font-size: .875em;
    }
    .body pre code { background: transparent; padding: 0; }
    .body ul, .body ol { padding-left: 1.5rem; margin-bottom: .75rem; }
    .body li { margin-bottom: .3rem; }
    .body strong { font-weight: 700; }
    .body em     { font-style: italic; }
    .body a      { color: #10a37f; }
    .body h1,.body h2,.body h3,.body h4 {
      margin: 1rem 0 .5rem;
      line-height: 1.3;
    }
    .body table {
      width: 100%;
      border-collapse: collapse;
      margin: .75rem 0;
    }
    .body th, .body td {
      border: 1px solid #ddd;
      padding: .4rem .75rem;
      text-align: left;
    }
    .body th { background: #f4f4f4; font-weight: 600; }
    @media (prefers-color-scheme: dark) {
      body { background: #121212; color: #e0e0e0; }
      .message { background: #1e1e1e; border-color: #333; }
      .body code { background: #2a2a2a; }
      .body th { background: #2a2a2a; }
      .body th, .body td { border-color: #444; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <h1>${safeTitle}</h1>
    <p class="meta">Exported ${escapeHTML(exportDate)} · ${messages.length} messages</p>
    ${rows}
  </div>
</body>
</html>`;
  }

  // ─── Download helper ──────────────────────────────────────────────────────────

  function downloadFile(content, filename, mimeType) {
    const blob   = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href     = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    // Clean up after a short delay
    setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older Firefox builds
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity  = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }

  // ─── Toast notification ───────────────────────────────────────────────────────

  function showToast(msg, isError = false) {
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = msg;
    if (isError) toast.classList.add("ccs-toast--error");
    document.body.appendChild(toast);

    // Trigger reflow then animate in
    void toast.offsetWidth;
    toast.classList.add("ccs-toast--visible");

    setTimeout(() => {
      toast.classList.remove("ccs-toast--visible");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // ─── Modal ────────────────────────────────────────────────────────────────────

  function createModal() {
    const overlay = document.createElement("div");
    overlay.id            = MODAL_ID;
    overlay.className     = "ccs-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ccs-modal-title");

    overlay.innerHTML = `
      <div class="ccs-modal" role="document">
        <header class="ccs-modal__header">
          <h2 id="ccs-modal-title" class="ccs-modal__title">Save Conversation</h2>
          <button class="ccs-modal__close" aria-label="Close" data-ccs-close>&#x2715;</button>
        </header>

        <p class="ccs-modal__sub">Choose a format to export locally — nothing leaves your device.</p>

        <div class="ccs-modal__grid">
          <button class="ccs-format-btn" data-format="txt">
            <span class="ccs-format-btn__icon">&#128221;</span>
            <span class="ccs-format-btn__label">Plain Text</span>
            <span class="ccs-format-btn__ext">.txt</span>
          </button>
          <button class="ccs-format-btn" data-format="md">
            <span class="ccs-format-btn__icon">&#35;</span>
            <span class="ccs-format-btn__label">Markdown</span>
            <span class="ccs-format-btn__ext">.md</span>
          </button>
          <button class="ccs-format-btn" data-format="json">
            <span class="ccs-format-btn__icon">&#123;&#125;</span>
            <span class="ccs-format-btn__label">JSON</span>
            <span class="ccs-format-btn__ext">.json</span>
          </button>
          <button class="ccs-format-btn" data-format="html">
            <span class="ccs-format-btn__icon">&#60;/&#62;</span>
            <span class="ccs-format-btn__label">HTML</span>
            <span class="ccs-format-btn__ext">.html</span>
          </button>
        </div>

        <div class="ccs-modal__divider"></div>

        <button class="ccs-copy-btn" data-format="copy">
          <span class="ccs-copy-btn__icon">&#128203;</span>
          Copy to Clipboard (Markdown)
        </button>

        <div class="ccs-progress" id="ccs-progress" aria-hidden="true">
          <div class="ccs-progress__bar"></div>
          <span class="ccs-progress__label">Loading messages…</span>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    return overlay;
  }

  function openModal() {
    let overlay = document.getElementById(MODAL_ID);
    if (!overlay) overlay = createModal();
    overlay.classList.add("ccs-overlay--visible");

    // Trap focus
    const firstBtn = overlay.querySelector("button");
    if (firstBtn) firstBtn.focus();
  }

  function closeModal() {
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) overlay.classList.remove("ccs-overlay--visible");
  }

  // ─── Core export flow ─────────────────────────────────────────────────────────

  async function runExport(format) {
    const progress = document.getElementById("ccs-progress");
    if (progress) {
      progress.setAttribute("aria-hidden", "false");
      progress.classList.add("ccs-progress--visible");
    }

    try {
      await autoScroll();

      const messages = extractMessages();
      if (!messages.length) {
        showToast("No messages found — is there an active conversation?", true);
        return;
      }

      const rawTitle = getTitle();
      const title    = rawTitle;
      const filename = sanitiseFilename(rawTitle);

      let content, ext, mime;

      switch (format) {
        case "txt":
          content = formatTXT(messages, title);
          ext     = "txt";
          mime    = "text/plain";
          break;
        case "md":
          content = formatMarkdown(messages, title);
          ext     = "md";
          mime    = "text/markdown";
          break;
        case "json":
          content = formatJSON(messages, title);
          ext     = "json";
          mime    = "application/json";
          break;
        case "html":
          content = formatHTML(messages, title);
          ext     = "html";
          mime    = "text/html";
          break;
        case "copy":
          content = formatMarkdown(messages, title);
          await copyToClipboard(content);
          showToast(`Copied ${messages.length} messages to clipboard!`);
          return;
        default:
          return;
      }

      downloadFile(content, `${filename}.${ext}`, mime);
      showToast(`Saved "${title}" as .${ext} (${messages.length} messages)`);

    } catch (err) {
      console.error("[ChatGPT Saver]", err);
      showToast("Export failed — see browser console for details.", true);
    } finally {
      closeModal();
      if (progress) {
        progress.setAttribute("aria-hidden", "true");
        progress.classList.remove("ccs-progress--visible");
      }
    }
  }

  // ─── Floating button ──────────────────────────────────────────────────────────

  function createFloatingButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id          = BTN_ID;
    btn.className   = "ccs-fab";
    btn.title       = "Save conversation";
    btn.setAttribute("aria-label", "Save conversation");
    btn.innerHTML   = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true" focusable="false" width="22" height="22">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>`;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal();
    });

    document.body.appendChild(btn);
  }

  // ─── Event delegation for modal ───────────────────────────────────────────────

  document.addEventListener("click", (e) => {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;

    // Close on backdrop click
    if (e.target === overlay) {
      closeModal();
      return;
    }

    // Close button
    if (e.target.closest("[data-ccs-close]")) {
      closeModal();
      return;
    }

    // Format buttons
    const btn = e.target.closest("[data-format]");
    if (btn) {
      runExport(btn.dataset.format);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // ─── SPA route change detection ───────────────────────────────────────────────
  // ChatGPT is a React SPA — inject button after navigation too.

  let _lastUrl = location.href;

  function onRouteChange() {
    const url = location.href;
    if (url === _lastUrl) return;
    _lastUrl = url;
    // Give React time to render before injecting
    setTimeout(createFloatingButton, 800);
  }

  // Observe URL changes via pushState / popstate
  const _pushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _pushState(...args);
    onRouteChange();
  };
  window.addEventListener("popstate", onRouteChange);

  // Also observe DOM mutations as a safety net
  const _observer = new MutationObserver(() => {
    onRouteChange();
    if (!document.getElementById(BTN_ID)) {
      createFloatingButton();
    }
  });
  _observer.observe(document.body, { childList: true, subtree: false });

  // ─── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    createFloatingButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
