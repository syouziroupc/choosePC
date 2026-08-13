# Implementation Status — v0.3 backend bridge

Repository: `syouziroupc/choosePC`

## Implemented

- React/Vite public UI for purchase, replacement and sale workflows
- URL inspection with supported-domain allowlist, per-session rate limiting, bounded streaming and redirect revalidation
- `NormalizedPC` model for laptops, gaming laptops, desktops, gaming desktops, BTO/custom, mini PC, workstation and Mac
- deterministic use-case requirement bands with essential gates
- lower-is-better requirements for mobility such as weight
- gaming resolution/FPS profiles and laptop-GPU TGP handling
- hard constraints for known critical failures such as inadequate PSU
- explicit warnings/confidence penalties for unknown gaming cooling, TGP and desktop power evidence
- purchase vs ownership evidence contexts
- observed-market vs user-estimate separation
- robust market estimator with freshness/similarity/source weighting, effective-sample sizing and outlier rejection
- stateless public market-estimation endpoint that cannot promote caller data into trusted evidence
- public API provenance guard: callers cannot spoof `observed_market`; public comparison values must remain `user_estimate`
- authenticated internal market-observation ingestion boundary with server-owned source classes/confidence and recent duplicate suppression
- D1 stored-market lookup by product signature and persisted market-estimate snapshots
- sale logic that refuses to invent dealer buyback quotes and exposes explicit route/confidence for funnel analysis
- evaluative candidate ranking isolated from affiliate/own-stock metadata
- authenticated neutral merchant-offer ingestion with stable URL/merchant IDs, batch support and explicit rejection of commercial fields
- neutral offer persistence always clears `affiliate_url`; commercial destination/program data cannot enter through the offer-ingest route
- neutral D1 offer candidate loader that excludes merchant identity, title, affiliate URLs, programs and commission fields before ranking
- server-sourced `/offers/recommend` path: neutral offer load -> trusted market enrichment -> frozen rank -> commercial metadata attachment
- post-ranking commercial resolver backed by D1 tables; commercial metadata cannot alter evaluation score or rank
- DB-resolved HTTPS outbound redirect path with click attribution and no client-controlled destination URL
- optional D1 persistence wired into evaluation, replacement, recommendation and analytics API paths
- persistence/commercial lookup failures are non-fatal to core manual diagnosis
- knowledge catalogs under `knowledge/` with provisional/verified status and source references
- reproducible D1 hardware-knowledge seed generator with source/evidence rows, foreign-key validation and idempotency check in CI
- D1 schema with provenance, market observation/estimate, recommendation, offer, commercial attribution, lead and conversion tables
- CI regression guards for decision-policy invariants, market provenance, robust market estimation, neutral offer ingestion/query fields and commercial fallback behavior
- Cloudflare Worker/Vite config and manual deploy workflow
- automated desktop/mobile screenshot smoke workflow

## Deliberate limitations before launch

- CPU/GPU capability indices are still `provisional`; they are internal relative indices, not copied benchmark scores.
- Provisional evidence is confidence-capped and cannot produce an unconditional strong recommendation.
- The trusted market ingestion boundary exists, but no real retailer/marketplace collector or scheduled refresh job is connected yet.
- The neutral offer-ingestion boundary exists, but no live merchant feed/crawler synchronization job is connected yet.
- Merchant-specific product parsers are not yet complete.
- D1 code paths are implemented, but the repository still lacks a real Cloudflare D1 binding/database configuration and remote migrations.
- Knowledge seed generation/validation is implemented, but the seed has not yet been applied to a real remote D1 database.
- Market observations therefore continue to retain resolved CPU/GPU IDs in evidence metadata rather than relying on remote hardware foreign keys until that deployment step is verified.
- The public UI does not yet render server-sourced ranked merchant offers or commercial outbound actions.
- Commercial program/attribution administration is not yet exposed through a protected operator workflow.
- Conversion imports and the revenue/quality dashboard are schema/design only.
- `package-lock.json` is still generated and uploaded by CI rather than committed to the branch.

## Next implementation sequence

1. Re-run CI and visual smoke on the latest Worker entry/offer-ingestion commits.
2. Provision a development D1 database in the target Cloudflare account, bind it as `DB`, configure distinct `MARKET_INGEST_TOKEN` and `OFFER_INGEST_TOKEN` secrets, and apply migrations.
3. Apply the generated versioned hardware-knowledge seed to D1 and verify foreign keys remotely.
4. Build trusted retailer/marketplace observation collectors and a scheduled refresh path.
5. Connect merchant feed/crawler synchronization to `/api/internal/offers/upsert` and add freshness/stale-offer maintenance.
6. Add a protected commercial-program/attribution administration path that remains downstream of neutral ranking.
7. Render `/offers/recommend` results and explicit commercial disclosures in the public UI.
8. Add merchant-specific parser fixtures/adapters for priority retailers.
9. Calibrate capability indices using licensed/reproducible benchmark evidence and promote entries from provisional to verified.
10. Add revenue/quality dashboard queries, conversion imports, commit the dependency lock, deploy a development environment and perform interactive desktop/mobile validation before moving the PR out of draft.
