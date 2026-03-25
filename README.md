# ChatGPT Conversation Saver

A browser extension that exports your ChatGPT conversations to your device — locally, privately, with no data collection.

**Supports Firefox · Chrome · Brave · Edge**

---

## Features

- **4 export formats** — Plain Text, Markdown, JSON, self-contained HTML
- **Copy to clipboard** — paste anywhere instantly
- **Auto-scroll** — loads lazy content before exporting so nothing is missed
- **Smart title detection** — files are named after the conversation
- **Code block preservation** — fenced code blocks with language tags
- **Dark mode UI** — matches your system theme
- **Zero permissions** — no `tabs`, no `storage`, no background script
- **No external requests** — everything runs locally in the page

---

## Installation

### Firefox (Temporary / Developer)

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on…**
3. Select the `manifest.json` file from this folder
4. Open [chatgpt.com](https://chatgpt.com) — a green download button appears bottom-right

> For permanent installation, submit to [addons.mozilla.org](https://addons.mozilla.org) (AMO).

### Chrome / Brave / Edge

1. Go to `chrome://extensions` (or `brave://extensions` / `edge://extensions`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Open [chatgpt.com](https://chatgpt.com)

---

## Generating Icons

Before loading the extension, generate the required PNG icons:

1. Open `generate_icons.html` in any browser
2. Click **Download all icons**
3. Move the 4 downloaded files (`icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`) into the `icons/` folder

---

## Usage

1. Open any ChatGPT conversation
2. Click the **green download button** (bottom-right corner)
3. Choose a format:
   | Format | Best for |
   |--------|----------|
   | `.txt` | Quick reading, notes apps |
   | `.md`  | Obsidian, Notion, GitHub |
   | `.json`| Archiving, scripts, analysis |
   | `.html`| Sharing, self-contained view |
4. Or click **Copy to Clipboard** for instant Markdown

---

## Export Format Examples

### Plain Text (`.txt`)
```
ChatGPT Conversation — How to learn Rust
Exported: 3/24/2026, 10:00:00 AM
════════════════════════════════════════════════════════════

[USER]
How do I learn Rust effectively?
────────────────────────────────────────────────────────────

[ASSISTANT]
Here's a structured approach to learning Rust...
```

### Markdown (`.md`)
```markdown
# How to learn Rust

### 👤 User
How do I learn Rust effectively?

---

### 🤖 Assistant
Here's a structured approach...
```

### JSON (`.json`)
```json
{
  "title": "How to learn Rust",
  "exportedAt": "2026-03-24T10:00:00.000Z",
  "messages": [
    { "role": "user",      "content": "How do I learn Rust effectively?" },
    { "role": "assistant", "content": "Here's a structured approach..." }
  ]
}
```

---

## File Structure

```
chatgpt-conversation-saver/
├── manifest.json          # Extension manifest (Manifest V3)
├── content.js             # Core logic — extraction, formatting, UI
├── content.css            # Scoped styles (namespaced .ccs-*)
├── icons/
│   ├── icon.svg           # Source SVG (edit this to change the icon)
│   ├── icon16.png         # Generated — see generate_icons.html
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── generate_icons.html    # One-time icon generator
├── LICENSE                # MIT
└── README.md
```

---

## Privacy & Security

- **No background scripts** — the extension only runs on `chatgpt.com`
- **No network requests** — export is entirely local (no analytics, no telemetry)
- **Minimal permissions** — only `host_permissions` for `chatgpt.com`
- **No `eval()`** — strict CSP, no dynamic code execution
- **Namespaced CSS** — all styles prefixed `.ccs-*` to avoid conflicts
- **HTML sanitisation** — output escapes `< > & " '` to prevent XSS

---

## Contributing

Pull requests are welcome! Please open an issue first for major changes.

```bash
git clone https://github.com/YOUR_USERNAME/chatgpt-conversation-saver
```

Areas for contribution:
- Additional export formats (e.g. EPUB, CSV)
- Support for other AI chat platforms
- Keyboard shortcut (`Alt+S`)
- Automated icon build via Node/Deno

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
