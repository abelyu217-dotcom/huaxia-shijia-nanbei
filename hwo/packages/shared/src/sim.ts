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
  MatchResult,
  PbpEvent,
  Player,
  PlayerStat,
  SimConfig,
  SimInput,
  SimOutput,
  Team,
  TeamStat,
} from "./types.js";
import { Rng } from "./prng.js";

/** 投篮类型 */
type ShotType = "three" | "midrange" | "inside" | "drive" | "postup";

/** 一个回合的进攻决策上下文 */
interface PossessionContext {
  offense: Team;
  defense: Team;
  isHome: boolean;        // 进攻方是否主队
  quarter: number;
  scoreHome: number;
  scoreAway: number;
  rng: Rng;
  config: SimConfig;
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

/** 选择当前在场上的 5 名球员（简化：MVP 用首发全员打满） */
function onCourtPlayers(team: Team): Player[] {
  const lineup = team.lineup;
  return lineup.starters
    .map((id) => team.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
}

// ─── 进攻决策 ───

/** 根据战术倾向与球员能力选择投篮类型 */
function chooseShotType(ctx: PossessionContext, shooter: Player): ShotType {
  const { rng, offense } = ctx;
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

  // 战术倾向修正
  const mod = tactic.tendencyMod;
  const weights: Record<ShotType, number> = {
    three: baseWeights.three * (1 + mod.three),
    midrange: baseWeights.midrange * (1 + mod.midrange),
    inside: baseWeights.inside * (1 + mod.inside),
    drive: baseWeights.drive * (1 + mod.drive),
    postup: baseWeights.postup * (1 + mod.postup),
  };

  // 加权随机选择
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = rng.float("shotType") * total;
  for (const [type, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return type as ShotType;
  }
  return "midrange";
}

/** 选择主攻手（简化：从在场球员中按进攻能力加权） */
function chooseShooter(ctx: PossessionContext): Player {
  const { rng, offense } = ctx;
  const onCourt = onCourtPlayers(offense);
  const weights = onCourt.map((p) => {
    const a = p.abilities;
    return a.three + a.midrange + a.inside + a.drive + a.postup + a.ballHandle;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.float("shooterPick") * total;
  for (let i = 0; i < onCourt.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return onCourt[i]!;
  }
  return onCourt[0]!;
}

/** 计算投篮命中率 */
function shotChance(ctx: PossessionContext, shooter: Player, shotType: ShotType): number {
  const { defense, rng, offense, config } = ctx;
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

  // 防守干扰：选防守方最强相关防守者
  const onCourtDef = onCourtPlayers(defense);
  const defAbility =
    shotType === "inside" || shotType === "postup"
      ? Math.max(...onCourtDef.map((p) => p.abilities.interiorD))
      : Math.max(...onCourtDef.map((p) => p.abilities.perimeterD));

  const contest = 1 + defense.tactic.defenseContest;
  chance -= (defAbility / 99) * 0.15 * contest;

  // 手感热度加成
  chance += shooter.condition.hot * 0.05;

  // 协防概率削减
  if (rng.chance(defense.tactic.helpDefChance, "helpDef")) {
    chance -= 0.04;
  }

  return clamp(chance, 0.05, 0.92);
}

// ─── 单回合模拟 ───

interface PossessionResult {
  event: PbpEvent;
  homeScoreDelta: number;
  awayScoreDelta: number;
}

function simulatePossession(ctx: PossessionContext, possessionIdx: number, config: SimConfig): PossessionResult {
  const { rng, offense, defense, quarter, scoreHome, scoreAway } = ctx;

  // 失误判定
  const turnoverChance = 0.12 + (1 - offense.chemistry / 100) * 0.03;
  if (rng.chance(turnoverChance, "turnover")) {
    // 被抢断？
    if (rng.chance(defense.tactic.stealChance + 0.05, "stealAttempt")) {
      const stealer = rng.pick(onCourtPlayers(defense), "stealer");
      return {
        homeScoreDelta: 0,
        awayScoreDelta: 0,
        event: {
          quarter,
          clock: formatClock(possessionIdx, config.possessionsPerQuarter, config),
          scoreHome,
          scoreAway,
          type: "steal",
          actorId: stealer.id,
          teamId: defense.id,
          desc: `${stealer.name} 抢断成功！`,
        },
      };
    }
    return {
      homeScoreDelta: 0,
      awayScoreDelta: 0,
      event: {
        quarter,
        clock: formatClock(possessionIdx, config.possessionsPerQuarter, config),
        scoreHome,
        scoreAway,
        type: "turnover",
        teamId: offense.id,
        desc: `${offense.name} 失误`,
      },
    };
  }

  // 选择投篮
  const shooter = chooseShooter(ctx);
  const shotType = chooseShotType(ctx, shooter);
  const chance = shotChance(ctx, shooter, shotType);

  const made = rng.chance(chance, "shot");
  const points = shotType === "three" ? 3 : 2;
  const isThree = shotType === "three";

  // 助攻判定
  let assistId: string | undefined;
  if (made && rng.chance(0.55, "assist")) {
    const passers = onCourtPlayers(offense).filter((p) => p.id !== shooter.id);
    if (passers.length > 0) {
      const assister = rng.pick(passers, "assister");
      assistId = assister.id;
    }
  }

  // 手感更新
  if (made) {
    shooter.condition.hot = clamp(shooter.condition.hot + 0.1, 0, 1);
  } else {
    shooter.condition.hot = clamp(shooter.condition.hot - 0.05, 0, 1);
  }

  // 篮板判定（未中时）
  let reboundEvent: PbpEvent | null = null;
  if (!made) {
    const offRebChance = 0.25 + (offense.chemistry / 100) * 0.05;
    if (rng.chance(offRebChance, "offReb")) {
      const rebounder = rng.pick(onCourtPlayers(offense), "offRebounder");
      reboundEvent = {
        quarter,
        clock: formatClock(possessionIdx, config.possessionsPerQuarter, config),
        scoreHome,
        scoreAway,
        type: "rebound",
        actorId: rebounder.id,
        teamId: offense.id,
        desc: `${rebounder.name} 进攻篮板`,
      };
    } else {
      const rebounder = rng.pick(onCourtPlayers(defense), "defRebounder");
      reboundEvent = {
        quarter,
        clock: formatClock(possessionIdx, config.possessionsPerQuarter, config),
        scoreHome,
        scoreAway,
        type: "rebound",
        actorId: rebounder.id,
        teamId: defense.id,
        desc: `${rebounder.name} 防守篮板`,
      };
    }
  }

  const delta = made ? points : 0;
  const scoreDelta = ctx.isHome ? { homeScoreDelta: delta, awayScoreDelta: 0 } : { homeScoreDelta: 0, awayScoreDelta: delta };

  const shotEvent: PbpEvent = {
    quarter,
    clock: formatClock(possessionIdx, config.possessionsPerQuarter, config),
    scoreHome: scoreHome + scoreDelta.homeScoreDelta,
    scoreAway: scoreAway + scoreDelta.awayScoreDelta,
    type: made ? (isThree ? "three_made" : "shot_made") : isThree ? "three_miss" : "shot_miss",
    actorId: shooter.id,
    assistId,
    teamId: offense.id,
    desc: made
      ? `${shooter.name} ${isThree ? "三分命中" : points + "分命中"}${assistId ? "（助攻）" : ""}`
      : `${shooter.name} ${isThree ? "三分不中" : "投篮不中"}`,
  };

  // 若有篮板，追加篮板事件（下一回合前）。此处简化合并到 shot event 的 score 已更新。
  // 为保持 PBP 完整，篮板作为独立事件返回会破坏单 event 结构；
  // 这里采用：未中时把篮板信息附在 desc，保持单事件。
  if (reboundEvent && !made) {
    return {
      event: { ...shotEvent, desc: `${shotEvent.desc} · ${reboundEvent.desc}` },
      ...scoreDelta,
    };
  }

  return { event: shotEvent, ...scoreDelta };
}

// ─── 统计收集 ───

function emptyPlayerStat(playerId: string): PlayerStat {
  return {
    playerId, points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, ftm: 0,
    rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, minutes: 0,
  };
}

function emptyTeamStat(teamId: string, players: Player[]): TeamStat {
  return {
    teamId, score: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fta: 0, ftm: 0,
    rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
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

  const pbp: PbpEvent[] = [];
  const homeStat = emptyTeamStat(homeTeam.id, homeTeam.players);
  const awayStat = emptyTeamStat(awayTeam.id, awayTeam.players);

  let scoreHome = 0;
  let scoreAway = 0;
  const totalQuarters = 4;

  for (let quarter = 1; quarter <= totalQuarters; quarter++) {
    pbp.push({
      quarter,
      clock: "12:00",
      scoreHome,
      scoreAway,
      type: "period_start",
      desc: `第 ${quarter} 节开始`,
    });

    const possessions = config.possessionsPerQuarter;
    for (let i = 0; i < possessions; i++) {
      // 交替球权（简化：主队先攻）
      const isHomeOffense = i % 2 === 0;
      const offense = isHomeOffense ? homeTeam : awayTeam;
      const defense = isHomeOffense ? awayTeam : homeTeam;

      const ctx: PossessionContext = {
        offense,
        defense,
        isHome: isHomeOffense,
        quarter,
        scoreHome,
        scoreAway,
        rng,
        config,
      };

      const result = simulatePossession(ctx, i, config);
      pbp.push(result.event);
      scoreHome += result.homeScoreDelta;
      scoreAway += result.awayScoreDelta;

      // 疲劳累积（每回合轻微增加）
      for (const p of onCourtPlayers(offense)) {
        p.condition.fatigue = clamp(p.condition.fatigue + 0.004, 0, 1);
      }
    }

    pbp.push({
      quarter,
      clock: "0:00",
      scoreHome,
      scoreAway,
      type: "period_end",
      desc: `第 ${quarter} 节结束`,
    });
  }

  // Clutch 判定：分差 ≤3 且最后 2 分钟
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
        if (playerStat) playerStat.rebounds++;
        break;
    }
  }

  // 上场时间均分（简化：首发每人 32 分钟）
  for (const stat of [homeStat, awayStat]) {
    for (const ps of stat.players) {
      ps.minutes = 32;
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
    rngLog: rng.auditLog() as Array<{ label: string; value: number }>,
    seed,
  };
}

export { DEFAULT_CONFIG };
export type { SimInput, SimOutput };
