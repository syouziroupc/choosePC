import { describe, expect, it } from "vitest";
import { loadAffiliateStatus } from "../src/affiliate-status";

function fakeDb(row: Record<string, number>) {
  return {
    prepare() {
      return {
        async first() { return row; },
      };
    },
  };
}

describe("A8 single-network affiliate status", () => {
  it("reports A8 as selected even before persistence is available", async () => {
    const status = await loadAffiliateStatus({});
    expect(status.network).toMatchObject({ id: "a8", name: "A8.net", selected: true });
    expect(status.persistenceConfigured).toBe(false);
    expect(status.readyForTraffic).toBe(false);
    expect(status.state).toBe("database-unavailable");
  });

  it("stays pending until an active A8 program has at least one mapped offer", async () => {
    const status = await loadAffiliateStatus({
      DB: fakeDb({ totalPrograms: 1, activePrograms: 0, pausedPrograms: 1, mappedOffers: 2, activeMappedOffers: 0 }) as never,
    });
    expect(status.persistenceConfigured).toBe(true);
    expect(status.totalPrograms).toBe(1);
    expect(status.pausedPrograms).toBe(1);
    expect(status.readyForTraffic).toBe(false);
    expect(status.state).toBe("awaiting-a8-program-link");
  });

  it("reports ready only when active A8 traffic can actually resolve", async () => {
    const status = await loadAffiliateStatus({
      DB: fakeDb({ totalPrograms: 2, activePrograms: 1, pausedPrograms: 1, mappedOffers: 3, activeMappedOffers: 2 }) as never,
    });
    expect(status.activePrograms).toBe(1);
    expect(status.activeMappedOffers).toBe(2);
    expect(status.readyForTraffic).toBe(true);
    expect(status.state).toBe("ready");
    expect(status.tracking.clickReferenceParameters).toEqual(["id1", "id2", "id3", "id4", "id5"]);
    expect(status.tracking.amazonRakutenParameterTracking).toBe(false);
  });
});
