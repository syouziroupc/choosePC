# SZPC ChatGPT sales control bus

This branch is a minimal public command transport for the private sales D1 system.

Rules:

- Never place company names, email addresses, phone numbers, addresses, email bodies, web research notes, or other customer/lead data here.
- `command.json` contains only an opaque command ID, D1 company ID, boolean review outcomes, and a Gmail message ID after a real send.
- The private Cloudflare Worker reads this fixed repository / branch / path over HTTPS and applies the command idempotently.
- Detailed candidate state is returned only to the private Gmail mailbox by the Worker.
- Actual sales email is composed, checked, and sent by ChatGPT through Gmail. The Worker never uses this branch to create or send sales copy.
