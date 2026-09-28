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

## Store assets

- Store icon: `icons/icon128.png`
- Package: `QueueDeck-1.1.2.zip` (from `./scripts/package.sh`)
- Screenshots: `docs/store-assets/` (see checklist)

## Single purpose

Save video links to a personal watch-later list stored only on the user’s device.

## Submission checklist

- [x] Privacy policy live on Pages
- [x] Screenshots in `docs/store-assets/`
- [ ] If 1.1.1 is still Pending review: ⋮ → Cancel review
- [ ] Package tab → Upload New Package → `QueueDeck-1.1.2.zip`
- [ ] Submit for review (auto-publish OK)
- [ ] Merge release branch to `main`
