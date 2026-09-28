# Schema

There is no API and no database — this documents the two objects Queue
keeps in `chrome.storage.local`, which together are the entire "contract"
of the app. Both are owned exclusively by `storage.js` (`QueueStorage`).

## `queue_items` → `QueueItem[]`

```ts
interface QueueItem {
  id: string;            // "q_<timestamp36>_<random7>" — generated locally, never reused
  url: string;            // full URL as captured, used as the link target
  normalizedUrl: string;  // url with tracking params stripped — used for de-dup
  title: string;          // from og:title or document.title, trimmed of site suffix
  siteName: string;       // og:site_name, else hostname with leading "www." removed
  thumbnail: string;      // og:image URL, or "" — never a locally stored image blob
  note: string;           // free-text note the user typed, or "" — never inferred
  position: number;       // playback position in seconds at last sync, or 0
  duration: number;       // video duration in seconds at last sync, or 0
  addedAt: number;        // Date.now() at save time (ms epoch)
  watched: boolean;       // toggled from the popup; default false
}
```

Stored newest-first (new items are `unshift`-ed, not pushed).

**De-duplication:** `addItem()` normalizes the incoming URL and checks it
against every stored `normalizedUrl`. If found, the existing item is
returned unchanged (`alreadyExisted: true`) rather than creating a
duplicate — *unless* the incoming `position` is further along than what's
stored, in which case the resume point is updated in place (see Resume
position below). Normalization currently strips: `si`, `utm_source`,
`utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `feature`,
`fbclid`, `gclid`, `igshid`, `spm`. Add new params to `STRIP_PARAMS` in
`storage.js` if a new tracking convention turns up false negatives.

**Resume position:** `content.js` calls
`QueueStorage.updatePositionByUrl(url, currentTime, duration)` roughly
every 10 seconds while a *saved* video plays. It's a no-op if the URL
isn't saved, and it never moves `position` backwards (so scrubbing back a
few seconds to re-watch a line doesn't lose your place). The popup uses
`position`/`duration` to draw the thumbnail progress bar and the "Resume
at mm:ss" label, and to build a best-effort resume link — see
`buildResumeUrl()` in `popup.js`, which currently only rewrites the URL
for YouTube (`?t=Ns`) and Vimeo (`#t=Ns`); every other site just opens the
plain saved URL, since there's no universal way to seek a `<video>` via
URL alone.

## `queue_settings` → `QueueSettings`

```ts
interface QueueSettings {
  popupEnabled: boolean;      // default true — passive toast on/off
  popupDelaySeconds: number;  // default 20 — seconds of playback before the toast
  theme: "system" | "light" | "dark"; // default "system"
  listSort: "newest" | "oldest" | "site"; // default "newest" — popup list order
  listFilter: "all" | "unwatched" | "watched"; // default "all" — popup list filter
}
```

`getSettings()` always merges over `DEFAULT_SETTINGS`, so a partial or
missing object in storage (e.g. right after install, or after a future
field is added) never produces `undefined` fields — new settings fields
get a safe default for existing users automatically as long as they're
added to `DEFAULT_SETTINGS`.

## Compatibility rule

Because this ships as a browser extension that auto-updates in place,
there is no deploy-time migration step. Any schema change must be
**additive and defaulted** (new optional field with a fallback in
`DEFAULT_SETTINGS` / read-time normalization) rather than renaming or
repurposing an existing field, unless a one-time migration is written into
`storage.js`'s load path to transform old shapes into new ones before
first use.

## Export/import shape

The JSON file produced by "Export as JSON" (`options.js`) is simply
`QueueItem[]` — the same shape as `queue_items`, serialized directly.
Import goes through `QueueStorage.importItems()`, which accepts that shape
(or a loosely-typed version: any object with at least a `url` is accepted,
missing fields fall back to sane defaults including `note`, `position`,
and `duration`) and merges it into the existing list using the same
`normalizedUrl` de-duplication as `addItem()`. Newly imported items keep
the order they appear in the file and are prepended ahead of existing
items.

