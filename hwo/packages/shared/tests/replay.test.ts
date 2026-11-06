/**
 * 反作弊审计工具单测（M5 §6.2）
 */

import { describe, it, expect } from "vitest";
import {
  replayMatch,
  detectMatchAnomaly,
  detectTradeAnomaly,
  ANOMALY_THRESHOLDS,
} from "../src/replay.js";
import { makeMockInput } from "./mock.js";
import { simulate, DEFAULT_CONFIG } from "../src/index.js";

describe("rngLog 重放验证", () => {
  it("同 seed 重放比分 + rngLog 完全一致", () => {
    const input = makeMockInput(42);
    const original = simulate(input);
    const replay = replayMatch("test-match-1", input, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.verified).toBe(true);
    expect(replay.scoreMatched).toBe(true);
    expect(replay.rngLogMatched).toBe(true);
  });

  it("篡改比分 → 重放验证失败", () => {
    const input = makeMockInput(42);
    const original = simulate(input);
    // 篡改比分（+10）
    const replay = replayMatch("test-match-2", input, {
      homeScore: original.result.homeScore + 10,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.verified).toBe(false);
    expect(replay.scoreMatched).toBe(false);
    expect(replay.note).toContain("比分不一致");
  });

  it("篡改 rngLog → 重放验证失败", () => {
    const input = makeMockInput(42);
    const original = simulate(input);
    // 篡改日志：删掉一半条目
    const tamperedLog = original.rngLog.slice(0, Math.floor(original.rngLog.length / 2));
    const replay = replayMatch("test-match-3", input, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: tamperedLog,
    });
    expect(replay.verified).toBe(false);
    expect(replay.rngLogMatched).toBe(false);
  });

  it("不同 seed 重放比分不一致", () => {
    const out1 = simulate(makeMockInput(100));
    const out2 = simulate(makeMockInput(200));
    // 用 seed=100 的输出，但 seed=200 重放
    const replay = replayMatch("test-match-4", makeMockInput(200), {
      homeScore: out1.result.homeScore,
      awayScore: out1.result.awayScore,
      rngLog: out1.rngLog,
    });
    expect(replay.verified).toBe(false);
  });

  it("重放耗时合理（< 50ms）", () => {
    const input = makeMockInput(42);
    const original = simulate(input);
    const replay = replayMatch("perf", input, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    expect(replay.replayMs).toBeLessThan(50);
  });
});

describe("比赛异常检测", () => {
  it("正常比分不触发异常", () => {
    const det = detectMatchAnomaly("m1", 100, 95);
    expect(det.isAnomaly).toBe(false);
    expect(det.scoreDiff).toBe(5);
  });

  it("比分差超过阈值触发异常（失衡对局）", () => {
    const det = detectMatchAnomaly("m2", 150, 70);
    expect(det.isAnomaly).toBe(true);
    expect(det.reasons.join("")).toContain("失衡对局");
  });

  it("总得分过高触发异常", () => {
    const det = detectMatchAnomaly("m3", 130, 120);
    expect(det.isAnomaly).toBe(true);
    expect(det.reasons.join("")).toContain("总得分");
  });

  it("总得分过低触发异常（疑似摆烂）", () => {
    const det = detectMatchAnomaly("m4", 18, 15);
    expect(det.isAnomaly).toBe(true);
    expect(det.reasons.join("")).toContain("疑似摆烂");
  });
});

describe("交易异常检测（防共谋）", () => {
  it("筹码价值匹配不触发异常", () => {
    const det = detectTradeAnomaly("t1", 100, 105);
    expect(det.isAnomaly).toBe(false);
    expect(det.valueDiff).toBe(5);
  });

  it("筹码价值失衡触发异常（防共谋）", () => {
    const det = detectTradeAnomaly("t2", 100, 50);
    expect(det.isAnomaly).toBe(true);
    expect(det.reasons.join("")).toContain("筹码价值差");
  });

  it("阈值可调（默认 25%，调到 50% 后宽松）", () => {
    // 50 vs 100 → 差 50/100=50%
    const det25 = detectTradeAnomaly("t3", 100, 50, 0.25);
    const det50 = detectTradeAnomaly("t3", 100, 50, 0.55);
    expect(det25.isAnomaly).toBe(true);
    expect(det50.isAnomaly).toBe(false);
  });

  it("双方筹码都为 0 触发异常", () => {
    const det = detectTradeAnomaly("t4", 0, 0);
    expect(det.isAnomaly).toBe(true);
    expect(det.reasons.join("")).toContain("空交易");
  });
});

describe("反作弊原则：客户端无法篡改 sim 结果", () => {
  it("客户端修改 SimConfig 不影响服务端权威", () => {
    // 服务端用 DEFAULT_CONFIG 持久化的结果，客户端改 SimConfig 重放仍产出原结果（DEFAULT_CONFIG）
    const input = makeMockInput(42);
    const original = simulate(input);
    // 客户端"修改"配置（无效）：服务端读取的是 rngLog，重放时仍用配置入参
    const tamperedInput = { ...input, config: { ...DEFAULT_CONFIG, homeAdvantage: 999 } };
    const replay = replayMatch("server-authority", tamperedInput, {
      homeScore: original.result.homeScore,
      awayScore: original.result.awayScore,
      rngLog: original.rngLog,
    });
    // 由于客户端篡改了配置，重放产出与原记录不同（防作弊检测生效）
    expect(replay.verified).toBe(false);
  });
});
