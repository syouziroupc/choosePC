# PC ASSIST — Integrated System Blueprint 0.9

## 1. Product priority

The order is fixed:

1. user friendliness and decision quality;
2. recognition and trust for 正二郎商事;
3. monetization after the recommendation is fixed.

A valid outcome can be “do not buy”, “keep the current PC”, “upgrade instead”, or “do not sell yet”. Commercial payout must never change the evaluation score or ranking.

## 2. Primary user journeys

### Check a product URL

Primary acquisition surface. The user pastes a product URL. The system extracts facts, asks only materially necessary follow-up questions, evaluates the machine and price, then shows a decision.

Fallback order: retailer parser -> structured data/generic HTML -> pasted product name/specifications -> manual entry. Parser failure must not terminate the journey.

### Find a PC

The user states budget, purpose and plain-language preferences. The system converts these into requirements and ranks suitable current offers.

### Replace a PC

Current machine + current pain points + future workload are evaluated. Output is one of KEEP / UPGRADE / REPAIR / REPLACE.

### Sell a PC

Estimate a market range and confidence, recommend a selling route, and only then attach an optional 正二郎商事 buyback path.

## 3. Device coverage

- general laptop
- mobile laptop
- gaming laptop
- general desktop
- gaming desktop
- BTO desktop
- custom/self-built desktop
- mini PC
- workstation
- used/refurbished variants of the above
- Mac in a later milestone

Gaming laptops use a dedicated evaluator. Exact GPU variant, GPU TGP/power envelope, VRAM, CPU sustained performance, cooling, RAM configuration, display resolution/refresh/VRR, storage, upgradeability, battery, weight and AC-adapter burden are evaluated when known. Two laptops with the same GPU marketing name are not assumed to perform identically.

## 4. Architecture

```text
Browser
  -> Web UI
  -> API Worker
       -> URL/merchant parsers
       -> NormalizedPC
       -> deterministic evaluation
       -> decision + frozen ranking
       -> monetization resolver
            -> own stock
            -> affiliate URL
            -> ordinary URL

Runtime data: Cloudflare D1
Async refresh/jobs: Cloudflare Queues + Cron
Bulky snapshots/fixtures: R2 when needed
Editorial knowledge source: GitHub
```

## 5. Core domain boundary

Every input is normalized into `NormalizedPC`. The evaluation package receives technical facts, condition, price and user requirements. It must not receive commission rate, expected payout, merchant payout tier or a flag saying which offer is commercially preferred.

Evaluation dimensions are 0–100:

- hardware
- use-case fit
- value
- condition
- longevity
- risk (higher is worse)
- confidence

The first aggregate calibration is:

```text
base = hardware*0.22 + fit*0.30 + value*0.25 + condition*0.08 + longevity*0.15
adjusted = clamp(base - risk*0.35, 0, 100)
```

Hard constraints override averages. Known critical incompatibility can force `avoid`; materially unknown critical information can force `insufficient_data`.

Decision set:

- strong_buy
- buy
- fair
- overpriced
- avoid
- insufficient_data

Weights are calibration defaults. Any weight/threshold change requires regression fixtures.

## 6. Market and price engine

The model does not ask a language model to invent a market price. Price evidence is built from observations.

Preferred matching order:

1. exact model/configuration;
2. same model with normalized RAM/storage/condition adjustment;
3. similar CPU/GPU/age/configuration;
4. insufficient-market-data result.

Return a price range, sample count, observation freshness and confidence. Median/robust range is preferred over a simple average.

## 7. URL analysis

Arbitrary product URLs are hostile input.

Flow:

```text
URL -> HTTPS validation -> host/IP validation -> controlled fetch ->
structured-data extraction -> retailer/generic parser -> candidate fields ->
optional low-cost AI extraction -> schema validation -> NormalizedPC
```

The fetch boundary must reject loopback/private/link-local/metadata targets, revalidate redirects, limit response bytes/time, and restrict content types. Merchant text is data, not instructions.

AI may interpret natural language, extract candidate fields, ask for missing data and explain a completed result. AI may not invent exact CPU/GPU IDs, benchmarks, market prices, or final rankings.

## 8. Knowledge management through GitHub

GitHub is the editorial source of truth for reviewed CPU/GPU/device/game/use-case/rule data.

```text
chat/research task -> branch -> knowledge edit + sources -> validation ->
regression tests -> PR -> merge -> runtime projection to D1 -> knowledge_version
```

Every evaluation records `engine_version` and `knowledge_version` so later changes are explainable.

## 9. D1 runtime domains

Knowledge: knowledge_versions, hardware_cpu, hardware_gpu, device_models, device_variants, usecase_profiles, game_profiles.

Market: market_observations, merchant_offers, url_analysis_cache.

Runtime: evaluation_runs, evaluation_reasons, jobs, parser_failures.

Commercial/analytics: leads, outbound_clicks, conversion_events, analytics_events.

Anonymous evaluation does not require contact information. Lead/contact data is separated from general analytics.

## 10. Monetization boundary

The ranking is fixed first. Only after that does `MonetizationResolver` attach one of:

- 正二郎商事 own-stock/sourcing path;
- affiliate destination;
- normal non-monetized link.

Launch revenue pillars:

1. own PC sales/sourcing;
2. affiliate PC purchases, including new, gaming and used-PC programs where available;
3. selected buyback -> refurbishment/resale;
4. repair/upgrade work;
5. accessory affiliate sales.

Later: corporate replacement leads, sponsorship displayed outside scored ranking, external buyback leads, B2B widget/API.

## 11. Analytics

Core funnel events:

- session_started
- url_analysis_started/completed/failed
- manual_entry_started
- evaluation_started/completed
- recommendation_viewed
- offer_clicked
- affiliate_outbound_clicked
- own_stock_clicked
- purchase/repair/sell lead created
- lead_closed_won/lost
- affiliate_conversion_imported

Primary metrics: analysis success, diagnosis completion, insufficient-data rate, offer CTR, affiliate conversion, own-consultation rate/close rate, repair/buyback close rate, gross contribution per completed evaluation, and gross contribution per 1,000 sessions.

Category reporting must separate general laptops, gaming laptops, desktops, gaming desktops and used/refurbished cohorts.

## 12. Security and abuse controls

- strict URL fetch boundary/SSRF controls
- deterministic parsing before model calls
- schema validation of AI extraction
- request/session rate limits
- URL analysis cache
- Turnstile escalation for abusive routes when needed
- affiliate redirect destinations stored server-side
- no secrets, affiliate IDs, customer data or private operating data in Git
- scoring package cannot import/query monetization data

## 13. v0.1 release gate

The first usable version requires:

- manual entry works without AI;
- NormalizedPC validation;
- CPU/GPU lookup path;
- category routing for ordinary laptop, gaming laptop, ordinary desktop and gaming desktop;
- deterministic score/decision/reason output;
- unknown fields remain unknown rather than guessed;
- a known critical constraint overrides a high score;
- gaming laptops route through dedicated logic;
- every evaluation includes engine/knowledge version;
- affiliate/own-stock information cannot affect scoring;
- CI passes type checks, unit tests, knowledge validation and regression fixtures.

URL analysis, live merchant search and monetization follow after this deterministic baseline is stable.
