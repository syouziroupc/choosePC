import { describe, expect, it } from "vitest";
import worker from "../src/production-entry";

const limiter = { async limit() { return { success: true }; } };

function executionContext() {
  const tasks: Promise<unknown>[] = [];
  return {
    tasks,
    context: {
      waitUntil(task: Promise<unknown>) { tasks.push(task); },
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext,
  };
}

describe("collector production boundaries", () => {
  it("hides collector status from unauthenticated requests", async () => {
    const { context } = executionContext();
    const response = await worker.fetch(
      new Request("https://example.test/api/internal/collectors/status"),
      { URL_INSPECT_LIMITER: limiter as never, OFFER_INGEST_TOKEN: "collector-secret" },
      context,
    );
    expect(response.status).toBe(404);
  });

  it("reports unavailable DB only after successful collector authentication", async () => {
    const { context } = executionContext();
    const response = await worker.fetch(
      new Request("https://example.test/api/internal/collectors/status", {
        headers: { authorization: "Bearer collector-secret" },
      }),
      { URL_INSPECT_LIMITER: limiter as never, OFFER_INGEST_TOKEN: "collector-secret" },
      context,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "COLLECTOR_DB_UNAVAILABLE" });
  });

  it("rejects invalid source registration before any D1 mutation", async () => {
    let prepared = false;
    const db = {
      prepare() {
        prepared = true;
        throw new Error("DB_SHOULD_NOT_BE_USED");
      },
    };
    const { context } = executionContext();
    const response = await worker.fetch(
      new Request("https://example.test/api/internal/collectors/source", {
        method: "POST",
        headers: {
          authorization: "Bearer collector-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          source: {
            productUrl: "https://example.test/not-supported",
            mode: "both",
            category: "general_laptop",
            conditionType: "new",
          },
        }),
      }),
      { DB: db as never, URL_INSPECT_LIMITER: limiter as never, OFFER_INGEST_TOKEN: "collector-secret" },
      context,
    );
    expect(response.status).toBe(400);
    expect(prepared).toBe(false);
  });

  it("allows the scheduled handler to no-op safely when D1 is not bound", async () => {
    const { context, tasks } = executionContext();
    await worker.scheduled?.(
      { cron: "0 * * * *", scheduledTime: Date.now(), noRetry() {} } as unknown as ScheduledController,
      { URL_INSPECT_LIMITER: limiter as never },
      context,
    );
    expect(tasks).toHaveLength(1);
    await expect(Promise.all(tasks)).resolves.toBeDefined();
  });
});
