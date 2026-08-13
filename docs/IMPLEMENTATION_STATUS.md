# Implementation Status — v0.2/v0.3 bridge

Repository: `syouziroupc/choosePC`

## Implemented

- React/Vite public UI for purchase, replacement and sale workflows
- URL inspection with supported-domain allowlist, per-session rate limiting, bounded streaming and redirect revalidation
- `NormalizedPC` model for laptops, gaming laptops, desktops, gaming desktops, BTO/custom, mini PC, workstation and Mac category
- deterministic use-case requirement bands with essential gates
- lower-is-better requirements for mobility such as weight
- gaming resolution/FPS profiles and laptop-GPU TGP handling
- hard constraints for known critical failures such as inadequate PSU
- explicit warnings/confidence penalties for unknown gaming cooling, TGP and desktop power evidence
- purchase vs ownership evidence contexts
- observed-market vs user-estimate separation
- robust market estimator with freshness/similarity/source weighting, effective-sample sizing and outlier rejection
- stateless public market-estimation endpoint that never promotes client observations into shared market evidence
- sale logic that refuses to invent dealer buyback quotes and exposes explicit route/confidence for funnel analysis
- evaluative candidate ranking isolated from affiliate/own-stock metadata
- post-ranking commercial resolver backed by D1 tables; commercial metadata cannot alter evaluation score or rank
- DB-resolved HTTPS outbound redirect path with click attribution and no client-controlled destination URL
- optional D1 persistence wired into evaluation, replacement, recommendation and analytics API paths
- persistence failures are non-fatal to the core diagnosis/recommendation path
- knowledge catalogs under `knowledge/` with provisional/verified status and source references
- D1 schema with provenance, market observation/estimate, recommendation, offer, commercial attribution, lead and conversion tables
- CI regression tests for core decision-policy invariants plus market-estimation and commercial-fallback behavior
- Cloudflare Worker/Vite config and manual deploy workflow

## Deliberate limitations before calibration and launch

- CPU/GPU capability indices are still `provisional`; they are internal relative indices, not copied benchmark scores.
- Provisional evidence is confidence-capped and cannot produce an unconditional strong recommendation.
- Trusted shared observed-market ingestion is not connected yet. Public observations are intentionally stateless and cannot populate the shared market database.
- Merchant offer ingestion/search is not yet connected to live retailer feeds or crawlers.
- Merchant-specific product parsers are not yet complete.
- D1 persistence code is connected, but a real D1 binding/database still has to be provisioned and migrated for deployment.
- The public UI does not yet render server-sourced ranked merchant offers or commercial outbound actions.
- Conversion imports and the revenue/quality dashboard are schema/design only.

## Next implementation sequence

1. Re-run CI on the current branch and fix all type/test/build/Wrangler failures.
2. Provision a development D1 database, bind it through Wrangler and apply both migrations.
3. Add a trusted market-observation ingestion path and scheduled refresh mechanism; keep it inaccessible to arbitrary public clients.
4. Add merchant-offer ingestion/search and derive market estimates from stored observations.
5. Feed server-sourced offer candidates through the existing neutral ranking engine, then attach commercial metadata only after rank is frozen.
6. Render ranked offers and clear commercial disclosures in the public UI, including own-sourcing/affiliate/normal outbound routes.
7. Add merchant adapters and URL parser fixtures for the highest-value retailers.
8. Calibrate capability indices using licensed/reproducible benchmark evidence and promote entries from provisional to verified.
9. Add revenue/quality dashboard queries for funnel, parser failures, category contribution and scoring regressions.
10. Deploy and perform desktop/mobile visual smoke review before moving the PR out of draft.
