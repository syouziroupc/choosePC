# Evaluation Engine v0.2

## Dimensions

Every purchase evaluation returns 0-100 values for:

- `hardware`: component/configuration capability
- `fit`: suitability for the selected use case
- `value`: price versus market evidence
- `condition`: new/used condition, battery, defects, warranty
- `longevity`: fit headroom, upgradeability, age/support when known
- `risk`: higher is worse
- `confidence`: evidence quality
- `overall`: descriptive aggregate, subordinate to decision gates

## Aggregate

```text
base =
  hardware  * 0.16 +
  fit       * 0.34 +
  value     * 0.24 +
  condition * 0.08 +
  longevity * 0.18

overall = clamp(
  base
  - max(0, risk - 20) * 0.38
  - max(0, 70 - confidence) * 0.20
)
```

The aggregate cannot override an essential requirement or critical constraint.

## Use-case fit

Each profile contains deterministic requirement bands:

- minimum
- preferred
- weight
- essential flag
- unknown policy
- direction (`higher_is_better` / `lower_is_better`)

An essential known failure becomes a critical constraint. An essential unknown whose policy is `block` produces `insufficient_data` rather than a guess.

## Gaming

Dynamic gaming profiles are generated from resolution (1080p/1440p/4K) and target FPS class (60/120/144/240). They operate on capability bands, not fabricated per-game FPS.

Gaming laptop hardware scoring separately considers CPU gaming index, GPU capability, RAM, storage and cooling. Laptop GPU capability is conservatively adjusted inside the manufacturer's supported TGP range when TGP is known. Unknown TGP and cooling lower confidence and increase risk.

## Capability data

`knowledge/hardware/*/catalog.json` contains PC ASSIST internal relative capability indices. `provisional` means the index has not yet been calibrated against a licensed/reproducible benchmark dataset. Such entries have deliberately limited confidence.

Manufacturer specifications can verify identity, VRAM and power ranges, but they do not by themselves verify the internal performance index.

## Market scoring

Value uses price / fair-market-price ratio through a piecewise curve. Market confidence combines explicit confidence, sample count and freshness. `user_estimate` market input is capped at low confidence and is never accepted by the sale assistant as observed market evidence.

## Replacement

Ownership evaluation has a separate confidence context. A current PC can be judged KEEP/UPGRADE/REPAIR/REPLACE without purchase-market evidence; price must not block a technically sound replacement decision.

## Regression requirements

CI must keep fixtures for essential requirement failures, capable-but-overpriced products, unknown hardware, PSU critical failure, unknown PSU warning, high/low TGP laptop variants, unknown TGP, unknown cooling, ownership without market evidence, sale without market evidence and ranking/monetization separation.
