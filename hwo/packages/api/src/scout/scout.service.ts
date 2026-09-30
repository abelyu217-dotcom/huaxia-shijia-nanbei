/**
 * ScoutService——球探/迷雾系统服务
 *
 * 职责：
 * 1. 管理 ScoutReport（球探报告）的 CRUD
 * 2. 执行球员探查 / 潜力探查，收窄 fog
 * 3. 管理球探预算
 *
 * 参见 球探系统设计.html §3-§6
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  applyFog,
  performPlayerScout,
  performPotentialScout,
  PLAYER_SCOUT_COST,
  POTENTIAL_SCOUT_COST,
  SEASON_SCOUT_BUDGET,
  type Abilities,
  type FogValue,
  type ScoutReport,
  type Player,
  type Position,
} from "@hwo/shared";

@Injectable()
export class ScoutService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取某球队对某球员的球探报告
   */
  async getReport(teamId: string, playerId: string): Promise<ScoutReport | null> {
    const row = await this.prisma.scoutReport.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!row) return null;
    return this.toScoutReport(row);
  }

  /**
   * 获取某球队的所有球探报告
   */
  async getTeamReports(teamId: string): Promise<ScoutReport[]> {
    const rows = await this.prisma.scoutReport.findMany({
      where: { teamId },
      orderBy: { lastScoutedAt: "desc" },
    });
    return rows.map((r) => this.toScoutReport(r));
  }

  /**
   * 执行球员探查：收窄该球员全部能力 fog
   */
  async scoutPlayer(
    teamId: string,
    playerId: string,
  ): Promise<{ report: ScoutReport; cost: number }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`球员 ${playerId} 不存在`);

    const existing = await this.getReport(teamId, playerId);
    const abilities = player.abilities as unknown as Abilities;
    const traits = (player.traits as string[]) ?? [];

    const { abilityFog, traitHints, scoutCount } = performPlayerScout(
      abilities,
      traits,
      player.age,
      existing?.scoutLevel ?? 3,
      existing,
    );

    const cost = PLAYER_SCOUT_COST;

    const upserted = await this.prisma.scoutReport.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      create: {
        teamId,
        playerId,
        abilityFog: abilityFog as unknown as Prisma.JsonObject,
        traitHints: traitHints as unknown as Prisma.JsonArray,
        scoutCount,
        totalCost: cost,
        lastScoutedAt: new Date(),
      },
      update: {
        abilityFog: abilityFog as unknown as Prisma.JsonObject,
        traitHints: traitHints as unknown as Prisma.JsonArray,
        scoutCount,
        totalCost: { increment: cost },
        lastScoutedAt: new Date(),
      },
    });

    return { report: this.toScoutReport(upserted), cost };
  }

  /**
   * 执行潜力探查：收窄该球员 Peak fog
   */
  async scoutPotential(
    teamId: string,
    playerId: string,
  ): Promise<{ report: ScoutReport; cost: number }> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`球员 ${playerId} 不存在`);

    const existing = await this.getReport(teamId, playerId);
    const realPeak = player.potential ?? 75;

    const peakFog = performPotentialScout(
      realPeak,
      player.age,
      existing?.scoutLevel ?? 3,
      existing,
    );

    const cost = POTENTIAL_SCOUT_COST;
    const scoutCount = (existing?.scoutCount ?? 0) + 1;

    const upserted = await this.prisma.scoutReport.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      create: {
        teamId,
        playerId,
        peakFog: peakFog as unknown as Prisma.JsonObject,
        traitHints: existing?.traitHints ?? ([] as unknown as Prisma.JsonArray),
        scoutCount,
        totalCost: cost,
        lastScoutedAt: new Date(),
      },
      update: {
        peakFog: peakFog as unknown as Prisma.JsonObject,
        scoutCount,
        totalCost: { increment: cost },
        lastScoutedAt: new Date(),
      },
    });

    return { report: this.toScoutReport(upserted), cost };
  }

  /**
   * 对一支球队的球员列表应用 fog（供 TeamController 使用）
   * 返回 fogged players 数组
   */
  async applyFogToTeamPlayers(
    viewerTeamId: string | null,
    targetTeamId: string,
    players: {
      id: string;
      name: string;
      position: string;
      abilities: unknown;
      traits: unknown;
      salary?: number | null;
      age?: number;
      fatigue?: number;
    }[],
  ): Promise<Array<{
    id: string;
    name: string;
    position: string;
    abilities: Partial<Record<keyof Abilities, FogValue>>;
    realAbilities?: Abilities;
    peak: FogValue | number | null;
    ovr: FogValue | number;
    traits: string[];
    salary?: number;
    age?: number;
    scouted: boolean;
  }>> {
    const isOwn = viewerTeamId === targetTeamId;

    // 批量获取该球队对这些球员的球探报告
    let reportMap = new Map<string, ScoutReport>();
    if (!isOwn && viewerTeamId) {
      const reports = await this.prisma.scoutReport.findMany({
        where: {
          teamId: viewerTeamId,
          playerId: { in: players.map((p) => p.id) },
        },
      });
      for (const r of reports) {
        reportMap.set(r.playerId, this.toScoutReport(r));
      }
    }

    return players.map((p) => {
      const abilities = p.abilities as Abilities;
      const player: Player = {
        id: p.id,
        name: p.name,
        position: p.position as Position,
        abilities,
        condition: { fatigue: (p.fatigue ?? 0) / 100, foulTrouble: 0, hot: 0 },
        traits: (p.traits as string[]) ?? [],
        salary: p.salary ?? 0,
      };
      const report = reportMap.get(p.id) ?? null;
      const fogged = applyFog(player, report, isOwn, 3, null);

      return {
        id: p.id,
        name: p.name,
        position: p.position,
        abilities: fogged.abilities,
        realAbilities: fogged.realAbilities,
        peak: fogged.peak,
        ovr: fogged.ovr,
        traits: fogged.traits,
        salary: p.salary ?? undefined,
        age: p.age,
        scouted: fogged.scouted,
      };
    });
  }

  /**
   * 获取球探预算状态
   */
  async getBudget(teamId: string): Promise<{
    remaining: number;
    total: number;
    used: number;
  }> {
    const reports = await this.prisma.scoutReport.findMany({
      where: { teamId },
      select: { totalCost: true },
    });
    const used = reports.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);
    return {
      remaining: Math.max(0, SEASON_SCOUT_BUDGET - used),
      total: SEASON_SCOUT_BUDGET,
      used,
    };
  }

  // ─── 内部方法 ───

  private toScoutReport(row: {
    teamId: string;
    playerId: string;
    abilityFog: unknown;
    peakFog: unknown;
    traitHints: unknown;
    lastScoutedAt: Date;
    scoutCount: number;
    scoutLevel: number;
    totalCost: number;
  }): ScoutReport {
    return {
      teamId: row.teamId,
      playerId: row.playerId,
      abilityFog: (row.abilityFog ?? {}) as ScoutReport["abilityFog"],
      peakFog: (row.peakFog ?? null) as ScoutReport["peakFog"],
      traitHints: (row.traitHints ?? []) as string[],
      lastScoutedAt: row.lastScoutedAt.toISOString(),
      scoutCount: row.scoutCount,
      scoutLevel: row.scoutLevel,
    };
  }
}

// 临时引入 Prisma 类型（避免在文件顶部重复 import）
import type { Prisma } from "@prisma/client";
