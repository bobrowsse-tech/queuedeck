# QueueDeck — Documentation Index

QueueDeck is a free, open source Chrome extension (Manifest V3)
that lets a person save video links to watch later. It has no backend: all
state lives in `chrome.storage.local` on the user's machine.

## Entry points

| File | Role |
|---|---|
| `manifest.json` | Extension manifest — permissions, entry points |
| `background.js` | Service worker — badge count, options-page opener |
| `content.js` | Runs on every page — detects video playback, renders the save prompt |
| `storage.js` | The single read/write layer over `chrome.storage.local` |
| `popup.html/css/js` | Toolbar popup — the playlist UI |
| `options.html/css/js` | Settings page |

## Documentation map

- [`architecture.md`](./architecture.md) — system topology, layer boundaries, stack decisions
- [`design.md`](./design.md) — visual design system, tokens, component specs
- [`features.md`](./features.md) — functional requirements and acceptance criteria
- [`userjourney.md`](./userjourney.md) — personas and end-to-end flows
- [`agents.md`](./agents.md) — AI-agent working boundaries for this repo
- [`conventions.md`](./conventions.md) — code style and patterns used in this codebase
- [`schema.md`](./schema.md) — data model (there is no server API; this covers the storage schema)
- [`tasks.md`](./tasks.md) — living backlog and status
- [`environment.md`](./environment.md) — local setup, no build step required

## Non-negotiables (carried through every doc below)

1. **No network calls.** The extension must never call `fetch`/`XMLHttpRequest`
   to a remote host. Everything the extension needs (fonts, icons, styles)
   ships in the package.
2. **Local-first storage.** `chrome.storage.local` only — never
   `chrome.storage.sync`, which would leave the device.
3. **No build tooling required.** Plain HTML/CSS/JS, loadable directly via
   "Load unpacked." Keeps the codebase auditable, which matters for an
   extension that asks for `<all_urls>` content-script access.
