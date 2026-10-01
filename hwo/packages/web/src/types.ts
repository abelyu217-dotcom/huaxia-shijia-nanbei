/**
 * HWO Web 前端 API 契约类型
 *
 * 对接后端 REST API：
 *   POST /api/auth/register        → AuthResult
 *   POST /api/auth/login           → AuthResult
 *   GET  /api/auth/me              → 当前用户信息
 *   GET  /api/teams                → TeamRoster[]
 *   GET  /api/teams/:id            → TeamDetail（球员详细能力值 + ovr）
 *   GET  /api/teams/:id/lineup     → LineupView
 *   PUT  /api/teams/:id/lineup     → LineupView（需 JWT）
 *   GET  /api/tactics              → TacticPreset[]（20 个战术预设）
 *   POST /api/sim/match            → SimOutput
 *   GET  /api/season               → SeasonInfo
 *   GET  /api/season/standings     → StandingRow[]
 *   GET  /api/season/schedule      → ScheduleDay[]
 *   POST /api/season/advance       → AdvanceResult（需 JWT）
 *   POST /api/season/generate      → { generated: number }（需 JWT）
 */

import type { Position, Abilities, MatchResult, FogValue } from "@hwo/shared";

/** 统一从 ./types 导出 shared 中与 API 契约一致的类型，便于组件单一来源导入。 */
export type {
  Position,
  Abilities,
  BoxScore,
  MatchResult,
  FogValue,
} from "@hwo/shared";

/** ScoutReport 直接从 shared 导出（球探报告） */
export type { ScoutReport } from "@hwo/shared";

/** 判断 ovr 是否为带雾估值 */
export function isFoggedOvr(ovr: number | FogValue): ovr is FogValue {
  return typeof ovr === "object" && ovr !== null;
}

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
  /** 当前场上主队 5 人 ID（用于直播同步场上阵容） */
  onCourtHome?: string[];
  /** 当前场上客队 5 人 ID */
  onCourtAway?: string[];
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
  ovr: number | FogValue;
  /** 是否已被本队球探探查过 */
  scouted?: boolean;
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
  /** 综合评分：本队为精确值，对手为带雾估值 */
  ovr: number | FogValue;
  /** 能力值：本队为真实 Abilities，对手为带雾的 Partial<Record<key, FogValue>> */
  abilities: Abilities | Partial<Record<keyof Abilities, FogValue>>;
  /** 真实能力（仅本队球员可见） */
  realAbilities?: Abilities;
  /** 潜力估值（带雾），本队球员为真实值 */
  peak?: FogValue | number | null;
  salary?: number;
  age?: number;
  /** 状态等级（#13）：peak/good/tired/exhausted */
  status?: "peak" | "good" | "tired" | "exhausted";
  /** 是否队长（#20） */
  isCaptain?: boolean;
  /** 是否新秀（#20） */
  isRookie?: boolean;
  /** 是否已被本队球探探查过 */
  scouted: boolean;
  /** 特质：本队可见全部，对手仅可见已探查的 traitHints */
  traits?: string[];
}

export interface TeamDetail {
  id: string;
  name: string;
  city?: string | null;
  players: PlayerDetail[];
  captainId?: string | null;
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

// ── 认证 ──
export interface AuthResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    nickname: string;
    teamId: string | null;
  };
}

export interface UserInfo {
  id: string;
  email: string;
  nickname: string;
  teamId: string | null;
}

// ── 赛季 ──
export interface SeasonInfo {
  id: string;
  name: string;
  year: number;
  status: string;
  currentDay: number;
}

export type SeasonStatus = "regular" | "playoff" | "offseason";

export interface StandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string | null;
  winRate: number;
}

export interface ScheduleMatch {
  id: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  status: "scheduled" | "in_progress" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
}

export interface ScheduleDay {
  day: number;
  matches: ScheduleMatch[];
}

export interface AdvanceResult {
  settled: number;
  nextDay: number;
  seasonEnded: boolean;
}

// ── 阵容 ──
export interface LineupPlayer {
  id: string;
  name: string;
  position: Position;
  ovr: number;
  status?: "peak" | "good" | "tired" | "exhausted";
  isCaptain?: boolean;
  isRookie?: boolean;
}

