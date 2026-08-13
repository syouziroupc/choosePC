import { ENGINE_VERSION, type EvaluationResult, type NormalizedPC, type UseCaseProfile } from "../../../packages/core/src/index";

export interface PersistenceEnv {
  DB?: D1Database;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

export async function persistEvaluation(args: {
  env: PersistenceEnv;
  sessionId: string | null;
  inputType: string;
  pc: NormalizedPC;
  profile: UseCaseProfile;
  result: EvaluationResult;
}): Promise<string | null> {
  const db = args.env.DB;
  if (!db) return null;
  const id = crypto.randomUUID();
  try {
    const run = db.prepare(`
      INSERT INTO evaluation_runs (
        id, session_id, input_type, category, normalized_pc_json, use_profile_json,
        hardware_score, fit_score, value_score, condition_score, longevity_score,
        risk_score, confidence_score, overall_score, decision, engine_version, knowledge_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      args.sessionId,
      args.inputType,
      args.pc.category,
      safeJson(args.pc),
      safeJson(args.profile),
      args.result.scores.hardware,
      args.result.scores.fit,
      args.result.scores.value,
      args.result.scores.condition,
      args.result.scores.longevity,
      args.result.scores.risk,
      args.result.scores.confidence,
      args.result.scores.overall,
      args.result.decision,
      args.result.engineVersion,
      args.result.knowledgeVersion,
    );

    const reasonStatements = args.result.reasonDetails.slice(0, 30).map((reason) => db.prepare(`
      INSERT OR IGNORE INTO evaluation_reasons (evaluation_id, code, severity, details_json)
      VALUES (?, ?, ?, ?)
    `).bind(id, reason.code, reason.kind, safeJson(reason)));

    await db.batch([run, ...reasonStatements]);
    return id;
  } catch (error) {
    console.error(JSON.stringify({ event: "persistence_error", operation: "evaluation", error: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

export async function persistAnalytics(args: {
  env: PersistenceEnv;
  sessionId: string | null;
  evaluationId?: string | null;
  eventName: string;
  category?: string | null;
  dimensions?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const db = args.env.DB;
  if (!db) return;
  try {
    await db.prepare(`
      INSERT INTO analytics_events (id, session_id, evaluation_id, event_name, category, dimensions_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      args.sessionId,
      args.evaluationId ?? null,
      args.eventName,
      args.category ?? null,
      safeJson(args.dimensions ?? {}),
    ).run();
  } catch (error) {
    console.error(JSON.stringify({ event: "persistence_error", operation: "analytics", error: error instanceof Error ? error.message : String(error) }));
  }
}

export async function persistRecommendation(args: {
  env: PersistenceEnv;
  sessionId: string | null;
  profile: UseCaseProfile;
  ranked: Array<{ candidateId: string; rank: number; decision: string; overall: number; fit: number; value: number; confidence: number }>;
  engineVersion: string;
  knowledgeVersion: string;
}): Promise<void> {
  const db = args.env.DB;
  if (!db) return;
  try {
    await db.prepare(`
      INSERT INTO recommendation_runs (id, session_id, usecase_json, ranked_candidates_json, engine_version, knowledge_version)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      args.sessionId,
      safeJson(args.profile),
      safeJson(args.ranked),
      ENGINE_VERSION,
      args.knowledgeVersion,
    ).run();
  } catch (error) {
    console.error(JSON.stringify({ event: "persistence_error", operation: "recommendation", error: error instanceof Error ? error.message : String(error) }));
  }
}
