# AI Conversation Exporter

> Export your ChatGPT, Claude, and Gemini conversations — locally, instantly, with zero data collection.

A lightweight browser extension (Firefox + Chrome) that saves your AI conversations as **TXT, Markdown, JSON, or HTML** — all processing happens on your device. No servers. No tracking. No nonsense.

---

## Supported Platforms

| Platform | URL |
|---|---|
| 🤖 ChatGPT | chatgpt.com |
| 🔮 Claude | claude.ai |
| ✨ Gemini | gemini.google.com |

---

## Features

- **4 export formats** — Plain Text, Markdown, JSON, self-contained HTML
- **Copy to clipboard** — instant Markdown copy, paste anywhere
- **Auto-scroll** — loads lazy-rendered messages before export so nothing is missed
- **Smart file naming** — files are named after the conversation title
- **Code block preservation** — fenced blocks with language tags intact
- **Dark mode aware** — export HTML respects system dark/light preference
- **Keyboard shortcut** — `Ctrl+Shift+S` / `MacCtrl+Shift+S`
- **Minimal permissions** — only `activeTab` + `downloads`, nothing else
- **Zero network requests** — everything runs locally, no analytics, no telemetry

---

## Installation

### Firefox (Temporary — for testing)

1. Go to `about:debugging` → **This Firefox**
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this folder
4. Open any conversation on ChatGPT, Claude, or Gemini
5. Click the extension icon in the toolbar

### Chrome / Brave / Edge

1. Go to `chrome://extensions` (or `brave://extensions` / `edge://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Open any conversation and click the toolbar icon

> Brave and Edge are Chromium-based — the extension works identically to Chrome with no changes needed.

### Firefox (Permanent via AMO)

Coming soon — submission in progress.

---

## Usage

1. Open any conversation on ChatGPT, Claude, or Gemini
2. Click the **extension icon** in your browser toolbar
3. The popup shows the platform, conversation title, message count, and word count
4. Pick a format:

| Format | Best for |
|---|---|
| `.txt` | Notes apps, plain reading |
| `.md` | Obsidian, Notion, GitHub, VS Code |
| `.json` | Scripts, data pipelines, archiving |
| `.html` | Sharing — self-contained, styled, readable |
| Copy | Paste directly into any app as Markdown |

---

## Export Previews

### Plain Text
```
ChatGPT Conversation — How to learn Rust
Exported: 3/25/2026, 10:00:00 AM
════════════════════════════════════════════════════════════

[USER]
How do I learn Rust effectively?
────────────────────────────────────────────────────────────

[ASSISTANT]
Start with "The Rust Book" at doc.rust-lang.org...
────────────────────────────────────────────────────────────
```

### Markdown
```markdown
# How to learn Rust

*Exported 3/25/2026 from ChatGPT via AI Conversation Exporter*

---

### 👤 User

How do I learn Rust effectively?

---

### 🤖 ChatGPT

Start with "The Rust Book" at doc.rust-lang.org...
```

### JSON
```json
{
  "title": "How to learn Rust",
  "platform": "ChatGPT",
  "exportedAt": "2026-03-25T10:00:00.000Z",
  "messages": [
    { "role": "user",      "content": "How do I learn Rust effectively?" },
    { "role": "assistant", "content": "Start with The Rust Book..." }
  ]
}
```

---

## Architecture

Built for minimal footprint — nothing runs unless you open the popup.

```
ai-conversation-exporter/
├── manifest.json      # MV3 manifest — permissions: activeTab + downloads only
├── content.js         # ~190 lines — extractor only, zero init cost on page load
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # ~200 lines — all formatters + downloads, loaded lazily
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── generate_icons.html  # One-time icon generator (open in browser)
├── LICENSE
└── README.md
```

**Key design decisions:**
- `content.js` is injected on every AI page but does **nothing on load** — no observers, no DOM queries, no CSS injection. It only registers one message listener.
- All formatting (TXT/MD/JSON/HTML) lives in `popup.js`, which is **loaded lazily** — only when you open the popup.
- No background script. No persistent processes.

---

## Privacy & Security

- No background script — extension is fully dormant until you click the icon
- No network requests — export is 100% local
- No `storage` permission — nothing is persisted
- No `eval()` — strict Content Security Policy
- HTML output escapes `< > & " '` to prevent XSS in exported files
- Only requests permissions for the 4 AI platforms — nothing broader

---

## Generating Icons

Icons are pre-built in the `icons/` folder. If you want to regenerate them:

1. Open `generate_icons.html` in any browser
2. Click **Download all icons**
3. Move the 4 PNGs into the `icons/` folder

---

## Contributing

PRs are welcome. Open an issue first for anything major.

```bash
git clone https://github.com/girijesh18/ai-conversation-exporter
cd ai-conversation-exporter
# Load unpacked in your browser and start hacking
```

Ideas for contribution:
- Support for more platforms (Perplexity, Copilot, etc.)
- EPUB export format
- Conversation search / filter before export
- AMO / Chrome Web Store release automation

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<p align="center">Built with care. No data leaves your device.</p>
