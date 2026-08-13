# Deployment

Production target: Cloudflare Workers with Vite static assets, Worker API routes and D1 persistence.

## Validation before deploy

```bash
npm install
npm run check
npm run deploy:dry
python3 scripts/validate_knowledge_seed.py
```

CI performs knowledge validation, migration validation, reproducible knowledge-seed validation, TypeScript type checking, Vitest regression tests, Vite build and Wrangler dry-run.

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

Do not seed application data before all repository migrations have applied successfully. Migration `0003_commercial_integrity.sql` adds the attribution merchant-match guard, unique offer/program pair and cleanup trigger; deployment validation must include it.

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

Set all three authority domains as separate Worker secrets rather than plaintext configuration:

```bash
npx wrangler secret put MARKET_INGEST_TOKEN
npx wrangler secret put OFFER_INGEST_TOKEN
npx wrangler secret put COMMERCIAL_ADMIN_TOKEN
```

- `MARKET_INGEST_TOKEN` authorizes trusted market evidence.
- `OFFER_INGEST_TOKEN` authorizes neutral merchant-offer facts.
- `COMMERCIAL_ADMIN_TOKEN` authorizes downstream program, disclosure, commission and outbound-destination configuration.

The tokens should be distinct. A merchant feed must not automatically gain authority to create trusted market evidence or change monetization destinations. If a token is absent, its corresponding internal route is concealed as unavailable.

Do not enable collectors or commercial administration until D1 migrations and the knowledge seed have completed successfully.

## Remote verification before public offer rollout

Verify the database directly:

```bash
npx wrangler d1 execute choosepc --remote --command="PRAGMA foreign_key_check"
npx wrangler d1 execute choosepc --remote --command="SELECT COUNT(*) AS cpu_count FROM hardware_cpu"
npx wrangler d1 execute choosepc --remote --command="SELECT COUNT(*) AS gpu_count FROM hardware_gpu"
```

Then deploy the Worker and smoke-test, in order:

1. `/api/v1/health`
2. `/api/v1/catalog`
3. manual `/api/v1/evaluate`
4. `/api/v1/market/lookup`
5. authenticated `/api/internal/market/observe` with a controlled non-production observation
6. authenticated `/api/internal/offers/upsert` with a controlled neutral test offer
7. `/api/v1/offers/recommend` before any commercial configuration and record the frozen rank
8. authenticated `/api/internal/commercial/upsert` for that test offer
9. `/api/v1/offers/recommend` again and confirm the frozen rank/evaluation is unchanged while `commercialOffers` gains metadata
10. `/api/v1/outbound/:offerId` and confirm only the stored HTTPS destination is used
11. direct D1 check that neutral `merchant_offers.affiliate_url` remains NULL and cross-merchant attribution is rejected
12. desktop/mobile visual review

## Rollout rule

The manual diagnosis path may remain usable without D1. Server-sourced market evidence, merchant recommendation and monetized outbound paths must not be advertised as operational until the target D1 database, all migrations, knowledge seed, all three internal secrets and controlled merchant/commercial data have been verified in the deployed environment.
