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

The first implementation uses an HTTPS allowlist, redirect revalidation, HTML-only response checks and a bounded streamed body. Failure does not block manual entry.

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

Response contains `result` and resolved hardware evidence. The decision is one of `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, `insufficient_data`.

## POST /replace

Uses ownership-context evaluation and returns both the current-PC evaluation and one of `keep`, `upgrade`, `repair_or_inspect`, `replace`, `insufficient_data`.

## POST /sell

Returns a sale assessment. It does not manufacture a dealer quote. `user_estimate` input alone is insufficient for an observed-market sale valuation.

## POST /events

Accepts bounded analytics event names/dimensions. Analytics are logged separately and cannot alter evaluation.

## Input policy

Body size is bounded. Numeric PC fields are range-checked. Arbitrary client-defined scoring profiles are rejected by design.
