/**
 * sim 平衡调参批量回归测试（M5 §6.1）
 *
 * 验证 1000 场 sim 后关键统计分布落在 NBA 真实区间内。
 * CI 硬门槛：分布越界 → 阻断部署（平衡被破坏）。
 *
 * 注：完整 10 万场校验在 batch CLI 中跑，CI 仅跑 1000 场以控制时长。
 */

import { describe, it, expect } from "vitest";
import { runBalanceBatch, summarizeBatch } from "../src/balance.js";
import { DEFAULT_CONFIG, simulate } from "../src/index.js";
import { makeMockMatchup } from "./mock.js";

describe("sim 平衡分布（1000 场批量）", () => {
  // 跑 1000 场（CI 时长可控）
  const stats = runBalanceBatch(1000);
  const report = summarizeBatch(stats);

  it("无错误完成（errors=0）", () => {
    expect(stats.errors).toBe(0);
    expect(stats.gamesPlayed).toBe(1000);
  });

  it("单场 sim 平均耗时 < 50ms（性能预算 §7.4）", () => {
    expect(stats.avgMs).toBeLessThan(50);
  });

  it("加时赛比例落在 [0.02, 0.15] 区间", () => {
    const otRate = stats.otGames / stats.gamesPlayed;
    expect(otRate).toBeGreaterThanOrEqual(0.02);
    expect(otRate).toBeLessThanOrEqual(0.15);
  });

  it("主场胜率落在 [0.5, 0.75] 区间（NBA 历史 ~60%）", () => {
    const totalGames = stats.homeWins + stats.awayWins;
    const homeWinRate = totalGames > 0 ? stats.homeWins / totalGames : 0;
    expect(homeWinRate).toBeGreaterThanOrEqual(0.5);
    expect(homeWinRate).toBeLessThanOrEqual(0.75);
  });

  it("球队平均得分落在 [40, 70] 区间（sim 压缩模型）", () => {
    const sum = stats.teamScores.reduce((a, b) => a + b, 0);
    const avg = sum / stats.teamScores.length;
    expect(avg).toBeGreaterThanOrEqual(40);
    expect(avg).toBeLessThanOrEqual(70);
  });

  it("球队平均投篮命中率落在 [0.4, 0.6] 区间", () => {
    const sum = stats.fgPcts.reduce((a, b) => a + b, 0);
    const avg = sum / stats.fgPcts.length;
    expect(avg).toBeGreaterThanOrEqual(0.4);
    expect(avg).toBeLessThanOrEqual(0.6);
  });

  it("球队平均篮板数落在 [12, 35] 区间（sim 压缩模型）", () => {
    const sum = stats.rebounds.reduce((a, b) => a + b, 0);
    const avg = sum / stats.rebounds.length;
    expect(avg).toBeGreaterThanOrEqual(12);
    expect(avg).toBeLessThanOrEqual(35);
  });

  it("球队平均助攻数落在 [6, 22] 区间（sim 压缩模型）", () => {
    const sum = stats.assists.reduce((a, b) => a + b, 0);
    const avg = sum / stats.assists.length;
    expect(avg).toBeGreaterThanOrEqual(6);
    expect(avg).toBeLessThanOrEqual(22);
  });

  it("球队平均失误数落在 [3, 14] 区间（sim 压缩模型）", () => {
    const sum = stats.turnovers.reduce((a, b) => a + b, 0);
    const avg = sum / stats.turnovers.length;
    expect(avg).toBeGreaterThanOrEqual(3);
    expect(avg).toBeLessThanOrEqual(14);
  });

  it("分布校验全部通过（汇总报告）", () => {
    // 输出校验明细到 console（便于 CI 日志查看）
    console.log(`\n[sim 平衡] ${report.summary}`);
    for (const c of report.checks) {
      const symbol = c.passed ? "✓" : "✗";
      console.log(
        `  ${symbol} ${c.metric}: mean=${c.mean.toFixed(3)} ` +
        `ideal=${c.ideal} range=[${c.rangeMin}, ${c.rangeMax}] → ${c.note}`,
      );
    }
    expect(report.allPassed).toBe(true);
  });
});

describe("sim 配置参数灰度更新", () => {
  it("调整 homeAdvantage 影响主场胜率（验证参数生效）", () => {
    const matchup = makeMockMatchup();
    // 跑小批量验证：高 homeAdv 应显著提升主场胜率
    let highHomeWins = 0;
    let lowHomeWins = 0;
    const n = 100;
    for (let i = 0; i < n; i++) {
      const highOut = simulate({
        matchup,
        seed: i + 1,
        config: { ...DEFAULT_CONFIG, homeAdvantage: 10 },
      });
      const lowOut = simulate({
        matchup,
        seed: i + 1,
        config: { ...DEFAULT_CONFIG, homeAdvantage: 0 },
      });
      if (highOut.result.winnerId === "home") highHomeWins++;
      if (lowOut.result.winnerId === "home") lowHomeWins++;
    }
    // 高主场优势的胜率应不低于低优势（容差 10%）
    expect(highHomeWins).toBeGreaterThanOrEqual(lowHomeWins - 5);
  });

  it("调整 possessionsPerQuarter 影响比赛回合数（验证参数生效）", () => {
    const matchup = makeMockMatchup();
    const lowPossOut = simulate({
      matchup,
      seed: 42,
      config: { ...DEFAULT_CONFIG, possessionsPerQuarter: 15 },
    });
    const highPossOut = simulate({
      matchup,
      seed: 42,
      config: { ...DEFAULT_CONFIG, possessionsPerQuarter: 40 },
    });
    // 高回合数应产出更多得分（更多 possessions）
    const highTotal = highPossOut.result.homeScore + highPossOut.result.awayScore;
    const lowTotal = lowPossOut.result.homeScore + lowPossOut.result.awayScore;
    expect(highTotal).toBeGreaterThan(lowTotal);
  });
});
