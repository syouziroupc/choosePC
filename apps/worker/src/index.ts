export interface Env {
  DB: D1Database;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/v1/health") {
      const db = await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: db?.ok === 1 });
    }

    if (url.pathname === "/api/v1/evaluate" && request.method === "POST") {
      return json({
        error: "NOT_IMPLEMENTED",
        message: "Evaluation endpoint scaffolded; domain engine wiring is pending.",
      }, 501);
    }

    return json({ error: "NOT_FOUND" }, 404);
  },
};
