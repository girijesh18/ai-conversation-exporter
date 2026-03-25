/**
 * AI Conversation Exporter — popup.js
 * Handles all formatting + downloads. Loaded only when popup opens.
 */
(function () {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : chrome;

  const PLATFORM_META = {
    chatgpt: { name: 'ChatGPT', icon: '🤖', color: '#10a37f' },
    claude:  { name: 'Claude',  icon: '🔮', color: '#d97757' },
    gemini:  { name: 'Gemini',  icon: '✨', color: '#4285F4' },
  };

  const SUPPORTED = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com'];

  let currentTabId = null;

  // ── UI helpers ───────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function showState(id) {
    ['state-loading', 'state-unsupported', 'state-empty', 'state-main'].forEach(s => {
      const n = el(s);
      if (n) n.classList.toggle('hidden', s !== id);
    });
  }

  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

  function setBusy(btn, busy) { btn.classList.toggle('busy', busy); }

  // ── Formatters (all live here — not in content script) ───────────────────────

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function sanitise(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').slice(0, 100).trim() || 'conversation';
  }

  function makeTXT(msgs, title, platform) {
    const label = PLATFORM_META[platform]?.name || 'AI';
    const lines = [`${label} Conversation — ${title}`, `Exported: ${new Date().toLocaleString()}`, '═'.repeat(60), ''];
    for (const m of msgs) lines.push(`[${m.role === 'user' ? 'USER' : 'ASSISTANT'}]`, m.text, '─'.repeat(60), '');
    return lines.join('\n');
  }

  function makeMD(msgs, title, platform) {
    const label = PLATFORM_META[platform]?.name || 'AI';
    const lines = [`# ${title}`, `*Exported ${new Date().toLocaleString()} from ${label} via AI Conversation Exporter*`, '', '---', ''];
    for (const m of msgs) {
      lines.push(m.role === 'user' ? '### 👤 User' : `### 🤖 ${label}`, '', m.md, '', '---', '');
    }
    return lines.join('\n');
  }

  function makeJSON(msgs, title, platform) {
    return JSON.stringify({
      title,
      platform:   PLATFORM_META[platform]?.name || platform,
      exportedAt: new Date().toISOString(),
      messages:   msgs.map(m => ({ role: m.role, content: m.text })),
    }, null, 2);
  }

  function makeHTML(msgs, title, platform) {
    const autoPrint = false;
    const label  = PLATFORM_META[platform]?.name || 'AI';
    const accent = PLATFORM_META[platform]?.color || '#10a37f';
    const rows   = msgs.map(m => `<article class="msg ${m.role === 'user' ? 'u' : 'a'}">
      <header>${esc(m.role === 'user' ? 'User' : label)}</header>
      <div class="body">${m.html}</div>
    </article>`).join('\n');
    const printScript = autoPrint
      ? `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script>`
      : '';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${printScript}
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;font-size:16px;line-height:1.65;background:#f9f9f9;color:#1a1a1a;padding:2rem 1rem}
.wrap{max-width:780px;margin:0 auto}
h1{font-size:1.5rem;margin-bottom:.25rem}
.meta{font-size:.85rem;color:#666;margin-bottom:2rem}
.badge{background:${accent};color:#fff;font-size:.7rem;font-weight:700;padding:.2em .6em;border-radius:999px;text-transform:uppercase;margin-right:.5rem}
.msg{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.msg.u{border-left:4px solid ${accent}} .msg.a{border-left:4px solid #888}
header{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.75rem;color:#555}
.msg.u header{color:${accent}}
.body p{margin-bottom:.85rem}.body p:last-child{margin-bottom:0}
.body pre{background:#1e1e1e;color:#d4d4d4;padding:1rem 1.25rem;border-radius:8px;overflow-x:auto;font-family:Consolas,monospace;font-size:.875rem;line-height:1.5;margin:.75rem 0}
.body code{background:#f0f0f0;padding:.15em .35em;border-radius:4px;font-family:Consolas,monospace;font-size:.875em}
.body pre code{background:transparent;padding:0}
.body ul,.body ol{padding-left:1.5rem;margin-bottom:.75rem}.body li{margin-bottom:.3rem}
.body a{color:${accent}}.body h1,.body h2,.body h3,.body h4{margin:1rem 0 .5rem}
.body table{width:100%;border-collapse:collapse;margin:.75rem 0}
.body th,.body td{border:1px solid #ddd;padding:.4rem .75rem;text-align:left}
.body th{background:#f4f4f4;font-weight:600}
@media print{body{background:#fff;padding:1rem}.msg{box-shadow:none;page-break-inside:avoid}}
@media(prefers-color-scheme:dark){body{background:#121212;color:#e0e0e0}.msg{background:#1e1e1e;border-color:#333}.body code{background:#2a2a2a}.body th{background:#2a2a2a}.body th,.body td{border-color:#444}}
</style></head><body><div class="wrap">
<h1><span class="badge">${esc(label)}</span>${esc(title)}</h1>
<p class="meta">Exported ${esc(new Date().toLocaleString())} · ${msgs.length} messages</p>
${rows}</div></body></html>`;
  }

  // ── Download via browser.downloads API ──────────────────────────────────────

  async function download(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url  = URL.createObjectURL(blob);
    await api.downloads.download({ url, filename, saveAs: false });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    showState('state-loading');
    const [tab] = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    if (!tab?.id) { showState('state-unsupported'); return; }
    currentTabId = tab.id;

    if (!SUPPORTED.some(h => (tab.url || '').includes(h))) {
      showState('state-unsupported');
      return;
    }

    try {
      const stats = await api.tabs.sendMessage(tab.id, { action: 'getStats' });
      if (!stats?.platform)    { showState('state-unsupported'); return; }
      if (!stats.messageCount) { showState('state-empty');       return; }
      render(stats);
    } catch (_) {
      showState('state-unsupported');
    }
  }

  function render(stats) {
    const meta = PLATFORM_META[stats.platform] || { name: stats.platform, icon: '💬', color: '#888' };
    document.documentElement.style.setProperty('--accent', meta.color);
    el('platform-icon').textContent = meta.icon;
    el('platform-name').textContent = meta.name;
    const t = el('conv-title');
    t.textContent = stats.title || 'Untitled'; t.title = stats.title || '';
    el('stats').innerHTML = `<strong>${stats.messageCount}</strong>msg${stats.messageCount !== 1 ? 's' : ''}<br>~${fmt(stats.wordCount)}&nbsp;words`;
    showState('state-main');
  }

  // ── Click handler ────────────────────────────────────────────────────────────

  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-format]');
    if (!btn || !currentTabId) return;
    const format = btn.dataset.format;
    setBusy(btn, true);

    try {
      // Get raw data from content script
      const data = await api.tabs.sendMessage(currentTabId, { action: 'extractData' });
      if (!data?.messages?.length) { setBusy(btn, false); return; }

      const { platform, title, messages } = data;
      const filename = `${platform}_${sanitise(title)}`;

      if (format === 'copy') {
        await navigator.clipboard.writeText(makeMD(messages, title, platform));
        btn.querySelector('.action-btn__icon').textContent = '✅';
        btn.lastChild.textContent = ' Copied!';
        setTimeout(() => window.close(), 800);
        return;
      }

      const MAP = {
        txt:  { fn: () => makeTXT(messages, title, platform),  ext: 'txt',  mime: 'text/plain'       },
        md:   { fn: () => makeMD(messages, title, platform),   ext: 'md',   mime: 'text/markdown'    },
        json: { fn: () => makeJSON(messages, title, platform), ext: 'json', mime: 'application/json' },
        html: { fn: () => makeHTML(messages, title, platform), ext: 'html', mime: 'text/html'        },
      };

      const def = MAP[format];
      if (!def) { setBusy(btn, false); return; }

      await download(def.fn(), `${filename}.${def.ext}`, def.mime);
      window.close();

    } catch (err) {
      console.error('[AI Exporter popup]', err);
      setBusy(btn, false);
    }
  });

  init();
})();
