# Merchant collection and refresh operations

## Purpose

The collector subsystem keeps neutral merchant offers and trusted market observations fresh without allowing affiliate or commission metadata into evaluation or ranking.

A collector source is an operator-approved HTTPS product URL from a supported merchant. Sources are stored in D1 and refreshed by the Worker scheduled handler. The default Worker cron is hourly; each source has its own `refreshMinutes` interval and `nextRunAt`, so an hourly trigger does not imply an hourly fetch for every URL.

## Supported merchant adapters

The current adapter registry recognizes:

- Amazon.co.jp
- Rakuten Ichiba
- Yahoo! Shopping
- Mercari
- Lenovo
- Dell
- HP
- Dospara
- PC Koubou
- TSUKUMO
- FRONTIER
- Sycom

Adapters provide merchant identity, product-scope title/price/specification hints and stock-state hints. Generic JSON-LD/OpenGraph extraction remains available, but page-wide component fallback is disabled when multiple Product JSON-LD objects are present unless a merchant-specific product scope supplies the component text. This prevents recommendation widgets and related products from contaminating the main PC specification.

## Security boundary

Collector URLs must:

- use HTTPS;
- contain no username/password credentials;
- belong to a supported merchant domain;
- remain within the same recognized merchant across redirects;
- return HTML;
- stay within the bounded response size and redirect limits.

The merchant name is derived server-side from the URL. Clients cannot assert a different merchant identity.

## Data-quality boundary

A page is not written into neutral offer or market data merely because it contains a price.

The collector requires:

- a usable price of at least 100 JPY; and
- at least one recognized hardware identity signal: CPU or GPU.

Unknown RAM, storage, condition detail, upgradeability, cooling, TGP, VRAM and similar values remain unknown. The collector does not infer them from product positioning or category names.

Offer writes are suppressed for `sold`, `out_of_stock` and `unavailable` pages. Market observations may retain a `sold` listing as sold-market evidence, but unavailable/out-of-stock listings are not treated as active market observations.

## D1 tables

Migration `0006_collectors.sql` creates:

- `collector_sources`: approved source URL, mode, category/condition context, interval, health state and parser metadata;
- `collector_runs`: immutable per-run status and extraction diagnostics.

## Internal API

All collector administration routes are protected by `OFFER_INGEST_TOKEN` and return `404` when authorization fails.

### Register or update a source

`POST /api/internal/collectors/source`

Body:

```json
{
  "source": {
    "productUrl": "https://www.dospara.co.jp/...",
    "mode": "both",
    "category": "gaming_desktop",
    "conditionType": "new",
    "warrantyDays": 365,
    "refreshMinutes": 360,
    "enabled": true
  }
}
```

`mode` is `offer`, `market` or `both`. `refreshMinutes` is constrained to 60–10080 minutes.

### Inspect collector health

`GET /api/internal/collectors/status`

Returns the configured source list with due time, last run/success, status, failure count, last error and parser version.

### Run due collectors manually

`POST /api/internal/collectors/run`

Body:

```json
{
  "force": false,
  "limit": 8
}
```

The manual endpoint is intended for operator verification and recovery. The scheduled path uses the same collector implementation.

## Scheduled refresh

`wrangler.jsonc` registers `0 * * * *`. The Worker `scheduled()` handler calls `runDueCollectors`. Only enabled sources whose `next_run_at` is due are selected. The collector batch is deliberately bounded and runs sources sequentially to limit remote load and simplify failure attribution.

## Production provisioning

`.github/workflows/provision-production.yml` is the guarded provisioning/deployment workflow. It requires GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `MARKET_INGEST_TOKEN`
- `OFFER_INGEST_TOKEN`
- `COMMERCIAL_ADMIN_TOKEN`
- `CONVERSION_IMPORT_TOKEN`

When credentials exist, the workflow:

1. validates the repository;
2. resolves or creates the production D1 database;
3. writes the real D1 binding to `wrangler.jsonc`;
4. applies all D1 migrations remotely;
5. builds and applies the reproducible knowledge seed;
6. checks the remote schema/seed;
7. deploys the Worker with the required secrets;
8. checks `/api/v1/health` and protected collector status;
9. persists the real D1 binding configuration back to the working branch when needed.

The workflow does not invent or commit secret values.

## Operational launch gate

Before the draft PR is considered production-ready:

- CI must pass at the exact deployment head;
- visual smoke must pass at the exact deployment head;
- production D1 provisioning/migrations/seed must pass;
- all four Worker operational secrets must exist;
- at least one representative source for each enabled priority merchant should complete successfully;
- `/api/internal/offers/status` should show fresh eligible coverage rather than only stale/unavailable rows;
- a deployed interactive desktop/mobile pass should be performed against real D1-backed offers;
- CPU/GPU capability entries must remain `provisional` until the repository contains explicit external/reproducible calibration evidence that satisfies `validate:knowledge`.
