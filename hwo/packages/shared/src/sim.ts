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

  // 失误判定
  const turnoverChance = 0.12 + (1 - offense.chemistry / 100) * 0.03;
  if (rng.chance(turnoverChance, "turnover")) {
    if (rng.chance(defense.tactic.stealChance + 0.05, "stealAttempt")) {
      const stealer = rng.pick(onCourtPlayers(defense), "stealer");
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
        type: "turnover", teamId: offense.id,
        desc: `${offense.name} 失误`,
      });
    }
    return { events, homeScoreDelta: homePts, awayScoreDelta: awayPts };
  }

  // 选择投篮
  const shooter = chooseShooter(ctx);
  const shotType = chooseShotType(ctx, shooter);
  const chance = shotChance(ctx, shooter, shotType);
  const isThree = shotType === "three";
  const basePoints = isThree ? 3 : 2;
  const made = rng.chance(chance, "shot");

  // 投篮犯规判定（独立概率，仅出现在投篮回合）
  const shootingFoul = rng.chance(0.13, "foul");
  const fouler = shootingFoul ? rng.pick(onCourtPlayers(defense), "fouler") : null;

  // 盖帽判定（仅未中时）
  let blocker: Player | null = null;
  if (!made) {
    const defCourt = onCourtPlayers(defense);
    const maxBlock = Math.max(...defCourt.map((p) => p.abilities.block));
    const blockChance = 0.06 + (maxBlock / 99) * 0.08;
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
    if (rng.chance(0.55, "assist")) {
      const passers = onCourtPlayers(offense).filter((p) => p.id !== shooter.id);
      if (passers.length > 0) assistId = rng.pick(passers, "assister").id;
    }
    const s = snap();
    events.push({
      quarter, clock, scoreHome: s.scoreHome, scoreAway: s.scoreAway,
      type: isThree ? "three_made" : "shot_made",
      actorId: shooter.id, assistId, teamId: offense.id,
      desc: `${shooter.name} ${isThree ? "三分命中" : basePoints + "分命中"}${assistId ? "（助攻）" : ""}`,
    });
    shooter.condition.hot = clamp(shooter.condition.hot + 0.1, 0, 1);

    // And-one：投篮犯规 + 命中 → 1 次罚球
    if (shootingFoul && fouler) {
      const sf = snap();
      events.push({
        quarter, clock, scoreHome: sf.scoreHome, scoreAway: sf.scoreAway,
        type: "foul", actorId: fouler.id, teamId: defense.id,
        desc: `${fouler.name} 投篮犯规（加罚）`,
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
      actorId: shooter.id, teamId: offense.id,
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
      const sf = snap();
      events.push({
        quarter, clock, scoreHome: sf.scoreHome, scoreAway: sf.scoreAway,
        type: "foul", actorId: fouler.id, teamId: defense.id,
        desc: `${fouler.name} 投篮犯规`,
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
      const offRebChance = 0.25 + (offense.chemistry / 100) * 0.05;
      if (rng.chance(offRebChance, "offReb")) {
        const rebounder = rng.pick(onCourtPlayers(offense), "offRebounder");
        const sr = snap();
        events.push({
          quarter, clock, scoreHome: sr.scoreHome, scoreAway: sr.scoreAway,
          type: "rebound", actorId: rebounder.id, teamId: offense.id,
          reboundType: "off", desc: `${rebounder.name} 进攻篮板`,
        });
      } else {
        const rebounder = rng.pick(onCourtPlayers(defense), "defRebounder");
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

  const pbp: PbpEvent[] = [];
  const homeStat = emptyTeamStat(homeTeam.id, homeTeam.players);
  const awayStat = emptyTeamStat(awayTeam.id, awayTeam.players);

  let scoreHome = 0;
  let scoreAway = 0;
  const totalQuarters = 4;
  const quarterScores = { home: [] as number[], away: [] as number[] };

  for (let quarter = 1; quarter <= totalQuarters; quarter++) {
    const qStartHome = scoreHome;
    const qStartAway = scoreAway;
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
      for (const ev of result.events) pbp.push(ev);
      scoreHome += result.homeScoreDelta;
      scoreAway += result.awayScoreDelta;

      // +/- 跟踪：在场球员记录本回合净分
      const netHome = result.homeScoreDelta - result.awayScoreDelta;
      const netAway = result.awayScoreDelta - result.homeScoreDelta;
      for (const p of onCourtPlayers(homeTeam)) {
        const ps = homeStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.plusMinus += netHome;
      }
      for (const p of onCourtPlayers(awayTeam)) {
        const ps = awayStat.players.find((s) => s.playerId === p.id);
        if (ps) ps.plusMinus += netAway;
      }

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

    quarterScores.home.push(scoreHome - qStartHome);
    quarterScores.away.push(scoreAway - qStartAway);
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

  // 上场时间：首发按 lineup.minutes 分配，替补 DNP（minutes=0）
  for (const team of [homeTeam, awayTeam]) {
    const stat = team.id === homeTeam.id ? homeStat : awayStat;
    const starterIds = new Set(team.lineup.starters);
    for (const ps of stat.players) {
      ps.minutes = starterIds.has(ps.playerId)
        ? (team.lineup.minutes[ps.playerId] ?? 32)
        : 0;
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
