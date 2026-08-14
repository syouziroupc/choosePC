# API v0.3 bridge

Public endpoints use `/api/v1`. Internal ingestion and operator-only metrics use `/api/internal`. Public clients cannot submit custom scoring profiles or claim trusted observed-market provenance; scoring and evidence trust policy are server-managed.

## GET /api/v1/health

Returns service and engine status.

## GET /api/v1/catalog

Returns supported CPU/GPU labels and public use-case identifiers. Internal capability numbers are intentionally omitted.

## POST /api/v1/url/inspect

```json
{ "url": "https://supported-merchant.example/item" }
```

Uses an HTTPS allowlist, redirect revalidation, HTML-only response checks, bounded streamed bodies and per-session rate limiting. Failure does not block manual entry.

## POST /api/v1/market/estimate

Computes a robust estimate from a bounded set of caller-supplied observations:

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

This endpoint is deliberately stateless. Its observations are not inserted into shared market storage, and the response explicitly reports `reusableAsObservedEvidence: false`. It is a calculation aid, not a route for creating trusted evidence.

## POST /api/v1/market/lookup

```json
{ "pc": { "...": "NormalizedPC" } }
```

Looks up server-stored observations by product signature and returns the robust market estimate, accepted/rejected sample counts and signature quality. If D1 is unavailable or no evidence exists, the market result is null rather than fabricated.

## POST /api/internal/market/observe

Trusted ingestion boundary for approved collectors or operator tooling. Requires `Authorization: Bearer <MARKET_INGEST_TOKEN>`; an unauthenticated request is concealed as 404.

Accepted source classes are server-controlled: `retailer_listing`, `marketplace_listing`, `sold_listing`, `curated_manual`, and `own_inventory`. Source confidence is assigned server-side. Recent duplicate URL/signature observations are suppressed.

Observed CPU/GPU IDs are retained as evidence metadata until the D1 hardware knowledge tables are seeded; the observation does not create invalid foreign-key references.

## POST /api/internal/offers/upsert

Authenticated ingestion boundary for neutral merchant offer facts. Requires `Authorization: Bearer <OFFER_INGEST_TOKEN>`; requests without the configured token are concealed as 404. A request can contain one `offer` or an `offers` array of up to 25 records.

Each offer contains merchant, title, canonical price, HTTPS product URL, controlled stock state, normalized PC data, observation time, and optional expiry time. The server derives the product signature and a stable offer ID from normalized merchant identity plus product URL. Repeated collection of the same merchant URL updates the existing row rather than creating an unbounded duplicate series.

Offer freshness is a shared invariant. If `expiresAt` is omitted, the server stores an effective expiry 30 days after `observedAt`. The authenticated API rejects an explicit expiry more than 30 days after observation, the persistence layer caps direct calls defensively, and migration `0005_offer_freshness.sql` normalizes legacy rows and applies the same cap at the database boundary.

Commercial fields are rejected at this boundary. `affiliateUrl`, commission values, program identifiers and destination overrides cannot be supplied here. `merchant_offers.affiliate_url` is explicitly written as `NULL` on insert/update. Commercial programs and attribution destinations remain a separate post-ranking concern.

## GET /api/internal/offers/status

Protected collector-health endpoint using the same `OFFER_INGEST_TOKEN` authority. It reports the 30-day freshness window, total and currently recommendation-eligible offer counts, stale/expired/unavailable counts, offers expiring within 24 hours, the newest observation timestamp, and up to 100 merchant summaries with total/eligible counts and latest observation time.

`stale`, `expired`, and `unavailable` are diagnostic dimensions and can overlap; `eligible` is the strict recommendation-usable subset. The endpoint is operational telemetry only and does not alter ranking or commercial metadata.

## POST /api/internal/commercial/upsert

Protected administration boundary for post-ranking commercial configuration. Requires a distinct `Authorization: Bearer <COMMERCIAL_ADMIN_TOKEN>`.

The request contains one program and zero or more offer links. Program fields include a stable operator key, merchant, `own` / `affiliate` / `normal` type, status, optional commission metadata, disclosure text, source URL, verification timestamp, and optional `clickRefParam`. Active `own` or `affiliate` programs require non-empty disclosure text. Commission metadata is size-bounded and is stored only in `commercial_programs`.

`clickRefParam`, when present, must be a short safe query-parameter name. It identifies the merchant/affiliate sub-ID parameter that can carry a persisted outbound click ID. It is commercial metadata and is never available to the neutral ranker.

Before any program/link write, every linked offer is loaded and its merchant is compared with the program merchant. A cross-merchant attachment is rejected. The D1 migration also enforces this relationship with insert/update triggers, a unique `(offer_id, program_id)` index and automatic attribution cleanup when an offer is deleted.

Attribution IDs are stable per offer/program pair. Changing the destination updates the existing pair and removes stale duplicate rows. Only HTTPS destinations without embedded credentials are accepted.

This administration route is downstream of ranking. The neutral offer loader does not import this module and does not query commission/program fields.

## POST /api/internal/conversions/upsert

Protected conversion-import boundary. Requires `Authorization: Bearer <CONVERSION_IMPORT_TOKEN>`; requests without the configured token are concealed as 404.

Example:

```json
{
  "conversion": {
    "provider": "example-asp",
    "externalReference": "order-123",
    "outboundClickId": "2eacb55e-3d42-4f1c-baa5-c9d7a721e64e",
    "occurredAt": "2026-08-13T04:00:00.000Z",
    "orderValueJpy": 50000,
    "commissionJpy": 1500,
    "status": "approved",
    "metadata": { "rawStatus": "confirmed" }
  }
}
```

