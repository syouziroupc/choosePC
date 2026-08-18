# Static SZPC frontend / choosePC API boundary

## Purpose

choosePC does not own the public `www.szpc.jp` user interface. The public diagnostic experience belongs to SZPC static pages, while the Worker provides API functions and an internal operations surface.

The intended split is:

- `www.szpc.jp`: static public pages and the future `便利ツール` UI.
- `choosepc.<account>.workers.dev`: JSON API, outbound redirect service, and the Operations Console for administration and verification.
- Later, the public API transport may move to `api.szpc.jp` without changing API paths or the public SZPC presentation.

This removes the previous dependency on Worker routes such as `/pc-check/*` and keeps SZPC page deployment independent from choosePC backend deployment.

## Operations Console

The Worker root (`https://choosepc.syouziroupc.workers.dev/`) is reserved for operations and development verification, not for end-user diagnosis.

The console provides:

- API health and deployed API version.
- D1 readiness.
- API request counts for today, 7 days and 30 days.
- Per-endpoint request counts.
- Commercial/affiliate program status.
- Offer-to-destination attribution links.
- 30-day outbound, affiliate click, conversion and commission summaries.
- A protected editor for commercial programs and attribution links.
- A same-origin API tester for health, catalog, recommendation, evaluation and URL-inspection routes.

The console HTML and static shell are intentionally reachable, but operational data and writes require `COMMERCIAL_ADMIN_TOKEN`. The token is never embedded in source or HTML and the console keeps an entered token only in `sessionStorage`, not persistent browser storage.

A future move to a custom operations hostname should preferably place Cloudflare Access in front of the console. The application itself must still keep its authorization checks; network or identity-proxy configuration is not a substitute for server-side authorization.

## Public API base

Current deployment target:

```text
https://choosepc.syouziroupc.workers.dev/api/v1
```

Do not hard-code this URL throughout the frontend. Define it once, for example:

```js
const CHOOSEPC_API_BASE = "https://choosepc.syouziroupc.workers.dev/api/v1";
```

A later migration to `https://api.szpc.jp/api/v1` should require changing only this value.

## Browser access policy

Public API responses allow CORS only from:

- `https://www.szpc.jp`
- `https://szpc.jp`
- localhost / 127.0.0.1 during development

The Worker does not use wildcard CORS.

Public browser requests may send:

```text
Content-Type: application/json
X-ChoosePC-Client: <stable browser UUID>
```

The static frontend should create the client ID once and keep it in local storage. It is not an authentication credential; it provides stable anonymous continuity for rate limiting and analytics without relying on third-party cookies.

Example:

```js
const CLIENT_STORAGE_KEY = "choosepc_client_id";

function choosePcClientId() {
  let value = localStorage.getItem(CLIENT_STORAGE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(CLIENT_STORAGE_KEY, value);
  }
  return value;
}

async function choosePcFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-ChoosePC-Client", choosePcClientId());
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  return fetch(`${CHOOSEPC_API_BASE}${path}`, {
    ...init,
    headers,
  });
}
```

Do not use `credentials: "include"`. Cross-site cookies are deliberately not part of this API contract.

## Discovery / health

`GET /api/v1` returns machine-readable API metadata. The Worker root returns the Operations Console.

`GET /api/v1/health` reports backend status and includes:

- API mode/version.
- Whether the persistence binding is configured.
- A marker that the public SZPC UI is not hosted by the Worker.

The frontend should treat `persistenceConfigured: false` as a degraded backend state. Catalog/evaluation functions that do not need D1 may still work, but stored market data, offer inventory, commercial attribution, affiliate links, request metrics and revenue persistence cannot be considered operational.

## API usage metrics

Public `/api/v1/*` responses are counted in D1 after the response path completes. Metrics are aggregated by UTC day, normalized path, method and response status. High-cardinality outbound offer identifiers are collapsed to `/api/v1/outbound/:offerId` before storage.

Metrics are operational telemetry only. They are not used as ranking signals and therefore cannot influence purchase recommendations.

## Main public routes

Existing public routes remain under `/api/v1`:

- `GET /health`
- `GET /catalog`
- `POST /url/inspect`
- `POST /evaluate`
- `POST /replace`
- `POST /sell`
- `POST /market/estimate`
- `POST /market/lookup`
- `POST /recommend`
- `POST /offers/recommend`
- `POST /events`
- `GET /outbound/:offerId`

Internal administration routes remain `/api/internal/*` and are not given browser CORS access. The Operations Console is same-origin with the Worker and sends a bearer token for protected internal requests.

## Outbound / affiliate links

`commercialOffers[].outboundPath` is an API-relative path. The static frontend must resolve it against the Worker origin, not against `www.szpc.jp`.

Example:

```js
const API_ORIGIN = new URL(CHOOSEPC_API_BASE).origin;
const outboundUrl = new URL(offer.outboundPath, API_ORIGIN).toString();
```

The outbound endpoint remains responsible for click persistence and the final redirect. Affiliate/own/normal commercial metadata is attached only after neutral ranking. Commercial program metadata must never be used by the neutral ranking engine as a scoring factor.

## D1 requirement

The repository configuration may temporarily have no D1 `DB` binding until production provisioning succeeds. Therefore code paths that require `env.DB` cannot be declared production-ready merely because their TypeScript implementation exists.

Before affiliate/offers/market persistence and Operations Console metrics are enabled in production, Cloudflare must provide a D1 binding named exactly:

```text
DB
```

The migrations in `/migrations` must then be applied to that database. Do not insert a guessed database ID into `wrangler.jsonc`.

## Frontend integration rule

The future `www.szpc.jp` convenience-tool page owns all public presentation, typography, navigation, accessibility and responsive behavior. The choosePC repository must not re-create SZPC chrome or ship a second public design system.

The API returns facts, scores, evidence, decisions and commercial destinations. The static SZPC page decides how those facts are presented. The workers.dev Operations Console is a separate internal-purpose interface and must not be linked as the public diagnostic experience.
