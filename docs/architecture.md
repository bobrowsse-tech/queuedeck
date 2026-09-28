# Architecture

## Topology

Queue is a single Chrome extension package with no backend and no build
step. There is nothing to deploy — the artifact *is* the source.

```
┌──────────────────────────────────────────────────────────────┐
│                         Chrome browser                        │
│                                                                │
│  ┌────────────┐   chrome.storage.local   ┌─────────────────┐  │
│  │ content.js │◄────────────────────────►│    storage.js    │  │
│  │ (per tab,  │                           │ (shared module,  │  │
│  │  isolated  │                           │  loaded by all   │  │
│  │  world)    │                           │  four contexts)  │  │
│  └─────┬──────┘                           └───┬────┬─────┬──┘  │
│        │ runtime.sendMessage                  │    │     │     │
│        ▼                                      │    │     │     │
│  ┌────────────┐   onMessage (OPEN_OPTIONS)     │    │     │     │
│  │background. │◄────────────────────────────── │    │     │     │
│  │js (service │                                │    │     │     │
│  │  worker)   │                                │    │     │     │
│  └────────────┘                                │    │     │     │
│                                                 ▼    ▼     ▼     │
│                                          popup.js  options.js   │
└──────────────────────────────────────────────────────────────┘
```

## Layers and boundaries

- **`storage.js`** is the only code that touches `chrome.storage.local`.
  Every other file goes through its `QueueStorage` API
  (`getItems`, `addItem`, `removeItem`, `updateItem`, `clearAll`,
  `importItems`, `getSettings`, `setSettings`). This keeps the storage
  schema in one place and makes it safe to change later without hunting
  through four files. It is loaded as a plain (non-module) script in
  every context — via `<script src="storage.js">` in the two HTML pages,
  via the `content_scripts.js` array for the isolated content-script
  world, and via `importScripts("storage.js")` in the service worker.
- **`content.js`** owns video detection and the in-page prompt. It never
  writes anything without a save action (its own **Save** button click)
  and never calls out to any other extension surface except a single
  `OPEN_OPTIONS` message when the user asks to adjust settings from the
  prompt itself.
- **`background.js`** is intentionally thin: keep the toolbar badge in
  sync with the item count, and relay the options-page request. It does
  **not** own writes — the two writers are `content.js` (via the prompt)
  and `popup.js`/`options.js` (via direct user action).
- **`popup.js`** is the primary surface for browsing, opening, renaming,
  marking watched, removing, and clearing items, plus the "Add current
  tab" quick action.
- **`options.js`** owns settings (prompt on/off, delay, theme) and the
  data controls (export/import/clear).

## Why Manifest V3 + vanilla JS, no framework

- The extension's entire value proposition is "trust us with nothing" —
  it collects no data and asks for the minimum permissions it can. A
  framework or bundler adds a supply chain (npm dependencies, a build
  step producing output that isn't directly readable) that works against
  that promise. Plain HTML/CSS/JS means the code loaded in the browser
  *is* the code in this repository, byte for byte — anyone can audit it
  in five minutes.
- MV3 is required for anything submitted to the Chrome Web Store going
  forward; MV2 is being phased out.
- No React/Vue: the UI surfaces (popup, options, in-page toast) are small
  and don't need componentization or client-side routing.

## Cross-context communication

- **Settings propagate live** via `chrome.storage.onChanged` — every
  context listens for changes to `queue_settings` (content scripts pick
  up a new delay/on-off immediately) and `queue_items` (popup re-renders
  the list instantly if the content-script toast saves something).
- **`content.js` → `background.js`**: one message type, `OPEN_OPTIONS`,
  because content scripts cannot call `chrome.runtime.openOptionsPage()`
  directly.
- **`popup.js` → `content.js`**: one message type, `GET_VIDEO_INFO`, used
  only when the popup opens, to ask the active tab whether it currently
  has a video and, if so, its title/thumbnail/position — this is what
  powers the "Add current tab" quick-add card. `content.js` re-scans for
  the video before answering so position/duration are fresh, not
  whatever was last recorded on `play`.
- **Keyboard command → `background.js`**: `chrome.commands.onCommand`
  fires the same `GET_VIDEO_INFO` round-trip to the active tab directly
  from the service worker (no popup involved), then calls
  `QueueStorage.addItem()` itself. This is the one place besides
  `content.js`'s toast and `popup.js` that writes an item — still through
  `QueueStorage`, never a raw `chrome.storage.local.set`.
- **Resume position sync**: `content.js` calls
  `QueueStorage.updatePositionByUrl()` every ~10 seconds while a video is
  playing (piggybacking on the existing 1-second watch-time tick counter
  rather than a second timer). It's cheap because the call is a no-op
  write-skip for any URL that isn't already saved.

## Permission boundary

- `storage`, `activeTab` only. No `tabs`, no `host_permissions` block —
  the static `content_scripts.matches` entry in the manifest is what
  grants the content script DOM access on `<all_urls>`; it does not grant
  any additional API surface.
- No remote code, no remote fonts, no analytics SDK, no error-reporting
  SDK. Grep the repo for `fetch(` or `XMLHttpRequest` — there should be
  no matches outside this sentence.
