# Implementation Status — v0.3 integrated bridge

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
- shared 30-day merchant-offer freshness policy across persistence, neutral search, outbound resolution and D1 triggers; legacy null/overlong expiries are normalized by migration
- stale, expired, sold, out-of-stock and unavailable offers are excluded from both recommendation and direct outbound resolution
- protected collector-health endpoint reporting eligible/stale/expired/unavailable/soon-expiring counts and bounded merchant freshness summaries
- neutral offer persistence always clears `affiliate_url`; commercial destination/program data cannot enter through the offer-ingest route
- neutral D1 offer candidate loader that excludes merchant identity, title, affiliate URLs, programs and commission fields before ranking
- server-sourced `/offers/recommend` path: neutral offer load -> trusted market enrichment -> frozen rank -> commercial metadata attachment
- public purchase-result UI for server-ranked offers with editable price ceiling, no-result fallback, rank/price/fit/value/confidence display and outbound actions
- explicit UI labels for own stock, affiliate links and normal links; monetized offers render disclosure text without changing the frozen ranking
- protected post-ranking commercial administration with a distinct authority token, mandatory disclosure for active monetized programs and merchant/offer matching
- optional per-program `clickRefParam` for affiliate/merchant sub-ID attribution, validated separately from neutral ranking data
- D1 commercial-integrity migration enforcing unique offer/program pairs, merchant-match triggers and attribution cleanup on offer deletion
- deterministic post-ranking commercial resolver; cross-merchant programs are ineligible and database row order cannot change the selected destination
- DB-resolved HTTPS outbound redirect path with click attribution and no client-controlled destination URL
- outbound click is persisted before its click reference is appended; a failed persistence write cannot emit an orphan attribution ID
- protected conversion-import route with stable provider/reference IDs, explicit unattributed conversions and rejection of unknown click IDs
- conversion attribution copies persisted click program/offer identity instead of guessing from client data
- operator-only revenue/funnel aggregation for observed clicks, conversions, approved/pending commission, order value, merchant types and top programs
- optional D1 persistence wired into evaluation, replacement, recommendation and analytics API paths
- persistence/commercial lookup failures are non-fatal to core manual diagnosis
- knowledge catalogs under `knowledge/` with provisional/verified status and source references
- reproducible D1 hardware-knowledge seed generator with source/evidence rows, foreign-key validation and idempotency check in CI
- D1 schema with provenance, market observation/estimate, recommendation, offer, commercial attribution, lead and conversion tables
- CI regression guards for decision-policy invariants, market provenance, robust market estimation, offer freshness, neutral offer ingestion/query fields, commercial administration/integrity, attribution/conversion accounting and monetization separation
- automated interactive visual smoke workflow covering initial UI, purchase diagnosis, D1-empty offer state and three mocked commercial offer types at desktop and 390px mobile widths
- interactive visual diagnostics reject horizontal overflow and verify rendered offer/disclosure counts
- Cloudflare Worker/Vite config uses the production entry that exposes outbound attribution, conversion import and revenue metrics
- committed `package-lock.json`; CI, visual smoke and deployment workflows install the exact lock with `npm ci`

## Deliberate limitations before launch

- CPU/GPU capability indices are still `provisional`; they are internal relative indices, not copied benchmark scores.
- Provisional evidence is confidence-capped and cannot produce an unconditional strong recommendation.
- The trusted market ingestion boundary exists, but no real retailer/marketplace collector or scheduled refresh job is connected yet.
- The neutral offer-ingestion and collector-health boundaries exist, but no live merchant feed/crawler synchronization job is connected yet.
- Merchant-specific product parsers are not yet complete.
- D1 code paths are implemented, but the repository still lacks a real Cloudflare D1 binding/database configuration and remote migrations.
- Knowledge seed generation/validation is implemented, but the seed has not yet been applied to a real remote D1 database.
- The current GitHub Actions environment does not have `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, so the attempted development-D1 provisioning gate stopped before any Cloudflare resource was created or changed.
- Market observations therefore continue to retain resolved CPU/GPU IDs in evidence metadata rather than relying on remote hardware foreign keys until that deployment step is verified.
- The public offer UI is implemented and visually validated with deterministic mock data, but real server-sourced offers cannot appear until D1 and ingestion are deployed.
- There is no operator-facing UI for commercial administration or revenue metrics; authenticated internal APIs are the current management boundary.
- Conversion import and revenue aggregation are implemented and locally regression-tested, but they have not yet been exercised against a real remote D1 database or live affiliate/merchant callback/export data.

## Next implementation sequence

1. Build merchant-specific parser fixtures/adapters for priority retailers and trusted retailer/marketplace observation collectors.
2. Add scheduled collector execution/refresh orchestration and use `/api/internal/offers/status` as its freshness/coverage health gate.
3. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the intended GitHub Actions environment, then provision a development D1 database, bind it as `DB`, and apply all migrations.
4. Configure distinct `MARKET_INGEST_TOKEN`, `OFFER_INGEST_TOKEN`, `COMMERCIAL_ADMIN_TOKEN` and `CONVERSION_IMPORT_TOKEN` Worker secrets.
5. Apply the generated versioned hardware-knowledge seed to D1 and verify foreign keys, commercial-integrity triggers and offer-freshness triggers remotely.
6. Connect merchant feed/crawler synchronization to `/api/internal/offers/upsert` and trusted market collectors to `/api/internal/market/observe`.
7. Calibrate capability indices using licensed/reproducible benchmark evidence and promote entries from provisional to verified.
8. Run real D1 end-to-end tests: neutral offer ingestion -> freshness status -> frozen rank -> commercial attachment -> outbound click -> conversion import -> revenue metrics.
9. Perform final interactive desktop/mobile validation on the deployed environment.
10. Move the PR out of draft only after the remote D1 and deployed-environment gates pass.
