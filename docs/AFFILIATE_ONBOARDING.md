# Affiliate onboarding runbook

choosePC keeps commercial configuration strictly downstream of neutral ranking. Joining or leaving an affiliate program must never change evaluation scores, offer ranks, or evidence confidence.

## Current safe state

- Zero affiliate programs is a valid production state.
- Offers without an active commercial program use their ordinary HTTPS product URL and `merchantType: normal`.
- An affiliate program affects presentation only when it is stored with `programType: affiliate`, `status: active`, a non-empty disclosure, and at least one valid offer mapping.
- Commission metadata is stored only in the commercial tables and is not accepted by offer-ingestion or ranking inputs.

## When a program is approved

1. Keep the program inactive until the provider has actually approved the account.
2. In the operations console, create or update a commercial program with:
   - a stable management key, for example `amazon-associates-jp`;
   - the merchant name exactly matching the ingested offer merchant;
   - `programType: affiliate`;
   - `status: paused` while preparing links;
   - the provider/program information page in `sourceUrl`;
   - a Japanese disclosure suitable for the public frontend;
   - optional non-secret commission metadata for reporting only;
   - optional `clickRefParam` only when the provider explicitly allows a click/sub ID parameter.
3. Map only offers belonging to the same merchant. Each mapping stores a complete provider-approved HTTPS destination URL. Existing mappings not present in the saved list are removed atomically.
4. Test outbound redirects while the program remains paused. Paused programs fall back to normal product URLs.
5. After verifying terms, destination URLs, disclosure, and tracking behavior, set `status: active`.
6. If the provider supplies conversion reports or callbacks, import normalized conversion records through the protected conversion endpoint. Never expose provider credentials to browser JavaScript.

## Secrets policy

Passwords, API keys, private affiliate credentials, and admin tokens must never be stored in D1, source files, static frontend JavaScript, GitHub commits, or commercial metadata. Runtime credentials belong in Cloudflare Worker Secrets. The D1 commercial tables may store public tracking identifiers or already-issued destination URLs when those values are intended to appear in outbound links.

## Required production bindings and secrets

- D1 binding: `DB` -> `choosepc-production`
- `COMMERCIAL_ADMIN_TOKEN`: operations console and revenue/admin APIs
- `OFFER_INGEST_TOKEN`: trusted offer/collector administration
- `CONVERSION_IMPORT_TOKEN`: conversion import
- `MARKET_INGEST_TOKEN`: protected market-data ingestion path

## Invariants

- No affiliate account means no affiliate program is activated.
- No active mapping means no affiliate redirect is emitted.
- Updating a program replaces its complete mapping set in one D1 batch so stale links cannot survive.
- A merchant mismatch is rejected before commercial data is written.
- Public ranking accepts no commission, affiliate URL, program ID, or destination URL fields.
- All public destinations must be HTTPS and cannot contain embedded credentials.
- Commercial disclosure is mandatory for active non-normal programs.
