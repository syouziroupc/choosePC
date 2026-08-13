import type { UseCaseProfile } from "./types";

export const USE_CASES: Record<string, UseCaseProfile> = {
  office: { id: "office", name: "事務・Web・オンライン会議", requirements: [
    { metric: "cpuGeneral", minimum: 35, preferred: 55, weight: 0.28, essential: true, unknownPolicy: "block" },
    { metric: "cpuSingle", minimum: 35, preferred: 55, weight: 0.18, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 8, preferred: 16, weight: 0.26, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 128, preferred: 512, weight: 0.18, unknownPolicy: "warn" },
    { metric: "batteryHealthPct", minimum: 55, preferred: 80, weight: 0.10, unknownPolicy: "neutral" },
  ], mobilityWeight: 0.2, upgradeabilityWeight: 0.1 },
  student: { id: "student", name: "大学・学校", requirements: [
    { metric: "cpuGeneral", minimum: 40, preferred: 62, weight: 0.24, essential: true, unknownPolicy: "block" },
    { metric: "cpuSingle", minimum: 40, preferred: 62, weight: 0.16, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 8, preferred: 16, weight: 0.24, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 256, preferred: 512, weight: 0.16, unknownPolicy: "warn" },
    { metric: "batteryHealthPct", minimum: 60, preferred: 85, weight: 0.14, unknownPolicy: "warn" },
    { metric: "weightKg", minimum: 1.8, preferred: 1.2, weight: 0.06, unknownPolicy: "warn", direction: "lower_is_better" },
  ], mobilityWeight: 0.55, upgradeabilityWeight: 0.1 },
  programming: { id: "programming", name: "プログラミング", requirements: [
    { metric: "cpuGeneral", minimum: 45, preferred: 70, weight: 0.23, essential: true, unknownPolicy: "block" },
    { metric: "cpuSingle", minimum: 45, preferred: 72, weight: 0.18, essential: true, unknownPolicy: "block" },
    { metric: "cpuMulti", minimum: 40, preferred: 72, weight: 0.19, unknownPolicy: "warn" },
    { metric: "ramGb", minimum: 8, preferred: 16, weight: 0.25, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 256, preferred: 1024, weight: 0.15, unknownPolicy: "warn" },
  ], upgradeabilityWeight: 0.25 },
  gaming: { id: "gaming", name: "PCゲーム 1080p", requirements: [
    { metric: "cpuGaming", minimum: 50, preferred: 75, weight: 0.23, essential: true, unknownPolicy: "block" },
    { metric: "gpu1080", minimum: 45, preferred: 75, weight: 0.38, essential: true, unknownPolicy: "block" },
    { metric: "vramGb", minimum: 4, preferred: 8, weight: 0.12, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 16, preferred: 32, weight: 0.14, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.08, unknownPolicy: "warn" },
    { metric: "refreshHz", minimum: 60, preferred: 144, weight: 0.05, unknownPolicy: "neutral" },
  ], upgradeabilityWeight: 0.2 },
  video_editing: { id: "video_editing", name: "動画編集", requirements: [
    { metric: "cpuMulti", minimum: 50, preferred: 80, weight: 0.28, essential: true, unknownPolicy: "block" },
    { metric: "gpuCompute", minimum: 35, preferred: 70, weight: 0.22, unknownPolicy: "warn" },
    { metric: "vramGb", minimum: 4, preferred: 8, weight: 0.14, unknownPolicy: "warn" },
    { metric: "ramGb", minimum: 16, preferred: 32, weight: 0.22, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.14, unknownPolicy: "warn" },
  ], upgradeabilityWeight: 0.2 },
  creative: { id: "creative", name: "写真・デザイン・クリエイティブ", requirements: [
    { metric: "cpuSingle", minimum: 45, preferred: 72, weight: 0.21, essential: true, unknownPolicy: "block" },
    { metric: "cpuMulti", minimum: 40, preferred: 68, weight: 0.16, unknownPolicy: "warn" },
    { metric: "gpuCompute", minimum: 25, preferred: 58, weight: 0.16, unknownPolicy: "warn" },
    { metric: "ramGb", minimum: 16, preferred: 32, weight: 0.27, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.20, unknownPolicy: "warn" },
  ], upgradeabilityWeight: 0.15 },
  cad_3d: { id: "cad_3d", name: "CAD・3D", requirements: [
    { metric: "cpuSingle", minimum: 55, preferred: 80, weight: 0.20, essential: true, unknownPolicy: "block" },
    { metric: "cpuMulti", minimum: 50, preferred: 78, weight: 0.16, unknownPolicy: "warn" },
    { metric: "gpuCompute", minimum: 45, preferred: 76, weight: 0.26, essential: true, unknownPolicy: "block" },
    { metric: "vramGb", minimum: 4, preferred: 8, weight: 0.14, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 16, preferred: 32, weight: 0.16, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.08, unknownPolicy: "warn" },
  ], upgradeabilityWeight: 0.20 },
  business_mobile: { id: "business_mobile", name: "仕事・持ち運び", requirements: [
    { metric: "cpuGeneral", minimum: 42, preferred: 65, weight: 0.23, essential: true, unknownPolicy: "block" },
    { metric: "cpuSingle", minimum: 42, preferred: 65, weight: 0.16, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 8, preferred: 16, weight: 0.22, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 256, preferred: 512, weight: 0.14, unknownPolicy: "warn" },
    { metric: "batteryHealthPct", minimum: 65, preferred: 85, weight: 0.16, unknownPolicy: "warn" },
    { metric: "weightKg", minimum: 1.7, preferred: 1.15, weight: 0.09, unknownPolicy: "warn", direction: "lower_is_better" },
  ], mobilityWeight: 0.65, upgradeabilityWeight: 0.08 },
  local_ai: { id: "local_ai", name: "ローカル生成AI", requirements: [
    { metric: "gpuCompute", minimum: 50, preferred: 85, weight: 0.36, essential: true, unknownPolicy: "block" },
    { metric: "vramGb", minimum: 8, preferred: 16, weight: 0.29, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 16, preferred: 32, weight: 0.20, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.15, unknownPolicy: "warn" },
  ], upgradeabilityWeight: 0.25 },
};

