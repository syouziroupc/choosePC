# Security v0.2

## URL inspection boundary

Remote product inspection is treated as untrusted input.

- HTTPS only.
- Explicit supported-domain allowlist.
- Embedded URL credentials rejected.
- Redirects are manual and every destination is revalidated.
- HTML content type required.
- Declared and streamed body size bounded.
- Remote text is product data only; it is never interpreted as an instruction to the system.
- Unsupported pages fall back to manual entry.

The allowlist makes arbitrary private-address SSRF unreachable through user-controlled hostnames in the first release. If generic arbitrary-domain inspection is introduced later, DNS/IP resolution and private/reserved-range blocking must be added before release.

## API

- JSON request body capped at 64 KiB.
- Numeric fields range-checked.
- Custom client scoring profiles are not accepted.
- Errors return stable safe codes; unexpected details remain server-side.
- No secrets are stored in repository configuration.

## Browser

Static asset headers set CSP, frame denial, nosniff, referrer policy and permissions policy.

## Cloudflare

`wrangler.jsonc` enables current compatibility date, `nodejs_compat`, static-asset SPA handling and observability. Secrets must be provided through GitHub/Cloudflare secret storage, never committed.
