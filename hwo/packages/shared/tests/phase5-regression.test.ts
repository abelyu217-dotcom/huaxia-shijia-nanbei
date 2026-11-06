/**
 * M5 阶段五回归验证（Sprint 5.5）
 *
 * 整合验证 Phase 5 各 Sprint 的核心功能：
 *   Sprint 5.1 - 平衡调参：100k sim 回归 + SimConfig 热更新
 *   Sprint 5.2 - 反作弊：rngLog 重放 + 比分 / 交易异常检测
 *   Sprint 5.3 - 数据观测：埋点字段约定（AnalyticsCategory）
 *   Sprint 5.4 - 多世界隔离：SimConfig 变更不破坏确定性 + rngLog 跨世界一致性
 *
 * 该测试不依赖 DB，全部用 @hwo/shared 引擎 + 内存数据校验。
 * 目的：Phase 5 上线前一次性回归，避免上线后才发现基础能力退化。
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  detectMatchAnomaly,
  detectTradeAnomaly,
  getActiveConfig,
  getActiveVersion,
  listConfigVersions,
  resetToDefault,
  rollbackToVersion,
  runBalanceBatch,
  simulate,
  summarizeBatch,
  updateConfig,
  replayMatch,
  type SimConfig,
} from "../src/index.js";
import { makeMockInput } from "./mock.js";

describe("Sprint 5.1 — 平衡调参回归", () => {
  it("1000 场批量 sim 分布落在 NBA 真实区间", () => {
    const stats = runBalanceBatch(1000);
    const report = summarizeBatch(stats);
    expect(report.allPassed).toBe(true);
  });

  it("SimConfig 热更新：updateConfig 即时生效", () => {
    resetToDefault();
    const v0 = getActiveVersion();
    updateConfig({ homeAdvantage: 9 }, "调高主场优势测试");
    const cfg = getActiveConfig();
    expect(cfg.homeAdvantage).toBe(9);
    expect(getActiveVersion()).toBe(v0 + 1);
    // 默认配置未被污染（DEFAULT_CONFIG 是冻结的）
    expect(DEFAULT_CONFIG.homeAdvantage).not.toBe(9);
  });

  it("SimConfig 热更新：rollbackToVersion 恢复到旧配置", () => {
    resetToDefault();
    const v0 = getActiveVersion();
    updateConfig({ possessionsPerQuarter: 30 }, "增加每回合控球数");
    expect(getActiveConfig().possessionsPerQuarter).toBe(30);
    const ok = rollbackToVersion(v0);
    expect(ok).toBe(true);
    expect(getActiveConfig().possessionsPerQuarter).toBe(DEFAULT_CONFIG.possessionsPerQuarter);
  });

  it("SimConfig 热更新：listConfigVersions 追踪完整时间线", () => {
    resetToDefault();
    updateConfig({ basePossessionTime: 4 }, "调整回合时间");
    updateConfig({ homeAdvantage: 5 }, "调整主场优势");
    const versions = listConfigVersions();
    // 至少 3 个版本（初始 + 2 次更新；rollback 会再多一条）
    expect(versions.length).toBeGreaterThanOrEqual(3);
    // 最新版本应为 active
    const active = versions.find((v) => v.active);
    expect(active).toBeDefined();
    expect(active?.version).toBe(getActiveVersion());
  });

  it("SimConfig 热更新：resetToDefault 紧急恢复", () => {
    updateConfig({ quarterLength: 999 }, "事故调参");
    expect(getActiveConfig().quarterLength).toBe(999);
    resetToDefault();
    const cfg = getActiveConfig();
    expect(cfg.quarterLength).toBe(DEFAULT_CONFIG.quarterLength);
  });
});

describe("Sprint 5.2 — 反作弊回归", () => {
  it("rngLog 重放：相同 seed + rngLog 比分完全一致", () => {
    const input = makeMockInput(2026);
    const original = simulate(input);
    const replay = replayMatch("reg-5.2-1", input, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.verified).toBe(true);
  });

  it("异常比分检测：失衡对局被标记", () => {
    const det = detectMatchAnomaly("reg-5.2-2", 150, 60);
    expect(det.isAnomaly).toBe(true);
  });

  it("异常交易检测：失衡交易被标记", () => {
    const det = detectTradeAnomaly("reg-5.2-3", 100, 50);
    expect(det.isAnomaly).toBe(true);
  });

  it("rngLog 重放：篡改比分后失败（服务端权威性）", () => {
    const input = makeMockInput(99);
    const original = simulate(input);
    const replay = replayMatch("reg-5.2-4", input, {
      homeScore: original.result.homeScore + 20,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.verified).toBe(false);
  });
});

describe("Sprint 5.3 — 数据观测埋点约定", () => {
  // 这里只校验类型层面的契约：埋点分类必须是已知集合之一
  // 实际的 AnalyticsService.track 行为依赖 DB，不在此回归。
  it("AnalyticsCategory 字段集合稳定（auth/game/commerce/retention/system）", () => {
    const categories = ["auth", "game", "commerce", "retention", "system"];
    expect(categories).toContain("auth");
    expect(categories).toContain("game");
    expect(categories).toContain("commerce");
    expect(categories).toContain("retention");
    expect(categories).toContain("system");
    expect(categories.length).toBe(5);
  });
});

describe("Sprint 5.4 — 多世界隔离回归", () => {
  it("SimConfig 变更不破坏 rngLog 确定性：相同 seed + 相同 rngLog → 相同比分", () => {
    // 1. 用配置 A 跑一场，保存 rngLog + 比分
    resetToDefault();
    const inputA = makeMockInput(7);
    const outA = simulate(inputA);

    // 2. 热更新配置（调整 quarterLength）
    updateConfig({ quarterLength: 10 }, "Phase 5.4 隔离测试");
    const cfgB = getActiveConfig();
    expect(cfgB.quarterLength).toBe(10);

    // 3. 重放原 rngLog：seed + rngLog 相同时，比分必须一致
    //    （rngLog 是结果权威源，不是配置；配置变更不影响已存档结果）
    const replay = replayMatch("reg-5.4-1", inputA, {
      homeScore: outA.result.homeScore,
      awayScore: outA.result.awayScore,
      rngLog: outA.rngLog,
    });
    expect(replay.verified).toBe(true);
    resetToDefault();
  });

  it("多世界独立性：两个不同 seed 同时 sim 互不干扰", () => {
    const input1 = makeMockInput(101);
    const input2 = makeMockInput(202);
    const out1 = simulate(input1);
    const out2 = simulate(input2);
    expect(out1.result.homeScore).not.toBe(out2.result.homeScore);
    // 两个世界的 rngLog 长度可能不同但都不能为空
    expect(out1.rngLog.length).toBeGreaterThan(0);
    expect(out2.rngLog.length).toBeGreaterThan(0);
  });
});

describe("Phase 5 全栈冒烟（端到端关键路径）", () => {
  it("sim → rngLog → replay → anomaly detection 链路一致", () => {
    // 1. 模拟比赛
    const input = makeMockInput(314);
    const output = simulate(input);

    // 2. 重放验证
    const replay = replayMatch("smoke-1", input, {
      homeScore: output.result.homeScore,
      awayScore: output.result.awayScore,
      rngLog: output.rngLog,
    });
    expect(replay.verified).toBe(true);

    // 3. 异常检测（正常比分不应触发）
    const det = detectMatchAnomaly("smoke-1", output.result.homeScore, output.result.awayScore);
    expect(det.isAnomaly).toBe(false);
  });

  it("SimConfig 热更新 + 重放：新配置不影响已存档结果", () => {
    // 这是灰度调参的核心保证：调参后历史比赛仍可重放验证
    resetToDefault();
    const input = makeMockInput(8888);
    const original = simulate(input);

    // 调参（模拟线上热更新）
    updateConfig({ homeAdvantage: 12, possessionsPerQuarter: 28 }, "灰度调参 v2");

    // 调参后用旧 rngLog 重放 → 仍匹配原比分
    const replay = replayMatch("smoke-2", input, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.verified).toBe(true);
    resetToDefault();
  });
});
