# GitHub creation checklist

When the repository is ready:

1. Import this bootstrap tree.
2. Repository is currently public. Keep all secrets, affiliate IDs, customer data, and private operating data out of Git; revisit visibility if proprietary datasets are added.
3. Run `npm install` with Node 24 LTS and commit `package-lock.json` as the first dependency-locking change.
4. Run `npm run validate:knowledge`, `npm run typecheck`, and `npm test`.
5. Create Cloudflare D1 and replace the placeholder database ID in `wrangler.jsonc`.
6. Apply `migrations/0001_initial.sql` to local D1 first.
7. Scaffold the React/Vite UI with the current official Cloudflare tooling rather than guessing package versions.
8. Add branch/ruleset protection for `main` and require the `validate` CI job.
9. Do not add affiliate credentials/IDs to the repository; use secrets/environment variables.
10. First implementation milestone: manual NormalizedPC -> deterministic evaluation -> result page.

## Before public launch

- add privacy/terms/affiliate disclosure
- test URL SSRF defenses
- test parser fallbacks
- ensure own-stock/affiliate data cannot enter evaluation package
- verify revenue dashboard uses gross contribution, not GMV, as its internal business metric