export interface LineupView {
  teamId: string;
  starters: string[];
  minutes: Record<string, number>;
  players: LineupPlayer[];
}

// ── AI 经理 ──
export type AiDifficulty = "easy" | "normal" | "hard";

export interface AiRefreshResult {
  updated: number;
}

export interface AiTrainResult {
  playersTrained: number;
}

// ── 球队战术（GET /api/tactics/team/:id）──
export interface TacticTendencyMod {
  drive: number;
  three: number;
  inside: number;
  postup: number;
  midrange: number;
}

// M4: 高级战术层（借鉴 JBL）
export type OffenseEmphasis =
  | "box_out"
  | "early_threes"
  | "get_to_rim"
  | "midrange_drops"
  | "protect_ball";

export type DefenseEmphasis =
  | "no_fouls"
  | "limit_fast_breaks"
  | "force_turnovers"
  | "protect_rim"
  | "limit_perimeter";

export type PlaybookAction =
  | "pnr_ball_handler"
  | "pnr_roll_man"
  | "isolation"
  | "post_up"
  | "spot_up"
  | "hand_off"
  | "off_screen"
  | "cut"
  | "transition"
  | "putback"
  | "second_chance";

export interface TacticModSet {
  teamId: string;
  stealChance: number;
  tendencyMod: TacticTendencyMod;
  helpDefChance: number;
  defenseContest: number;
  pickRollChance: number;
  fastBreakChance: number;
  possessionTimeDelta: number;
  // M4: 高级战术层
  pace?: "faster" | "balanced" | "slower";
  offenseFocus?: "balanced" | "drive" | "outside" | "inside" | "bully" | "pnr";
  ballDistribution?: "natural" | "heliocentric" | "egalitarian";
  offenseFreedom?: "set_plays" | "freelance";
  offenseEmphasis?: OffenseEmphasis[];
  defenseIntensity?: "aggressive" | "balanced" | "conservative";
  defenseFocus?: "interior" | "balanced" | "perimeter";
  screenDefGuards?: "over" | "under" | "switch";
  screenDefBigs?: "drop" | "hedge" | "blitz";
  defenseEmphasis?: DefenseEmphasis[];
  signatureActions?: PlaybookAction[];
  closerId?: string;
  familiarity?: Partial<Record<string, number>>;
  actionWeights?: Partial<Record<PlaybookAction, number>>;
  // M4: 末节策略
  endGameStrategies?: EndGameStrategies;
}

// M4: 末节策略
export type EndGameStrategy =
  | "normal"
  | "milk_clock"
  | "quick_three"
  | "foul_strategy"
  | "isolate_star"
  | "double_team";

export interface EndGameStrategies {
  leading?: EndGameStrategy;
  trailing?: EndGameStrategy;
  close?: EndGameStrategy;
}

export interface TeamTactic {
  teamId: string;
  presetId: string;
  presetName: string;
  modSet: TacticModSet;
}

export interface CounterTacticResult {
  counter: TacticPreset;
  reason: string;
}

/** M4 #8: 战术使用率统计 */
export interface TacticUsageStat {
  presetId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  pointDifferential: number;
}

// ── 交易系统 ──
export type TradeStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "countered"
  | "expired";

export interface TradeOffer {
  id: string;
  worldId: string;
  offerorTeamId: string;
  offerorTeamName?: string;
  offereeTeamId: string;
  offereeTeamName?: string;
  offerorPlayers: string[];
  offereePlayers: string[];
  offerorCash: number;
  offereeCash: number;
  status: TradeStatus;
  round: number;
  expiresAt: string;
  createdAt: string;
}

// ── SSE 实时直播事件 ──
export interface SseStreamEvent {
  type: "pbp" | "box" | "final";
  event?: PbpEvent;
  boxScore?: { home: TeamStat; away: TeamStat };
  scoreHome?: number;
  scoreAway?: number;
  done?: boolean;
}

// ── M3: 球员生涯弧线 ──
export type CareerStage = "rookie" | "rising" | "prime" | "decline" | "retired";

