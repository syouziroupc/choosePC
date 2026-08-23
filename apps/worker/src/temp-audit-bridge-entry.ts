import base from "./api-entry";

type BaseEnv = Parameters<NonNullable<typeof base.fetch>>[1];
interface Env extends BaseEnv {
  SALES_SYSTEM: Fetcher;
}

const BRIDGE_PATH = "/__temp_sales_review_cipher_20260823";
const SALES_PATH = "/__ops/review-export-6c8856c0902865c72780d3e886c5d5c2b1e7";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === BRIDGE_PATH) {
      const downstream = new Request(`https://sales-system.internal${SALES_PATH}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          "x-internal-audit-bridge": "choosepc-temp-20260823",
        },
      });
      const response = await env.SALES_SYSTEM.fetch(downstream);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store");
      headers.set("x-robots-tag", "noindex, nofollow");
      headers.set("x-content-type-options", "nosniff");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return base.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
