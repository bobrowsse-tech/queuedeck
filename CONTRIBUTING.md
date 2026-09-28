# Contributing

Thanks for helping improve QueueDeck. A few ground rules keep the
extension auditable and trustworthy.

## Workflow

1. Fork (or branch from) the repo.
2. Open a pull request against `main` — direct pushes to `main` are blocked.
3. Keep the PR focused; one concern per PR when practical.
4. CI must pass (`node --test test/*.test.js`).

## Non-negotiables

- **No network calls** from the extension (`fetch`, XHR, remote fonts, analytics).
- **No new permissions** in `manifest.json` without discussion in the PR.
- **`chrome.storage.local` only**, and only through `QueueStorage` in `storage.js`.
- **No build step / npm runtime dependencies** unless the PR explicitly proposes
  that architectural change.

See `docs/agents.md` and `docs/architecture.md` for the full boundaries.
