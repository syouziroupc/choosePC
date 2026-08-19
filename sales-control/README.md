# SZPC ChatGPT sales control bus v43

This branch is only a minimal command transport for the private sales D1 system. It is intentionally public so the Cloudflare Worker can read it without GitHub tokens or GitHub Actions.

## Privacy rule

Never put any of the following in this branch:

- company names
- email addresses
- phone numbers
- addresses
- sales email subjects or bodies
- web research notes
- Gmail content
- customer or lead personal data

Allowed metadata is limited to:

- opaque `command_id` / `batch_id`
- private D1 `company_id`
- review enums such as `CONFIRMED`, `ALLOWED`, `MATCH`
- SHA-256 fingerprints of the verified normalized email and exact sales copy
- Gmail message ID after a real send
- generic suppression reason codes

The identifiers are operational metadata only. Detailed candidate data and processing results are returned to the private company Gmail mailbox by the Worker.

## Flow

1. ChatGPT writes a `STATE_REQUEST` or `TARGET_REQUEST` to `sales-control/command.json`.
2. The private Worker reads the fixed raw URL and sends detailed state to the private Gmail mailbox.
3. ChatGPT checks Gmail history and official web sources and creates the exact sales copy.
4. ChatGPT writes `PREPARE_SEND` using only `company_id` and SHA-256 fingerprints.
5. The Worker rechecks the live sendable population, claims the recipient, and atomically changes `APPROVED -> INFLIGHT` only when the current row is still sendable.
6. Only after the private `SEND_RESERVED` result does ChatGPT send the real sales email through Gmail.
7. ChatGPT writes `SENT` with the real Gmail message ID. The Worker records outreach history and updates the live counts.
8. If Gmail confirms that no send occurred, ChatGPT may use `CANCEL_SEND`. An ambiguous send is never released or retried merely to find out what happened.

The Worker does not autonomously research, approve, compose, or send external sales email.
