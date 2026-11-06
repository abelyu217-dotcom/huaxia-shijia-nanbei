/**
 * 属性双层结构——38↔17 往返一致性测试（P0-① 验收）
 *
 * 验收门槛：
 * 1. buildProfile 产出的 38 项档案字段完整、值域合法；
 * 2. deriveAbilities 产出的 17 项引擎能力值均在 [0, 99]；
 * 3. 往返一致性：deriveAbilities(deriveProfileFromAbilities(ab)) 与原 ab 每项偏差 ≤ 1。
 */

import { describe, it, expect } from "vitest";
import type { Abilities, Position } from "../src/types.js";
import {
  buildProfile,
  deriveAbilities,
  deriveProfileFromAbilities,
} from "../src/profile.js";

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

describe("buildProfile 产出合法 38 项档案", () => {
  for (const pos of POSITIONS) {
    for (let tier = 0; tier <= 3; tier++) {
      it(`${pos} tier=${tier} 档案字段完整且值域合法`, () => {
        const p = buildProfile(pos, tier, 22, pos.charCodeAt(0) * 100 + tier);

        // 静态体测
        expect(p.physical.heightCm).toBeGreaterThan(170);
        expect(p.physical.heightCm).toBeLessThan(230);
        expect(p.physical.armSpanCm).toBeGreaterThan(p.physical.heightCm - 10);
        expect(p.physical.weightKg).toBeGreaterThan(60);
        expect(p.physical.weightKg).toBeLessThan(140);
        for (const k of ["frame", "handLength", "achilles"] as const) {
          expect(p.physical[k]).toBeGreaterThanOrEqual(1);
          expect(p.physical[k]).toBeLessThanOrEqual(10);
        }

        // 运动 8 项 / 技术 14 项 / 心智 iq 均在 0-99
        for (const v of Object.values(p.athletic)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(99);
        }
        for (const v of Object.values(p.skill)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(99);
        }
        expect(p.mental.iq).toBeGreaterThanOrEqual(0);
        expect(p.mental.iq).toBeLessThanOrEqual(99);

        // 心智 1-10
        for (const k of ["workEthic", "pressure", "teamwork", "leadership"] as const) {
          expect(p.mental[k]).toBeGreaterThanOrEqual(1);
          expect(p.mental[k]).toBeLessThanOrEqual(10);
        }

        // 隐藏
        expect(p.hidden.injuryProne).toBeGreaterThanOrEqual(1);
        expect(p.hidden.injuryProne).toBeLessThanOrEqual(10);
        expect(["A+", "A", "B", "C", "D"]).toContain(p.hidden.potential);
      });
    }
  }
});

describe("deriveAbilities 产出合法 17 项引擎能力值", () => {
  it("所有能力值均在 [0, 99]", () => {
    for (const pos of POSITIONS) {
      const p = buildProfile(pos, 2, 25, pos.charCodeAt(0) + 999);
      const a = deriveAbilities(p);
      for (const v of Object.values(a)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(99);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

describe("38→17→38 往返一致性（偏差 ≤ 1）", () => {
  // 用一组覆盖各位置/档位的 17 项能力值做往返
  const sampleAbilities: Array<{ pos: Position; abilities: Abilities }> = [
    {
      pos: "PG",
      abilities: { three: 72, midrange: 68, inside: 50, drive: 80, postup: 45, passing: 85, ballHandle: 88, perimeterD: 65, interiorD: 40, steal: 75, block: 35, speed: 88, strength: 45, jumping: 60, stamina: 75, iq: 82, clutch: 70 },
    },
    {
      pos: "C",
      abilities: { three: 30, midrange: 40, inside: 85, drive: 35, postup: 82, passing: 40, ballHandle: 35, perimeterD: 35, interiorD: 80, steal: 40, block: 85, speed: 45, strength: 88, jumping: 80, stamina: 65, iq: 68, clutch: 60 },
    },
    {
      pos: "SF",
      abilities: { three: 75, midrange: 72, inside: 65, drive: 70, postup: 60, passing: 65, ballHandle: 68, perimeterD: 70, interiorD: 60, steal: 65, block: 55, speed: 72, strength: 68, jumping: 74, stamina: 80, iq: 72, clutch: 68 },
    },
  ];

  for (const { pos, abilities } of sampleAbilities) {
    it(`${pos} 往返后每项偏差 ≤ 1`, () => {
      const profile = deriveProfileFromAbilities(abilities, pos, 25, 12345);
      const derived = deriveAbilities(profile);

      for (const key of Object.keys(abilities) as (keyof Abilities)[]) {
        const diff = Math.abs(derived[key] - abilities[key]);
        expect(diff).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe("deriveAbilities 确定性", () => {
  it("相同 profile 两次推导结果完全一致", () => {
    const p = buildProfile("SG", 2, 24, 42);
    const a1 = deriveAbilities(p);
    const a2 = deriveAbilities(p);
    expect(a1).toEqual(a2);
  });
});
