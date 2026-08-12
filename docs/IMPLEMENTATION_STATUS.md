# Implementation Status — Bootstrap Baseline

Repository: `syouziroupc/choosePC`

## Completed in this baseline

- integrated product/system blueprint
- `NormalizedPC` and evaluation-result schemas
- deterministic evaluation core skeleton
- explicit gaming-laptop fields and routing requirement
- monetization attachment separated from ranking
- D1 initial schema
- Worker health/evaluation endpoint skeleton
- analytics/revenue model
- GitHub Actions validation workflow
- knowledge JSON validator

## Deliberately not provisioned yet

- production Cloudflare bindings and D1 ID
- Queue/R2 bindings
- React/Vite UI
- AI-provider credentials
- affiliate IDs/merchant credentials
- customer data

## Immediate sequence

1. Make bootstrap CI green on GitHub.
2. Generate and commit `package-lock.json` using Node 24.
3. Add deterministic fixtures for general laptop, gaming laptop, desktop and gaming desktop.
4. Implement manual `NormalizedPC -> EvaluationResult` API and result page.
5. Create dev D1 and apply `migrations/0001_initial.sql`.
6. Implement the secure URL-fetch boundary before arbitrary URL parsing is exposed.
7. Add merchant parsers incrementally with fixtures/regression tests.
8. Add offer ranking and freeze it before monetization resolution.
9. Add 正二郎商事 consultation/buyback/repair leads and affiliate outbound tracking.
10. Replace revenue assumptions with measured funnel data after launch.