Accepted statuses are `pending`, `approved`, `rejected`, `cancelled`, and `refunded`. Provider plus external reference produces a stable conversion ID so the same external order can be safely re-imported as its status changes. If an `outboundClickId` is supplied it must already exist; unknown clicks are rejected rather than guessed. An explicitly null/omitted click is stored as unattributed.

When a click exists, its program and offer identity are copied into the conversion row. `orderValueJpy` is the API field name; it is persisted to the existing D1 `gross_order_jpy` column.

## GET /api/internal/metrics/revenue

Operator-only observed revenue/funnel metrics. Requires `Authorization: Bearer <COMMERCIAL_ADMIN_TOKEN>`. Optional `days` must be an integer from 1 through 365; the default is 30.

The response separates observed approved and pending commission, approved order value, conversion status counts, attributed conversions, clicks by merchant type, click-to-approved-conversion rate, a 30-day-normalized approved-commission figure, and the highest-contributing commercial programs. It does not substitute planning-model assumptions for missing observed data.

## POST /api/v1/evaluate

Request:

```json
{
  "pc": { "category": "general_laptop", "condition": { "type": "used" }, "commerce": { "priceJpy": 30000 }, "confidence": {} },
  "useCase": "office",
  "market": null
}
```

If `market` is supplied by a public client, its source must be `user_estimate`. A client cannot submit `source: "observed_market"`. When market is omitted, the server may enrich the evaluation from trusted D1 observations.

Gaming requests may additionally supply `gaming.resolution` and `gaming.targetFps`.

Response contains `result`, resolved hardware evidence, optional stored market evidence and a nullable `evaluationId`. The decision is one of `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, `insufficient_data`.

## POST /api/v1/recommend

Accepts up to 20 normalized caller-supplied candidates and evaluates every candidate with the same server-managed policy. Duplicate candidate IDs are rejected. Caller-supplied market values are limited to `user_estimate`; missing market evidence may be filled from trusted D1 observations.

The response keeps neutral ranking and commercial presentation separate:

- `ranked`: candidate ID, frozen rank and evaluation result.
- `commercialOffers`: optional metadata attached only after rank has been calculated.

Commercial metadata cannot alter rank or evaluation score. If D1/commercial lookup fails, neutral ranking still returns.

## POST /api/v1/offers/recommend

Server-sourced recommendation route. It accepts neutral filters such as use case, device category, maximum price, condition, and gaming target.

The offer loader reads only candidate ID, canonical row price, normalized PC data and observation timestamp before evaluation. Merchant identity, product title, affiliate URL, commercial program and commission data are excluded from the pre-ranking query. Offers older than 30 days, explicitly expired offers, and known `out_of_stock` / `sold` / `unavailable` rows are excluded before evaluation. The sequence is:

1. load eligible D1 offers using neutral filters and shared freshness/availability rules;
2. enrich missing market evidence from trusted stored observations;
3. calculate and freeze evaluation ranking;
4. resolve merchant/commercial metadata for the already-ranked offer IDs;
5. return `ranked`, `commercialOffers`, and neutral search diagnostics.

This is the primary backend path for production recommendation monetization.

## GET /api/v1/outbound/:offerId

Resolves an already stored offer destination from D1, records an outbound click when possible and responds with a redirect. The caller cannot supply a destination URL. Only stored HTTPS destinations are accepted, preventing use as an arbitrary open redirect.

The outbound resolver re-applies the same 30-day freshness, expiry, and stock-state eligibility gates used by neutral offer search. A stale, expired, sold, out-of-stock, or unavailable offer therefore cannot remain reachable merely because its offer ID is known.

Commercial program selection is deterministic after rank is frozen. Only programs whose merchant matches the offer merchant are eligible. A usable own-source program is selected before affiliate, then normal; ties within a type are resolved by stable identifiers rather than database row order. If no active program is usable, the neutral product URL is used.

For an active program with a configured `clickRefParam`, the Worker first persists the outbound click and only then appends that persisted click ID to the stored destination URL. If persistence fails, the redirect still proceeds but no click-reference parameter is emitted, preventing orphan attribution IDs.

## POST /api/v1/replace

Uses ownership-context evaluation and returns both the current-PC evaluation and one of `keep`, `upgrade`, `repair_or_inspect`, `replace`, `insufficient_data`. The current evaluation is persisted when D1 is available.

## POST /api/v1/sell

Returns a sale assessment without inventing a dealer quote. A public `user_estimate` does not become observed-market evidence. When no public comparison value is supplied, the server may use trusted D1 observations. The response includes the decision/route and confidence used for analytics.

## POST /api/v1/events

Accepts bounded analytics event names/dimensions. Analytics are logged and, when D1 is available, persisted separately. Analytics cannot alter evaluation.

## Session and persistence policy

A first-party opaque session cookie is used for rate limiting and aggregate funnel attribution. Evaluation, recommendation, analytics and outbound-click persistence remain non-fatal: core manual diagnosis can continue when D1 is not bound. Conversion import is different: it is an operator-only accounting path and refuses to invent an outbound attribution when a supplied click ID does not exist.

## Input and trust policy

Body size and numeric fields are bounded. Arbitrary client-defined scoring profiles are rejected. Shared observed-market data can enter through the authenticated market ingestion boundary only. Neutral offer data can enter through the separately authenticated offer ingestion boundary only. Commercial metadata enters through a third authenticated administration boundary, and conversion data through a dedicated conversion-import authority. Commercial and conversion data remain segregated from ranking inputs. Public market calculations and user-entered comparison values are never promoted to trusted evidence.
