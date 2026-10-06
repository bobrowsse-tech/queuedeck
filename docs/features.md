# Features & Acceptance Criteria

## F1 — Passive save prompt

**As a** person watching a video, **I want** to be asked whether to save it
after watching for a while, **so that** I don't have to remember to do it
myself.

- [x] After N seconds of *actual playback* (not just page-open time) of the
  largest `<video>` element on the page, show a non-modal toast.
- [x] N defaults to 20s and is adjustable from 5s to 180s in Settings.
- [x] The prompt can be turned off entirely in Settings; when off, no toast
  ever appears (quick-add via the toolbar icon still works).
- [x] The prompt never appears twice for the same URL in the same tab
  session, whether the user saved, dismissed, or closed it.
- [x] The prompt does not appear at all if the video's URL is already saved.
- [x] Watch-time tracking resets when the page navigates to a new video
  (handles single-page apps like YouTube, where the URL changes without a
  full page reload).

## F2 — One-click add from the toolbar

**As a** person who doesn't want to wait for the passive prompt, **I want**
to save the current tab immediately by clicking the extension icon.

- [x] Clicking the toolbar icon opens the popup.
- [x] If the active tab has a video, an **Add** quick-action appears at the
  top of the popup showing the detected title/thumbnail.
- [x] If the tab has no detectable video (or is a non-http page like
  `chrome://`), the quick-add card is hidden — no dead button.
- [x] If the current tab's video is already saved, the quick-add card is
  hidden (nothing to add).

## F3 — Manage the playlist

- [x] Every saved item shows thumbnail, title, source site, relative
  "added" time.
- [x] Clicking an item opens it in a new tab.
- [x] Items can be marked watched/unwatched (visual strikethrough).
- [x] Items can be renamed in place.
- [x] Items can be removed individually.
- [x] The whole list can be cleared, behind a confirmation prompt.
- [x] Duplicate saves of the same video (URL normalized to strip tracking
  params like `si`/`utm_*`) are recognized as one entry, not two.

## F4 — Persistence

- [x] Data is written to `chrome.storage.local`, which Chrome persists to
  disk — it survives browser restarts and extension updates.
- [x] No sync storage, no IndexedDB duplication, one source of truth.
- [x] Export to a JSON file and import from one, for manual backup/
  migration between machines (still entirely user-initiated, still local).

## F5 — Settings

- [x] Toggle the passive prompt on/off.
- [x] Adjust the prompt delay (5–180s).
- [x] Theme: System / Light / Dark.
- [x] Data controls: export, import, clear all — visible on the same
  screen as a plain-language statement of what is and isn't collected.

## F6 — Privacy & footprint

- [x] Zero network requests originate from the extension (no analytics, no
  remote fonts, no update-ping beyond what Chrome itself does for the
  extension package).
- [x] Minimum viable permission set: `storage`, `activeTab`, plus the
  static content-script match pattern needed for video detection.
- [x] Fully open source under MIT (`LICENSE.txt`).

## F7 — Accessibility

- [x] Full keyboard operability across popup, options page, and the
  in-page toast.
- [x] Screen-reader announcements for save/remove/rename actions.
- [x] Visible focus indicators everywhere; no `outline: none` without a
  replacement.
- [x] Respects `prefers-reduced-motion` and `prefers-color-scheme`.

## F8 — Keyboard shortcut

**As a** person who wants to save without touching the mouse, **I want** a
keyboard shortcut that saves the current tab's video directly.

- [x] `Ctrl+Shift+S` (`⌃⇧S` on Mac) by default, saves the active tab's
  video without opening the popup.
- [x] Customizable via `chrome://extensions/shortcuts`, same as any other
  extension command — documented on the options page.
- [x] Toolbar badge flashes ✓ on success, · if it was already saved, or !
  if the tab has no video/content script (e.g. a `chrome://` page).
- [x] Falls back to saving the plain tab URL/title if no video is detected
  on the page, same as the popup's quick-add.

## F9 — Notes

**As a** person saving a video for a specific reason, **I want** to attach
a short note to it, **so that** I remember why I saved it.

- [x] Every saved item has an optional free-text note, added/edited from
  an inline editor in the popup (note icon → textarea → Save/Cancel).
- [x] A one-line preview of the note shows under the item when present.
- [x] Notes are included in JSON export/import.

## F10 — Resume position

**As a** person coming back to a saved video, **I want** to pick up where
I left off, **so that** I don't have to scrub through it again.

- [x] While a *saved* video plays, its position syncs to storage roughly
  every 10 seconds (position never moves backward from a brief rewind).
- [x] The popup shows a thin progress bar on the thumbnail and a
  "Resume at mm:ss" label once there's meaningful progress.
- [x] Clicking the item opens a best-effort resume link: YouTube and Vimeo
  URLs get a timestamp appended; every other site opens the plain saved
  URL, since there's no universal way to seek a `<video>` via URL.
- [x] A video that's essentially finished (within 3s of its duration)
  doesn't show a resume prompt — nothing left to resume.

## F11 — Sort & filter

**As a** person with a growing list, **I want** to sort and filter it,
**so that** I can find what I actually want to watch.

- [x] Filter: All / Unwatched / Watched.
- [x] Sort: Newest first / Oldest first / By site / Custom.
- [x] Custom follows each item's stored `manualOrder`. Newest, oldest, and
  by site only change the view.
- [x] A drag, or Arrow Up / Arrow Down on the row handle, moves that video
  among the rows on screen, stores that order, and switches the sort to
  Custom. The handle is disabled unless the filter is All.
- [x] Both choices persist (stored in settings) across popup opens.
- [x] An empty-filter state ("Nothing matches this filter") is distinct
  from the true empty-list state, so it's clear the list isn't actually
  empty.

## F12 — Named lists

**As a** person saving videos for different reasons, **I want** more than
one list, **so that** I can keep them apart.

- [x] Existing videos migrate into one list named Watch later.
- [x] The popup chooses which list is open. Creating, renaming, and
  deleting lists happens in Settings. The last list cannot be deleted.
- [x] The in-page prompt and the keyboard shortcut save into the current
  save target with no extra prompt. Adding from the popup saves into the
  open list and makes that the next silent target.
- [x] The same video may sit in two lists. Resume position updates every copy.
- [x] Export is a version-2 file of named lists. An older bare-array backup
  still imports into the save-target list.

## F13 — List lock

**As a** person with a private list, **I want** to hide it behind the
unlock I already use on this device, **so that** opening QueueDeck does
not show those videos.

- [x] Lock is optional per list and uses the browser's platform authenticator
  (device password, fingerprint, Windows Hello, or PIN). There is no
  separate QueueDeck password.
- [x] Saving into a locked list still works, from the prompt, the shortcut,
  and the popup Add button.
- [x] Until the list is unlocked, the popup and Settings hide its videos,
  counts, and edit actions. Unlock lasts for the browser session.
- [x] The lock is a screen gate. It does not encrypt the saved videos.
- [x] If this device has no OS unlock the browser can use, the lock stays off.
- [x] Locking a list again hides it immediately, including after it was unlocked earlier in this browser session.

## Out of scope (v1)

- Syncing across devices (would require a server or `storage.sync`, both
  against the local-first constraint).
- Automatic video-progress/resume tracking.
- Browsers other than Chrome/Chromium (Manifest V3 is the target; a
  Firefox port is a plausible future fork, not a v1 goal).
