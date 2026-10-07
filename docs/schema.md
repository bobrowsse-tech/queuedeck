# Schema

There is no API and no database — this documents the two objects Queue
keeps in `chrome.storage.local`, which together are the entire "contract"
of the app. Both are owned exclusively by `storage.js` (`QueueStorage`).

## `queue_items` → library

Older installs stored a bare `QueueItem[]`. On the first read, `storage.js`
writes that array back once as a single list named "Watch later", and the
generated list id stays stable. A missing key creates that same empty list.

```ts
interface Library {
  lists: QueueList[];
}

interface QueueList {
  id: string;             // "l_<timestamp36>_<random7>"
  name: string;           // trimmed, at most 80 characters
  locked: boolean;        // default false; forced false without lockCredentialId
  items: QueueItem[];
}
```

`activeListId` is the list the popup is showing. `saveListId` is where a
save with no list id goes (the toast and the keyboard shortcut). Adding
from the popup writes to the open list and then points `saveListId` at it.
Switching the visible list does not change the save target.

De-dupe is per list: the same normalized URL may exist in two lists.
`updatePositionByUrl` advances every copy and still never moves `position`
backwards. `hasUrl(url)` checks only the save-target list. `hasUrl(url, listId)`
checks one list. `getItems()` still returns every item in every list so the
toolbar badge can keep using its length.

Deleting a list deletes its items. The last list cannot be deleted.
`clearList` empties one list. `clearAll` empties items in every list and
keeps the lists.

## `queue_items` items → `QueueItem`

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
  manualOrder?: number;  // stored order; missing values read as the array index and are not rewritten until a later write
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
  listSort: "newest" | "oldest" | "site" | "manual"; // default "newest" — popup list order
  listFilter: "all" | "unwatched" | "watched"; // default "all" — popup list filter
  activeListId: string;   // list shown in the popup; falls back to the first list
  saveListId: string;     // silent-save target; falls back to the first list
  lockCredentialId: string; // platform WebAuthn credential id, or ""
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

Export downloads `{ version: 2, lists }` with each list's id, name, locked
flag, and items. It does not include `lockCredentialId`. A locked list that
has not been unlocked this browser session exports its name and an empty
items array.

Import accepts that version-2 file (match an existing list by id, then by
name, otherwise create it; de-dupe inside the list; new item ids) and a
bare `QueueItem[]`, which merges into the save-target list. Anything else
is rejected. A locked list without a session grant is not imported into.
Importing a list marked locked revokes that list's session grant, so a
grant from earlier in this browser session does not keep the restored list
open. The locked flag still does not stick when this device has no
credential id.

## Unlock grants

`chrome.storage.session` holds `{ queue_grants: { [listId]: true } }`,
written only by `QueueStorage`. Grants die with the browser session and
are not video data. A grant unlocks that one list in the popup and on the
options page. The lock is a UI gate: WebAuthn checks the device unlock, and
the videos stay readable in `chrome.storage.local`.

