# QueueDeck

A Chrome extension that saves video links so you can watch them later. No
accounts, no servers, no analytics — everything lives in your browser's
local storage.

## What it does

- **Passive save prompt.** While you're watching a video on any site,
  QueueDeck waits until you've been watching for a while (20 seconds by
  default, fully adjustable) and then shows a small, dismissible prompt
  asking if you want to save it. Say no once and it won't ask again for
  that video.
- **One-click save.** Click the toolbar icon any time — if the current tab
  has a video, QueueDeck shows an **Add** button at the top of the
  popup so you can save it immediately, no waiting required.
- **A real playlist.** Every saved video is listed with its thumbnail,
  title, source site, and when it was added. Click any entry to open it in
  a new tab. Mark videos watched, rename them, remove one, or clear
  everything.
- **Keyboard shortcut.** `Ctrl+Shift+S` (`⌃⇧S` on Mac) saves the active
  tab's video instantly, no popup required — the toolbar badge flashes to
  confirm. Customizable at `chrome://extensions/shortcuts`.
- **Notes.** Attach a short note to any saved item, right from the list.
- **Resume where you left off.** Playback position syncs every ~10s while
  playing, with a progress bar and "Resume at mm:ss" — plus a real resume
  link on YouTube and Vimeo.
- **Sort & filter.** All / Unwatched / Watched, and Newest / Oldest / By
  site — both remembered between popup opens.
- **Local-first.** Data is stored with `chrome.storage.local`, which
  persists across browser restarts and extension updates, and is cleared
  only when you clear it (or uninstall the extension). Nothing is ever sent
  over the network — the extension makes zero network requests of its own.
- **Configurable.** Turn the passive prompt off entirely, change its delay
  (5 seconds to 3 minutes), and switch between light, dark, or
  system-matched appearance.
- **Accessible by default.** Keyboard-operable throughout, visible focus
  states, semantic landmarks and labels, live-region announcements for
  screen readers, and respect for `prefers-reduced-motion`.

## Install (unpacked, for development or personal use)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the **QueueDeck** icon to your toolbar.

## Why these permissions

- `storage` — to save your playlist and settings locally.
- `activeTab` — so the popup can read the current tab's URL/title only when
  *you* click the toolbar icon; it has no standing access to your tabs.
- The content script runs on all pages (`<all_urls>`) because video
  detection has to work on any site, not just YouTube. It only looks for
  `<video>` elements and page metadata (title, `og:image`, `og:site_name`);
  it reads nothing else and sends nothing anywhere. Read `content.js` and
  `storage.js` yourself — that's the whole data path.

## Project layout

```
manifest.json     Extension manifest (MV3)
background.js     Service worker: badge count, opens the options page
content.js        Detects video playback, shows the save prompt
storage.js         Shared read/write layer over chrome.storage.local
popup.html/.css/.js   Toolbar popup: the playlist itself
options.html/.css/.js Settings page: delay, on/off, theme, export/import
icons/            Toolbar icons (16/32/48/128)
test/             Node test suite (`node --test test/*.test.js`)
docs/             Project documentation (see docs/index.md)
```

## Contributing

PRs only — `main` is protected. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT — see `LICENSE.txt`. Contributions welcome.
