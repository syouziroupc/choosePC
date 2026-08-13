import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, KNOWLEDGE_VERSION } from "../../../packages/core/src/index";
import { persistRecommendation } from "../src/persistence";

describe("recommendation persistence version provenance", () => {
  it("stores active engine and knowledge versions even when stale caller versions are supplied", async () => {
    const statements: Array<{ sql: string; args: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            statements.push({ sql, args });
            return {
              async run() { return { success: true }; },
            };
          },
        };
      },
    };

    await persistRecommendation({
      env: { DB: db as never },
      sessionId: "session-1",
      profile: { id: "office", name: "Office", requirements: [] },
      ranked: [],
      engineVersion: "0.2.0",
      knowledgeVersion: "stale-knowledge",
    });

    const insert = statements.find((statement) => /INSERT INTO recommendation_runs/i.test(statement.sql));
    expect(insert).toBeTruthy();
    expect(insert!.args[4]).toBe(ENGINE_VERSION);
    expect(insert!.args[5]).toBe(KNOWLEDGE_VERSION);
  });
});
