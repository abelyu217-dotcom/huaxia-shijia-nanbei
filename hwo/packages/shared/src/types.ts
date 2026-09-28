/**
 * HWO 核心类型定义
 *
 * 前后端共享。一个 Player 类型定义在此处，前端后端共用——
 * 这是 TypeScript 全栈的核心收益（技术架构文档 §1）。
 *
 * 参见：比赛模拟引擎系统设计、技术架构文档 §3.2
 */

/** 球场位置 */
export type Position = "PG" | "SG" | "SF" | "PF" | "C";

/** 球员能力值（0-99）。参见 比赛模拟引擎 §能力映射 */
export interface Abilities {
  // 进攻
  three: number;        // 三分
  midrange: number;     // 中投
  inside: number;       // 内线
  drive: number;        // 突破
  postup: number;       // 低位
  passing: number;      // 传球
  ballHandle: number;   // 控球
  // 防守
  perimeterD: number;   // 外线防守
  interiorD: number;    // 内线防守
  steal: number;        // 抢断
  block: number;        // 盖帽
  // 身体
  speed: number;        // 速度
  strength: number;     // 力量
  jumping: number;      // 弹跳
  stamina: number;      // 体能
  // 精神
  iq: number;           // 球商
  clutch: number;       // 关键球
}

/** 球员状态（实时，比赛进行中变化） */
export interface PlayerCondition {
  fatigue: number;      // 0=满血, 1=力竭
  foulTrouble: number;  // 当前犯规数
  hot: number;          // 手感热度 0-1
}

/** 球员 */
export interface Player {
  id: string;
  name: string;
  position: Position;
  abilities: Abilities;
  condition: PlayerCondition;
  /** 显性特质 ID 列表（特质觉醒系统 §5） */
  traits: string[];
}

/** 战术参数修正集（战术系统 §参数注入） */
export interface TacticModSet {
  teamId: string;
  /** 进攻倾向修正 */
  tendencyMod: {
    three: number;
    midrange: number;
    inside: number;
    drive: number;
    postup: number;
  };
  /** 快攻概率加成 */
  fastBreakChance: number;
  /** 挡拆概率加成 */
  pickRollChance: number;
  /** 防守干扰强度 */
  defenseContest: number;
  /** 协防概率 */
  helpDefChance: number;
  /** 抢断倾向 */
  stealChance: number;
  /** 单回合时间偏移（秒） */
  possessionTimeDelta: number;
}

/** 阵容轮换：5 名首发 + 上场时间分配 */
export interface Lineup {
  starters: string[];   // 5 个 player id
  /** 每个位置的目标出场时间（分钟，0-48） */
  minutes: Record<string, number>;
}

/** 球队 */
export interface Team {
  id: string;
  name: string;
  players: Player[];
  lineup: Lineup;
  tactic: TacticModSet;
  /** 球队化学反应 0-100 */
  chemistry: number;
}

/** 对阵 */
export interface Matchup {
  homeTeam: Team;
  awayTeam: Team;
}

/** 比赛配置（灰度参数，可热更新） */
export interface SimConfig {
  /** 单节时长（秒，默认 12 分钟 = 720 秒，sim 压缩为回合数） */
  quarterLength: number;
  /** 每节回合数（sim 用回合数而非真实秒数） */
  possessionsPerQuarter: number;
  /** 主场优势加成（能力值加成） */
  homeAdvantage: number;
  /** 默认单回合时间（秒） */
  basePossessionTime: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  quarterLength: 720,
  possessionsPerQuarter: 25,
  homeAdvantage: 3,
  basePossessionTime: 14,
};

/** sim 输入——纯函数入参 */
export interface SimInput {
  matchup: Matchup;
  seed: number;
  config: SimConfig;
}

/** PBP 事件类型 */
export type PbpEventType =
  | "shot_made"
  | "shot_miss"
  | "three_made"
  | "three_miss"
  | "free_throw"
  | "rebound"
  | "turnover"
  | "steal"
  | "block"
  | "foul"
  | "period_start"
  | "period_end"
  | "game_end";

/** PBP 事件（回合级） */
export interface PbpEvent {
  quarter: number;
  clock: string;          // 剩余时间 mm:ss
  scoreHome: number;
  scoreAway: number;
  type: PbpEventType;
  actorId?: string;       // 主要执行者
  assistId?: string;      // 助攻者
  teamId?: string;        // 所属球队
  desc: string;           // 叙事文本
}

/** 单球员技术统计 */
export interface PlayerStat {
  playerId: string;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  fta: number;
  ftm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutes: number;
}

/** 球队技术统计 */
export interface TeamStat {
  teamId: string;
  score: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  fta: number;
  ftm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  players: PlayerStat[];
}

/** Box Score */
export interface BoxScore {
  home: TeamStat;
  away: TeamStat;
}

/** 比赛结果 */
export interface MatchResult {
  homeScore: number;
  awayScore: number;
  winnerId: string;
  loserId: string;
  isClutch: boolean;
}

/** RNG 审计日志条目 */
export interface RngLogEntry {
  label: string;
  value: number;
}

/** sim 输出——纯函数产出 */
export interface SimOutput {
  pbp: PbpEvent[];
  boxScore: BoxScore;
  result: MatchResult;
  rngLog: RngLogEntry[];
  seed: number;
}
