/**
 * HWO 比赛模拟引擎核心
 *
 * 纯函数——输入相同则输出相同。零副作用。
 * 不读写 DB、不调网络、不依赖时间戳。
 *
 * 参见：比赛模拟引擎系统设计、技术架构文档 §8
 */

import {
  Abilities,
  BoxScore,
  DEFAULT_CONFIG,
  EndGameStrategies,
  EndGameStrategy,
  LineupCondition,
  MatchResult,
  PbpEvent,
  Player,
  PlayerStat,
  PlaybookAction,
  Position,
  SimConfig,
  SimInput,
  SimOutput,
  Team,
  TeamStat,
} from "./types.js";
import { Rng } from "./prng.js";
import {
  ARCHETYPE_ACTION_AFFINITY,
  DEFAULT_ACTION_WEIGHTS,
  EmphasisMods,
  SIGNATURE_ACTION_BOOST,
  combineEmphasisMods,
  fillTacticDefaults,
} from "./tactics.js";

/** 投篮类型 */
type ShotType = "three" | "midrange" | "inside" | "drive" | "postup";

// ─── M4: 战术上下文（每队预计算一次） ───

/**
 * 预计算的战术上下文。把 emphasis 修正、action 权重、熟练度惩罚
 * 合并为一组有效参数，供 possession 决策直接消费。
 */
interface TacticalContext {
  /** 合并 emphasis 后的有效修正 */
  mods: EmphasisMods;
  /** 有效 action 权重（已叠加 signature + archetype 倾向，归一化前） */
  actionWeights: Record<PlaybookAction, number>;
  /** 战术熟练度（0-100，低熟练度降效） */
  familiarity: Partial<Record<string, number>>;
  /** 关键球执行者 id */
  closerId?: string;
  /** 节奏 */
  pace: "faster" | "balanced" | "slower";
  /** 进攻侧重 */
  offenseFocus: "balanced" | "drive" | "outside" | "inside" | "bully" | "pnr";
  /** 球权分配 */
  ballDistribution: "natural" | "heliocentric" | "egalitarian";
  /** 后卫防挡拆 */
  screenDefGuards: "over" | "under" | "switch";
  /** 大个子防挡拆 */
  screenDefBigs: "drop" | "hedge" | "blitz";
  /** M4: 末节策略配置 */
  endGameStrategies: EndGameStrategies;
}

/** Action → 偏好 ShotType 映射（用于 action 选定后微调出手倾向） */
const ACTION_SHOT_BIAS: Partial<Record<PlaybookAction, Partial<Record<ShotType, number>>>> = {
  pnr_ball_handler: { three: 0.15, midrange: 0.2, drive: 0.2, inside: 0.1, postup: -0.2 },
  pnr_roll_man: { inside: 0.25, midrange: 0.1, three: -0.1, postup: -0.1 },
  isolation: { midrange: 0.15, drive: 0.15, three: 0.05, inside: 0.05, postup: 0.05 },
  post_up: { postup: 0.35, inside: 0.15, midrange: 0.05, three: -0.2, drive: -0.15 },
  spot_up: { three: 0.3, midrange: 0.1, inside: -0.1, drive: -0.1, postup: -0.2 },
  hand_off: { midrange: 0.15, three: 0.15, drive: 0.1, postup: -0.15 },
  off_screen: { midrange: 0.2, three: 0.2, inside: -0.1, drive: -0.1, postup: -0.2 },
  cut: { inside: 0.3, drive: 0.15, three: -0.15, postup: -0.1, midrange: -0.1 },
  transition: { three: 0.15, inside: 0.2, drive: 0.15, midrange: -0.1, postup: -0.2 },
  putback: { inside: 0.4, postup: 0.1, three: -0.3, midrange: -0.2, drive: -0.2 },
  second_chance: { inside: 0.25, postup: 0.1, midrange: 0.05, three: -0.15, drive: -0.1 },
};

/** 是否为挡拆类动作（触发 screen defense 判定） */
function isPnrAction(a: PlaybookAction): boolean {
  return a === "pnr_ball_handler" || a === "pnr_roll_man";
}

/**
 * 为一支球队构建战术上下文。
 * 合并 emphasis 修正、叠加 signature/archetype 到 action 权重。
 */
