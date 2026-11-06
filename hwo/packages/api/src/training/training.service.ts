/**
 * TrainingService——训练计划 + 每日训练结算 + 训练日志
 *
 * v0.6 设计：
 * - TrainingPlan：每队 1 份（focusByPosition 按位置定向 + teamFocus 整队权重）
 * - TrainingLog：每日每球员每能力一行（beforeVal/afterVal/gain/source）
 * - runDaily：由 ScheduleService.advanceDay 调用，对每支球队所有未退役球员
 *   按计划小幅成长（0.05-0.12 / 日），受训练馆倍率与职员加成影响。
 * - 成长严格受 player.potential 上限约束；下滑/退役阶段不成长。
 *
 * 参见：HWO_系统调整方案_v2.md §批次3
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { FacilityService } from "../facility/facility.service.js";
import { StaffService } from "../staff/staff.service.js";
import {
  getCareerStage,
  type Abilities,
} from "@hwo/shared";
import type { Prisma } from "@prisma/client";

/** 能力 key 类型 */
type AbilityKey = keyof Abilities;

/** 训练来源标签 */
type TrainSource = "team_training" | "position_training" | "individual";

/** 各位置默认主攻能力（用于未配置 TrainingPlan 时的兜底） */
const POSITION_DEFAULT_FOCUS: Record<string, AbilityKey> = {
  PG: "passing",
  SG: "three",
  SF: "midrange",
  PF: "inside",
  C: "postup",
};

/** 各位置可训练能力池（按权重抽取，权重递减） */
const POSITION_ABILITY_POOL: Record<string, Array<{ key: AbilityKey; weight: number }>> = {
  PG: [
    { key: "passing", weight: 3 },
    { key: "ballHandle", weight: 2 },
    { key: "iq", weight: 2 },
    { key: "drive", weight: 1 },
    { key: "three", weight: 1 },
  ],
  SG: [
    { key: "three", weight: 3 },
    { key: "midrange", weight: 2 },
    { key: "drive", weight: 1 },
    { key: "ballHandle", weight: 1 },
    { key: "perimeterD", weight: 1 },
  ],
  SF: [
    { key: "midrange", weight: 3 },
    { key: "three", weight: 2 },
    { key: "drive", weight: 2 },
    { key: "perimeterD", weight: 2 },
    { key: "inside", weight: 1 },
  ],
  PF: [
    { key: "inside", weight: 3 },
    { key: "postup", weight: 2 },
    { key: "strength", weight: 2 },
    { key: "interiorD", weight: 2 },
    { key: "jumping", weight: 1 },
  ],
  C: [
    { key: "postup", weight: 3 },
    { key: "inside", weight: 3 },
    { key: "interiorD", weight: 2 },
    { key: "strength", weight: 2 },
    { key: "block", weight: 1 },
    { key: "jumping", weight: 1 },
  ],
};

/** 训练日志视图（前端 TrainingLogEntry） */
export interface TrainingLogView {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  abilityKey: string;
  beforeVal: number;
  afterVal: number;
  gain: number;
  source: string;
  day: number;
  seasonId: string;
}

/** 当日训练汇总（用于 TrainingPage 顶部卡片） */
export interface DailyTrainingSummary {
  day: number;
  seasonId: string;
  totalGains: number; // 当日总成长点数（所有球员所有能力之和）
  playersTrained: number;
  topGains: Array<{
    playerId: string;
    playerName: string;
    ability: string;
    gain: number;
  }>;
  facilityMultiplier: number;
  staffBonus: number;
}

/** TrainingPlan 视图 */
export interface TrainingPlanView {
  teamId: string;
  focusByPosition: Record<string, string>;
  teamFocus: Record<string, number>;
  updatedAt: string;
}

