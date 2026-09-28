/**
 * HWO Web 前端 API 契约类型
 *
 * 对接后端 REST API：
 *   GET  /api/teams          → TeamRoster[]
 *   GET  /api/teams/:id      → TeamDetail（球员详细能力值 + ovr）
 *   GET  /api/tactics        → TacticPreset[]（20 个战术预设）
 *   POST /api/sim/match      → SimOutput
 *
 * Position / Abilities 复用 @hwo/shared；PbpEvent / PlayerStat / TeamStat /
 * SimOutput 在本地定义，与后端 @hwo/shared 对齐（PbpEvent.type 用 string
 * 保持宽松；SimOutput 含 quarterScores 逐节比分）。
 */

import type { Position, Abilities, MatchResult } from "@hwo/shared";

/** 统一从 ./types 导出 shared 中与 API 契约一致的类型，便于组件单一来源导入。 */
export type {
  Position,
  Abilities,
  BoxScore,
  MatchResult,
} from "@hwo/shared";

// ── PBP 事件（type 用 string 保持宽松，与 @hwo/shared 对齐）──
export interface PbpEvent {
  quarter: number;
  clock: string;
  scoreHome: number;
  scoreAway: number;
  type: string;
  actorId?: string;
  assistId?: string;
  teamId?: string;
  /** 篮板类型：off=进攻篮板, def=防守篮板（仅篮板事件有值） */
  reboundType?: "off" | "def";
  /** 罚球是否命中（仅罚球事件有值） */
  made?: boolean;
  desc: string;
}

// ── 单球员技术统计 ──
export interface PlayerStat {
  playerId: string;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutes: number;
  plusMinus: number;
}

// ── 球队技术统计 ──
export interface TeamStat {
  teamId: string;
  score: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  players: PlayerStat[];
}

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
 * 比赛模拟输出。与 @hwo/shared 的 SimOutput 对齐，但 API 契约不含 rngLog，
 * 故在此显式定义，避免类型声称存在运行时未返回的字段。新增 quarterScores
 * 逐节比分（home[i]/away[i] 为第 i+1 节得分）。
 */
export interface SimOutput {
  pbp: PbpEvent[];
  boxScore: { home: TeamStat; away: TeamStat };
  result: MatchResult;
  quarterScores: { home: number[]; away: number[] };
  seed: number;
}