function buildTacticalContext(team: Team): TacticalContext {
  const t = fillTacticDefaults(team.tactic);
  const mods = combineEmphasisMods(
    t.offenseEmphasis ?? [],
    t.defenseEmphasis ?? [],
  );

  // action 权重：默认 + signature 加权
  const base = { ...DEFAULT_ACTION_WEIGHTS };
  const sigSet = new Set(t.signatureActions ?? []);
  for (const a of Object.keys(base) as PlaybookAction[]) {
    if (sigSet.has(a)) base[a] *= SIGNATURE_ACTION_BOOST;
  }

  // 叠加场上球员 archetype 倾向（取首发主导原型）
  const starters = team.lineup.starters
    .map((id) => team.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
  for (const p of starters) {
    if (!p.archetype) continue;
    const aff = ARCHETYPE_ACTION_AFFINITY[p.archetype];
    if (!aff) continue;
    for (const a of Object.keys(aff) as PlaybookAction[]) {
      base[a] = (base[a] ?? 1) * (aff[a] ?? 1);
    }
  }

  // 用户自定义 actionWeights 覆盖
  if (t.actionWeights) {
    for (const a of Object.keys(t.actionWeights) as PlaybookAction[]) {
      base[a] = t.actionWeights[a]!;
    }
  }

  return {
    mods,
    actionWeights: base,
    familiarity: t.familiarity ?? {},
    closerId: t.closerId,
    pace: t.pace ?? "balanced",
    offenseFocus: t.offenseFocus ?? "balanced",
    ballDistribution: t.ballDistribution ?? "natural",
    screenDefGuards: t.screenDefGuards ?? "over",
    screenDefBigs: t.screenDefBigs ?? "drop",
    endGameStrategies: t.endGameStrategies ?? {},
  };
}

/** 熟练度惩罚系数（0-100 → 0.85-1.0，越低越打折） */
function familiarityFactor(fam: Partial<Record<string, number>>, key: string): number {
  const v = fam[key];
  if (v === undefined) return 1.0;
  return 0.85 + (v / 100) * 0.15;
}

// ─── M4: 末节策略 ───

/**
 * 根据当前分差解析某队应触发的末节策略。
 * scoreDiff 为该队视角的分差（正=领先，负=落后）。
 * 仅在关键时刻（isClutch）调用。
 */
function resolveEndGameStrategy(
  strategies: EndGameStrategies,
  scoreDiff: number,
): EndGameStrategy {
  if (scoreDiff > 5) return strategies.leading ?? "normal";
  if (scoreDiff < -5) return strategies.trailing ?? "normal";
  return strategies.close ?? "normal";
}

/** 末节策略对进攻端的即时影响 */
interface OffenseStrategyEffect {
  /** action 权重倍率 */
  actionWeightMul: Partial<Record<PlaybookAction, number>>;
  /** 投篮类型倾向叠加（加到 chooseShotType 的 weights 上） */
  shotBias: Partial<Record<ShotType, number>>;
  /** closer 接管概率加成 */
  closerBoost: number;
  /** 回合时长偏移（秒） */
  possessionDelta: number;
}

/** 末节策略对防守端的即时影响 */
interface DefenseStrategyEffect {
  /** 故意犯规概率加成（大幅提升） */
  foulBoost: number;
  /** 协防概率加成 */
  helpDefBoost: number;
  /** 盖帽概率加成 */
  blockBoost: number;
  /** 对手底角三分惩罚（包夹漏人） */
  cornerThreeBoost: number;
}

const NO_OFF_EFFECT: OffenseStrategyEffect = {
  actionWeightMul: {},
  shotBias: {},
  closerBoost: 0,
  possessionDelta: 0,
};
const NO_DEF_EFFECT: DefenseStrategyEffect = {
  foulBoost: 0,
  helpDefBoost: 0,
  blockBoost: 0,
  cornerThreeBoost: 0,
};

/** 根据进攻策略计算效果 */
function offenseStrategyEffect(s: EndGameStrategy): OffenseStrategyEffect {
  switch (s) {
    case "milk_clock":
      return {
        actionWeightMul: {},
        shotBias: { three: -0.3, midrange: 0.15, inside: 0.1 },
        closerBoost: 0,
        possessionDelta: 4, // 压时间
      };
    case "quick_three":
      return {
        actionWeightMul: { transition: 1.4, spot_up: 1.3 },
        shotBias: { three: 0.5, midrange: -0.15, inside: -0.15, drive: -0.1 },
        closerBoost: 0,
        possessionDelta: -3, // 抢攻
      };
    case "isolate_star":
      return {
        actionWeightMul: { isolation: 1.8, pnr_ball_handler: 1.2 },
        shotBias: { midrange: 0.1, drive: 0.1 },
        closerBoost: 0.2, // 更高概率交给 closer
        possessionDelta: 2,
      };
    default:
      return NO_OFF_EFFECT;
  }
}

/** 根据防守策略计算效果 */
function defenseStrategyEffect(s: EndGameStrategy): DefenseStrategyEffect {
  switch (s) {
    case "foul_strategy":
      return {
        foulBoost: 0.5, // 故意犯规概率大幅提升
        helpDefBoost: 0,
        blockBoost: 0,
        cornerThreeBoost: 0,
      };
    case "double_team":
      return {
        foulBoost: 0.05,
        helpDefBoost: 0.25,
        blockBoost: 0.05,
        cornerThreeBoost: 0.08, // 包夹漏底角
      };
    default:
      return NO_DEF_EFFECT;
  }
}

/** 一个回合的进攻决策上下文 */
interface PossessionContext {
  offense: Team;
  defense: Team;
  offenseState: TeamRuntimeState;
  defenseState: TeamRuntimeState;
  isHome: boolean;        // 进攻方是否主队
  quarter: number;
  scoreHome: number;
  scoreAway: number;
  /** 是否关键时刻（第4节/加时最后2分钟且分差≤5） */
  isClutch: boolean;
  rng: Rng;
  config: SimConfig;
  /** M4: 进攻方战术上下文 */
  offTac: TacticalContext;
  /** M4: 防守方战术上下文 */
  defTac: TacticalContext;
}

// ─── 工具函数 ───

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function formatClock(possessionIdx: number, totalPerQuarter: number, config: SimConfig): string {
  const elapsed = (possessionIdx / totalPerQuarter) * config.quarterLength;
  const remaining = Math.max(0, config.quarterLength - elapsed);
  const m = Math.floor(remaining / 60);
  const s = Math.floor(remaining % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 计算球员有效能力（含疲劳、主场优势、化学反应修正） */
function effectiveAbilities(player: Player, isHome: boolean, config: SimConfig, chemistry: number): Abilities {
  const fatigue = player.condition.fatigue;
  const chemMod = 1 + (chemistry - 50) * 0.001; // chem 50=中性, 100=+5%
  const homeMod = isHome ? 1 + config.homeAdvantage * 0.01 : 1;
  const fatigueMod = 1 - fatigue * 0.3; // 疲劳最多削弱 30%

  const scale = (v: number) => clamp(Math.round(v * chemMod * homeMod * fatigueMod), 1, 99);
  const a = player.abilities;
  return {
    three: scale(a.three),
    midrange: scale(a.midrange),
    inside: scale(a.inside),
    drive: scale(a.drive),
    postup: scale(a.postup),
    passing: scale(a.passing),
    ballHandle: scale(a.ballHandle),
    perimeterD: scale(a.perimeterD),
    interiorD: scale(a.interiorD),
    steal: scale(a.steal),
    block: scale(a.block),
    speed: scale(a.speed),
    strength: scale(a.strength),
    jumping: scale(a.jumping),
    stamina: scale(a.stamina),
    iq: scale(a.iq),
    clutch: scale(a.clutch),
  };
}

/** 每队单场比赛的运行时状态 */
interface TeamRuntimeState {
  /** 当前在场上的 5 名球员 id（会因犯规/疲劳轮换而变化） */
  activeIds: string[];
  /** 已被罚出场的球员 id 集合（6 犯） */
  fouledOut: Set<string>;
}

/** 计算球员综合 OVR（用于换人选择） */
function playerOvr(p: Player): number {
  const a = p.abilities;
  const vals = [
    a.three, a.midrange, a.inside, a.drive, a.postup,
    a.passing, a.ballHandle, a.perimeterD, a.interiorD,
    a.steal, a.block, a.speed, a.strength, a.jumping, a.stamina, a.iq, a.clutch,
  ];
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/** 选择当前在场上的 5 名球员（从运行时 activeIds 取） */
function onCourtPlayers(team: Team, state: TeamRuntimeState): Player[] {
  return state.activeIds
    .map((id) => team.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
}

/**
 * 为指定位置寻找替补球员（确定性：选 OVR 最高的可用球员）。
 * 可用 = 未在场上、未被罚出场。
 */
function findSubstitute(
  team: Team,
  state: TeamRuntimeState,
  position: Position,
): Player | null {
  const onCourtSet = new Set(state.activeIds);
  const candidates = team.players.filter(
    (p) =>
      !onCourtSet.has(p.id) &&
      !state.fouledOut.has(p.id) &&
      p.position === position,
  );
  if (candidates.length === 0) {
    // 同位置无人可用，放宽到任意位置
    const any = team.players.filter(
      (p) => !onCourtSet.has(p.id) && !state.fouledOut.has(p.id),
    );
    if (any.length === 0) return null;
    any.sort((a, b) => playerOvr(b) - playerOvr(a));
    return any[0]!;
  }
  candidates.sort((a, b) => playerOvr(b) - playerOvr(a));
  return candidates[0]!;
}

/**
 * 将场上某球员替换为替补。返回被换下的球员，若无替补则返回 null。
 * 换人是确定性的，不消耗 RNG。
 */
function substitute(
  team: Team,
  state: TeamRuntimeState,
  outId: string,
): Player | null {
  const outPlayer = team.players.find((p) => p.id === outId);
  if (!outPlayer) return null;
  const sub = findSubstitute(team, state, outPlayer.position);
  if (!sub) return null;
  const idx = state.activeIds.indexOf(outId);
  if (idx >= 0) state.activeIds[idx] = sub.id;
  return sub;
}

/**
 * 节间休息轮换：把场上疲劳过高的球员换下，换上疲劳最低的可用球员。
 * 确定性排序，不消耗 RNG。
 */
function rotateAtQuarterBreak(team: Team, state: TeamRuntimeState): void {
  const FATIGUE_THRESHOLD = 0.35;
  const onCourt = onCourtPlayers(team, state);
  // 按疲劳降序排列场上球员
  const sorted = [...onCourt].sort((a, b) => b.condition.fatigue - a.condition.fatigue);
  for (const tired of sorted) {
    if (tired.condition.fatigue < FATIGUE_THRESHOLD) break;
    // 找同位置疲劳最低的替补
    const onCourtSet = new Set(state.activeIds);
    const candidates = team.players.filter(
      (p) =>
        !onCourtSet.has(p.id) &&
        !state.fouledOut.has(p.id) &&
        p.position === tired.position,
    );
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.condition.fatigue - b.condition.fatigue);
    const sub = candidates[0]!;
    if (sub.condition.fatigue >= tired.condition.fatigue - 0.05) continue;
    const idx = state.activeIds.indexOf(tired.id);
    if (idx >= 0) state.activeIds[idx] = sub.id;
  }
}

// ─── M4: 轮换网格 + 条件阵容 ───

/** 评估当前比分情境，返回匹配的 conditional lineup（含情境标签；无匹配返回 undefined） */
function resolveConditionalLineup(
  team: Team,
  scoreDiff: number,
  possessionInQuarter: number,
  possessionsPerQuarter: number,
): { starters: string[]; condition: LineupCondition } | undefined {
  const conds = team.lineup.conditionalLineups;
  if (!conds || conds.length === 0) return undefined;

  // 判定当前情境（仅特殊情境，default 作为最后兜底）
  const conditions: LineupCondition[] = [];
  const isLateGame =
    possessionInQuarter >= Math.floor(possessionsPerQuarter * 0.83);
  if (isLateGame) conditions.push("late_game");

  if (Math.abs(scoreDiff) >= 15) {
    conditions.push(scoreDiff > 0 ? "blowout_up" : "blowout_down");
  } else if (Math.abs(scoreDiff) <= 5) {
    conditions.push("close_game");
  }

  // 按优先级匹配特殊情境
  const sorted = [...conds].sort(
    (a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER),
  );
  for (const c of conditions) {
    const match = sorted.find((cl) => cl.condition === c);
    if (match) return { starters: match.starters, condition: c };
  }
  // 无特殊情境：返回 default（若有）
  const def = sorted.find((cl) => cl.condition === "default");
  if (def) return { starters: def.starters, condition: "default" };
  return undefined;
}

/**
 * 应用轮换网格：根据当前节次与回合索引，查找覆盖该时段的 slot，
 * 将场上球员设置为 slot.onCourt（仅当 slot 球员均未犯下离场时）。
 * 返回是否应用了轮换网格。
 */
function applyRotationSlot(
  team: Team,
  state: TeamRuntimeState,
  quarter: number,
  possessionIdx: number,
): boolean {
  const grid = team.lineup.rotation;
  if (!grid || !grid.quarters || grid.quarters.length === 0) return false;
  // 加时复用第 4 节网格
  const qIdx = Math.min(quarter, 4) - 1;
  const slots = grid.quarters[qIdx];
  if (!slots) return false;
  for (const slot of slots) {
    if (
      possessionIdx >= slot.possessionStart &&
      possessionIdx < slot.possessionEnd
    ) {
      // 仅当 slot 球员均未被罚出场才应用
      const valid = slot.onCourt.filter((id) => !state.fouledOut.has(id));
      if (valid.length === 5) {
        state.activeIds = [...valid];
        return true;
      }
      break;
    }
  }
  return false;
}


// ─── 进攻决策 ───

/**
 * M4: 选择本回合的 PlaybookAction。
 * 基于 actionWeights 加权随机，关键时刻偏好 isolation/pnr_ball_handler。
 * 可叠加末节策略的 action 权重倍率。
 */
function choosePlayAction(
  ctx: PossessionContext,
  extraMul: Partial<Record<PlaybookAction, number>> = {},
): PlaybookAction {
  const { rng, offTac, isClutch } = ctx;
  const weights = { ...offTac.actionWeights };
  // 关键时刻提升 isolation / pnr_ball_handler 权重（清晰终结）
  if (isClutch) {
    weights.isolation *= 1.5;
    weights.pnr_ball_handler *= 1.3;
    weights.post_up *= 1.1;
  }
  // 末节策略倍率叠加
  for (const a of Object.keys(extraMul) as PlaybookAction[]) {
    weights[a] *= extraMul[a] ?? 1;
  }
  const actions = Object.keys(weights) as PlaybookAction[];
  const total = actions.reduce((s, a) => s + weights[a], 0);
  let r = rng.float("playAction") * total;
  for (const a of actions) {
    r -= weights[a];
    if (r <= 0) return a;
  }
  return "spot_up";
}

/** 根据战术倾向、球员能力与 action 偏好选择投篮类型。可叠加末节策略 shotBias。 */
function chooseShotType(
  ctx: PossessionContext,
  shooter: Player,
  action: PlaybookAction,
  extraBias: Partial<Record<ShotType, number>> = {},
): ShotType {
  const { rng, offense, offTac } = ctx;
  const tactic = offense.tactic;
  const a = shooter.abilities;

  // 基础权重：球员能力驱动
  const baseWeights: Record<ShotType, number> = {
    three: a.three,
    midrange: a.midrange,
    inside: a.inside,
    drive: a.drive,
    postup: a.postup,
  };

  // 战术倾向修正（含 emphasis 叠加）
  const mod = tactic.tendencyMod;
  const emphTend = offTac.mods.tendency ?? {};
  const weights: Record<ShotType, number> = {
    three: baseWeights.three * (1 + mod.three + (emphTend.three ?? 0) + (extraBias.three ?? 0)),
    midrange: baseWeights.midrange * (1 + mod.midrange + (emphTend.midrange ?? 0) + (extraBias.midrange ?? 0)),
    inside: baseWeights.inside * (1 + mod.inside + (emphTend.inside ?? 0) + (extraBias.inside ?? 0)),
    drive: baseWeights.drive * (1 + mod.drive + (emphTend.drive ?? 0) + (extraBias.drive ?? 0)),
    postup: baseWeights.postup * (1 + mod.postup + (emphTend.postup ?? 0)),
  };

  // offenseFocus 全局偏好叠加
  const focusBias: Record<string, Partial<Record<ShotType, number>>> = {
    outside: { three: 0.2, midrange: 0.05, inside: -0.1, postup: -0.1 },
    inside: { inside: 0.2, postup: 0.15, three: -0.1, drive: -0.05 },
    drive: { drive: 0.25, inside: 0.1, three: -0.05, postup: -0.1 },
    bully: { postup: 0.25, inside: 0.15, three: -0.2, drive: -0.1 },
    pnr: { midrange: 0.1, drive: 0.15, inside: 0.1, three: 0.05 },
    balanced: {},
  };
  const fb = focusBias[offTac.offenseFocus] ?? {};
  for (const k of Object.keys(fb) as ShotType[]) {
    weights[k] *= 1 + (fb[k] ?? 0);
  }

  // action 偏好叠加
  const ab = ACTION_SHOT_BIAS[action] ?? {};
  for (const k of Object.keys(ab) as ShotType[]) {
    weights[k] *= 1 + (ab[k] ?? 0);
  }

  // 加权随机选择
  const total = Object.values(weights).reduce((s, w) => s + Math.max(0.01, w), 0);
  let r = rng.float("shotType") * total;
  for (const [type, w] of Object.entries(weights)) {
    r -= Math.max(0.01, w);
    if (r <= 0) return type as ShotType;
  }
  return "midrange";
}

/** 选择主攻手（含 ballDistribution + closer 机制）。closerBoost 为末节策略加成。 */
function chooseShooter(
  ctx: PossessionContext,
  action: PlaybookAction,
  closerBoost: number = 0,
): Player {
  const { rng, offense, offenseState, isClutch, offTac } = ctx;
  const onCourt = onCourtPlayers(offense, offenseState);

  // 关键时刻 + 指定 closer：高概率交给 closer
  if (isClutch && offTac.closerId) {
    const closer = onCourt.find((p) => p.id === offTac.closerId);
    if (closer && rng.chance(0.55 + closerBoost, "closerOverride")) {
      return closer;
    }
  }

  const weights = onCourt.map((p) => {
    const a = p.abilities;
    let w = a.three + a.midrange + a.inside + a.drive + a.postup + a.ballHandle;

    // ballDistribution：heliocentric 主控持球加权，egalitarian 趋均
    if (offTac.ballDistribution === "heliocentric") {
      w *= 1 + (a.ballHandle / 99) * 0.6; // 控球越好越核心化
    } else if (offTac.ballDistribution === "egalitarian") {
      // 压缩最高最低差距
      w = Math.pow(w, 0.85);
    }

    // action 倾向：archetype 擅长该 action 的球员加权
    if (p.archetype) {
      const aff = ARCHETYPE_ACTION_AFFINITY[p.archetype];
      const affVal = aff?.[action];
      if (affVal !== undefined) w *= affVal;
    }

    // 关键时刻：关键球能力越高，出手权重越大
    if (isClutch) {
      w += a.clutch * 1.5;
    }
    return Math.max(0.01, w);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.float("shooterPick") * total;
  for (let i = 0; i < onCourt.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return onCourt[i]!;
  }
  return onCourt[0]!;
}

/** 计算投篮命中率。defStratEffect 为防守方末节策略效果。 */
function shotChance(
  ctx: PossessionContext,
  shooter: Player,
  shotType: ShotType,
  action: PlaybookAction,
  defStratEffect: DefenseStrategyEffect = NO_DEF_EFFECT,
): number {
  const { defense, rng, offense, config, isClutch, offTac, defTac } = ctx;
  const a = effectiveAbilities(shooter, ctx.isHome, config, offense.chemistry);

  // 基础命中率（按投篮类型）
  const baseRate: Record<ShotType, number> = {
    three: 0.36 + a.three * 0.003,
    midrange: 0.42 + a.midrange * 0.003,
    inside: 0.55 + a.inside * 0.003,
    drive: 0.48 + a.drive * 0.003,
    postup: 0.45 + a.postup * 0.003,
  };

  let chance = baseRate[shotType];

  // 特质加成
  if (shooter.traits.includes("sharpshooter") && shotType === "three") {
    chance += 0.05;
  }
  if (shooter.traits.includes("interior_monster") && (shotType === "inside" || shotType === "postup")) {
    chance += 0.05;
  }

  // M4: emphasis 命中率修正（进攻方加成/惩罚）
  if (shotType === "three") chance += offTac.mods.threePctMod ?? 0;
  if (shotType === "inside" || shotType === "drive") chance += offTac.mods.rimPctMod ?? 0;
  if (shotType === "midrange") chance += offTac.mods.midPctMod ?? 0;

  // M4: 防守方 emphasis 反向作用（防守方限制外线 → 进攻方三分下降）
  if (shotType === "three") chance += defTac.mods.threePctMod ?? 0; // 已为负值
  if (shotType === "three") chance += defTac.mods.cornerThreeAllowedMod ?? 0;

  // 防守干扰：选防守方最强相关防守者
  const onCourtDef = onCourtPlayers(defense, ctx.defenseState);
  const defAbility =
    shotType === "inside" || shotType === "postup"
      ? Math.max(...onCourtDef.map((p) => p.abilities.interiorD))
      : Math.max(...onCourtDef.map((p) => p.abilities.perimeterD));

  const contest = 1 + defense.tactic.defenseContest + (defTac.mods.defenseContest ?? 0);
  chance -= (defAbility / 99) * 0.15 * contest;

  // M4: 挡拆 screen defense（仅 PnR 动作触发）
  if (isPnrAction(action)) {
    // screenDefBigs: drop=稳守禁区（降筐下命中率），blitz=激进包夹（降命中率但升失误），hedge=中性
    if (defTac.screenDefBigs === "drop" && (shotType === "inside" || shotType === "drive")) {
      chance -= 0.04;
    } else if (defTac.screenDefBigs === "blitz") {
      chance -= 0.06; // 包夹降命中
    } else if (defTac.screenDefBigs === "hedge") {
      chance -= 0.02;
    }
    // screenDefGuards: switch=换防消除错位，over=绕过（放三分），under=沉退
    if (defTac.screenDefGuards === "switch") {
      chance -= 0.02; // 换防减少错位
    } else if (defTac.screenDefGuards === "under" && shotType === "three") {
      chance += 0.03; // 沉退放三分
    }
  }

  // M4: 防守方 blownBy 风险 → 突破/内线命中率上升
  if ((shotType === "drive" || shotType === "inside") && (defTac.mods.blownByMod ?? 0) > 0) {
    chance += defTac.mods.blownByMod! * 0.5;
  }

  // 手感热度加成
  chance += shooter.condition.hot * 0.05;

  // 关键时刻：关键球能力提供额外命中率加成（最多 +6%）
  if (isClutch) {
    chance += (a.clutch / 99) * 0.06;
    // 关键先生特质：额外 +4%
    if (shooter.traits.includes("clutch_performer")) {
      chance += 0.04;
    }
  }

  // M4: 熟练度惩罚（低熟悉度降命中）
  chance *= familiarityFactor(offTac.familiarity, action);

  // 协防概率削减（含 emphasis + 末节包夹策略）
  const helpChance = defense.tactic.helpDefChance + (defTac.mods.helpDefChance ?? 0) + defStratEffect.helpDefBoost;
  if (rng.chance(helpChance, "helpDef")) {
    chance -= 0.04;
  }

  // 末节包夹策略漏底角三分
  if (shotType === "three" && defStratEffect.cornerThreeBoost > 0) {
    chance += defStratEffect.cornerThreeBoost;
  }

  return clamp(chance, 0.05, 0.92);
}

// ─── 单回合模拟 ───

interface PossessionResult {
  events: PbpEvent[];     // 一个回合可产生多个事件：投篮/篮板/盖帽/犯规/罚球
  homeScoreDelta: number;
  awayScoreDelta: number;
}

/** 罚球命中率（基于关键球能力微调） */
function ftChance(shooter: Player): number {
  return clamp(0.75 + (shooter.abilities.clutch / 99) * 0.12, 0.5, 0.92);
}

function simulatePossession(ctx: PossessionContext, possessionIdx: number, config: SimConfig): PossessionResult {
  const { rng, offense, defense, quarter, scoreHome, scoreAway } = ctx;
  const clock = formatClock(possessionIdx, config.possessionsPerQuarter, config);
  const events: PbpEvent[] = [];
  let homePts = 0;
  let awayPts = 0;
  const addPts = (pts: number) => {
    if (ctx.isHome) homePts += pts;
    else awayPts += pts;
  };
  // 当前累计比分快照（每个事件携带最新比分）
  const snap = () => ({ scoreHome: scoreHome + homePts, scoreAway: scoreAway + awayPts });

  // M4: 末节策略 —— 仅关键时刻生效，按分差解析攻防双方策略
  const offDiff = ctx.isHome ? scoreHome - scoreAway : scoreAway - scoreHome;
  const defDiff = -offDiff;
  const offStrategy = ctx.isClutch
    ? resolveEndGameStrategy(ctx.offTac.endGameStrategies, offDiff)
    : "normal";
  const defStrategy = ctx.isClutch
    ? resolveEndGameStrategy(ctx.defTac.endGameStrategies, defDiff)
    : "normal";
  const offEff = offenseStrategyEffect(offStrategy);
  const defEff = defenseStrategyEffect(defStrategy);

  // M4: 先选择本回合进攻动作（影响 shooter/shtype/chance/PBP 标签）
  const action = choosePlayAction(ctx, offEff.actionWeightMul);

  // 失误判定（含 emphasis turnover 修正 + PnR blitz 失误风险）
  let turnoverChance = 0.12 + (1 - offense.chemistry / 100) * 0.03;
  turnoverChance += ctx.offTac.mods.turnoverMod ?? 0;
  // 防守方 blitz 包夹 → 失误概率上升
  if (isPnrAction(action) && ctx.defTac.screenDefBigs === "blitz") {
    turnoverChance += 0.03;
  }
  // 防守方 force_turnovers emphasis → 失误概率上升
  turnoverChance += Math.max(0, ctx.defTac.mods.blownByMod ?? 0) * 0.3;
  if (rng.chance(turnoverChance, "turnover")) {
    const stealAttempt = defense.tactic.stealChance + 0.05 + (ctx.defTac.mods.stealChance ?? 0);
    if (rng.chance(stealAttempt, "stealAttempt")) {
      const stealer = rng.pick(onCourtPlayers(defense, ctx.defenseState), "stealer");
      const s = snap();
      events.push({
        quarter, clock, scoreHome: s.scoreHome, scoreAway: s.scoreAway,
        type: "steal", actorId: stealer.id, teamId: defense.id,
        desc: `${stealer.name} 抢断成功！`,
      });
    } else {
      const s = snap();
      events.push({
        quarter, clock, scoreHome: s.scoreHome, scoreAway: s.scoreAway,
        type: "turnover", teamId: offense.id, playAction: action,
        desc: `${offense.name} 失误`,
      });
    }
    return { events, homeScoreDelta: homePts, awayScoreDelta: awayPts };
  }

  // 选择投篮（基于 action）
  const shooter = chooseShooter(ctx, action, offEff.closerBoost);
  const shotType = chooseShotType(ctx, shooter, action, offEff.shotBias);
  const chance = shotChance(ctx, shooter, shotType, action, defEff);
  const isThree = shotType === "three";
  const basePoints = isThree ? 3 : 2;
  const made = rng.chance(chance, "shot");

  // 投篮犯规判定（含 emphasis foul 修正 + 末节砍鲨策略）
  let foulChance = 0.13 + (ctx.defTac.mods.foulMod ?? 0) + defEff.foulBoost;
  // 防守方 force_turnovers / aggressive → 犯规上升
  if (ctx.defTac.screenDefBigs === "blitz" && isPnrAction(action)) foulChance += 0.02;
  const shootingFoul = rng.chance(foulChance, "foul");
  const fouler = shootingFoul ? rng.pick(onCourtPlayers(defense, ctx.defenseState), "fouler") : null;

  // 盖帽判定（仅未中时；含 emphasis blockMod + 末节包夹策略）
  let blocker: Player | null = null;
  if (!made) {
    const defCourt = onCourtPlayers(defense, ctx.defenseState);
    const maxBlock = Math.max(...defCourt.map((p) => p.abilities.block));
    let blockChance = 0.06 + (maxBlock / 99) * 0.08;
    blockChance += ctx.defTac.mods.blockMod ?? 0;
    blockChance += defEff.blockBoost;
    // 保护禁区的防守对内线出手盖帽加成
    if ((shotType === "inside" || shotType === "postup") && (ctx.defTac.mods.blockMod ?? 0) > 0) {
      blockChance += 0.02;
    }
    if (rng.chance(blockChance, "block")) {
      const candidates = defCourt.filter((p) => p.abilities.block >= 55);
      blocker = candidates.length > 0
        ? rng.pick(candidates, "blocker")
        : rng.pick(defCourt, "blocker");
    }
  }

  if (made) {
    // 命中
    addPts(basePoints);
    let assistId: string | undefined;
    let assistChance = 0.55;
    const passers = onCourtPlayers(offense, ctx.offenseState).filter((p) => p.id !== shooter.id);
    // 组织核心特质在场上时，助攻概率提升
    if (passers.some((p) => p.traits.includes("playmaker"))) {
      assistChance += 0.12;
    }
    if (rng.chance(assistChance, "assist")) {
      if (passers.length > 0) {
        // 优先让组织核心传球
        const playmakers = passers.filter((p) => p.traits.includes("playmaker"));
        const pool = playmakers.length > 0 ? playmakers : passers;
        assistId = rng.pick(pool, "assister").id;
      }
    }
    const s = snap();
    events.push({
      quarter, clock, scoreHome: s.scoreHome, scoreAway: s.scoreAway,
      type: isThree ? "three_made" : "shot_made",
      actorId: shooter.id, assistId, teamId: offense.id, playAction: action,
      desc: `${shooter.name} ${isThree ? "三分命中" : basePoints + "分命中"}${assistId ? "（助攻）" : ""}`,
    });
    shooter.condition.hot = clamp(shooter.condition.hot + 0.1, 0, 1);

    // And-one：投篮犯规 + 命中 → 1 次罚球
    if (shootingFoul && fouler) {
      fouler.condition.foulTrouble++;
      const fouledOut = fouler.condition.foulTrouble >= 6;
      const sf = snap();
      events.push({
        quarter, clock, scoreHome: sf.scoreHome, scoreAway: sf.scoreAway,
        type: "foul", actorId: fouler.id, teamId: defense.id,
        desc: `${fouler.name} 投篮犯规（加罚）${fouledOut ? "，个人第 6 犯离场！" : ""}`,
      });
      const ftMade = rng.chance(ftChance(shooter), "ft");
      if (ftMade) addPts(1);
      const sf2 = snap();
      events.push({
        quarter, clock, scoreHome: sf2.scoreHome, scoreAway: sf2.scoreAway,
        type: "free_throw", actorId: shooter.id, teamId: offense.id, made: ftMade,
        desc: `${shooter.name} 加罚${ftMade ? "命中" : "不中"}`,
      });
    }
  } else {
    // 未中
    const s0 = snap();
    events.push({
      quarter, clock, scoreHome: s0.scoreHome, scoreAway: s0.scoreAway,
      type: isThree ? "three_miss" : "shot_miss",
      actorId: shooter.id, teamId: offense.id, playAction: action,
      desc: blocker ? `${shooter.name} 投篮被 ${blocker.name} 封盖` : `${shooter.name} ${isThree ? "三分不中" : "投篮不中"}`,
    });
    if (blocker) {
      const sb = snap();
      events.push({
        quarter, clock, scoreHome: sb.scoreHome, scoreAway: sb.scoreAway,
        type: "block", actorId: blocker.id, teamId: defense.id,
        desc: `${blocker.name} 盖帽`,
      });
    }
    shooter.condition.hot = clamp(shooter.condition.hot - 0.05, 0, 1);

    if (shootingFoul && fouler) {
      // 投篮犯规未中 → 罚球（三分尝试 3 罚，其余 2 罚）
      fouler.condition.foulTrouble++;
      const fouledOut = fouler.condition.foulTrouble >= 6;
      const sf = snap();
      events.push({
        quarter, clock, scoreHome: sf.scoreHome, scoreAway: sf.scoreAway,
        type: "foul", actorId: fouler.id, teamId: defense.id,
        desc: `${fouler.name} 投篮犯规${fouledOut ? "，个人第 6 犯离场！" : ""}`,
      });
      const ftCount = isThree ? 3 : 2;
      const rate = ftChance(shooter);
      for (let f = 0; f < ftCount; f++) {
        const ftMade = rng.chance(rate, "ft" + f);
        if (ftMade) addPts(1);
        const sf2 = snap();
        events.push({
          quarter, clock, scoreHome: sf2.scoreHome, scoreAway: sf2.scoreAway,
          type: "free_throw", actorId: shooter.id, teamId: offense.id, made: ftMade,
          desc: `${shooter.name} 罚球${ftMade ? "命中" : "不中"}（${f + 1}/${ftCount}）`,
        });
      }
    } else {
      // 篮板判定（仅非犯规回合；犯规回合球权转入罚球）
      // M4: 含 emphasis offRebMod（进攻方 box_out 加成 / 防守方 limit_fast_breaks 惩罚）
      let offRebChance = 0.25 + (offense.chemistry / 100) * 0.05;
      offRebChance += ctx.offTac.mods.offRebMod ?? 0;
      // 加权选择篮板手：禁区霸主特质权重 ×2
      const weightedPick = (players: Player[], label: string): Player => {
        const pool: Player[] = [];
        for (const p of players) {
          const weight = p.traits.includes("interior_monster") ? 2 : 1;
          for (let w = 0; w < weight; w++) pool.push(p);
        }
        return rng.pick(pool, label);
      };
      if (rng.chance(offRebChance, "offReb")) {
        const rebounder = weightedPick(onCourtPlayers(offense, ctx.offenseState), "offRebounder");
        const sr = snap();
        events.push({
          quarter, clock, scoreHome: sr.scoreHome, scoreAway: sr.scoreAway,
          type: "rebound", actorId: rebounder.id, teamId: offense.id,
          reboundType: "off", desc: `${rebounder.name} 进攻篮板`,
        });
      } else {
        const rebounder = weightedPick(onCourtPlayers(defense, ctx.defenseState), "defRebounder");
        const sr = snap();
        events.push({
          quarter, clock, scoreHome: sr.scoreHome, scoreAway: sr.scoreAway,
          type: "rebound", actorId: rebounder.id, teamId: defense.id,
          reboundType: "def", desc: `${rebounder.name} 防守篮板`,
        });
      }
    }
  }

  return { events, homeScoreDelta: homePts, awayScoreDelta: awayPts };
}

// ─── 统计收集 ───

function emptyPlayerStat(playerId: string): PlayerStat {
  return {
    playerId, points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, ftm: 0,
    offReb: 0, defReb: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
    turnovers: 0, fouls: 0, minutes: 0, plusMinus: 0,
  };
}

function emptyTeamStat(teamId: string, players: Player[]): TeamStat {
  return {
    teamId, score: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, ftm: 0,
    offReb: 0, defReb: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
    turnovers: 0, fouls: 0,
    players: players.map((p) => emptyPlayerStat(p.id)),
  };
}

// ─── 主 simulate 函数 ───

/**
 * 模拟一场比赛。纯函数——输入相同则输出相同。
 *
 * @param input SimInput：对阵 + seed + config
 * @returns SimOutput：PBP + Box Score + 结果 + RNG 审计日志
 */
export function simulate(input: SimInput): SimOutput {
  const { matchup, seed, config } = input;
  const rng = new Rng(seed);

  // 深拷贝球员状态（避免污染输入——纯函数要求）
  const homeTeam: Team = {
    ...matchup.homeTeam,
    players: matchup.homeTeam.players.map((p) => ({ ...p, condition: { ...p.condition }, abilities: { ...p.abilities }, traits: [...p.traits] })),
    tactic: { ...matchup.homeTeam.tactic, tendencyMod: { ...matchup.homeTeam.tactic.tendencyMod } },
  };
  const awayTeam: Team = {
    ...matchup.awayTeam,
    players: matchup.awayTeam.players.map((p) => ({ ...p, condition: { ...p.condition }, abilities: { ...p.abilities }, traits: [...p.traits] })),
    tactic: { ...matchup.awayTeam.tactic, tendencyMod: { ...matchup.awayTeam.tactic.tendencyMod } },
  };

  // M4: 预计算双方战术上下文（emphasis 合并 + action 权重 + archetype 倾向）
  const homeTac = buildTacticalContext(homeTeam);
  const awayTac = buildTacticalContext(awayTeam);

  const pbp: PbpEvent[] = [];
  const homeStat = emptyTeamStat(homeTeam.id, homeTeam.players);
  const awayStat = emptyTeamStat(awayTeam.id, awayTeam.players);

  // 运行时阵容状态：首发开局，6 犯离场或疲劳过高时换人
  // M4: 若有 conditional lineup default 命中，开局即应用其 starters
  const homeInit = resolveConditionalLineup(homeTeam, 0, 0, config.possessionsPerQuarter);
  const awayInit = resolveConditionalLineup(awayTeam, 0, 0, config.possessionsPerQuarter);
  const homeInitialStarters = homeInit?.starters ?? homeTeam.lineup.starters;
  const awayInitialStarters = awayInit?.starters ?? awayTeam.lineup.starters;
  const homeState: TeamRuntimeState = {
    activeIds: [...homeInitialStarters],
    fouledOut: new Set<string>(),
  };
  const awayState: TeamRuntimeState = {
    activeIds: [...awayInitialStarters],
    fouledOut: new Set<string>(),
  };

  let scoreHome = 0;
  let scoreAway = 0;
  const quarterScores = { home: [] as number[], away: [] as number[] };

  // 比赛周期：4 节常规 + 最多 2 个加时（5 分钟/节）
  const MAX_OT = 2;
  const OT_POSSESSIONS = Math.max(6, Math.round(config.possessionsPerQuarter * 0.42)); // 5min ≈ 42% of 12min
  const OT_LENGTH = 300; // 5 分钟 = 300 秒

  let periodNumber = 1;
  let periodsPlayed = 0;
  const maxPeriods = 4 + MAX_OT;

  while (periodNumber <= maxPeriods) {
    const isOvertime = periodNumber > 4;
    const otIndex = isOvertime ? periodNumber - 4 : 0;
    const possessions = isOvertime ? OT_POSSESSIONS : config.possessionsPerQuarter;
    const periodLength = isOvertime ? OT_LENGTH : config.quarterLength;
    const periodLabel = isOvertime ? `加时赛 ${otIndex}` : `第 ${periodNumber} 节`;

    const qStartHome = scoreHome;
    const qStartAway = scoreAway;
    pbp.push({
      quarter: periodNumber,
      clock: isOvertime ? "5:00" : "12:00",
      scoreHome,
      scoreAway,
      type: "period_start",
      desc: `${periodLabel}开始`,
    });

    // 周期专用配置：OT 使用 5 分钟时长与对应回合数
    const periodConfig: SimConfig = {
      ...config,
      quarterLength: periodLength,
      possessionsPerQuarter: possessions,
    };

    for (let i = 0; i < possessions; i++) {
      // 交替球权（简化：主队先攻）
      const isHomeOffense = i % 2 === 0;
      const offense = isHomeOffense ? homeTeam : awayTeam;
      const defense = isHomeOffense ? awayTeam : homeTeam;
      const offenseState = isHomeOffense ? homeState : awayState;
      const defenseState = isHomeOffense ? awayState : homeState;

      // M4: 轮换网格 —— 每回合按 slot 设定场上球员（覆盖疲劳轮换）
      applyRotationSlot(homeTeam, homeState, periodNumber, i);
      applyRotationSlot(awayTeam, awayState, periodNumber, i);

      // M4: 条件阵容 —— 仅特殊情境（大比分/焦灼/末节）覆盖轮换网格
      const homeDiff = scoreHome - scoreAway;
      const awayDiff = -homeDiff;
      const homeCondLU = resolveConditionalLineup(homeTeam, homeDiff, i, possessions);
      const awayCondLU = resolveConditionalLineup(awayTeam, awayDiff, i, possessions);
      if (homeCondLU && homeCondLU.condition !== "default") {
        const valid = homeCondLU.starters.filter((id) => !homeState.fouledOut.has(id));
        if (valid.length === 5) homeState.activeIds = [...valid];
      }
      if (awayCondLU && awayCondLU.condition !== "default") {
        const valid = awayCondLU.starters.filter((id) => !awayState.fouledOut.has(id));
        if (valid.length === 5) awayState.activeIds = [...valid];
      }

      // 关键时刻判定：第4节/加时 + 分差≤5 + 最后约2分钟
      const isClutch =
        periodNumber >= 4 &&
        Math.abs(scoreHome - scoreAway) <= 5 &&
        i >= Math.floor(possessions * 0.83);

      const ctx: PossessionContext = {
        offense,
        defense,
        offenseState,
        defenseState,
        isHome: isHomeOffense,
        quarter: periodNumber,
        scoreHome,
        scoreAway,
        isClutch,
        rng,
        config: periodConfig,
        offTac: isHomeOffense ? homeTac : awayTac,
        defTac: isHomeOffense ? awayTac : homeTac,
      };

      const result = simulatePossession(ctx, i, periodConfig);
      for (const ev of result.events) pbp.push(ev);
      scoreHome += result.homeScoreDelta;
      scoreAway += result.awayScoreDelta;

      // 6 犯离场检查：若有球员刚达 6 犯，立即换人
      for (const st of [homeState, awayState]) {
        const team = st === homeState ? homeTeam : awayTeam;
        for (const id of [...st.activeIds]) {
          const p = team.players.find((pl) => pl.id === id);
          if (p && p.condition.foulTrouble >= 6 && !st.fouledOut.has(id)) {
            st.fouledOut.add(id);
            const sub = substitute(team, st, id);
            if (sub) {
              const s = { scoreHome, scoreAway };
              pbp.push({
                quarter: periodNumber,
                clock: formatClock(i, possessions, periodConfig),
                scoreHome: s.scoreHome,
                scoreAway: s.scoreAway,
                type: "period_start", // 复用中性事件类型
                teamId: team.id,
                desc: `${p.name} 6 犯离场，${sub.name} 替补登场`,
              });
            }
          }
        }
      }

      // +/- 跟踪：在场球员记录本回合净分
      const netHome = result.homeScoreDelta - result.awayScoreDelta;
      const netAway = result.awayScoreDelta - result.homeScoreDelta;
      for (const p of onCourtPlayers(homeTeam, homeState)) {
        const ps = homeStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.plusMinus += netHome;
      }
      for (const p of onCourtPlayers(awayTeam, awayState)) {
        const ps = awayStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.plusMinus += netAway;
      }

      // 疲劳累积（双方在场球员每回合都增加；铁人特质减缓 30%）
      for (const team of [
        { team: homeTeam, state: homeState },
        { team: awayTeam, state: awayState },
      ]) {
        for (const p of onCourtPlayers(team.team, team.state)) {
          const fatigueDelta = p.traits.includes("iron_man") ? 0.008 * 0.7 : 0.008;
          p.condition.fatigue = clamp(p.condition.fatigue + fatigueDelta, 0, 1);
        }
      }

      // 上场时间累计：每回合在场球员获得对应分钟数
      const minutesPerPossession = (periodLength / possessions) / 60;
      const homeCourt = onCourtPlayers(homeTeam, homeState);
      const awayCourt = onCourtPlayers(awayTeam, awayState);
      for (const p of homeCourt) {
        const ps = homeStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.minutes += minutesPerPossession;
      }
      for (const p of awayCourt) {
        const ps = awayStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.minutes += minutesPerPossession;
      }
    }

    // 节间休息：疲劳轮换 + 体力小幅恢复
    rotateAtQuarterBreak(homeTeam, homeState);
    rotateAtQuarterBreak(awayTeam, awayState);
    for (const p of homeTeam.players) {
      p.condition.fatigue = clamp(p.condition.fatigue - 0.08, 0, 1);
    }
    for (const p of awayTeam.players) {
      p.condition.fatigue = clamp(p.condition.fatigue - 0.08, 0, 1);
    }

    pbp.push({
      quarter: periodNumber,
      clock: "0:00",
      scoreHome,
      scoreAway,
      type: "period_end",
      desc: `${periodLabel}结束`,
    });

    quarterScores.home.push(scoreHome - qStartHome);
    quarterScores.away.push(scoreAway - qStartAway);

    periodsPlayed++;

    // 常规 4 节结束后若平局，进入加时；否则比赛结束
    if (periodNumber === 4) {
      if (scoreHome === scoreAway) {
        periodNumber++;
        continue;
      }
      break;
    }
    // 加时结束后若仍平局且未达上限，继续下一个加时；否则结束
    if (isOvertime) {
      if (scoreHome === scoreAway && periodNumber < maxPeriods) {
        periodNumber++;
        continue;
      }
      break;
    }
    // 第 1-3 节：继续下一节
    periodNumber++;
  }

  // Clutch 判定：分差 ≤3
  const isClutch = Math.abs(scoreHome - scoreAway) <= 3;

  // 胜负
  const winnerId = scoreHome >= scoreAway ? homeTeam.id : awayTeam.id;
  const loserId = winnerId === homeTeam.id ? awayTeam.id : homeTeam.id;

  // 回填 Box Score（简化：从 PBP 聚合）
  for (const ev of pbp) {
    const stat = ev.teamId === homeTeam.id ? homeStat : ev.teamId === awayTeam.id ? awayStat : null;
    if (!stat) continue;
    const playerStat = ev.actorId ? stat.players.find((p) => p.playerId === ev.actorId) : null;

    switch (ev.type) {
      case "shot_made":
        stat.score += 2; stat.fgm++; stat.fga++;
        if (playerStat) { playerStat.points += 2; playerStat.fgm++; playerStat.fga++; }
        if (ev.assistId) {
          const ast = stat.players.find((p) => p.playerId === ev.assistId);
          if (ast) ast.assists++;
          stat.assists++;
        }
        break;
      case "three_made":
        stat.score += 3; stat.fgm++; stat.fga++; stat.tpm++; stat.tpa++;
        if (playerStat) { playerStat.points += 3; playerStat.fgm++; playerStat.fga++; playerStat.tpm++; playerStat.tpa++; }
        if (ev.assistId) {
          const ast = stat.players.find((p) => p.playerId === ev.assistId);
          if (ast) ast.assists++;
          stat.assists++;
        }
        break;
      case "shot_miss":
        stat.fga++;
        if (playerStat) playerStat.fga++;
        break;
      case "three_miss":
        stat.fga++; stat.tpa++;
        if (playerStat) { playerStat.fga++; playerStat.tpa++; }
        break;
      case "steal":
        stat.steals++;
        if (playerStat) playerStat.steals++;
        break;
      case "turnover":
        stat.turnovers++;
        break;
      case "rebound":
        stat.rebounds++;
        if (ev.reboundType === "off") stat.offReb++;
        else stat.defReb++;
        if (playerStat) {
          playerStat.rebounds++;
          if (ev.reboundType === "off") playerStat.offReb++;
          else playerStat.defReb++;
        }
        break;
      case "block":
        stat.blocks++;
        if (playerStat) playerStat.blocks++;
        break;
      case "foul":
        stat.fouls++;
        if (playerStat) playerStat.fouls++;
        break;
      case "free_throw":
        stat.fta++;
        if (playerStat) playerStat.fta++;
        if (ev.made) {
          stat.score += 1; stat.ftm++;
          if (playerStat) { playerStat.points += 1; playerStat.ftm++; }
        }
        break;
    }
  }

  // 上场时间已在比赛过程中按实际出场回合累计，此处四舍五入到 1 位小数
  for (const stat of [homeStat, awayStat]) {
    for (const ps of stat.players) {
      ps.minutes = Math.round(ps.minutes * 10) / 10;
    }
  }

  const boxScore: BoxScore = { home: homeStat, away: awayStat };

  const result: MatchResult = {
    homeScore: scoreHome,
    awayScore: scoreAway,
    winnerId,
    loserId,
    isClutch,
  };

  return {
    pbp,
    boxScore,
    result,
    quarterScores,
    rngLog: rng.auditLog() as Array<{ label: string; value: number }>,
    seed,
  };
}

export { DEFAULT_CONFIG };
export type { SimInput, SimOutput };