@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facility: FacilityService,
    private readonly staff: StaffService,
  ) {}

  // ── 训练计划 CRUD ──

  /** 获取球队训练计划（不存在则用默认初始化） */
  async getPlan(teamId: string): Promise<TrainingPlanView> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    let plan = await this.prisma.trainingPlan.findUnique({ where: { teamId } });
    if (!plan) {
      plan = await this.prisma.trainingPlan.create({
        data: {
          teamId,
          focusByPosition: POSITION_DEFAULT_FOCUS as unknown as Prisma.InputJsonValue,
          teamFocus: {},
        },
      });
    }
    return {
      teamId: plan.teamId,
      focusByPosition: plan.focusByPosition as unknown as Record<string, string>,
      teamFocus: plan.teamFocus as unknown as Record<string, number>,
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  /** 更新训练计划 */
  async updatePlan(
    teamId: string,
    focusByPosition?: Record<string, string>,
    teamFocus?: Record<string, number>,
  ): Promise<TrainingPlanView> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    const data: Prisma.TrainingPlanUpdateInput = {};
    if (focusByPosition) {
      data.focusByPosition = focusByPosition as unknown as Prisma.InputJsonValue;
    }
    if (teamFocus) {
      data.teamFocus = teamFocus as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.trainingPlan.upsert({
      where: { teamId },
      create: {
        teamId,
        focusByPosition:
          (focusByPosition ?? POSITION_DEFAULT_FOCUS) as unknown as Prisma.InputJsonValue,
        teamFocus: (teamFocus ?? {}) as unknown as Prisma.InputJsonValue,
      },
      update: data,
    });

    this.logger.log(`训练计划已更新：team=${teamId}`);
    return {
      teamId: updated.teamId,
      focusByPosition: updated.focusByPosition as unknown as Record<string, string>,
      teamFocus: updated.teamFocus as unknown as Record<string, number>,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  // ── 训练日志查询 ──

  /** 查询训练日志（按 day 范围 / 球员过滤） */
  async getLogs(
    teamId: string,
    opts: { day?: number; dayGte?: number; dayLte?: number; playerId?: string; limit?: number },
  ): Promise<TrainingLogView[]> {
    const where: Prisma.TrainingLogWhereInput = { teamId };
    if (opts.day !== undefined) where.day = opts.day;
    if (opts.dayGte !== undefined || opts.dayLte !== undefined) {
      where.day = {};
      if (opts.dayGte !== undefined) where.day.gte = opts.dayGte;
      if (opts.dayLte !== undefined) where.day.lte = opts.dayLte;
    }
    if (opts.playerId) where.playerId = opts.playerId;

    const logs = await this.prisma.trainingLog.findMany({
      where,
      orderBy: { day: "desc" },
      take: opts.limit ?? 200,
    });

    if (logs.length === 0) return [];

    const playerIds = Array.from(new Set(logs.map((l) => l.playerId)));
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true, position: true },
    });
    const pMap = new Map(players.map((p) => [p.id, p]));

    return logs.map((l) => {
      const p = pMap.get(l.playerId);
      return {
        id: l.id,
        playerId: l.playerId,
        playerName: p?.name ?? "—",
        position: p?.position ?? "—",
        abilityKey: l.abilityKey,
        beforeVal: l.beforeVal,
        afterVal: l.afterVal,
        gain: l.gain,
        source: l.source,
        day: l.day,
        seasonId: l.seasonId,
      };
    });
  }

  /** 当日训练汇总 */
  async getDailySummary(teamId: string, seasonId: string, day: number): Promise<DailyTrainingSummary> {
    const [facilityMult, staffBonus] = await Promise.all([
      this.facility.getTrainingMultiplier(teamId),
      this.staff.getTrainingBonus(teamId),
    ]);

    const logs = await this.prisma.trainingLog.findMany({
      where: { teamId, seasonId, day },
      orderBy: { gain: "desc" },
    });

    const playerIds = Array.from(new Set(logs.map((l) => l.playerId)));
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true },
    });
    const pMap = new Map(players.map((p) => [p.id, p.name]));

    return {
      day,
      seasonId,
      totalGains: logs.reduce((s, l) => s + l.gain, 0),
      playersTrained: playerIds.length,
      topGains: logs.slice(0, 6).map((l) => ({
        playerId: l.playerId,
        playerName: pMap.get(l.playerId) ?? "—",
        ability: l.abilityKey,
        gain: l.gain,
      })),
      facilityMultiplier: facilityMult,
      staffBonus,
    };
  }

  // ── 每日训练结算（由 ScheduleService 调用） ──

  /**
   * 单支球队每日训练结算
   * - 对所有未退役球员按位置 focus + team focus + 训练馆倍率 + 职员加成
   *   小幅提升 1-2 项能力（0.05-0.15 / 日）
   * - 严格受 potential 上限约束
   * - 写入 TrainingLog
   */
  async runDaily(teamId: string, seasonId: string, day: number): Promise<{
    playersTrained: number;
    totalGains: number;
  }> {
    // 1. 加载训练计划 + 训练馆倍率 + 职员加成
    const [plan, facilityMult, staffBonus] = await Promise.all([
      this.prisma.trainingPlan.findUnique({ where: { teamId } }),
      this.facility.getTrainingMultiplier(teamId),
      this.staff.getTrainingBonus(teamId),
    ]);

    const focusByPosition =
      (plan?.focusByPosition as unknown as Record<string, string>) ?? POSITION_DEFAULT_FOCUS;
    const teamFocus = (plan?.teamFocus as unknown as Record<string, number>) ?? {};

    // 整队加权倍率（最大 1.2）
    const teamFocusBonus = Object.values(teamFocus).length > 0
      ? 1 + Math.min(0.2, Object.values(teamFocus).reduce((s, v) => s + Math.max(0, v), 0) * 0.05)
      : 1.0;

    // 2. 加载所有未退役球员
    const players = await this.prisma.player.findMany({
      where: { teamId, retired: false },
      select: { id: true, name: true, position: true, age: true, abilities: true, potential: true },
    });

    if (players.length === 0) {
      return { playersTrained: 0, totalGains: 0 };
    }

    // 3. 逐球员训练
    const logEntries: Array<{
      playerId: string;
      abilityKey: string;
      beforeVal: number;
      afterVal: number;
      gain: number;
      source: TrainSource;
    }> = [];
    let totalGains = 0;
    let playersTrained = 0;

    for (const p of players) {
      const abilities = p.abilities as unknown as Abilities;
      const potential = p.potential ?? 75;
      const stage = getCareerStage(p.age);

      // 下滑/退役阶段不训练
      if (stage === "decline" || stage === "retired") continue;

      // 抽 2 项能力训练（按位置权重池）
      const pool = POSITION_ABILITY_POOL[p.position] ?? POSITION_ABILITY_POOL["PG"]!;
      const picks = this.sampleByWeight(pool, 2);

      // 位置 focus 主能力（强制训练）
      const focusKey = (focusByPosition[p.position] as AbilityKey) ?? pool[0]!.key;
      if (!picks.includes(focusKey)) picks[0] = focusKey;

      let improved = false;
      for (const key of picks) {
        const current = abilities[key];
        const room = potential - current;
        if (room <= 0) continue;

        // 基础成长 0.05-0.12，乘以训练馆倍率、职员加成、整队权重
        const baseGrowth = 0.05 + Math.random() * 0.07;
        const growth = Math.min(
          room,
          baseGrowth * facilityMult * (1 + staffBonus) * teamFocusBonus,
        );
        const after = Math.min(99, Math.round((current + growth) * 100) / 100);
        const delta = Math.round((after - current) * 100) / 100;
        if (delta > 0) {
          abilities[key] = after;
          logEntries.push({
            playerId: p.id,
            abilityKey: key,
            beforeVal: current,
            afterVal: after,
            gain: delta,
            source: key === focusKey ? "position_training" : "team_training",
          });
          totalGains += delta;
          improved = true;
        }
      }

      if (improved) {
        // 更新球员能力值
        await this.prisma.player.update({
          where: { id: p.id },
          data: {
            abilities: abilities as unknown as Prisma.InputJsonValue,
            trainExp: { increment: 1 },
          },
        });
        playersTrained++;
      }
    }

    // 4. 批量写入训练日志
    if (logEntries.length > 0) {
      await this.prisma.trainingLog.createMany({
        data: logEntries.map((e) => ({
          teamId,
          seasonId,
          day,
          playerId: e.playerId,
          abilityKey: e.abilityKey,
          beforeVal: e.beforeVal,
          afterVal: e.afterVal,
          gain: e.gain,
          source: e.source,
        })),
      });
    }

    this.logger.log(
      `[Training] 球队 ${teamId} 第 ${day} 日训练：${playersTrained} 名球员，${logEntries.length} 条日志，总成长 ${totalGains.toFixed(2)}（设施 x${facilityMult}，职员 +${(staffBonus * 100).toFixed(0)}%）`,
    );

    return { playersTrained, totalGains };
  }

  /** 批量为所有球队执行每日训练 */
  async runDailyAllTeams(seasonId: string, day: number): Promise<void> {
    const teams = await this.prisma.team.findMany({ select: { id: true } });
    for (const t of teams) {
      try {
        await this.runDaily(t.id, seasonId, day);
      } catch (e) {
        this.logger.warn(
          `球队 ${t.id} 训练失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /** 按权重从池中抽取 n 项不重复能力 */
  private sampleByWeight<T extends { key: AbilityKey; weight: number }>(
    pool: T[],
    n: number,
  ): AbilityKey[] {
    const result: AbilityKey[] = [];
    const remaining = [...pool];
    for (let i = 0; i < n && remaining.length > 0; i++) {
      const totalW = remaining.reduce((s, x) => s + x.weight, 0);
      let r = Math.random() * totalW;
      let idx = 0;
      for (let j = 0; j < remaining.length; j++) {
        r -= remaining[j]!.weight;
        if (r <= 0) {
          idx = j;
          break;
        }
      }
      result.push(remaining[idx]!.key);
      remaining.splice(idx, 1);
    }
    return result;
  }
}
