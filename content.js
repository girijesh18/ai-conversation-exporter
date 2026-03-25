/**
 * AI Conversation Exporter — content.js
 * Lean extractor only. No formatters. No UI. No observers.
 * Loaded on every matching page — must stay minimal.
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Bail immediately if not on a supported platform
  const PLATFORM = (() => {
    const h = location.hostname;
    if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
    if (h.includes('claude.ai'))           return 'claude';
    if (h.includes('gemini.google.com'))   return 'gemini';
    return null;
  })();
  if (!PLATFORM) return;

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function qAll(sels, root = document) {
    for (const s of sels) {
      try { const r = Array.from(root.querySelectorAll(s)); if (r.length) return r; } catch (_) {}
    }
    return [];
  }

  function qOne(sels, root = document) {
    for (const s of sels) {
      try { const r = root.querySelector(s); if (r) return r; } catch (_) {}
    }
    return null;
  }

  function domOrder(a, b) {
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  // ── Text/Markdown converters ─────────────────────────────────────────────────

  function toText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('pre').forEach(p => {
      const code = p.querySelector('code');
      const lang = code ? (code.className.match(/language-(\w+)/) || [])[1] || '' : '';
      p.replaceWith(`\n\`\`\`${lang}\n${(code || p).textContent}\n\`\`\`\n`);
    });
    c.querySelectorAll('p,li,h1,h2,h3,h4,br,div').forEach(n => n.append('\n'));
    return c.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  function toMd(el) {
    function w(n) {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1) return '';
      const t = n.tagName.toLowerCase();
      const k = Array.from(n.childNodes).map(w).join('');
      if (t === 'h1') return `\n# ${k}\n`;
      if (t === 'h2') return `\n## ${k}\n`;
      if (t === 'h3') return `\n### ${k}\n`;
      if (t === 'h4') return `\n#### ${k}\n`;
      if (t === 'strong' || t === 'b')  return `**${k}**`;
      if (t === 'em'     || t === 'i')  return `*${k}*`;
      if (t === 's'      || t === 'del') return `~~${k}~~`;
      if (t === 'a') { const h = n.getAttribute('href'); return h ? `[${k}](${h})` : k; }
      if (t === 'code') {
        if (n.parentElement?.tagName.toLowerCase() === 'pre') return n.textContent;
        return `\`${n.textContent}\``;
      }
      if (t === 'pre') {
        const c = n.querySelector('code');
        const l = c ? (c.className.match(/language-(\w+)/) || [])[1] || '' : '';
        return `\n\`\`\`${l}\n${(c || n).textContent}\n\`\`\`\n`;
      }
      if (t === 'ul') return '\n' + Array.from(n.children).filter(c => c.tagName === 'LI').map(li => `- ${w(li).trim()}`).join('\n') + '\n';
      if (t === 'ol') return '\n' + Array.from(n.children).filter(c => c.tagName === 'LI').map((li, i) => `${i + 1}. ${w(li).trim()}`).join('\n') + '\n';
      if (t === 'br') return '\n';
      if (t === 'hr') return '\n---\n';
      if (t === 'blockquote') return k.split('\n').map(l => `> ${l}`).join('\n');
      if (t === 'p' || t === 'div' || t === 'section' || t === 'article') return `\n${k}\n`;
      return k;
    }
    return w(el).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── Auto-scroll (3 s hard cap) ───────────────────────────────────────────────

  function autoScroll() {
    const s = document.querySelector('main') ||
              document.querySelector('[class*="overflow-y-auto"]') ||
              document.documentElement;
    return new Promise(resolve => {
      const end = Date.now() + 3000;
      let last = 0, stable = 0;
      (function step() {
        if (Date.now() >= end) return resolve();
        s.scrollTop = s.scrollHeight;
        const h = s.scrollHeight;
        if (h === last) { if (++stable >= 2) return resolve(); }
        else { stable = 0; last = h; }
        setTimeout(step, 150);
      })();
    });
  }

  // ── Platform extractors ──────────────────────────────────────────────────────

  function msgOf(el, role) {
    return { role, text: toText(el), md: toMd(el), html: el.innerHTML };
  }

  function extractChatGPT() {
    const turns = qAll(['article[data-testid^="conversation-turn"]', '[data-message-author-role]']);
    return turns.flatMap(turn => {
      const rEl = turn.hasAttribute('data-message-author-role') ? turn : turn.querySelector('[data-message-author-role]');
      if (!rEl) return [];
      const role = rEl.getAttribute('data-message-author-role') || 'unknown';
      const cEl  = qOne(['.markdown.prose', '.markdown', '.prose', "[class*='prose']", "[class*='markdown']"], turn) || rEl;
      return cEl.textContent.trim() ? [msgOf(cEl, role)] : [];
    });
  }

  function extractClaude() {
    // Strategy 1 — .human-turn / .ai-turn
    const human = Array.from(document.querySelectorAll('.human-turn'));
    const ai    = Array.from(document.querySelectorAll('.ai-turn'));
    if (human.length || ai.length) {
      const all = [...human.map(el => ({ el, role: 'user' })), ...ai.map(el => ({ el, role: 'assistant' }))].sort(domOrder);
      const out = all.map(({ el, role }) => {
        const c = qOne(['.whitespace-pre-wrap', '.prose', 'p'], el) || el;
        return c.textContent.trim() ? msgOf(c, role) : null;
      }).filter(Boolean);
      if (out.length) return out;
    }
    // Strategy 2 — alternating turns
    const turns = Array.from(document.querySelectorAll('[data-test-render-count]'));
    if (turns.length) {
      const out = turns.map((t, i) => {
        const c = qOne(['.whitespace-pre-wrap', '.prose', 'p'], t) || t;
        return c.textContent.trim() ? msgOf(c, i % 2 === 0 ? 'user' : 'assistant') : null;
      }).filter(Boolean);
      if (out.length) return out;
    }
    // Strategy 3 — font class names
    const u = Array.from(document.querySelectorAll('[class*="font-user-message"]'));
    const a = Array.from(document.querySelectorAll('[class*="font-claude-message"]'));
    return [...u.map(el => ({ el, role: 'user' })), ...a.map(el => ({ el, role: 'assistant' }))]
      .sort(domOrder).filter(({ el }) => el.textContent.trim()).map(({ el, role }) => msgOf(el, role));
  }

  function extractGemini() {
    // Strategy 1 — separate user/ai elements
    const u = Array.from(document.querySelectorAll('.query-text, .user-query-text, p.query-text, [class*="query-text"]'));
    const a = Array.from(document.querySelectorAll('.model-response-text, [class*="model-response-text"], .response-text'));
    if (u.length || a.length) {
      const all = [...u.map(el => ({ el, role: 'user' })), ...a.map(el => ({ el, role: 'assistant' }))].sort(domOrder);
      const out = all.filter(({ el }) => el.textContent.trim()).map(({ el, role }) => msgOf(el, role));
      if (out.length) return out;
    }
    // Strategy 2 — conversation-turn containers
    return qAll(['.conversation-turn, [class*="conversation-turn"]']).flatMap(turn => {
      const out = [];
      const uEl = qOne(['.query-text', '[class*="query"]'], turn);
      const aEl = qOne(['.model-response-text', '.markdown', '[class*="response"]'], turn);
      if (uEl?.textContent.trim()) out.push(msgOf(uEl, 'user'));
      if (aEl?.textContent.trim()) out.push(msgOf(aEl, 'assistant'));
      return out;
    });
  }

  function extract() {
    if (PLATFORM === 'chatgpt') return extractChatGPT();
    if (PLATFORM === 'claude')  return extractClaude();
    if (PLATFORM === 'gemini')  return extractGemini();
    return [];
  }

  // ── Title ────────────────────────────────────────────────────────────────────

  function getTitle() {
    if (PLATFORM === 'chatgpt') {
      const nav = document.querySelector('nav a[aria-current="page"]');
      if (nav?.textContent.trim()) return nav.textContent.trim();
      return document.title.replace(/\s*[–—-]\s*(ChatGPT|OpenAI).*/i, '').trim() || 'conversation';
    }
    if (PLATFORM === 'claude') {
      const el = qOne(['[class*="conversation-title"]', '.font-tiempos-heading', 'h1', '.truncate']);
      if (el?.textContent.trim()) return el.textContent.trim();
      return document.title.replace(/\s*[-–]\s*Claude.*/i, '').trim() || 'conversation';
    }
    if (PLATFORM === 'gemini') {
      return document.title.replace(/\s*[-–]\s*Gemini.*/i, '').trim() || 'conversation';
    }
    return document.title || 'conversation';
  }

  // ── Message listener ─────────────────────────────────────────────────────────

  api.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg.action === 'getStats') {
      const msgs  = extract();
      const words = msgs.reduce((a, m) => a + m.text.split(/\s+/).filter(Boolean).length, 0);
      send({ platform: PLATFORM, title: getTitle(), messageCount: msgs.length, wordCount: words });
      return; // sync — no need to return true
    }
    if (msg.action === 'extractData') {
      autoScroll().then(() => {
        send({ platform: PLATFORM, title: getTitle(), messages: extract() });
      });
      return true; // async
    }
  });

})();
