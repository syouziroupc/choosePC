import app from "./entry";
import {
  attachClickReference,
  persistOutboundClick,
  resolveOutboundDestination,
} from "./commercial";
import type { PersistenceEnv } from "./persistence";

interface Env extends PersistenceEnv {
  URL_INSPECT_LIMITER: RateLimit;
  MARKET_INGEST_TOKEN?: string;
  OFFER_INGEST_TOKEN?: string;
  COMMERCIAL_ADMIN_TOKEN?: string;
  CONVERSION_IMPORT_TOKEN?: string;
}

const SESSION_COOKIE = "pc_assist_sid";

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return new Response(JSON.stringify(data), { status, headers });
}

function parseCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function getSession(request: Request): { id: string; setCookie?: string } {
  const existing = parseCookie(request, SESSION_COOKIE);
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) return { id: existing.toLowerCase() };
  const id = crypto.randomUUID().replace(/-/g, "");
  return {
    id,
    setCookie: `${SESSION_COOKIE}=${id}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
  };
}

function sessionHeaders(session: { setCookie?: string }): HeadersInit {
  return session.setCookie ? { "set-cookie": session.setCookie } : {};
}

function outboundOfferId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/v1\/outbound\/([^/]{1,160})$/);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    return /^[a-zA-Z0-9._:-]{1,80}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function handleOutbound(request: Request, env: Env, offerId: string): Promise<Response> {
  const session = getSession(request);
  const destination = await resolveOutboundDestination(env, offerId);
  if (!destination) return json({ error: "OFFER_NOT_AVAILABLE" }, 404, sessionHeaders(session));

  const clickId = crypto.randomUUID();
  const persisted = await persistOutboundClick({
    env,
    clickId,
    sessionId: session.id,
    destination,
  });
  const redirectUrl = persisted
    ? attachClickReference(destination.destinationUrl, destination.clickRefParam, clickId)
    : destination.destinationUrl;

  const headers = new Headers(sessionHeaders(session));
  headers.set("location", redirectUrl);
  headers.set("cache-control", "no-store");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const offerId = request.method === "GET" ? outboundOfferId(url.pathname) : null;
    if (offerId) return handleOutbound(request, env, offerId);
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
