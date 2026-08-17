# choosePC

choosePC is a PC diagnosis and recommendation service deployed on Cloudflare Workers.

## Production invariants

- Production source branch: `main`
- Runtime catalog must be generated from the repository knowledge data, not a hard-coded historical count.
- Current validated hardware catalog: 374 CPUs and 243 GPUs.
- Cloudflare production deployment must only be considered healthy after the public route and API match the validated source revision.
- Legacy deployment branches must not be used as independent sources of production truth.

## Development

Use the repository scripts for validation, tests, build, and Wrangler dry-runs before production deployment.
