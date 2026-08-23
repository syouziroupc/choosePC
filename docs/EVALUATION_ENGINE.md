# Evaluation Engine v0.3.0

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

Engine 0.3 also returns `scoreBreakdown`. It exposes the maximum and earned points for each dimension, evidence coverage, risk/evidence penalties, and the individual factors used inside each dimension. A score and its evidence coverage are separate values; missing fields are not represented as verified benchmark values.

## Aggregate

```text
base =
  hardware  * 0.25 +
  fit       * 0.30 +
  value     * 0.20 +
  condition * 0.10 +
  longevity * 0.15

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

An essential known failure becomes a critical constraint. An essential unknown whose policy is `block` prevents a positive recommendation. `insufficient_data` is reserved for extremely weak total evidence (confidence below 45); otherwise a purchase with an unverified essential requirement is rejected rather than left as an ambiguous verdict.

## Gaming

Dynamic gaming profiles are generated from resolution (1080p/1440p/4K) and target FPS class (60/120/144/240). They operate on capability bands, not fabricated per-game FPS.

Gaming laptop hardware scoring separately considers CPU gaming index, GPU capability, RAM, storage and cooling. Laptop GPU capability is conservatively adjusted inside the manufacturer's supported TGP range when TGP is known. Unknown TGP and cooling lower confidence and increase risk.

## Capability data

`knowledge/hardware/*/catalog.json` contains PC ASSIST internal relative capability indices. `provisional` means the index has not yet been calibrated against a licensed/reproducible benchmark dataset. Such entries have deliberately limited confidence.

Manufacturer specifications can verify identity, VRAM and power ranges, but they do not by themselves verify the internal performance index.

## Market scoring

Value uses price / fair-market-price ratio through a piecewise curve. The raw value score is pulled toward neutral in proportion to market-evidence quality, so one sparse observation cannot create an extreme bargain/overpriced score. Market confidence combines explicit confidence, effective sample size, freshness and price dispersion.

Stored-market matching uses model/configuration identity and, where exact hardware IDs differ, normalized CPU/GPU capability proximity. Missing fields never count as a perfect match. Used/refurbished observations may be compared with a condition penalty; new and used observations remain incompatible. The estimator uses a freshness/source/similarity-weighted median, weighted 20th/80th percentiles, modified-Z/MAD outlier rejection, effective sample size and an explicit `strong`/`moderate`/`weak`/`sparse` quality class.

`user_estimate` market input is capped at low market-confidence contribution, is never accepted as observed market evidence, and cannot produce the `strong_buy` verdict. A technically/financially strong result based only on user-entered comparison value is capped at `buy` until observed-market evidence is available.

## Replacement

Ownership evaluation has a separate confidence context. A current PC can be judged KEEP/UPGRADE/REPAIR/REPLACE without purchase-market evidence; price must not block a technically sound replacement decision. Known critical constraints are handled before normal keep/upgrade routing: insufficient PSU is routed to repair/inspection, memory-only critical failure can route to upgrade when expansion is verified, and other known critical failures cannot be hidden by a generic upgrade suggestion.

## Regression requirements

CI must keep fixtures for 100-point allocation totals, factor-level breakdowns, evidence coverage, sparse-market quality metadata, low-confidence price-score shrinkage, partial-signature non-matches, nearby/distant hardware similarity, essential requirement failures, capable-but-overpriced products, unknown hardware, PSU critical failure, unknown PSU warning, high/low TGP laptop variants, unknown TGP, unknown cooling, user-estimate strong-buy suppression, ownership without market evidence, known-critical replacement routing, sale without market evidence and ranking/monetization separation.

## Method references

- Nardo, M., Saisana, M., Saltelli, A., & Tarantola, S. (2005). *Tools for composite indicators building*. European Commission, Joint Research Centre. https://publications.jrc.ec.europa.eu/repository/bitstream/JRC31473/EUR%2021682%20EN.pdf
- National Institute of Standards and Technology. (n.d.). *Detection of outliers*. NIST/SEMATECH e-Handbook of Statistical Methods. https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm
- Triplett, J. E. (2004). *Handbook on hedonic indexes and quality adjustments in price indexes: Special application to information technology products*. OECD. https://www.oecd.org/content/dam/oecd/en/publications/reports/2004/10/handbook-on-hedonic-indexes-and-quality-adjustments-in-price-indexes_g17a168b/643587187107.pdf
