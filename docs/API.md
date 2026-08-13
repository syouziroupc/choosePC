# API v0.2

All endpoints use `/api/v1`. Public clients cannot submit custom scoring profiles; scoring policy is server-managed.

## GET /health

Returns service and engine status.

## GET /catalog

Returns supported CPU/GPU labels and public use-case identifiers. Capability numbers are intentionally omitted.

## POST /url/inspect

```json
{ "url": "https://supported-merchant.example/item" }
```

The implementation uses an HTTPS allowlist, redirect revalidation, HTML-only response checks, a bounded streamed body and per-session rate limiting. Failure does not block manual entry.

## POST /market/estimate

Computes a robust market estimate from a bounded list of observations:

```json
{
  "observations": [
    {
      "priceJpy": 42000,
      "observedAt": "2026-08-12T04:00:00.000Z",
      "similarity": 0.96,
      "sourceConfidence": 0.90
    }
  ]
}
```

This endpoint is deliberately stateless. Client-submitted observations are **not** written into the shared market database and therefore cannot poison later users' market evidence. The estimator applies similarity/source-confidence thresholds, freshness weighting, effective-sample sizing and robust outlier rejection.

## POST /evaluate

Request:

```json
{
  "pc": { "category": "general_laptop", "condition": { "type": "used" }, "commerce": { "priceJpy": 30000 }, "confidence": {} },
  "useCase": "office",
  "market": null
}
```

Gaming requests may additionally supply `gaming.resolution` and `gaming.targetFps`.

Response contains `result`, resolved hardware evidence and a nullable `evaluationId`. The ID is present when D1 persistence is bound and succeeds. The decision is one of `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, `insufficient_data`.

## POST /recommend

Accepts up to 20 normalized candidates and evaluates every candidate with the same server-managed policy. Duplicate candidate IDs are rejected.

The response has two deliberately separate arrays:

- `ranked`: neutral ranking containing candidate ID, rank and evaluation result.
- `commercialOffers`: optional post-ranking presentation metadata loaded from D1. Commercial metadata cannot alter rank or evaluation score.

If D1 is unavailable or commercial lookup fails, `ranked` is still returned and `commercialOffers` is empty.

## GET /outbound/:offerId

Resolves an already stored offer destination from D1, records an outbound click when possible and responds with a redirect. The client cannot supply a destination URL, and only stored HTTPS destinations are accepted. This prevents the endpoint from becoming an open redirect.

## POST /replace

Uses ownership-context evaluation and returns both the current-PC evaluation and one of `keep`, `upgrade`, `repair_or_inspect`, `replace`, `insufficient_data`. The current evaluation is persisted when D1 is available.

## POST /sell

Returns a sale assessment. It does not manufacture a dealer quote. `user_estimate` input alone is insufficient for an observed-market sale valuation. The response includes the decision/route and the confidence used for analytics.

## POST /events

Accepts bounded analytics event names/dimensions. Analytics are logged and, when D1 is available, persisted separately. Analytics cannot alter evaluation.

## Session and persistence policy

A first-party opaque session cookie is used for rate limiting and aggregate funnel attribution. Evaluation, recommendation, analytics and outbound-click persistence are optional: core diagnosis continues to operate when D1 is not bound.

## Input policy

Body size is bounded. Numeric PC fields and market evidence are range-checked. Arbitrary client-defined scoring profiles are rejected by design. Shared market observations are never accepted directly from this public API.
