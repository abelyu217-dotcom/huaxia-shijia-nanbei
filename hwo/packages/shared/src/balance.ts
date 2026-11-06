/**
 * 海量 sim 自动对局批量回归工具（M5 §6.1 平衡调参）
 *
 * 用途：
 *   - 在 CI / 调参脚本中跑 N 场 sim，统计得分/命中率/篮板等分布
 *   - 校验分布是否符合真实篮球区间（参见 NBA 真实统计）
 *   - 验证 sim 引擎在大批量调用下的稳定性（无崩溃、无 NaN）
 *
 * 使用：
 *   import { runBalanceBatch, summarizeBatch, type BalanceStats } from "@hwo/shared";
 *   const stats = await runBalanceBatch(10000);
 *   const report = summarizeBatch(stats);
 *
 * 性能预算（开发计划 §7.4）：
 *   - 单场 sim ≤ 50ms → 10000 场 ≤ 500s（合理）
 *   - 10 万场可在多 worker 并行下完成
 */

import { simulate } from "./sim.js";
import { DEFAULT_CONFIG, type SimConfig, type SimInput, type Team } from "./types.js";
import { generateAllTeams } from "./generators.js";

/**
 * 真实 NBA 统计参考区间（用于分布校验）
 *
 * 注：HWO sim 是压缩回合模型（DEFAULT_CONFIG.possessionsPerQuarter=25，
 * 约为真实 NBA 100 possessions/队 的一半），所以各项统计预期约为 NBA 的 0.5x。
 * 这里给出 NBA 原始参考 + 校验时按比例缩放后的合理区间。
 */
export const NBA_REAL_RANGES = {
  /** 单场球队得分（NBA 85-130，sim 压缩模型 ~50% = 42-65，平均 ~56） */
  teamScore: { min: 40, max: 70, ideal: 56, nbaIdeal: 105 },
  /** 单场球队三分命中率（与 NBA 一致，sim 模型保留真实命中率） */
  threePct: { min: 0.3, max: 0.5, ideal: 0.38, nbaIdeal: 0.36 },
  /** 单场球队投篮命中率（与 NBA 一致，命中率是比例不压缩） */
  fgPct: { min: 0.4, max: 0.6, ideal: 0.5, nbaIdeal: 0.46 },
  /** 单场球队罚球命中率（与 NBA 一致） */
  ftPct: { min: 0.65, max: 0.9, ideal: 0.78, nbaIdeal: 0.77 },
  /** 单场球队篮板数（NBA 30-60，sim 压缩 ~50% = 15-30，平均 ~22） */
  rebounds: { min: 12, max: 35, ideal: 22, nbaIdeal: 43 },
  /** 单场球队助攻数（NBA 15-35，sim 压缩 ~50% = 7-18，平均 ~12） */
  assists: { min: 6, max: 22, ideal: 12, nbaIdeal: 25 },
  /** 单场球队失误数（NBA 8-25，sim 压缩 ~50% = 4-12，平均 ~7） */
  turnovers: { min: 3, max: 14, ideal: 7, nbaIdeal: 14 },
  /** 加时赛比例（与 NBA 一致，5%-8%） */
  otRate: { min: 0.02, max: 0.15, ideal: 0.06, nbaIdeal: 0.06 },
  /** 主场胜率（NBA 历史 ~60%） */
  homeWinRate: { min: 0.5, max: 0.75, ideal: 0.6, nbaIdeal: 0.6 },
};

/** 批量 sim 统计结果 */
export interface BalanceStats {
  gamesPlayed: number;
  /** 所有球队得分样本 */
  teamScores: number[];
  /** 所有球队三分命中率样本 */
  threePcts: number[];
  /** 所有球队投篮命中率样本 */
  fgPcts: number[];
  /** 所有球队罚球命中率样本 */
  ftPcts: number[];
  /** 所有球队篮板数样本 */
  rebounds: number[];
  /** 所有球队助攻数样本 */
  assists: number[];
  /** 所有球队失误数样本 */
  turnovers: number[];
  /** 加时赛数量 */
  otGames: number;
  /** 主场胜场数 */
  homeWins: number;
  /** 客场胜场数 */
  awayWins: number;
  /** 比赛平均耗时（毫秒） */
  avgMs: number;
  /** 出错的 sim 调用数（不应有） */
  errors: number;
  /** sim 时段分布（按平均得分 5 分桶） */
  scoreHistogram: Record<number, number>;
}

