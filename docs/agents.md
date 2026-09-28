# Agent Operating Rules — Queue

This file defines what an AI coding agent (Claude Code or otherwise) is and
isn't allowed to do unsupervised in this repository. It implements the
project's general AI-assisted development rules, specialized for a
browser extension whose entire pitch is "collects nothing, needs no
server."

## Non-negotiable safety boundaries

1. **No network calls, ever.** Do not add `fetch`, `XMLHttpRequest`,
   `navigator.sendBeacon`, `<img src="https://...">`, remote fonts,
   remote scripts, or any other outbound request. This is the project's
   core promise; a single violation breaks it silently for every user.
   Any PR that introduces one should be treated as a critical bug, not a
   style nit.
2. **No new permissions or `host_permissions`** in `manifest.json` without
   explicit user sign-off in the same conversation/PR — permissions are
   the thing Chrome Web Store reviewers and users both scrutinize first.
3. **`chrome.storage.local` only.** Never switch to `chrome.storage.sync`
   or add any server-backed persistence — that would silently make saved
   videos leave the device.
4. **`storage.js` is the only writer.** Every read/write of extension data
   goes through the `QueueStorage` API. Do not call
   `chrome.storage.local.get/set` directly from `content.js`, `popup.js`,
   `options.js`, or `background.js`.
5. **No new third-party dependencies without confirmation.** The project
   is deliberately dependency-free (no npm, no bundler). Adding one
   requires the same registry-verification and confirmation step as any
   other project, but here the default answer should be "write it in
   vanilla JS instead."

## Boot sequence for this repo

1. Read `docs/index.md` and `docs/tasks.md` for current state and goals.
2. Read `docs/architecture.md` and `docs/conventions.md` before proposing
   any structural change.
3. Read `docs/schema.md` before changing anything stored in
   `chrome.storage.local` (the item shape, the settings shape) — a schema
   change needs a migration path so existing users' saved lists don't
   break on update.
4. There is no external ecosystem to verify for this repo specifically
   (no dependencies to check against a registry) — skip that step unless
   a task explicitly proposes adding one.
5. Read the target file(s) in full before editing, same as any repo.

## Task scope

- Keep edits incremental and scoped to the file(s) the task actually
  concerns. Don't touch `popup.css` while fixing a `content.js` bug.
- Preserve the four-context split (`content.js` / `background.js` /
  `popup.js` / `options.js`) — don't merge logic across them for
  convenience; each exists because of where it runs (isolated content
  world, service worker, extension page).
- This is an unpacked, no-build-step extension. Never introduce a build
  step (webpack/vite/etc.) as a side effect of an unrelated task.

## Definition of done, adapted for this repo

There is no bundler. Until/unless the project adopts one, "done" means:

1. The change loads cleanly via `chrome://extensions` → Load unpacked,
   with no errors in the extension's service-worker console or the page
   console.
2. Manually walk the acceptance criteria in `docs/features.md` that the
   change touches.
3. `node --test test/*.test.js` passes (required on PRs via CI).
4. No new permissions, no new network calls, no new dependencies (see
   Safety boundaries above).
5. `docs/tasks.md` and, if the storage shape changed, `docs/schema.md`
   are updated in the same change.
