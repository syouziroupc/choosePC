# Static SZPC frontend / choosePC API boundary

## Purpose

choosePC no longer needs to own the public `www.szpc.jp` route or render the SZPC user interface.

The intended split is:

- `www.szpc.jp`: static public pages and the future `便利ツール` UI.
- `choosepc.<account>.workers.dev`: JSON API and outbound redirect service only.
- Later, the API host may move to `api.szpc.jp` without changing the API paths.

This removes the previous dependency on Worker routes such as `/pc-check/*` and keeps SZPC page deployment independent from choosePC backend deployment.

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

The Worker root and `/api/v1` return API metadata instead of a web UI.

`GET /api/v1/health` reports backend status and includes:

- API mode/version
- whether the persistence binding is configured

The frontend should treat `persistenceConfigured: false` as a degraded backend state. Catalog/evaluation functions that do not need D1 may still work, but stored market data, offer inventory, commercial attribution, affiliate links and revenue persistence cannot be considered operational.

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

Internal administration routes remain `/api/internal/*` and are not given browser CORS access.

## Outbound / affiliate links

`commercialOffers[].outboundPath` is an API-relative path. The static frontend must resolve it against the Worker origin, not against `www.szpc.jp`.

Example:

```js
const API_ORIGIN = new URL(CHOOSEPC_API_BASE).origin;
const outboundUrl = new URL(offer.outboundPath, API_ORIGIN).toString();
```

The outbound endpoint remains responsible for click persistence and the final redirect. Affiliate/own/normal commercial metadata is attached only after neutral ranking.

## D1 requirement

The current repository configuration does not contain a D1 `DB` binding. Therefore the code paths that require `env.DB` cannot be declared production-ready merely because their TypeScript implementation exists.

Before affiliate/offers/market persistence is enabled in production, Cloudflare must provide a D1 binding named exactly:

```text
DB
```

The existing migrations in `/migrations` must then be applied to that database. Do not insert a guessed database ID into `wrangler.jsonc`.

## Frontend integration rule

The future `www.szpc.jp` convenience-tool page should own all presentation, typography, navigation, accessibility and responsive behavior. The choosePC repository should not re-create SZPC chrome or ship a second public design system.

The API should return facts, scores, evidence, decisions and commercial destinations. The static SZPC page decides how those facts are presented.