/**
 * 跑一批 sim 对局，收集统计样本
 *
 * @param count 比赛场数
 * @param config 模拟配置（默认 DEFAULT_CONFIG）
 * @param teams 球队池（默认用 generateAllTeams 生成）
 * @returns BalanceStats
 */
export function runBalanceBatch(
  count: number,
  config: SimConfig = DEFAULT_CONFIG,
  teams?: Team[],
): BalanceStats {
  const pool = teams ?? generateAllTeams(42);
  const stats: BalanceStats = {
    gamesPlayed: 0,
    teamScores: [],
    threePcts: [],
    fgPcts: [],
    ftPcts: [],
    rebounds: [],
    assists: [],
    turnovers: [],
    otGames: 0,
    homeWins: 0,
    awayWins: 0,
    avgMs: 0,
    errors: 0,
    scoreHistogram: {},
  };

  let totalMs = 0;
  for (let i = 0; i < count; i++) {
    const homeIdx = i % pool.length;
    let awayIdx = (i + 1) % pool.length;
    if (awayIdx === homeIdx) awayIdx = (homeIdx + 2) % pool.length;

    const homeTeam = pool[homeIdx]!;
    const awayTeam = pool[awayIdx]!;

    const input: SimInput = {
      matchup: { homeTeam, awayTeam },
      seed: i + 1,
      config,
    };

    const t0 = Date.now();
    try {
      const out = simulate(input);
      totalMs += Date.now() - t0;

      // 收集主队统计
      collectTeamStats(stats, out.boxScore.home);
      // 收集客队统计
      collectTeamStats(stats, out.boxScore.away);

      // 比分
      stats.teamScores.push(out.result.homeScore);
      stats.teamScores.push(out.result.awayScore);

      // 得分分布直方图（5 分桶）
      const bucket = Math.floor(out.result.homeScore / 5) * 5;
      stats.scoreHistogram[bucket] = (stats.scoreHistogram[bucket] ?? 0) + 1;
      const bucket2 = Math.floor(out.result.awayScore / 5) * 5;
      stats.scoreHistogram[bucket2] = (stats.scoreHistogram[bucket2] ?? 0) + 1;

      // 加时
      const quarters = new Set(out.pbp.map((e) => e.quarter));
      if (quarters.size > 4) stats.otGames++;

      // 胜负
      if (out.result.winnerId === homeTeam.id) stats.homeWins++;
      else stats.awayWins++;

      stats.gamesPlayed++;
    } catch (e) {
      stats.errors++;
      // 不中断，继续跑（用于诊断）
    }
  }

  stats.avgMs = count > 0 ? totalMs / count : 0;
  return stats;
}

function collectTeamStats(stats: BalanceStats, team: any): void {
  // team 是 BoxScoreTeam
  const fga = team.fga ?? 0;
  const fgm = team.fgm ?? 0;
  const tpa = team.tpa ?? 0;
  const tpm = team.tpm ?? 0;
  const fta = team.fta ?? 0;
  const ftm = team.ftm ?? 0;
  if (fga > 0) stats.fgPcts.push(fgm / fga);
  if (tpa > 0) stats.threePcts.push(tpm / tpa);
  if (fta > 0) stats.ftPcts.push(ftm / fta);
  stats.rebounds.push(team.rebounds ?? 0);
  stats.assists.push(team.assists ?? 0);
  stats.turnovers.push(team.turnovers ?? 0);
}

