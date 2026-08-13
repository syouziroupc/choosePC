# choosePC

Deployment source: `cloudflare-production`

Manual production deployment is available from GitHub Actions via **Deploy choosePC to Cloudflare**. The workflow always checks out `cloudflare-production`, installs locked dependencies, validates the knowledge corpus, runs TypeScript/tests, builds the Cloudflare Vite output, verifies `dist/client/index.html` and `dist/choosepc/wrangler.json`, then deploys with Wrangler.

Required repository Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare Workers Builds may also use `cloudflare-production` directly. Use repository root, `npm run build` as the build command and `npx wrangler deploy` as the deploy command.
