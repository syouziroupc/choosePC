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

## Development

```bash
npm install
npm run check
npm run dev
```

CI runs knowledge validation, TypeScript checks, unit/regression tests, the web build, and a Wrangler deploy dry-run.

## Main API

- `GET /api/v1/health`
- `GET /api/v1/catalog`
- `POST /api/v1/url/inspect`
- `POST /api/v1/evaluate`
- `POST /api/v1/replace`
- `POST /api/v1/sell`
- `POST /api/v1/events`

See `docs/` for the decision policy, data governance, security and deployment requirements.
