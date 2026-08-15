import app from "./browser-enhanced-entry";

interface Env {
  ASSETS: Fetcher;
  [key: string]: unknown;
}

type AppFetch = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
const appFetch = app.fetch as unknown as AppFetch;
const SERVICE_PREFIX = "/pc-check";

function cloneWithPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

function stripServicePrefix(pathname: string): string {
  const stripped = pathname.slice(SERVICE_PREFIX.length);
  return stripped || "/";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === SERVICE_PREFIX) {
      url.pathname = `${SERVICE_PREFIX}/`;
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname.startsWith(`${SERVICE_PREFIX}/api/`)) {
      return appFetch(cloneWithPath(request, stripServicePrefix(url.pathname)), env, ctx);
    }

    if (url.pathname.startsWith("/api/")) {
      return appFetch(request, env, ctx);
    }

    if (url.pathname.startsWith(`${SERVICE_PREFIX}/`)) {
      return env.ASSETS.fetch(cloneWithPath(request, stripServicePrefix(url.pathname)));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
