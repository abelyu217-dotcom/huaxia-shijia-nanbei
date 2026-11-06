/**
 * 确定性伪随机数生成器（PRNG）
 *
 * 实现 mulberry32 算法。这是 HWO 确定性的基石——
 * 同一 seed 永远产出同一序列，保证 sim 可重放、可审计、可防作弊。
 *
 * 参见：比赛模拟引擎系统设计 §确定性、技术架构文档 §8
 */

/**
 * 创建一个确定性随机数生成器。
 * @param seed 32 位无符号整数种子
 * @returns 返回一个函数，每次调用产出 [0, 1) 区间的浮点数
 */
export function mulberry32(seed: number): () => number {
  // 确保种子在 32 位无符号范围内
  let a = seed >>> 0;

  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RNG 包装器：记录每次消耗，用于审计与确定性验证。
 * sim 引擎应使用此包装器，而非裸 mulberry32。
 */
export class Rng {
  private next: () => number;
  readonly log: Array<{ label: string; value: number }> = [];
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  /**
   * 产出 [0, 1) 浮点数。label 用于审计日志，标注此次 RNG 消耗的用途。
   */
  float(label = "float"): number {
    const value = this.next();
    this.log.push({ label, value });
    return value;
  }

  /**
   * 产出 [min, max] 闭区间整数。
   */
  int(min: number, max: number, label = "int"): number {
    const raw = this.next();
    const value = Math.floor(raw * (max - min + 1)) + min;
    this.log.push({ label, value: raw }); // 记录原始 [0,1) 浮点，保证审计值域一致
    return value;
  }

  /**
   * 以概率 p 返回 true（伯努利试验）。
   */
  chance(p: number, label = "chance"): boolean {
    const value = this.next();
    this.log.push({ label, value });
    return value < p;
  }

  /**
   * 从数组中按均匀分布取一个元素。
   */
  pick<T>(arr: readonly T[], label = "pick"): T {
    const raw = this.next();
    const idx = Math.floor(raw * arr.length);
    this.log.push({ label, value: raw });
    return arr[idx]!;
  }

  /**
   * 导出审计日志快照（不可变）。
   */
  auditLog(): ReadonlyArray<{ label: string; value: number }> {
    return [...this.log];
  }
}
