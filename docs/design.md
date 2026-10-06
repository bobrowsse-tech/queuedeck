# Design System

## Concept

Queue is a **queue, not a bookmark folder** — the design language borrows
from a tape/playback deck rather than a generic card-grid "SaaS" look: a
single amber "record" accent against a calm charcoal surface, a flat list
(not cards-in-a-grid) because the content genuinely is a sequence of
things to watch, and a monospace-free, system-font UI so the extension
never makes a network request just to render text.

## Color tokens

| Token | Dark (default) | Light (`prefers-color-scheme: light` or explicit) | Use |
|---|---|---|---|
| `--bg` | `#14171C` | `#FAFAF9` | Page/popup background |
| `--surface` | `#1D2129` | `#FFFFFF` | Cards, toast, popup shell |
| `--surface-2` | `#262B34` | `#F1F0ED` | Hover states, thumbnails, switch track |
| `--border` | `#333A46` | `#E3E1DC` | Hairlines, input borders |
| `--text` | `#EDEFF2` | `#1B1D22` | Primary text |
| `--text-muted` | `#8B93A1` | `#6B7178` | Secondary text, timestamps |
| `--accent` | `#F2A93B` | `#D98A1F` | Primary actions, the "rec" dot, focus rings |
| `--accent-ink` | `#14171C` | `#FFFFFF` | Text/icons drawn on top of `--accent` |
| `--good` | `#4FD1C5` | (inherited) | Watched confirmation state |
| `--danger` | `#E85D5D` | (inherited) | Remove / clear-all |

Three theme modes: **System** (default, follows OS via media query),
**Light**, **Dark** — explicit choice is stored in settings and applied via
`data-theme` on `<html>`, overriding the media query.

## Type

System font stack only — `-apple-system, BlinkMacSystemFont, "Segoe UI",
Roboto, Helvetica, Arial, sans-serif` — deliberately, not a webfont: it
renders instantly, needs no network request (consistent with the
zero-network-calls rule), and looks native on every platform. One scale:
16px popup title, 13–14px body, 11–12px metadata/labels. No small-caps or
tracked-out eyebrow labels.

## Layout

- **Popup** (360px wide, ~560px max height): top bar → optional quick-add
  card → list header ("N saved" / Clear all) → scrollable flat list → empty
  state. Left-aligned throughout; no centered content.
- **In-page toast**: fixed bottom-right, 300px wide, appears in a Shadow
  DOM host so host-page CSS can never bleed into it (and vice versa).
- **Options page**: single centered column, 560px max width, stacked cards
  — this is a settings page, not a dashboard, so no multi-column grid.

## Components

- **List item**: 56×56 thumbnail (falls back to a centered ▶ glyph on
  `--surface-2` when no `og:image` was found) + two-line clamped title +
  site name + relative time. A thin 3px progress bar sits along the
  thumbnail's bottom edge once a saved video has a tracked position, in
  `--accent` over a translucent black track. Row actions (watched-toggle,
  note, rename, remove) are icon-only, `opacity: 0` until hover/focus-
  within, so the list reads clean at rest but every action is still
  keyboard-reachable.
- **Note editor**: opens inline below the row it belongs to (a flex-wrap
  trick: the row is `flex-wrap: wrap` and the editor gets
  `flex-basis: 100%; order: 3`, so it drops to its own line without a
  layout reflow of the rows around it) rather than as a modal or a
  separate page — keeps the "this is a lightweight queue, not a database"
  feel.
- **List switcher**: a native `<select>` above the filter and sort, same
  styling. A muted line names the silent-save list when it is not the
  list on screen. A locked list replaces the rows with a short note and
  an Unlock button that opens Settings. No video titles or counts.
- **Drag handle**: a 30×30 icon button at the start of each row. Arrow Up
  and Arrow Down move that row. The handle is disabled when a filter is
  hiding rows. The drop does not animate when reduced motion is requested.
- **Filter/sort bar**: two native `<select>` elements, not custom
  dropdown components — full keyboard/screen-reader support for free, and
  visually quiet enough to sit directly under the list header without
  competing with it.
- **Switch** (options page "prompt me" toggle): custom-styled checkbox,
  not a `<div>` — keeps native checkbox semantics and keyboard operation
  for free.
- **Toast**: amber dot + "Still watching?" eyebrow, two-line title, site
  name, primary **Save to Queue** / ghost **Not now**, small close (×),
  and a muted text link to jump straight to the delay/off setting.
- **Theme picker**: three-way segmented control built from native radio
  inputs (`:has(input:checked)` for the selected style), not custom JS
  toggle logic.

## Motion

One motion moment only: the toast's entrance (`translateY(8px)` fade-in,
220ms). No hover-lift on list rows, no staggered reveals. Every animation
is wrapped in `@media (prefers-reduced-motion: reduce)` and disabled
outright for people who've asked for that.

## Accessibility floor (applies everywhere, not just a checklist)

- Visible focus ring (`2px solid var(--accent)`, 2px offset) on every
  interactive element, including inside the Shadow DOM toast.
- Real semantics over ARIA where possible: `<button>`/`<a>`/`<input
  type="checkbox">`/`<fieldset><legend>`, not `<div onclick>`.
- `aria-live="polite"` regions for asynchronous state changes (item
  removed, item saved, item renamed) so screen-reader users get
  confirmation without a focus jump.
- Color is never the only signal: the watched state also gets a
  strikethrough and a changed `aria-pressed`/label, not just a color
  change.
- Minimum touch target 30×30px on every icon button.
- The toast never steals focus on appearance — it would interrupt video
  playback — but every control in it is reachable by keyboard and
  announced via the live region once acted on.
