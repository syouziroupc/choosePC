import type { PersistenceEnv } from "./persistence";

export const PRIMARY_AFFILIATE_NETWORK = {
  id: "a8",
  name: "A8.net",
  homepageUrl: "https://www.a8.net/",
  signupUrl: "https://media-console.a8.net/signup-mail-send?action=default",
} as const;

type AffiliateCountRow = {
  totalPrograms: number | null;
  activePrograms: number | null;
  pausedPrograms: number | null;
  mappedOffers: number | null;
  activeMappedOffers: number | null;
};

export interface AffiliateStatus {
  ok: true;
  network: {
    id: "a8";
    name: "A8.net";
    selected: true;
    homepageUrl: string;
    signupUrl: string;
  };
  persistenceConfigured: boolean;
  totalPrograms: number;
  activePrograms: number;
  pausedPrograms: number;
  mappedOffers: number;
  activeMappedOffers: number;
  readyForTraffic: boolean;
  state: "database-unavailable" | "awaiting-a8-program-link" | "ready";
  tracking: {
    clickReferenceParameters: readonly ["id1", "id2", "id3", "id4", "id5"];
    linkManager: "supported-programs-only";
    amazonRakutenParameterTracking: false;
    amazonRakutenLinkManager: false;
  };
}

export async function loadAffiliateStatus(env: PersistenceEnv): Promise<AffiliateStatus> {
  const db = env.DB;
  const base = {
    ok: true as const,
    network: {
      id: PRIMARY_AFFILIATE_NETWORK.id,
      name: PRIMARY_AFFILIATE_NETWORK.name,
      selected: true as const,
      homepageUrl: PRIMARY_AFFILIATE_NETWORK.homepageUrl,
      signupUrl: PRIMARY_AFFILIATE_NETWORK.signupUrl,
    },
    tracking: {
      clickReferenceParameters: ["id1", "id2", "id3", "id4", "id5"] as const,
      linkManager: "supported-programs-only" as const,
      amazonRakutenParameterTracking: false as const,
      amazonRakutenLinkManager: false as const,
    },
  };

  if (!db) {
    return {
      ...base,
      persistenceConfigured: false,
      totalPrograms: 0,
      activePrograms: 0,
      pausedPrograms: 0,
      mappedOffers: 0,
      activeMappedOffers: 0,
      readyForTraffic: false,
      state: "database-unavailable",
    };
  }

  const row = await db.prepare(`
    SELECT
      COALESCE((
        SELECT COUNT(*)
        FROM commercial_programs
        WHERE program_type = 'affiliate' AND affiliate_network = 'a8'
      ), 0) AS totalPrograms,
      COALESCE((
        SELECT COUNT(*)
        FROM commercial_programs
        WHERE program_type = 'affiliate' AND affiliate_network = 'a8' AND status = 'active'
      ), 0) AS activePrograms,
      COALESCE((
        SELECT COUNT(*)
        FROM commercial_programs
        WHERE program_type = 'affiliate' AND affiliate_network = 'a8' AND status = 'paused'
      ), 0) AS pausedPrograms,
      COALESCE((
        SELECT COUNT(DISTINCT al.offer_id)
        FROM attribution_links al
        JOIN commercial_programs cp ON cp.id = al.program_id
        WHERE cp.program_type = 'affiliate' AND cp.affiliate_network = 'a8'
      ), 0) AS mappedOffers,
      COALESCE((
        SELECT COUNT(DISTINCT al.offer_id)
        FROM attribution_links al
        JOIN commercial_programs cp ON cp.id = al.program_id
        WHERE cp.program_type = 'affiliate'
          AND cp.affiliate_network = 'a8'
          AND cp.status = 'active'
      ), 0) AS activeMappedOffers
  `).first<AffiliateCountRow>();

  const totalPrograms = Number(row?.totalPrograms ?? 0);
  const activePrograms = Number(row?.activePrograms ?? 0);
  const pausedPrograms = Number(row?.pausedPrograms ?? 0);
  const mappedOffers = Number(row?.mappedOffers ?? 0);
  const activeMappedOffers = Number(row?.activeMappedOffers ?? 0);
  const readyForTraffic = activePrograms > 0 && activeMappedOffers > 0;

  return {
    ...base,
    persistenceConfigured: true,
    totalPrograms,
    activePrograms,
    pausedPrograms,
    mappedOffers,
    activeMappedOffers,
    readyForTraffic,
    state: readyForTraffic ? "ready" : "awaiting-a8-program-link",
  };
}
