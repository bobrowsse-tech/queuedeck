# Tasks

## v1.1.1 — polish (this build)

- [x] JSON import preserves notes, resume position/duration, and export order
      via `QueueStorage.importItems()`
- [x] Settings sanitization (clamp delay 5–180, valid theme/sort/filter enums)
- [x] Item shape normalization on read so older lists gain new fields safely
- [x] Content-script video listener cleanup when the tracked `<video>` changes
- [x] Safer http(s)-only thumbnail CSS assignment in the popup
- [x] Automated Node test suite (`node --test test/*.test.js`) + GitHub Actions CI

## v1.1.0 — shipped

- [x] Keyboard shortcut (`commands` in manifest, `Ctrl+Shift+S` default) to
      quick-add the active tab's video without opening the popup, with a
      flashing badge for feedback
- [x] Per-item notes: inline add/edit in the popup, included in export/import
- [x] Resume playback position: periodic position sync while a saved video
      plays, thumbnail progress bar, "Resume at mm:ss" label, best-effort
      resume links for YouTube/Vimeo
- [x] Sort (newest/oldest/site) and filter (all/unwatched/watched) controls
      in the popup, persisted in settings

## v1.0.0 — shipped

- [x] Manifest V3 scaffold, minimal permissions (`storage`, `activeTab`)
- [x] `storage.js` shared local-storage layer (items + settings, promise-based)
- [x] Video detection in `content.js` (largest visible `<video>`, SPA-aware
      via URL polling, per-URL watch-time accumulation)
- [x] Accessible in-page save toast (Shadow DOM isolated, respects
      reduced-motion, live-region confirmation)
- [x] Toolbar popup: list, quick-add for the current tab, mark
      watched/unwatched, rename, remove, clear all
- [x] Options page: prompt on/off, delay slider (5–180s), theme
      (system/light/dark), export/import JSON, clear all
- [x] Toolbar badge showing saved-item count
- [x] Generated toolbar icons (16/32/48/128) matching the design system
- [x] `docs/` structure and MIT license

## Backlog (not started)

- [ ] `_locales` i18n scaffold — currently English-only.
- [ ] Firefox (WebExtensions) port — the codebase avoids Chrome-only APIs
      where practical, but this hasn't been tested against
      `browser.*`/`webextension-polyfill`. See `docs/architecture.md` for
      the specific changes a port would need.
- [ ] Headless-Chrome / Puppeteer popup smoke test (unit coverage for
      `QueueStorage` + manifest invariants is in place; browser UI smoke is next).

## Known constraints (by design, not bugs)

- Data does not sync across devices (local-first is a stated
  requirement, not an oversight — see `docs/architecture.md`).
- The passive prompt tracks the single largest `<video>` on the page; a
  page with several equally prominent videos (e.g. a grid of previews)
  isn't a target use case.
