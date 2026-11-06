/**
 * DynastyService——王朝与传承系统服务（P3-3）
 *
 * 职责：
 * 1. 球队王朝记录查询/判定
 * 2. 名人堂名单查询
 * 3. 时代标签查询
 * 4. 球员传承遗产查询
 *
 * 参见：王朝与传承系统设计.html
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type DynastyTier = "legendary" | "golden" | "silver" | "rising";
export type HofTier = "legendary" | "hall" | "honor";
export type EraTagType = "player" | "team" | "season";

const TIER_LABEL: Record<DynastyTier, string> = {
  legendary: "传奇王朝",
  golden: "黄金王朝",
  silver: "白银王朝",
  rising: "崛起中",
};

const HOF_LABEL: Record<HofTier, string> = {
  legendary: "传奇名人堂",
  hall: "名人堂",
  honor: "荣誉堂",
};

@Injectable()
export class DynastyService {
  private readonly logger = new Logger(DynastyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 获取球队王朝记录 */
  async getTeamDynasty(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    const records = await this.prisma.dynastyRecord.findMany({
      where: { teamId },
      orderBy: [{ active: "desc" }, { startSeason: "asc" }],
    });

    // 计算综合评分（取活跃王朝或最新）
    const active = records.find((r) => r.active);
    const totalLegacy = records.reduce((s, r) => s + r.legacyScore, 0);

    return {
      teamId,
      teamName: team.name,
      records: records.map((r) => ({
        id: r.id,
        tier: r.tier,
        tierLabel: TIER_LABEL[r.tier as DynastyTier] ?? r.tier,
        startSeason: r.startSeason,
        endSeason: r.endSeason,
        titles: r.titles,
        runnerUps: r.runnerUps,
        signatureTags: r.signatureTags as string[],
        legacyScore: r.legacyScore,
        active: r.active,
      })),
      activeDynasty: active
        ? {
            tier: active.tier,
            tierLabel: TIER_LABEL[active.tier as DynastyTier] ?? active.tier,
            titles: active.titles,
            legacyScore: active.legacyScore,
          }
        : null,
      totalLegacyScore: totalLegacy,
    };
  }

  /** 获取名人堂名单 */
  async getHallOfFame() {
    const entries = await this.prisma.hallOfFameEntry.findMany({
      orderBy: [{ tier: "asc" }, { legacyScore: "desc" }],
      include: { player: { select: { name: true, position: true } } },
    });

    return {
      legendary: entries
        .filter((e) => e.tier === "legendary")
        .map((e) => this.toHofView(e)),
      hall: entries
        .filter((e) => e.tier === "hall")
        .map((e) => this.toHofView(e)),
      honor: entries
        .filter((e) => e.tier === "honor")
        .map((e) => this.toHofView(e)),
    };
  }

  /** 获取某球员的时代标签 */
  async getPlayerEraTags(playerId: string) {
    const tags = await this.prisma.eraTag.findMany({
      where: { type: "player", refId: playerId },
      orderBy: { season: "desc" },
    });
    return tags.map((t) => ({
      id: t.id,
      label: t.label,
      season: t.season,
      weight: t.weight,
      narrative: t.narrative,
    }));
  }

  /** 获取某球队的时代标签 */
  async getTeamEraTags(teamId: string) {
    const tags = await this.prisma.eraTag.findMany({
      where: { type: "team", refId: teamId },
      orderBy: { season: "desc" },
    });
    return tags.map((t) => ({
      id: t.id,
      label: t.label,
      season: t.season,
      weight: t.weight,
      narrative: t.narrative,
    }));
  }

  /** 获取某球员的传承遗产（作为传承源） */
  async getPlayerLegacy(playerId: string) {
    const legacies = await this.prisma.legacy.findMany({
      where: { fromPlayerId: playerId },
      orderBy: { season: "desc" },
    });

    const hof = await this.prisma.hallOfFameEntry.findUnique({ where: { playerId } });

    return {
      playerId,
      hallOfFame: hof
        ? {
            tier: hof.tier,
            tierLabel: HOF_LABEL[hof.tier as HofTier] ?? hof.tier,
            legacyScore: hof.legacyScore,
            titles: hof.titles,
            inductedSeason: hof.inductedSeason,
            narrative: hof.narrative,
          }
        : null,
      legacies: legacies.map((l) => ({
        id: l.id,
        type: l.type,
        toRefId: l.toRefId,
        effects: l.effects as Record<string, unknown>,
        season: l.season,
      })),
    };
  }

  /** 赛季末判定王朝（由 season 结算调用） */
  async evaluateDynasty(teamId: string, season: number, titles: number, runnerUps: number, playoffAppearances: number) {
    let tier: DynastyTier = "rising";
    if (titles >= 3) tier = "legendary";
    else if (titles >= 2) tier = "golden";
    else if (titles >= 1) tier = "silver";

    const legacyScore =
      titles * 10 +
      runnerUps * 4 +
      playoffAppearances * 2;

    const active = await this.prisma.dynastyRecord.findFirst({
      where: { teamId, active: true },
    });

    if (active) {
      await this.prisma.dynastyRecord.update({
        where: { id: active.id },
        data: {
          tier,
          titles,
          runnerUps,
          legacyScore,
          endSeason: season,
        },
      });
    } else {
      await this.prisma.dynastyRecord.create({
        data: {
          teamId,
          tier,
          startSeason: season,
          endSeason: season,
          titles,
          runnerUps,
          legacyScore,
          active: true,
        },
      });
    }

    this.logger.log(`王朝判定：team=${teamId} season=${season} tier=${tier} score=${legacyScore}`);
  }

  private toHofView(e: { id: string; playerId: string; tier: string; legacyScore: number; titles: number; inductedSeason: number; narrative: string | null; player: { name: string; position: string } }) {
    return {
      id: e.id,
      playerId: e.playerId,
      playerName: e.player.name,
      position: e.player.position,
      tier: e.tier,
      tierLabel: HOF_LABEL[e.tier as HofTier] ?? e.tier,
      legacyScore: e.legacyScore,
      titles: e.titles,
      inductedSeason: e.inductedSeason,
      narrative: e.narrative,
    };
  }
}
