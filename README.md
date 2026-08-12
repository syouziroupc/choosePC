# PC ASSIST

PC ASSIST is a decision-support service for buying, replacing, keeping, repairing, and selling personal computers.

## Product priorities

1. User friendliness and decision quality.
2. Recognition and trust for 正二郎商事.
3. Monetization after the recommendation is fixed.

The scoring/ranking layer MUST NOT read affiliate commission values.

## Initial scope

- General laptops
- Mobile laptops
- Gaming laptops
- General desktops
- Gaming desktops
- BTO / custom builds
- Mini PCs
- Workstations
- Used/refurbished machines
- Mac support is reserved for a later milestone

## Repository layout

- `docs/` — product, system, revenue, API, analytics and security specifications
- `schemas/` — canonical JSON schemas
- `knowledge/` — reviewed knowledge source-of-truth data
- `migrations/` — D1/SQLite migrations
- `packages/core/` — deterministic evaluation and revenue-domain logic
- `apps/worker/` — API Worker skeleton
- `.github/workflows/` — CI checks

## Canonical flow

`URL / manual input -> extraction -> NormalizedPC -> deterministic evaluation -> decision -> recommendation -> monetization resolver`

AI is used for extraction, natural-language interpretation, missing-data questions and explanation. It is not allowed to invent benchmark values, market prices, model identifiers or rankings.

## Status

Bootstrap design baseline for `syouziroupc/choosePC`. Runtime infrastructure and the React UI are intentionally not provisioned yet.
