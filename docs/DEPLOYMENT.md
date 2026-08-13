# Deployment

Production target: Cloudflare Workers with Vite static assets, Worker API routes and D1 persistence.

## Validation before deploy

```bash
npm ci
npm run check
npm run deploy:dry
python3 scripts/validate_knowledge_seed.py
```

CI performs production-dependency audit, knowledge validation, migration validation, reproducible knowledge-seed validation, TypeScript type checking, Vitest regression tests, Vite build and Wrangler dry-run using the committed dependency lock.

## GitHub Actions deploy

`.github/workflows/deploy.yml` is intentionally manual (`workflow_dispatch`) during development. Repository Actions secrets required for the existing deploy workflow:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow must not be treated as production-ready for the monetized backend until the real D1 binding is committed and remote migrations/seed are verified.

## Provision the D1 database

Create the database from an authenticated Wrangler environment:

```bash
npx wrangler d1 create choosepc
```

Use the exact binding block returned by Wrangler and commit it to `wrangler.jsonc` with binding name `DB`. Do not invent or copy a database ID from another environment.

The expected shape is:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "choosepc",
      "database_id": "<ID RETURNED BY CLOUDFLARE>"
    }
  ]
}
```

## Apply schema migrations

After the binding is committed and points to the intended database:

```bash
npx wrangler d1 migrations list choosepc --remote
npx wrangler d1 migrations apply choosepc --remote
```

Do not seed application data before all repository migrations have applied successfully. Migration `0003_commercial_integrity.sql` enforces attribution merchant matching and pair uniqueness. Migration `0005_offer_freshness.sql` normalizes legacy offer expiry, caps offer lifetime at 30 days after observation and adds insert/update freshness triggers. Remote verification must include both sets of constraints.

## Seed versioned hardware knowledge

Generate SQL from the repository-managed knowledge catalogs:

```bash
node scripts/build_knowledge_seed.mjs \
  --git-sha "$(git rev-parse HEAD)" \
  --output /tmp/choosepc-knowledge-seed.sql
```

Apply the generated file to the same remote D1 database:

```bash
npx wrangler d1 execute choosepc --remote --file=/tmp/choosepc-knowledge-seed.sql
```

The seed is designed to be rerun safely. It writes `knowledge_versions`, hardware catalogs, source documents and evidence links from repository data.

## Configure internal secrets

Set all four internal authority domains as separate Worker secrets rather than plaintext configuration:

```bash
npx wrangler secret put MARKET_INGEST_TOKEN
npx wrangler secret put OFFER_INGEST_TOKEN
npx wrangler secret put COMMERCIAL_ADMIN_TOKEN
npx wrangler secret put CONVERSION_IMPORT_TOKEN
```

- `MARKET_INGEST_TOKEN` authorizes trusted market evidence.
- `OFFER_INGEST_TOKEN` authorizes neutral merchant-offer ingestion and collector-health status.
- `COMMERCIAL_ADMIN_TOKEN` authorizes downstream program/disclosure/commission configuration and observed revenue metrics.
- `CONVERSION_IMPORT_TOKEN` authorizes conversion imports and must not grant offer, market or commercial administration authority.

The tokens should be distinct. A merchant feed must not automatically gain authority to create trusted market evidence, change monetization destinations or import accounting data. If a token is absent, its corresponding internal route is concealed as unavailable.

Do not enable collectors or commercial administration until D1 migrations and the knowledge seed have completed successfully.

## Remote verification before public offer rollout

Verify the database directly:

```bash
npx wrangler d1 execute choosepc --remote --command="PRAGMA foreign_key_check"
npx wrangler d1 execute choosepc --remote --command="SELECT COUNT(*) AS cpu_count FROM hardware_cpu"
npx wrangler d1 execute choosepc --remote --command="SELECT COUNT(*) AS gpu_count FROM hardware_gpu"
npx wrangler d1 execute choosepc --remote --command="SELECT COUNT(*) AS bad_offer_expiry FROM merchant_offers WHERE expires_at IS NULL OR datetime(expires_at) > datetime(observed_at, '+30 days')"
```

Then deploy the Worker and smoke-test, in order:

1. `/api/v1/health`
2. `/api/v1/catalog`
3. manual `/api/v1/evaluate`
4. `/api/v1/market/lookup`
5. authenticated `/api/internal/market/observe` with a controlled non-production observation
6. authenticated `/api/internal/offers/upsert` with a controlled neutral test offer; verify its effective expiry is no more than 30 days after observation
7. authenticated `/api/internal/offers/status`; verify the controlled offer appears in eligible/merchant health counts
8. `/api/v1/offers/recommend` before any commercial configuration and record the frozen rank
9. authenticated `/api/internal/commercial/upsert` for that test offer
10. `/api/v1/offers/recommend` again and confirm the frozen rank/evaluation is unchanged while `commercialOffers` gains metadata
11. `/api/v1/outbound/:offerId` and confirm only the stored HTTPS destination is used and stale/unavailable offers are rejected
12. import a controlled conversion through authenticated `/api/internal/conversions/upsert`
13. query authenticated `/api/internal/metrics/revenue` and confirm the controlled click/conversion is represented without affecting ranking
14. direct D1 check that neutral `merchant_offers.affiliate_url` remains NULL and cross-merchant attribution is rejected
15. desktop/mobile visual review

## Rollout rule

The manual diagnosis path may remain usable without D1. Server-sourced market evidence, merchant recommendation and monetized outbound paths must not be advertised as operational until the target D1 database, all migrations, knowledge seed, all four internal secrets and controlled merchant/commercial/conversion data have been verified in the deployed environment.
