# Chrome Web Store listing draft

## Name

QueueDeck

## Short description

Save any video to watch later. 100% local storage, zero accounts, zero tracking.

## Detailed description

QueueDeck saves video links so you can watch them later — no accounts, no servers, no analytics. Everything stays in your browser’s local storage.

• Passive save prompt while you’re watching (delay adjustable, or turn it off)
• One-click Add from the toolbar popup when the current tab has a video
• Keyboard shortcut Ctrl+Shift+S (⌃⇧S on Mac) to save instantly
• Playlist with thumbnails, notes, watched state, sort & filter
• Resume playback position on supported sites
• Export / import your list from the Options page

QueueDeck is fully open source (MIT) and makes zero network requests of its own.

## Category

Productivity

## Permission justification

- `storage` — Save your playlist and settings locally in Chrome.
- `activeTab` — Read the current tab’s URL and title only when you open the popup or use the save shortcut.
- Host access / content script on all pages — Detect `<video>` elements and page metadata (title, Open Graph image/site name) so save works on any video site. The script does not read form fields, passwords, or unrelated page content, and does not send data anywhere.

## Privacy practices

- No data collected / no data sold / no data shared with third parties
- Data stays on-device (`chrome.storage.local`)
- Privacy policy URL (after merge to main):
  `https://bobrowsse-tech.github.io/queuedeck/privacy.html`
  Fallback: `https://github.com/bobrowsse-tech/queuedeck/blob/main/privacy.html`

## GitHub publish (Chrome Web Store API)

Yes — after a one-time OAuth setup, GitHub Actions can zip and upload QueueDeck
(and submit for review) without the dashboard file picker.

### One-time secrets

Create four repository secrets (`Settings → Secrets and variables → Actions`):

| Secret | Value |
| --- | --- |
| `CWS_EXTENSION_ID` | `pfbkjofaohbcfipdmkohcgpngbkfgjkk` |
| `CWS_CLIENT_ID` | OAuth Desktop client ID |
| `CWS_CLIENT_SECRET` | OAuth Desktop client secret |
| `CWS_REFRESH_TOKEN` | Long-lived refresh token |

Get the three OAuth values with [fregante/chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys):

1. Create a Google Cloud project and enable **Chrome Web Store API**
2. Configure OAuth consent + a **Desktop app** client
3. Run `npx chrome-webstore-upload-keys` and authorize with the same Google
   account that owns the CWS listing
4. Paste `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` into the secrets above

These credentials can be reused for other extensions you own; do not commit them.

### How to publish from GitHub

Workflow: [`.github/workflows/publish-chrome.yml`](../.github/workflows/publish-chrome.yml)

- **Manual:** Actions → **Publish Chrome Web Store** → Run workflow  
  (optional checkbox to upload-only vs submit for review)
- **Tag:** bump `manifest.json` `version`, commit, then  
  `git tag v1.1.3 && git push origin v1.1.3`  
  (tag must match the manifest version, e.g. `v1.1.2`)

The job runs tests, builds `QueueDeck-<version>.zip` via `scripts/package.sh`,
uploads to CWS, and submits for review when publish is enabled.

### Manual fallback

- Package: `./scripts/package.sh` → `QueueDeck-<version>.zip`
- Store icon: `icons/icon128.png`
- Screenshots: `docs/store-assets/`
- Privacy: `https://bobrowsse-tech.github.io/queuedeck/privacy.html`

## Submission checklist

- [x] Privacy policy live on Pages
- [x] Screenshots in `docs/store-assets/`
- [ ] Add GitHub Actions secrets (`CWS_*`) for automated publish
- [ ] For this release: cancel pending 1.1.1 if needed, then either upload
      `QueueDeck-1.1.2.zip` in the dashboard **or** run the publish workflow
- [ ] Confirm listing / privacy practices still correct after upload
