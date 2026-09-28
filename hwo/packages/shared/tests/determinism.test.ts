/**
 * sim 引擎确定性测试
 *
 * 核心断言：同一 SimInput 永远产出同一 SimOutput。
 * 这是可重放、可审计、可防作弊的基础（技术架构文档 §8、§12.3）。
 *
 * CI 中若此测试失败 → sim 被意外破坏（浮点优化/重构引入非确定性）→ 阻断部署。
 */

import { describe, it, expect } from "vitest";
import { simulate } from "../src/index.js";
import { makeMockInput, makeMockMatchup } from "./mock.js";

describe("sim 引擎确定性", () => {
  it("同一 seed 多次调用产出完全相同的 PBP", () => {
    const input = makeMockInput(42);
    const out1 = simulate(input);
    const out2 = simulate(makeMockInput(42)); // 重新构造，模拟两次独立调用

    expect(out1.pbp).toEqual(out2.pbp);
    expect(out1.boxScore).toEqual(out2.boxScore);
    expect(out1.result).toEqual(out2.result);
    expect(out1.rngLog).toEqual(out2.rngLog);
  });

  it("不同 seed 产出不同结果（非恒定）", () => {
    const out1 = simulate(makeMockInput(1));
    const out2 = simulate(makeMockInput(2));
    // 比分应大概率不同（不同 seed → 不同 RNG 序列）
    expect(out1.pbp).not.toEqual(out2.pbp);
  });

  it("确定性在 100 次重复调用中保持一致", () => {
    const input = makeMockInput(777);
    const baseline = simulate(input);
    for (let i = 0; i < 100; i++) {
      const out = simulate(makeMockInput(777));
      expect(out.pbp).toEqual(baseline.pbp);
      expect(out.result).toEqual(baseline.result);
    }
  });

  it("RNG 审计日志完整且可重放", () => {
    const out = simulate(makeMockInput(100));
    // 日志非空
    expect(out.rngLog.length).toBeGreaterThan(0);
    // 每条日志有 label 和 value
    for (const entry of out.rngLog) {
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.value).toBe("number");
      expect(entry.value).toBeGreaterThanOrEqual(0);
      expect(entry.value).toBeLessThan(1);
    }
    // 同 seed 日志一致
    const out2 = simulate(makeMockInput(100));
    expect(out.rngLog).toEqual(out2.rngLog);
  });
});

describe("sim 输出完整性", () => {
  it("产出有效的 PBP 序列", () => {
    const out = simulate(makeMockInput(1));
    expect(out.pbp.length).toBeGreaterThan(0);
    // 包含节开始/结束事件
    expect(out.pbp.some((e) => e.type === "period_start")).toBe(true);
    expect(out.pbp.some((e) => e.type === "period_end")).toBe(true);
    // 4 节
    const quarters = new Set(out.pbp.map((e) => e.quarter));
    expect(quarters.size).toBe(4);
  });

  it("比分非负且合理", () => {
    const out = simulate(makeMockInput(1));
    expect(out.result.homeScore).toBeGreaterThanOrEqual(0);
    expect(out.result.awayScore).toBeGreaterThanOrEqual(0);
    // 25 回合/节 × 4 节 × 2 队 ≈ 200 回合，每回合平均 ~1 分 → 比分应在合理范围
    expect(out.result.homeScore).toBeLessThan(300);
    expect(out.result.awayScore).toBeLessThan(300);
  });

  it("胜负方与比分一致", () => {
    const out = simulate(makeMockInput(1));
    const { homeScore, awayScore, winnerId } = out.result;
    if (homeScore >= awayScore) {
      expect(winnerId).toBe("home");
    } else {
      expect(winnerId).toBe("away");
    }
  });

  it("Box Score 与 PBP 比分一致", () => {
    const out = simulate(makeMockInput(1));
    expect(out.boxScore.home.score).toBe(out.result.homeScore);
    expect(out.boxScore.away.score).toBe(out.result.awayScore);
  });

  it("simulate 不污染输入（纯函数）", () => {
    const input = makeMockInput(1);
    const originalFatigue = input.matchup.homeTeam.players[0]!.condition.fatigue;
    simulate(input);
    // 输入的球员状态不应被修改
    expect(input.matchup.homeTeam.players[0]!.condition.fatigue).toBe(originalFatigue);
  });

  it("多次模拟不串味（无共享可变状态）", () => {
    const out1 = simulate(makeMockInput(50));
    const out2 = simulate(makeMockInput(50));
    const out3 = simulate(makeMockInput(50));
    expect(out1.pbp).toEqual(out2.pbp);
    expect(out2.pbp).toEqual(out3.pbp);
  });
});

describe("不同配置下的确定性", () => {
  it("不同 seed 必产出不同 PBP（参数差异未必改离散结果，但 seed 必改）", () => {
    const out1 = simulate(makeMockInput(2024));
    const out2 = simulate(makeMockInput(2025));
    expect(out1.pbp).not.toEqual(out2.pbp);
    // 各自确定
    expect(simulate(makeMockInput(2024)).pbp).toEqual(out1.pbp);
    expect(simulate(makeMockInput(2025)).pbp).toEqual(out2.pbp);
  });

  it("不同 seed 的 RNG 日志必不同", () => {
    const out1 = simulate(makeMockInput(1000));
    const out2 = simulate(makeMockInput(2000));
    expect(out1.rngLog).not.toEqual(out2.rngLog);
  });
});
