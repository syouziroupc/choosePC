# Implementation Status — v0.2 build

Repository: `syouziroupc/choosePC`

## Implemented

- React/Vite public UI for purchase, replacement and sale workflows
- URL inspection with supported-domain allowlist, bounded streaming and redirect revalidation
- `NormalizedPC` model for laptops, gaming laptops, desktops, gaming desktops, BTO/custom, mini PC, workstation and Mac category
- deterministic use-case requirement bands with essential gates
- lower-is-better requirements for mobility such as weight
- gaming resolution/FPS profiles and laptop-GPU TGP handling
- hard constraints for known critical failures such as inadequate PSU
- explicit warnings/confidence penalties for unknown gaming cooling, TGP and desktop power evidence
- purchase vs ownership evidence contexts
- observed-market vs user-estimate separation
- sale logic that refuses to invent dealer buyback quotes
- evaluative ranking isolated from affiliate/own-stock metadata
- knowledge catalogs under `knowledge/` with provisional/verified status and source references
- D1 schema extended with provenance, market-estimate, recommendation and commercial attribution tables
- CI regression tests for the core decision-policy invariants
- Cloudflare Worker/Vite config and manual deploy workflow

## Deliberate limitations before calibration

- CPU/GPU capability indices are still `provisional`; they are internal relative indices, not copied benchmark scores.
- Provisional evidence is confidence-capped and cannot produce an unconditional strong recommendation.
- Live observed-market ingestion is not connected yet; user-entered comparison prices remain low-confidence reference input.
- Merchant-specific product parsers are not yet complete.
- D1 persistence is designed but not yet bound to the deployed Worker.

## Next implementation sequence

1. Make v0.2 CI green including Vite build and Wrangler dry-run.
2. Add observed market ingestion/storage and robust price estimator.
3. Add recommendation/search candidates and freeze rank before monetization.
4. Add merchant adapters and URL parser fixtures.
5. Add D1 persistence and analytics/revenue dashboard data path.
6. Calibrate capability indices using licensed/reproducible benchmark evidence and promote entries from provisional to verified.
7. Deploy and perform desktop/mobile visual smoke review.
8. Add own-stock/affiliate outbound destinations only after ranking is stable.