export type GamingResolution = "1080p" | "1440p" | "4k";
export type GamingTargetFps = 60 | 120 | 144 | 240;

export function buildGamingProfile(resolution: GamingResolution = "1080p", targetFps: GamingTargetFps = 60): UseCaseProfile {
  const metric = resolution === "1080p" ? "gpu1080" : resolution === "1440p" ? "gpu1440" : "gpu4k";
  const baseMin = resolution === "1080p" ? 42 : resolution === "1440p" ? 50 : 62;
  const basePreferred = resolution === "1080p" ? 70 : resolution === "1440p" ? 76 : 84;
  const fpsLift = targetFps === 60 ? 0 : targetFps === 120 ? 7 : targetFps === 144 ? 10 : 17;
  const vramMin = resolution === "4k" ? 8 : resolution === "1440p" ? 6 : 4;
  const vramPreferred = resolution === "4k" ? 12 : 8;
  return { id: "gaming", name: `PCゲーム ${resolution} / ${targetFps}fps目標`, requirements: [
    { metric: "cpuGaming", minimum: Math.min(90, 48 + Math.round(fpsLift * 0.65)), preferred: Math.min(98, 72 + fpsLift), weight: 0.22, essential: true, unknownPolicy: "block" },
    { metric, minimum: Math.min(92, baseMin + fpsLift), preferred: Math.min(99, basePreferred + fpsLift), weight: 0.39, essential: true, unknownPolicy: "block" },
    { metric: "vramGb", minimum: vramMin, preferred: vramPreferred, weight: 0.13, essential: true, unknownPolicy: "block" },
    { metric: "ramGb", minimum: 16, preferred: targetFps >= 144 ? 32 : 16, weight: 0.13, essential: true, unknownPolicy: "block" },
    { metric: "storageGb", minimum: 512, preferred: 1024, weight: 0.08, unknownPolicy: "warn" },
    { metric: "refreshHz", minimum: Math.min(60, targetFps), preferred: targetFps, weight: 0.05, unknownPolicy: "neutral" },
  ], upgradeabilityWeight: 0.2 };
}
