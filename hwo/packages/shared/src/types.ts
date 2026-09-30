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

/** 球员状态等级（#13 状态色体系） */
export type PlayerStatus = "peak" | "good" | "tired" | "exhausted";

/** 球员 */
export interface Player {
  id: string;
  name: string;
  position: Position;
  abilities: Abilities;
  condition: PlayerCondition;
  /** 显性特质 ID 列表（特质觉醒系统 §5） */
  traits: string[];
  /** M4: 进攻原型（影响 sim 行为权重，借鉴 JBL Po Archetype） */
  archetype?: PlayerArchetype;
  /** M4: 防守角色（影响对位防守） */
  gameRole?: DefensiveRole;
  /** 年薪（单位：万元）。来自 DB Player.salary，seed/世界生成/选秀/青训时写入 */
  salary?: number;
  /** 状态等级（#13）：基于 fatigue 计算，peak/good/tired/exhausted */
  status?: PlayerStatus;
  /** 是否队长（#20）：由 Team.captainId 推导 */
  isCaptain?: boolean;
  /** 是否新秀（#20）：年龄 ≤ 22 或当季选秀 */
  isRookie?: boolean;
}

/** 球员进攻原型（借鉴 JBL Po Archetype） */
export type PlayerArchetype =
  | "post_scorer"      // 低位得分手
  | "shot_creator"     // 投篮创造者
  | "glue_guy"         // 万金油
  | "play_finisher"    // 终结者
  | "primary_ballhandler" // 主控
  | "secondary_creator"   // 副控
  | "three_d"          // 3D
  | "stretch_big"      // 空间型内线
  | "rim_runner"       // 顺下型
  | "slasher";         // 突破手

/** 防守角色（借鉴 JBL Game Role） */
export type DefensiveRole =
  | "anchor_big"       // 护框大个子
  | "mobile_big"       // 移动型内线
  | "helper"           // 协防者
  | "wing_stopper"     // 锋线锁
  | "chaser"           // 追防者
  | "point_of_attack"  // 持球点防守
  | "rim_protector";   // 篮筐保护者

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

  // ─── M4: 高级战术层（借鉴 JBL）───
  /** 节奏：faster 提早启动进攻，slower 拖慢 */
  pace?: "faster" | "balanced" | "slower";
  /** 进攻侧重：决定主攻方向 */
  offenseFocus?: "balanced" | "drive" | "outside" | "inside" | "bully" | "pnr";
  /** 球权分配：heliocentric 主控持球，egalitarian 均沾 */
  ballDistribution?: "natural" | "heliocentric" | "egalitarian";
  /** 进攻自由度：set_plays 跑战术，freelance 自由发挥 */
  offenseFreedom?: "set_plays" | "freelance";
  /** 进攻强调点（最多 2 个，每个带 +/- 权衡） */
  offenseEmphasis?: OffenseEmphasis[];
  /** 防守强度 */
  defenseIntensity?: "aggressive" | "balanced" | "conservative";
  /** 防守侧重 */
  defenseFocus?: "interior" | "balanced" | "perimeter";
  /** 后卫防挡拆方式 */
  screenDefGuards?: "over" | "under" | "switch";
  /** 大个子防挡拆方式 */
  screenDefBigs?: "drop" | "hedge" | "blitz";
  /** 防守强调点（最多 2 个） */
  defenseEmphasis?: DefenseEmphasis[];
  /** 教练标志性动作（提高这些 action 的触发权重） */
  signatureActions?: PlaybookAction[];
  /** 关键球执行者球员 id（clutch 时优先出手） */
  closerId?: string;
  /** 各战术选项的熟练度 0-100（低熟练度降效） */
  familiarity?: Partial<Record<string, number>>;
  /** Playbook action 加权分布（覆盖默认） */
  actionWeights?: Partial<Record<PlaybookAction, number>>;
  /** M4: 末节策略（领先/落后/焦灼时分别触发） */
  endGameStrategies?: EndGameStrategies;
}

// ─── M4: 末节策略 ───

/** 末节单策略类型 */
export type EndGameStrategy =
  | "normal"          // 正常战术
  | "milk_clock"      // 压时间（领先时）
  | "quick_three"     // 抢投三分（落后时）
  | "foul_strategy"   // 砍鲨/故意犯规（落后时）
  | "isolate_star"    // 球星单打（焦灼时）
  | "double_team";    // 包夹对方球星（防守端）

