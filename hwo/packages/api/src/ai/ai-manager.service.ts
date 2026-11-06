/**
 * AiManagerService——AI 经理自动决策
 *
 * 参见：开发计划.html §2.5 AI 经理（单机填充）
 *
 * 职责：
 * 1. lineup：按 OVR 排序自动选择 5 名首发，按能力值分配出场时间
 * 2. tactic：基于球队阵容特征选择最匹配的战术预设（不重复随机）
 * 3. training：M1 阶段简化为按位置分配训练点（写入 player.abilities 微调）
 *
 * 难度参数（easy/normal/hard）影响战术合理性：
 *   - easy:   完全随机战术，阵容按位置随意挑选
 *   - normal: 按球队进攻/防守倾向选战术，阵容按 OVR 排序
 *   - hard:   综合球员特质与对手特征做针对性选择
 *
 * 调用时机：每日结算前由 ScheduleService.advanceDay 触发，
 * 为所有未被真实玩家拥有的球队刷新 lineup + tactic。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PRESET_TACTICS,
  overallRating,
  tacticFromPreset,
  type Abilities,
  type Position,
  type PresetTactic,
} from "@hwo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { TeamService } from "../team/team.service.js";

export type AiDifficulty = "easy" | "normal" | "hard";

const LINEUP_MIN_TOTAL = 200;
const LINEUP_MAX_TOTAL = 240;
const STARTER_MIN_MINUTES = 24;
const STARTER_MAX_MINUTES = 40;

interface PlayerWithAbilities {
  id: string;
  position: string;
  abilities: Abilities;
  ovr: number;
}

@Injectable()
export class AiManagerService {
  private readonly logger = new Logger(AiManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * 为所有 AI 球队（userId = null）刷新阵容 + 战术。
   * 在每日结算前由 ScheduleService 调用。
   */
  async refreshAllAiTeams(difficulty: AiDifficulty = "normal"): Promise<number> {
    const aiTeams = await this.prisma.team.findMany({
      where: { userId: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    let updated = 0;
    for (const team of aiTeams) {
      try {
        await this.refreshTeam(team.id, difficulty);
        updated++;
      } catch (e) {
        this.logger.warn(
          `AI 经理更新失败 ${team.name}(${team.id}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.logger.log(`AI 经理完成 ${updated}/${aiTeams.length} 支球队更新（${difficulty}）`);
    return updated;
  }

  /** 为单支 AI 球队刷新 lineup + tactic */
  async refreshTeam(teamId: string, difficulty: AiDifficulty = "normal"): Promise<void> {
    const team = await this.teamService.getById(teamId);
    if (!team) throw new Error(`Team ${teamId} not found`);

    const players: PlayerWithAbilities[] = team.players.map((p) => ({
      id: p.id,
      position: p.position,
      abilities: p.abilities,
      ovr: overallRating(p.abilities),
    }));

    if (players.length < 5) {
      this.logger.warn(`球队 ${teamId} 球员不足 5 人，跳过 AI 决策`);
      return;
    }

    // 1. 选择首发 + 出场时间
    const { starters, minutes } = this.pickLineup(players, difficulty);

    // 2. 选择战术
    const tacticPreset = this.pickTactic(players, difficulty);

    // 3. 持久化 lineup
    await this.prisma.lineup.upsert({
      where: { teamId },
      create: { teamId, starters, minutes },
      update: { starters, minutes },
    });

    // 4. 持久化 tactic
    const modSet = tacticFromPreset(teamId, tacticPreset.id);
    await this.prisma.tactic.upsert({
      where: { teamId },
      create: { teamId, presetId: tacticPreset.id, modSet: modSet as unknown as object },
      update: { presetId: tacticPreset.id, modSet: modSet as unknown as object },
    });

    // 5. 清除缓存
    await this.teamService.invalidateCache(teamId);
  }

  /**
   * 选择首发阵容 + 出场时间分配。
   * - normal/hard: 按 OVR 排序选前 5 人，保证位置覆盖（至少 1 个 PG，1 个 C）
   * - easy: 随机选 5 人
   */
  private pickLineup(
    players: PlayerWithAbilities[],
    difficulty: AiDifficulty,
  ): { starters: string[]; minutes: Record<string, number> } {
    let chosen: PlayerWithAbilities[];

    if (difficulty === "easy") {
      // 随机 5 人
      chosen = this.shuffle(players).slice(0, 5);
    } else {
      // 按 OVR 降序选 5 人，并尽量保证阵容结构合理
      const sorted = [...players].sort((a, b) => b.ovr - a.ovr);
      chosen = this.balanceLineup(sorted);
    }

    const starters = chosen.map((p) => p.id);
    const minutes = this.distributeMinutes(chosen, difficulty);
    return { starters, minutes };
  }

  /**
   * 从 OVR 排序中挑选 5 人，保证至少 1 个后卫（PG/SG）+ 1 个前场（PF/C）。
   * 简单贪心：先取前 5，若位置不均衡则用第 6/7 人替换最弱的同质位置。
   */
  private balanceLineup(sorted: PlayerWithAbilities[]): PlayerWithAbilities[] {
    const top5 = sorted.slice(0, 5);
    const hasGuard = top5.some((p) => p.position === "PG" || p.position === "SG");
    const hasBig = top5.some((p) => p.position === "PF" || p.position === "C");

    if (hasGuard && hasBig) return top5;

    // 从剩余球员中补足
    const rest = sorted.slice(5);
    const result = [...top5];

    if (!hasGuard) {
      const guard = rest.find((p) => p.position === "PG" || p.position === "SG");
      if (guard) {
        // 替换 OVR 最低的球员
        const replaceIdx = this.findWeakestReplaceable(result);
        if (replaceIdx >= 0) result[replaceIdx] = guard;
      }
    }
    if (!hasBig) {
      const big = rest.find((p) => p.position === "PF" || p.position === "C");
      if (big) {
        const replaceIdx = this.findWeakestReplaceable(result);
        if (replaceIdx >= 0) result[replaceIdx] = big;
      }
    }
    return result;
  }

  /** 找到阵容中 OVR 最低的球员索引 */
  private findWeakestReplaceable(lineup: PlayerWithAbilities[]): number {
    let weakestIdx = 0;
    let weakestOvr = lineup[0]?.ovr ?? 0;
    for (let i = 1; i < lineup.length; i++) {
      if (lineup[i]!.ovr < weakestOvr) {
        weakestOvr = lineup[i]!.ovr;
        weakestIdx = i;
      }
    }
    return weakestIdx;
  }

  /**
   * 出场时间分配：根据 OVR 分配，OVR 越高时间越多，总和落在 200-240 之间。
   * - normal/hard: 主力 32-40 min，角色球员 18-28 min
   * - easy: 均分 ~40 min/人
   */
  private distributeMinutes(
    starters: PlayerWithAbilities[],
    difficulty: AiDifficulty,
  ): Record<string, number> {
    const minutes: Record<string, number> = {};

    if (difficulty === "easy") {
      // 简单均分 40 min/人 = 200 min 总
      for (const p of starters) minutes[p.id] = 40;
      return minutes;
    }

    // normal/hard：按 OVR 加权
    const sorted = [...starters].sort((a, b) => b.ovr - a.ovr);
    // 主力（前 2）→ 36-40 min；中段（3-4）→ 28-34 min；第 5 人 → 22-28 min
    const buckets = [
      [38, 40],
      [34, 38],
      [28, 34],
      [26, 32],
      [22, 28],
    ];

    let total = 0;
    for (let i = 0; i < sorted.length; i++) {
      const [lo, hi] = buckets[i] ?? [22, 28];
      const min = this.clamp(
        Math.round(lo + ((hi - lo) * (sorted[i]!.ovr - 60)) / 35),
        STARTER_MIN_MINUTES,
        STARTER_MAX_MINUTES,
      );
      minutes[sorted[i]!.id] = min;
      total += min;
    }

    // 调整到 LINEUP_MIN_TOTAL..LINEUP_MAX_TOTAL
    if (total < LINEUP_MIN_TOTAL) {
      const deficit = LINEUP_MIN_TOTAL - total;
      const extra = Math.ceil(deficit / 5);
      for (const p of sorted) minutes[p.id] = Math.min(STARTER_MAX_MINUTES, minutes[p.id]! + extra);
    } else if (total > LINEUP_MAX_TOTAL) {
      const excess = total - LINEUP_MAX_TOTAL;
      const cut = Math.ceil(excess / 5);
      for (const p of sorted) minutes[p.id] = Math.max(STARTER_MIN_MINUTES, minutes[p.id]! - cut);
    }
    return minutes;
  }

  /**
   * 根据球队阵容特征挑选战术预设。
   * - easy: 完全随机
   * - normal: 基于平均三分能力 vs 内线能力，倾向 outside/inside
   * - hard: 综合考量速度 + 三分 + 防守，挑选最匹配的预设
   */
  private pickTactic(
    players: PlayerWithAbilities[],
    difficulty: AiDifficulty,
  ): PresetTactic {
    if (difficulty === "easy") {
      return this.randomPick(PRESET_TACTICS);
    }

    const roster = players.slice(0, 8);
    const avgThree = this.avg(roster.map((p) => p.abilities.three));
    const avgInside = this.avg(roster.map((p) => p.abilities.inside));
    const avgSpeed = this.avg(roster.map((p) => p.abilities.speed));
    const avgDef = this.avg([
      ...roster.map((p) => p.abilities.perimeterD),
      ...roster.map((p) => p.abilities.interiorD),
    ]);

    const scoreFor = (preset: PresetTactic): number => {
      let s = 0;
      // 三分强的球队优先选 outside 战术
      if (avgThree > avgInside + 3) {
        if (preset.offenseTendency === "outside") s += 2;
        if (preset.tempo === "fast" || preset.tempo === "ultra_fast") s += 1;
      } else if (avgInside > avgThree + 3) {
        if (preset.offenseTendency === "inside") s += 2;
        if (preset.tempo === "slow" || preset.tempo === "mid") s += 1;
      } else {
        if (preset.offenseTendency === "balanced") s += 1.5;
      }
      // 速度快的球队倾向快节奏
      if (avgSpeed > 70) {
        if (preset.tempo === "fast" || preset.tempo === "ultra_fast") s += 1.5;
      } else if (avgSpeed < 60) {
        if (preset.tempo === "slow" || preset.tempo === "mid") s += 1.5;
      }
      // 防守强的球队可选防守型战术
      if (avgDef > 70 && preset.defenseTendency === "press") s += 1;
      if (avgDef < 60 && preset.defenseTendency === "pack") s += 1;

      if (difficulty === "hard") {
        // hard 难度避开特殊型战术（除非阵容契合）
        if (preset.category === "spec") s -= 1;
      }
      // 加一点随机扰动避免决策完全确定
      s += Math.random() * 0.5;
      return s;
    };

    let best = PRESET_TACTICS[0]!;
    let bestScore = -Infinity;
    for (const t of PRESET_TACTICS) {
      const s = scoreFor(t);
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    return best;
  }

  /** M1 阶段训练：按位置分配训练点，写入 player.abilities 微调（±1-2）。
   * 此处仅作占位实现：把球队所有 player 的对应主能力 +1。
   * 真正的训练系统在 M3 阶段补完。 */
  async applyTrainingForTeam(teamId: string): Promise<number> {
    const players = await this.prisma.player.findMany({
      where: { teamId },
      select: { id: true, position: true, abilities: true },
    });
    let touched = 0;
    for (const p of players) {
      const abilities = p.abilities as unknown as Abilities;
      // 按位置提升主能力
      const trained = { ...abilities };
      switch (p.position as Position) {
        case "PG":
          trained.ballHandle = Math.min(99, trained.ballHandle + 1);
          trained.passing = Math.min(99, trained.passing + 1);
          break;
        case "SG":
          trained.three = Math.min(99, trained.three + 1);
          trained.midrange = Math.min(99, trained.midrange + 1);
          break;
        case "SF":
          trained.midrange = Math.min(99, trained.midrange + 1);
          trained.drive = Math.min(99, trained.drive + 1);
          break;
        case "PF":
          trained.inside = Math.min(99, trained.inside + 1);
          trained.postup = Math.min(99, trained.postup + 1);
          break;
        case "C":
          trained.inside = Math.min(99, trained.inside + 1);
          trained.block = Math.min(99, trained.block + 1);
          break;
      }
      await this.prisma.player.update({
        where: { id: p.id },
        data: { abilities: trained },
      });
      touched++;
    }
    if (touched > 0) {
      await this.teamService.invalidateCache(teamId);
    }
    return touched;
  }

  /** 为所有 AI 球队执行训练（每日结算后调用） */
  async applyTrainingForAllAiTeams(): Promise<number> {
    const aiTeams = await this.prisma.team.findMany({
      where: { userId: null },
      select: { id: true },
    });
    let total = 0;
    for (const t of aiTeams) {
      total += await this.applyTrainingForTeam(t.id);
    }
    this.logger.log(`AI 训练完成：${aiTeams.length} 支球队，${total} 名球员`);
    return total;
  }

  // ── 工具 ──
  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, n) => s + n, 0) / arr.length;
  }

  private clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  private randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
  }
}
