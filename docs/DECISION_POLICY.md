# Decision Policy v0.2.1

The public verdict is gated. An average score alone cannot create a recommendation.

## Order

1. Normalize the product and resolve hardware identity.
2. Evaluate essential use-case requirements.
3. Apply hard constraints and known compatibility risks.
4. Evaluate price only from explicit market evidence; missing evidence is neutral, never invented.
5. Calculate evidence confidence.
6. Calculate descriptive score dimensions.
7. Apply decision gates and market-provenance gate.
8. Freeze result/ranking.
9. Attach own-stock / affiliate / normal destinations afterward.

## Decision gates

- Known critical constraint -> `avoid`.
- Unknown critical requirement or confidence below 58 -> `insufficient_data`.
- Risk >= 70 or use-fit < 45 -> `avoid`.
- Adequate PC but value < 38 -> `overpriced`.
- `strong_buy`: overall >= 87, fit >= 85, value >= 72, risk <= 25, confidence >= 78 **and purchase market source is `observed_market`**.
- A result that otherwise meets `strong_buy` but relies on `user_estimate` or unspecified market provenance is capped at `buy`.
- `buy`: overall >= 74, fit >= 75, value >= 55, risk <= 45, confidence >= 68.
- `fair`: minimums are met but evidence/value does not justify a stronger verdict.

## Confidence

A complete form does not make weak source data reliable. Final confidence cannot exceed the weakest essential CPU/GPU evidence by more than five points. Provisional internal capability indices are deliberately too weak to produce an unconditional `strong_buy`.

Purchase and ownership decisions have different evidence requirements. Purchase judgement includes price/market evidence. Replacement judgement evaluates the user's existing PC without requiring a sale price.

## Requirement directions

Normal performance requirements use `higher_is_better`. Mobility limits such as weight use `lower_is_better`. Missing optional data reduces evidence quality rather than being silently converted to zero.

## Gaming laptops

GPU marketing name is not treated as a complete performance identity. TGP, VRAM, CPU gaming capability, cooling and display are separate evidence. Unknown TGP/cooling adds warnings and lowers confidence. The TGP adjustment is a conservative relative model for ranking only, not a linear FPS claim.

## Price and sale

A user-entered comparison price is marked `user_estimate`; it is not promoted to observed market evidence and cannot by itself produce `strong_buy`. The sale assistant does not invent a dealer buyback quote. Observed market data must carry sample count, confidence and age.