/** 计算数组统计：mean / median / min / max / std */
export function statSummary(arr: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  std: number;
  p5: number;
  p95: number;
} {
  if (arr.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, std: 0, p5: 0, p95: 0 };
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  const mean = sum / sorted.length;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / sorted.length;
  const std = Math.sqrt(variance);
  return {
    mean,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    std,
    p5: sorted[Math.floor(sorted.length * 0.05)] ?? 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
  };
}

/** 单项分布校验结果 */
export interface RangeCheck {
  metric: string;
  mean: number;
  ideal: number;
  minObserved: number;
  maxObserved: number;
  /** 理论合理区间 */
  rangeMin: number;
  rangeMax: number;
  /** 是否通过（均值落在合理区间内） */
  passed: boolean;
  /** 偏离描述 */
  note: string;
}

/**
 * 把 BalanceStats 与 NBA 真实区间对比，产出校验报告
 */
export function summarizeBatch(stats: BalanceStats): {
  checks: RangeCheck[];
  allPassed: boolean;
  summary: string;
} {
  const checks: RangeCheck[] = [];

  const scoreCheck = checkRange(
    "球队得分",
    statSummary(stats.teamScores).mean,
    NBA_REAL_RANGES.teamScore,
  );
  checks.push(scoreCheck);

  const fgCheck = checkRange(
    "投篮命中率",
    statSummary(stats.fgPcts).mean,
    NBA_REAL_RANGES.fgPct,
  );
  checks.push(fgCheck);

  const threeCheck = checkRange(
    "三分命中率",
    statSummary(stats.threePcts).mean,
    NBA_REAL_RANGES.threePct,
  );
  checks.push(threeCheck);

  const ftCheck = checkRange(
    "罚球命中率",
    statSummary(stats.ftPcts).mean,
    NBA_REAL_RANGES.ftPct,
  );
  checks.push(ftCheck);

  const rebCheck = checkRange(
    "篮板数",
    statSummary(stats.rebounds).mean,
    NBA_REAL_RANGES.rebounds,
  );
  checks.push(rebCheck);

  const astCheck = checkRange(
    "助攻数",
    statSummary(stats.assists).mean,
    NBA_REAL_RANGES.assists,
  );
  checks.push(astCheck);

  const toCheck = checkRange(
    "失误数",
    statSummary(stats.turnovers).mean,
    NBA_REAL_RANGES.turnovers,
  );
  checks.push(toCheck);

  const totalGames = stats.homeWins + stats.awayWins;
  const homeWinRate = totalGames > 0 ? stats.homeWins / totalGames : 0;
  const hwCheck = checkRange(
    "主场胜率",
    homeWinRate,
    NBA_REAL_RANGES.homeWinRate,
  );
  checks.push(hwCheck);

  const otRate = stats.gamesPlayed > 0 ? stats.otGames / stats.gamesPlayed : 0;
  const otCheck = checkRange(
    "加时赛比例",
    otRate,
    NBA_REAL_RANGES.otRate,
  );
  checks.push(otCheck);

  const allPassed = checks.every((c) => c.passed);
  const summary = allPassed
    ? `✓ 全部 ${checks.length} 项校验通过（${stats.gamesPlayed} 场，平均 ${stats.avgMs.toFixed(2)}ms/场）`
    : `✗ ${checks.filter((c) => !c.passed).length}/${checks.length} 项校验未通过（${stats.gamesPlayed} 场）`;

  return { checks, allPassed, summary };
}

function checkRange(
  metric: string,
  mean: number,
  range: { min: number; max: number; ideal: number },
): RangeCheck {
  const passed = mean >= range.min && mean <= range.max;
  let note = "";
  if (!passed) {
    if (mean < range.min) note = `偏低，低于下限 ${range.min}`;
    else note = `偏高，高于上限 ${range.max}`;
  } else {
    note = `落在合理区间 [${range.min}, ${range.max}]`;
  }
  return {
    metric,
    mean,
    ideal: range.ideal,
    minObserved: mean,
    maxObserved: mean,
    rangeMin: range.min,
    rangeMax: range.max,
    passed,
    note,
  };
}
