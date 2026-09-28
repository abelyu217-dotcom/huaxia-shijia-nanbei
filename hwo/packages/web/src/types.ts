/**
 * HWO Web 前端 API 契约类型
 *
 * 对接后端 REST API：
 *   GET  /api/teams          → TeamRoster[]
 *   GET  /api/teams/:id      → TeamDetail（球员详细能力值 + ovr）
 *   GET  /api/tactics        → TacticPreset[]（20 个战术预设）
 *   POST /api/sim/match      → SimOutput
 *
 * 复用 @hwo/shared 中与 API 契约一致的子结构（Position / Abilities /
 * PbpEvent / PlayerStat / TeamStat / BoxScore / MatchResult）；
 * 其余与 API 文档对齐的形状在此本地定义。
 */

import type {
  Abilities,
  Position,
  PbpEvent,
  BoxScore,
  MatchResult,
} from "@hwo/shared";

/** 统一从 ./types 导出 shared 中与 API 契约一致的类型，便于组件单一来源导入。 */
export type {
  Position,
  Abilities,
  PbpEvent,
  PlayerStat,
  TeamStat,
  BoxScore,
  MatchResult,
} from "@hwo/shared";

// ── 球队列表（GET /api/teams）──
export interface RosterPlayer {
  id: string;
  name: string;
  position: Position;
  ovr: number;
}

export interface TeamRoster {
  id: string;
  name: string;
  players: RosterPlayer[];
}

// ── 球队详情（GET /api/teams/:id）──
export interface PlayerDetail {
  id: string;
  name: string;
  position: Position;
  ovr: number;
  abilities: Abilities;
}

export interface TeamDetail {
  id: string;
  name: string;
  players: PlayerDetail[];
}

// ── 战术预设（GET /api/tactics）──
export type TacticCategory = "off" | "def" | "mix" | "spec";
export type TacticTempo = "slow" | "mid" | "fast" | "ultra_fast";
export type OffenseTendency = "outside" | "balanced" | "inside";
export type DefenseTendency = "press" | "balanced" | "pack";

export interface TacticPreset {
  id: string;
  name: string;
  nameEn: string;
  category: TacticCategory;
  tempo: TacticTempo;
  offenseTendency: OffenseTendency;
  defenseTendency: DefenseTendency;
  desc: string;
}

// ── 比赛模拟（POST /api/sim/match）──
export interface SimMatchRequest {
  homeTeamId: string;
  awayTeamId: string;
  homeTacticId: string;
  awayTacticId: string;
  seed?: number;
}

/**
 * 比赛模拟输出。与 @hwo/shared 的 SimOutput 一致，但 API 契约不含 rngLog，
 * 故在此显式定义，避免类型声称存在运行时未返回的字段。
 */
export interface SimOutput {
  pbp: PbpEvent[];
  boxScore: BoxScore;
  result: MatchResult;
  seed: number;
}