export interface PlayerCareer {
  playerId: string;
  name: string;
  age: number;
  position: Position;
  ovr: number;
  potential: number;
  stage: CareerStage;
  stageLabel: string;
  trainExp: number;
  retired?: boolean;
  retireSeason?: number | null;
  growthRoom: number;
  salary?: number;
}

export interface TrainResult {
  playerId: string;
  drillType: string;
  drillLabel: string;
  ovrBefore: number;
  ovrAfter: number;
  improved: boolean;
  attributeChanges: { ability: string; before: number; after: number; delta: number }[];
}

// ── M3: 青训学院 ──
export interface Academy {
  id: string;
  teamId: string;
  level: number;
  investment: number;
  lastProdYear: number | null;
}

export interface AcademyUpgradeResult extends Academy {
  upgradeCost: number | null;
  nextLevelPotential: number | null;
}

// ── M3: 选秀 ──
export interface DraftPickView {
  id: string;
  seasonId: string;
  worldId: string | null;
  round: number;
  pickNum: number;
  teamId: string | null;
  team?: { id: string; name: string } | null;
  playerId: string | null;
  player?: {
    id: string;
    name: string;
    position: string;
    age: number;
    potential: number | null;
  } | null;
}

export interface DraftProspect {
  id: string;
  name: string;
  position: string;
  age: number;
  potential: number | null;
  ovr: number;
}

export interface DraftBoard {
  picks: DraftPickView[];
  available: DraftProspect[];
}

export interface DraftInitResult {
  picksCreated: number;
  prospectsCreated: number;
  lotteryOrder: Array<{ teamId: string; pickNum: number }>;
}

export interface DraftAutoResult {
  picked: number;
  picks: Array<{
    round: number;
    pickNum: number;
    teamId: string;
    playerName: string;
  }>;
}

// ── M3: 合同 ──
export type ContractStatus = "active" | "expired" | "waived";

export interface Contract {
  id: string;
  playerId: string;
  teamId: string;
  yearsTotal: number;
  yearsRemain: number;
  salaryPerYear: number;
  playerOption: boolean;
  teamOption: boolean;
  noTrade: boolean;
  status: ContractStatus;
  player?: {
    id: string;
    name: string;
    position: string;
    age: number;
    potential: number | null;
    retired: boolean;
  } | null;
}

export interface SalaryStatus {
  teamId: string;
  totalSalary: number;
  salaryCap: number;
  remaining: number;
  capHit: number;
  contractCount: number;
}

export interface FreeAgent {
  id: string;
  name: string;
  position: string;
  age: number;
  potential: number | null;
  salary: number;
  team: { id: string; name: string; worldId: string | null } | null;
}

// ── M3: 世界（用于选秀页查找所在世界）──
export interface WorldInfo {
  id: string;
  name: string;
  region: string;
  seasonId: string;
  seasonName: string;
  seasonStatus: string;
  teamCount: number;
  teams: Array<{ id: string; name: string; userId: string | null }>;
  leagues: Array<{ id: string; name: string; level: number; type: string }>;
}

// ── M4: 钱包 ──
export interface WalletInfo {
  userId: string;
  coins: number;
  credits: number;
}

// ── M4: VIP ──
export interface VipStatus {
  active: boolean;
  type: "monthly" | "seasonal" | null;
  expiresAt: string | null;
}

// ── M4: 外观 ──
export interface CosmeticItem {
  id: string;
  type: "jersey" | "arena_skin" | "avatar_frame";
  name: string;
  description: string | null;
  price: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  data: Record<string, unknown>;
}

export interface OwnedCosmetic {
  id: string;
  userId: string;
  itemId: string;
  equipped: boolean;
  item: CosmeticItem;
}

// ── M4: 支付 ──
export interface CreditPackage {
  id: string;
  credits: number;
  priceCents: number;
  label: string;
  bonus?: number;
}

export interface PaymentOrderResult {
  orderId: string;
  packageId: string;
  credits: number;
  amount: number;
  provider: string;
  checkoutUrl: string;
  sandbox: boolean;
}
