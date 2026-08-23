import base from "./api-entry";

type BaseEnv = Parameters<NonNullable<typeof base.fetch>>[1];
interface Env extends BaseEnv {
  SALES_SYSTEM: Fetcher;
}

const CIPHER_BRIDGE = "/__temp_sales_review_cipher_20260823";
const APPLY_BRIDGE = "/__temp_sales_review_apply_20260823";
const STATUS_BRIDGE = "/__temp_sales_review_status_20260823";
const SALES_CIPHER = "/__ops/review-export-6c8856c0902865c72780d3e886c5d5c2b1e7";
const SALES_APPLY = "/__ops/manual100-apply-f82bd6d7b98c4fd9a3c520260823";
const SALES_STATUS = "/__ops/manual100-status-6a7e98f3d1e8406eac5d20260823";

async function forward(env:Env,path:string,method:"GET"|"POST") {
  const downstream = new Request(`https://sales-system.internal${path}`, {
    method,
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === CIPHER_BRIDGE) return forward(env,SALES_CIPHER,"GET");
    if (request.method === "POST" && url.pathname === APPLY_BRIDGE) return forward(env,SALES_APPLY,"POST");
    if (request.method === "GET" && url.pathname === STATUS_BRIDGE) return forward(env,SALES_STATUS,"GET");
    return base.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (base.scheduled) return base.scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
