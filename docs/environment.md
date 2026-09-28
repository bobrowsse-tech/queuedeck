# Environment

## Requirements

- Chrome or any Chromium-based browser with Manifest V3 support (Chrome
  88+; recent stable strongly recommended). That's it for running the
  extension — no Node, no package manager, no build tool.
- Optional for contributors: Node 18+ to run the automated tests.

## Why no build step

Queue is intentionally shipped as the raw source: no bundler, no
transpiler, no npm dependency tree. Two reasons:

1. **Auditability is the product.** The whole pitch is "this extension
   collects nothing"; a build step that turns readable source into a
   minified bundle would make that harder to verify, not easier.
2. **Nothing here needs one.** The codebase is a handful of small,
   framework-free files. A bundler would add complexity without solving a
   problem the project actually has.

If a future task genuinely needs a build step (e.g. TypeScript is
adopted), that's a deliberate architectural change requiring sign-off per
`docs/agents.md` — not something to introduce incidentally.

## Local development loop

```
1. Edit any file directly (no compile step).
2. Go to chrome://extensions
3. Ensure Developer mode is on.
4. First time: "Load unpacked" → select the project folder.
   After that: click the refresh icon on the extension's card to
   pick up changes to background.js/content.js/manifest.json.
   (popup.html/js and options.html/js changes apply immediately on
   next open — no reload needed for those.)
5. Open chrome://extensions → click "service worker" under Queue to
   see background.js console output.
6. Open DevTools on any regular page to see content.js console output
   (it runs in that page's tab, isolated world).
```

## Tests

No npm install required. From the repo root:

```
node --test test/*.test.js
```

These cover `QueueStorage` behavior (de-dupe, import, settings clamp) and
manifest / privacy invariants (no network calls, storage boundary). CI runs
the same command on every PR via `.github/workflows/test.yml`.

## Ports / servers / env vars

None. There is no local server, no `.env` file, and nothing to
configure — `chrome.storage.local` is provisioned automatically per
Chrome profile the first time the extension reads or writes to it.

## Packaging for distribution

Use the repo helper (preferred):

```
./scripts/package.sh
```

That writes `QueueDeck-<manifest-version>.zip` with only the runtime files.

`chrome://extensions` → "Pack extension" produces a `.crx` + private key for
sideload testing; the Web Store wants the zip, not the crx.

### Publishing via GitHub

After you add the `CWS_*` Actions secrets (see `docs/store-listing.md`), either:

- Actions → **Publish Chrome Web Store** → Run workflow, or
- Push a matching version tag (`v1.2.0` when manifest is `1.2.0`)

CI runs tests, builds the zip, and uploads it through the Chrome Web Store API.

