/**
 * sim 重放与审计工具（M5 §6.2 反作弊）
 *
 * 核心思路：
 *   - 比赛结果由服务端权威 sim 产生，客户端不可篡改
 *   - 每场比赛保存 rngLog（RNG 序列）+ seed + 输入快照
 *   - 任何审计请求都可通过 seed + rngLog 重新构造输入 → 调用 simulate() → 对比输出
 *   - 若重放输出与持久化输出不一致 → 提示 sim 被篡改 / 数据损坏
 *
 * 用途：
 *   - 反作弊：用户举报"奇怪比赛"，重放验证结果是否合法
 *   - 数据完整性：定期抽样重放，发现数据损坏
 *   - 调参回归：用真实历史 seed + 新 SimConfig 重放，对比新旧分布
 */

import { simulate, type SimOutput, type SimInput } from "./index.js";

/** 重放验证结果 */
export interface ReplayResult {
  /** 比赛记录 id */
  matchId: string;
  /** 原种子 */
  seed: number;
  /** 是否通过重放验证 */
  verified: boolean;
  /** 重放产出的比分 */
  replayHomeScore: number;
  replayAwayScore: number;
  /** 原记录的比分 */
  originalHomeScore: number;
  originalAwayScore: number;
  /** 比分是否一致 */
  scoreMatched: boolean;
  /** RNG 日志条目数 */
  rngLogEntries: number;
  /** 重放 RNG 日志是否与原日志一致 */
  rngLogMatched: boolean;
  /** 重放耗时（ms） */
  replayMs: number;
  /** 偏离说明 */
  note: string;
}

/**
 * 重放一场比赛，验证服务端权威 sim 结果的完整性
 *
 * @param matchId 比赛 id
 * @param input 重放输入（matchup + seed + config）
 * @param original 原记录的输出（homeScore, awayScore, rngLog 等）
 * @returns ReplayResult
 */
export function replayMatch(
  matchId: string,
  input: SimInput,
  original: {
    homeScore: number;
    awayScore: number;
    rngLog?: unknown;
  },
): ReplayResult {
  const t0 = Date.now();
  let output: SimOutput;
  try {
    output = simulate(input);
  } catch (e) {
    return {
      matchId,
      seed: input.seed,
      verified: false,
      replayHomeScore: 0,
      replayAwayScore: 0,
      originalHomeScore: original.homeScore,
      originalAwayScore: original.awayScore,
      scoreMatched: false,
      rngLogEntries: 0,
      rngLogMatched: false,
      replayMs: Date.now() - t0,
      note: `sim 重放失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const replayMs = Date.now() - t0;

  const scoreMatched =
    output.result.homeScore === original.homeScore &&
    output.result.awayScore === original.awayScore;

  // RNG 日志对比
  const replayRngLog = output.rngLog;
  const originalRngLog = Array.isArray(original.rngLog) ? original.rngLog : [];
  const rngLogMatched = replayRngLog.length === originalRngLog.length &&
    replayRngLog.every((entry, i) => {
      const orig = originalRngLog[i] as any;
      return orig && entry.label === orig.label && entry.value === orig.value;
    });

  const verified = scoreMatched && rngLogMatched;
  let note = "";
  if (!scoreMatched) {
    note = `比分不一致：重放 ${output.result.homeScore}-${output.result.awayScore} vs 原记录 ${original.homeScore}-${original.awayScore}`;
  } else if (!rngLogMatched) {
    note = `RNG 日志不一致：重放 ${replayRngLog.length} 条 vs 原记录 ${originalRngLog.length} 条`;
  } else {
    note = "✓ 重放验证通过";
  }

  return {
    matchId,
    seed: input.seed,
    verified,
    replayHomeScore: output.result.homeScore,
    replayAwayScore: output.result.awayScore,
    originalHomeScore: original.homeScore,
    originalAwayScore: original.awayScore,
    scoreMatched,
    rngLogEntries: replayRngLog.length,
    rngLogMatched,
    replayMs,
    note,
  };
}

/** 异常比赛检测阈值（M5 §6.2 风控） */
export const ANOMALY_THRESHOLDS = {
  /** 比分差超过此阈值 → 标记异常（潜在失衡对局） */
  scoreDiffMax: 60,
  /** 单场总得分超过此阈值 → 标记异常 */
  totalScoreMax: 200,
  /** 单场总得分低于此阈值 → 标记异常（双方摆烂？） */
  totalScoreMin: 40,
  /** 重放验证耗时超过此阈值 → 标记异常（sim 性能退化） */
  replayMsMax: 100,
};

/** 异常检测结果 */
export interface AnomalyDetection {
  matchId: string;
  isAnomaly: boolean;
  reasons: string[];
  homeScore: number;
  awayScore: number;
  /** 比分差绝对值 */
  scoreDiff: number;
}

/**
 * 检测比赛结果异常（用于风控）
 */
export function detectMatchAnomaly(matchId: string, homeScore: number, awayScore: number): AnomalyDetection {
  const reasons: string[] = [];
  const diff = Math.abs(homeScore - awayScore);
  const total = homeScore + awayScore;

  if (diff > ANOMALY_THRESHOLDS.scoreDiffMax) {
    reasons.push(`比分差 ${diff} 超过阈值 ${ANOMALY_THRESHOLDS.scoreDiffMax}（失衡对局）`);
  }
  if (total > ANOMALY_THRESHOLDS.totalScoreMax) {
    reasons.push(`总得分 ${total} 超过阈值 ${ANOMALY_THRESHOLDS.totalScoreMax}`);
  }
  if (total < ANOMALY_THRESHOLDS.totalScoreMin) {
    reasons.push(`总得分 ${total} 低于阈值 ${ANOMALY_THRESHOLDS.totalScoreMin}（疑似摆烂）`);
  }

  return {
    matchId,
    isAnomaly: reasons.length > 0,
    reasons,
    homeScore,
    awayScore,
    scoreDiff: diff,
  };
}

/** 异常交易检测（M5 §6.2 防共谋） */
export interface TradeAnomaly {
  tradeId: string;
  isAnomaly: boolean;
  reasons: string[];
  /** 筹码价值差（绝对值） */
  valueDiff: number;
  /** 价值差阈值 */
  valueDiffThreshold: number;
}

/**
 * 检测交易筹码是否失衡（用于人工复核队列）
 *
 * @param tradeId 交易 id
 * @param offerValue 报价方筹码总价值
 * @param counterValue 接收方筹码总价值
 * @param threshold 失衡阈值（默认 25%）
 */
export function detectTradeAnomaly(
  tradeId: string,
  offerValue: number,
  counterValue: number,
  threshold = 0.25,
): TradeAnomaly {
  const reasons: string[] = [];
  const maxValue = Math.max(offerValue, counterValue);
  const valueDiff = Math.abs(offerValue - counterValue);
  const ratio = maxValue > 0 ? valueDiff / maxValue : 0;

  if (ratio > threshold) {
    reasons.push(`筹码价值差 ${valueDiff}（占比 ${(ratio * 100).toFixed(1)}%）超过阈值 ${threshold * 100}%（防共谋触发）`);
  }
  if (offerValue === 0 && counterValue === 0) {
    reasons.push("双方筹码都为 0（异常空交易）");
  }

  return {
    tradeId,
    isAnomaly: reasons.length > 0,
    reasons,
    valueDiff,
    valueDiffThreshold: threshold,
  };
}