/** 末节策略配置：按比分情境分别设置 */
export interface EndGameStrategies {
  /** 领先时（分差 > 5）策略 */
  leading?: EndGameStrategy;
  /** 落后时（分差 < -5）策略 */
  trailing?: EndGameStrategy;
  /** 焦灼时（|分差| ≤ 5）策略 */
  close?: EndGameStrategy;
}

/** 进攻强调点（每个带明确 +/- 权衡，借鉴 JBL Emphasis Points） */
export type OffenseEmphasis =
  | "box_out"          // +前板 -退防
  | "early_threes"     // +转换三分 -出手质量
  | "get_to_rim"       // +筐下压力 -失误风险
  | "midrange_drops"   // +中投 -筐下压力
  | "protect_ball";    // +球权安全 -侵略性 -空位

/** 防守强调点 */
export type DefenseEmphasis =
  | "no_fouls"           // +犯规纪律 -禁区压力 -盖帽
  | "limit_fast_breaks"  // +防快攻 -live-ball 压迫 -前板
  | "force_turnovers"    // +抢断 +球压 -被过风险
  | "protect_rim"        // +护框 +盖帽 -底角三分
  | "limit_perimeter";   // +防三分 -禁区 traffic

/** Playbook action 类型（NBA Synergy 分类，借鉴 JBL） */
export type PlaybookAction =
  | "pnr_ball_handler"   // 挡拆持球
  | "pnr_roll_man"       // 挡拆顺下
  | "isolation"          // 单打
  | "post_up"            // 低位
  | "spot_up"            // 接球投
  | "hand_off"           // 手递手
  | "off_screen"         // 无球掩护
  | "cut"                // 空切
  | "transition"         // 快攻
  | "putback"            // 补篮
  | "second_chance";     // 二次进攻

/** 阵容轮换：5 名首发 + 上场时间分配 */
export interface Lineup {
  starters: string[];   // 5 个 player id
  /** 每个位置的目标出场时间（分钟，0-48） */
  minutes: Record<string, number>;
  /** M4: 轮换网格（每节细分时段槽指派球员；可选，无则回退到 fatigue 轮换） */
  rotation?: RotationGrid;
  /** M4: 条件阵容（按比分情境切换；按优先级从上到下匹配） */
  conditionalLineups?: ConditionalLineup[];
}

/** 轮换网格：4 节 × 每节 N 个时段槽，每槽指派 5 名在场球员 */
export interface RotationGrid {
  /** 每节的时段槽指派；quarters[q] = 该节的 slots 数组 */
  quarters: RotationSlot[][];
}

/** 单个轮换时段槽 */
export interface RotationSlot {
  /** 节次 1-4（加时复用第 4 节） */
  quarter: number;
  /** 该槽覆盖的回合范围 [start, end) */
  possessionStart: number;
  possessionEnd: number;
  /** 该槽在场 5 名球员 id */
  onCourt: string[];
}

/** 条件阵容触发情境 */
export type LineupCondition =
  | "blowout_up"    // 大比分领先（≥15）
  | "blowout_down"  // 大比分落后（≤-15）
  | "close_game"    // 焦灼（分差≤5）
  | "late_game"     // 末节最后 3 分钟
  | "default";

/** 条件阵容规则 */
export interface ConditionalLineup {
  /** 触发情境 */
  condition: LineupCondition;
  /** 该情境下的首发 5 人 */
  starters: string[];
  /** 优先级（数字越小越先匹配，默认按数组顺序） */
  priority?: number;
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
  /** 队长 ID（#20） */
  captainId?: string | null;
  /** M5 §6.3：关联用户 ID（用于埋点 + 留存分析，AI 球队为 null） */
  userId?: string | null;
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
  /** 篮板类型：off=进攻篮板, def=防守篮板（仅 type=rebound 时有值） */
  reboundType?: "off" | "def";
  /** 罚球是否命中（仅 type=free_throw 时有值） */
  made?: boolean;
  /** M4: 本回合进攻动作类型（Synergy 分类标签，投篮事件携带） */
  playAction?: PlaybookAction;
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
  offReb: number;     // 进攻篮板
  defReb: number;     // 防守篮板
  rebounds: number;   // 总篮板
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutes: number;
  plusMinus: number;  // 正负值：在场期间球队净分
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
  /** 逐节比分：home[i]/away[i] 为第 i+1 节得分 */
  quarterScores: { home: number[]; away: number[] };
  rngLog: RngLogEntry[];
  seed: number;
}
