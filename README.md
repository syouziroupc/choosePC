# choosePC / PC ASSIST

PC ASSIST is a decision-support service operated by 正二郎商事株式会社. It helps users decide whether to buy, keep/upgrade, replace, or sell a PC without allowing commercial payout to affect evaluation.

## Product priorities

1. User-friendly and useful judgement.
2. Build recognition and trust for 正二郎商事.
3. Monetize the action after the judgement, not the judgement itself.

## Current supported categories

- general/mobile laptops
- gaming laptops
- general/gaming desktops
- BTO/custom desktops
- mini PCs
- workstations
- Mac category reserved for later data coverage

Gaming laptops are evaluated separately. GPU model alone is not enough; TGP, VRAM, CPU, cooling, display, RAM, storage and evidence quality matter when known.

## Decision architecture

`NormalizedPC -> use-case requirements -> hard constraints -> market value -> confidence -> scores -> decision -> frozen ranking -> monetization metadata`

Known critical failures cannot be hidden by a high average score. Missing critical evidence produces `insufficient_data`. Affiliate commission and own-stock status are not accepted by ranking functions.

## Merchant URL and market collection

URL inspection combines generic Product JSON-LD/OpenGraph extraction with merchant-specific adapters for the current priority Japanese retail/marketplace set. Merchant-specific product scopes are used to reduce contamination from recommendation widgets or related-product blocks. Unknown values remain unknown rather than being filled from UI samples or inferred from product positioning.

D1-backed collector sources can refresh neutral offers and trusted market observations on the Worker schedule. Collector administration, safeguards, supported merchants and production setup are documented in `docs/COLLECTORS.md`.

## Development

```bash
npm install
npm run check
npm run dev
```

CI runs dependency audits, knowledge validation, D1 migration validation, reproducible knowledge-seed validation, TypeScript checks, unit/regression tests, the web build, and a Wrangler deploy dry-run. A separate visual-smoke workflow checks desktop/mobile rendering and horizontal overflow in the principal result/offer states.

## Main API

- `GET /api/v1/health`
- `GET /api/v1/catalog`
- `POST /api/v1/url/inspect`
- `POST /api/v1/evaluate`
- `POST /api/v1/replace`
- `POST /api/v1/sell`
- `POST /api/v1/events`
- `POST /api/v1/offers/recommend`
- `GET /api/v1/outbound/:offerId`

Protected operator routes include market/offer ingestion, collector administration, commercial configuration, conversion import and revenue metrics. See `docs/API.md` and `docs/COLLECTORS.md`.

## Production gate

Production provisioning is intentionally gated on real Cloudflare and Worker credentials. `.github/workflows/provision-production.yml` can resolve/create D1, apply migrations and the reproducible knowledge seed, deploy the Worker and verify health once the required GitHub Actions secrets are configured. Secret values are never stored in the repository.

CPU/GPU capability indices remain provisional until external/reproducible calibration evidence satisfies the repository knowledge-validation rules.

See `docs/` for the decision policy, data governance, security, collector operation and deployment requirements.
