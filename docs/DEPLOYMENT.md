# Deployment

Production target: Cloudflare Workers with Vite static assets and Worker API routes.

## Validation before deploy

```bash
npm install
npm run check
npm run deploy:dry
```

CI performs knowledge validation, TypeScript type checking, Vitest regression tests, Vite build and Wrangler dry-run.

## GitHub Actions deploy

`.github/workflows/deploy.yml` is intentionally manual (`workflow_dispatch`) during early development. Repository Actions secrets required:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow runs the full check suite before `cloudflare/wrangler-action@v3` executes `wrangler deploy`.

## Current runtime resources

v0.2 can deploy without D1 because the public evaluation catalog is repository-backed static data. D1 migrations already define the future persistent knowledge/market/evaluation/lead/analytics schema; D1 bindings should be enabled only when persistence is actually wired and tested.

## Rollout

1. PR CI green.
2. Deploy manual preview/initial production Worker.
3. Smoke-test `/api/v1/health`, catalog, manual evaluation and URL fallback.
4. Perform visual review on desktop/mobile.
5. Only then merge and protect `main`.
