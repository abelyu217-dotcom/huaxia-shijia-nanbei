/**
 * PlayoffService——季后赛淘汰系统
 *
 * 职责：
 * 1. generateBracket：常规赛结束后，从积分榜取前 N 名生成对阵树（PlayoffSeries）
 * 2. scheduleRound：为当前轮次中已确定双方的系列赛创建 Match 记录
 * 3. processResults：结算已完成的季后赛比赛，更新系列赛胜场，胜者晋级下一轮
 * 4. getBracket：返回完整对阵树（含比赛结果），供前端展示
 *
 * 对阵规则：
 * - 国内 L1：前 4 名 → 半决赛(1v4, 2v3) → 决赛
 * - 国际联赛：前 8 名 → 1/4 决赛 → 半决赛 → 决赛（≥16 队则多一轮 1/8）
 * - 国内 L2：无季后赛（仅升降级）
 *
 * 系列赛赛制：
 * - 早期轮次：五局三胜（bestOf=5）
 * - 决赛：七局四胜（bestOf=7）
 * - 16 强赛：三局两胜（bestOf=3）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

interface TeamSeed {
  teamId: string;
  teamName: string;
  seed: number;
  wins: number;
  losses: number;
}

export interface PlayoffMatchView {
  id: string;
  day: number;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  status: string;
}

export interface PlayoffSeriesView {
  id: string;
  round: number;
  slot: number;
  bestOf: number;
  teamAId: string | null;
  teamAName: string | null;
  seedA: number | null;
  teamBId: string | null;
  teamBName: string | null;
  seedB: number | null;
  winsA: number;
  winsB: number;
  status: string;
  winnerId: string | null;
  matches: PlayoffMatchView[];
}

export interface PlayoffBracketView {
  seasonId: string;
  leagueId: string;
  leagueName: string;
  totalRounds: number;
  series: PlayoffSeriesView[];
  championId: string | null;
  championName: string | null;
}

@Injectable()
export class PlayoffService {
  private readonly logger = new Logger(PlayoffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 判断联赛是否有季后赛。
   * 国内 L1 与国际联赛有季后赛；国内 L2 无。
   */
  private leagueHasPlayoffs(level: number, type: string): boolean {
    if (type === "international") return true;
    return level === 1;
  }

  /**
   * 根据联赛球队数量决定季后赛参赛队伍数与赛制。
   * 返回 { teamCount, rounds, bestOfByRound }
   */
  private decideFormat(
    teamCount: number,
    _type: string,
  ): { teamCount: number; rounds: number; bestOfByRound: number[] } {
    // 取不超过实际球队数的最大 2 的幂次（2/4/8/16）
    let n = 2;
    if (teamCount >= 16) n = 16;
    else if (teamCount >= 8) n = 8;
    else if (teamCount >= 4) n = 4;
    else n = 2;

    const rounds = Math.log2(n); // 2→1, 4→2, 8→3, 16→4
    // 赛制：16 强首轮三局两胜，其余早期轮五局三胜，决赛七局四胜
    const bestOfByRound: number[] = [];
    for (let r = 1; r <= rounds; r++) {
      if (r === rounds) bestOfByRound.push(7); // 决赛
      else if (n === 16 && r === 1) bestOfByRound.push(3); // 16 强首轮
      else bestOfByRound.push(5);
    }
    return { teamCount: n, rounds, bestOfByRound };
  }

  /**
   * 为指定联赛生成季后赛对阵树。
   * 从积分榜取前 N 名，按种子排位创建 PlayoffSeries。
   */
  async generateBracket(
    seasonId: string,
    leagueId: string,
  ): Promise<{ seriesCount: number; rounds: number }> {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { level: true, type: true, name: true },
    });
    if (!league) throw new Error(`League ${leagueId} not found`);
    if (!this.leagueHasPlayoffs(league.level, league.type)) {
      this.logger.log(`联赛 ${league.name} 无季后赛（L2），跳过`);
      return { seriesCount: 0, rounds: 0 };
    }

    // 已生成则跳过
    const existing = await this.prisma.playoffSeries.count({
      where: { seasonId, leagueId },
    });
    if (existing > 0) {
      this.logger.log(`联赛 ${league.name} 季后赛对阵已生成（${existing} 组），跳过`);
      const maxRound = await this.prisma.playoffSeries.aggregate({
        where: { seasonId, leagueId },
        _max: { round: true },
      });
      return { seriesCount: existing, rounds: maxRound._max.round ?? 0 };
    }

    // 获取积分榜（按胜率排序）
    const standings = await this.prisma.standing.findMany({
      where: { leagueId },
      include: { team: { select: { name: true } } },
      orderBy: [
        { wins: "desc" },
        { losses: "asc" },
        { pointsFor: "desc" },
      ],
    });
    if (standings.length < 2) {
      this.logger.warn(`联赛 ${league.name} 球队不足，无法生成季后赛`);
      return { seriesCount: 0, rounds: 0 };
    }

    const format = this.decideFormat(standings.length, league.type);
    const qualified = standings.slice(0, format.teamCount);
    const seeds: TeamSeed[] = qualified.map((s, i) => ({
      teamId: s.teamId,
      teamName: s.team.name,
      seed: i + 1,
      wins: s.wins,
      losses: s.losses,
    }));

    this.logger.log(
      `联赛 ${league.name} 季后赛：${format.teamCount} 强，${format.rounds} 轮，参赛球队：${seeds
        .map((s) => `#${s.seed} ${s.teamName}`)
        .join(", ")}`,
    );

    // 构建对阵树：每轮的系列赛数 = teamCount / 2^round
    // 种子配对：第 1 轮 1vN, 2v(N-1), ...
    // 胜者晋级：series i (1-based) 的胜者进入下一轮 slot ceil(i/2)
    const seriesData: Array<{
      seasonId: string;
      leagueId: string;
      round: number;
      slot: number;
      bestOf: number;
      teamAId: string | null;
      teamBId: string | null;
      seedA: number | null;
      seedB: number | null;
      nextRound: number | null;
      nextSlot: number | null;
    }> = [];

    for (let r = 1; r <= format.rounds; r++) {
      const seriesInRound = format.teamCount / Math.pow(2, r);
      const bestOf = format.bestOfByRound[r - 1]!;
      for (let s = 1; s <= seriesInRound; s++) {
        let teamAId: string | null = null;
        let teamBId: string | null = null;
        let seedA: number | null = null;
        let seedB: number | null = null;

        if (r === 1) {
          // 首轮：种子配对 1vN, 2v(N-1), ...
          const seedAIdx = s - 1; // 0-based
          const seedBIdx = format.teamCount - s; // 0-based
          teamAId = seeds[seedAIdx]!.teamId;
          teamBId = seeds[seedBIdx]!.teamId;
          seedA = seeds[seedAIdx]!.seed;
          seedB = seeds[seedBIdx]!.seed;
        }

        // 胜者晋级位置
        let nextRound: number | null = null;
        let nextSlot: number | null = null;
        if (r < format.rounds) {
          nextRound = r + 1;
          nextSlot = Math.ceil(s / 2);
        }

        seriesData.push({
          seasonId,
          leagueId,
          round: r,
          slot: s,
          bestOf,
          teamAId,
          teamBId,
          seedA,
          seedB,
          nextRound,
          nextSlot,
        });
      }
    }

    await this.prisma.playoffSeries.createMany({ data: seriesData });
    return { seriesCount: seriesData.length, rounds: format.rounds };
  }

  /**
   * 为当前轮次中已确定双方且未排赛程的系列赛创建 Match 记录。
   * 每个系列赛每天排 1 场（主客场交替），直到达到 bestOf。
   * @returns 新创建的比赛数
   */
  async scheduleRound(
    seasonId: string,
    leagueId: string,
    day: number,
  ): Promise<number> {
    const series = await this.prisma.playoffSeries.findMany({
      where: {
        seasonId,
        leagueId,
        teamAId: { not: null },
        teamBId: { not: null },
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });
    if (series.length === 0) return 0;

    let created = 0;
    for (const s of series) {
      // 已完成的系列赛不再排赛
      if (s.status === "completed") continue;
      // 计算该系列赛已有的比赛数
      const matchCount = await this.prisma.match.count({
        where: { playoffSeriesId: s.id },
      });
      if (matchCount >= s.bestOf) continue; // 已排满

      // 已决出胜负则不再排赛
      const winsNeeded = Math.ceil(s.bestOf / 2);
      if (s.winsA >= winsNeeded || s.winsB >= winsNeeded) continue;

      // 确定主客场：第 1、3、5... 场 A 主场，第 2、4、6... 场 B 主场
      const gameNum = matchCount + 1;
      const aIsHome = gameNum % 2 === 1;
      const homeTeamId = aIsHome ? s.teamAId! : s.teamBId!;
      const awayTeamId = aIsHome ? s.teamBId! : s.teamAId!;

      await this.prisma.match.create({
        data: {
          seasonId,
          leagueId,
          homeTeamId,
          awayTeamId,
          day,
          status: "scheduled",
          phase: "playoff",
          playoffSeriesId: s.id,
        },
      });
      created++;

      // 更新系列赛状态
      if (s.status === "pending") {
        await this.prisma.playoffSeries.update({
          where: { id: s.id },
          data: { status: "in_progress" },
        });
      }
    }
    return created;
  }

  /**
   * 结算已完成的季后赛比赛：
   * - 统计每个系列赛的胜场
   * - 达到 bestOf 半数则决出胜者
   * - 胜者填入下一轮对应位置的 teamA/teamB
   * @returns { completedSeries, advancedToNextRound }
   */
  async processResults(
    seasonId: string,
    leagueId: string,
  ): Promise<{ completedSeries: number; advancedToNextRound: number }> {
    const series = await this.prisma.playoffSeries.findMany({
      where: { seasonId, leagueId },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });
    if (series.length === 0) return { completedSeries: 0, advancedToNextRound: 0 };

    let completedSeries = 0;
    let advancedToNextRound = 0;

    for (const s of series) {
      if (s.status === "completed" || !s.teamAId || !s.teamBId) continue;

      // 统计该系列赛已结算的比赛结果
      const matches = await this.prisma.match.findMany({
        where: { playoffSeriesId: s.id, status: "settled" },
        include: { result: { select: { winnerId: true } } },
      });

      let winsA = 0;
      let winsB = 0;
      for (const m of matches) {
        if (m.result?.winnerId === s.teamAId) winsA++;
        else if (m.result?.winnerId === s.teamBId) winsB++;
      }

      const winsNeeded = Math.ceil(s.bestOf / 2);
      if (winsA === s.winsA && winsB === s.winsB) continue; // 无变化

      // 更新胜场
      await this.prisma.playoffSeries.update({
        where: { id: s.id },
        data: { winsA, winsB },
      });

      // 检查是否决出胜者
      let winnerId: string | null = null;
      if (winsA >= winsNeeded) winnerId = s.teamAId;
      else if (winsB >= winsNeeded) winnerId = s.teamBId;

      if (winnerId) {
        await this.prisma.playoffSeries.update({
          where: { id: s.id },
          data: { status: "completed", winnerId },
        });
        completedSeries++;

        // 胜者晋级下一轮
        const nr = s.nextRound;
        const ns = s.nextSlot;
        if (nr != null && ns != null) {
          const next = await this.prisma.playoffSeries.findUnique({
            where: {
              seasonId_leagueId_round_slot: {
                seasonId,
                leagueId,
                round: nr,
                slot: ns,
              },
            },
          });
          if (next) {
            // slot 奇数 → 胜者作为 teamA，偶数 → 作为 teamB
            const isA = s.slot % 2 === 1;
            const updateData: {
              teamAId?: string;
              seedA?: number;
              teamBId?: string;
              seedB?: number;
            } = {};
            if (isA) {
              updateData.teamAId = winnerId;
              if (s.seedA != null) updateData.seedA = s.seedA;
            } else {
              updateData.teamBId = winnerId;
              if (s.seedB != null) updateData.seedB = s.seedB;
            }
            await this.prisma.playoffSeries.update({
              where: { id: next.id },
              data: updateData,
            });
            advancedToNextRound++;
          }
        }
      }
    }

    return { completedSeries, advancedToNextRound };
  }

  /**
   * 检查该联赛季后赛是否已全部结束（决赛有胜者）。
   */
  async isComplete(seasonId: string, leagueId: string): Promise<boolean> {
    const maxRound = await this.prisma.playoffSeries.aggregate({
      where: { seasonId, leagueId },
      _max: { round: true },
    });
    if (!maxRound._max.round) return false;
    const final = await this.prisma.playoffSeries.findFirst({
      where: { seasonId, leagueId, round: maxRound._max.round },
    });
    return final?.status === "completed" && !!final.winnerId;
  }

  /**
   * 获取联赛冠军（季后赛全部结束后）。
   */
  async getChampion(
    seasonId: string,
    leagueId: string,
  ): Promise<{ id: string; name: string } | null> {
    const maxRound = await this.prisma.playoffSeries.aggregate({
      where: { seasonId, leagueId },
      _max: { round: true },
    });
    if (!maxRound._max.round) return null;
    const final = await this.prisma.playoffSeries.findFirst({
      where: { seasonId, leagueId, round: maxRound._max.round, status: "completed" },
      include: { teamA: { select: { name: true } }, teamB: { select: { name: true } } },
    });
    if (!final?.winnerId) return null;
    const name =
      final.winnerId === final.teamAId
        ? final.teamA?.name
        : final.winnerId === final.teamBId
          ? final.teamB?.name
          : null;
    return name ? { id: final.winnerId, name } : null;
  }

  /**
   * 获取完整对阵树（含比赛结果），供前端展示。
   */
  async getBracket(
    seasonId: string,
    leagueId: string,
  ): Promise<PlayoffBracketView> {
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { name: true },
    });

    const series = await this.prisma.playoffSeries.findMany({
      where: { seasonId, leagueId },
      include: {
        teamA: { select: { name: true } },
        teamB: { select: { name: true } },
        matches: {
          orderBy: { day: "asc" },
          include: {
            result: { select: { homeScore: true, awayScore: true, winnerId: true } },
          },
        },
      },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });

    const maxRound = series.reduce((m, s) => Math.max(m, s.round), 0);

    const seriesViews: PlayoffSeriesView[] = series.map((s) => ({
      id: s.id,
      round: s.round,
      slot: s.slot,
      bestOf: s.bestOf,
      teamAId: s.teamAId,
      teamAName: s.teamA?.name ?? null,
      seedA: s.seedA,
      teamBId: s.teamBId,
      teamBName: s.teamB?.name ?? null,
      seedB: s.seedB,
      winsA: s.winsA,
      winsB: s.winsB,
      status: s.status,
      winnerId: s.winnerId,
      matches: s.matches.map((m) => {
        const homeName = m.homeTeamId === s.teamAId ? s.teamA?.name : m.homeTeamId === s.teamBId ? s.teamB?.name : "";
        const awayName = m.awayTeamId === s.teamAId ? s.teamA?.name : m.awayTeamId === s.teamBId ? s.teamB?.name : "";
        return {
          id: m.id,
          day: m.day,
          homeTeamId: m.homeTeamId,
          homeTeamName: homeName ?? "",
          awayTeamId: m.awayTeamId,
          awayTeamName: awayName ?? "",
          homeScore: m.result?.homeScore ?? null,
          awayScore: m.result?.awayScore ?? null,
          winnerId: m.result?.winnerId ?? null,
          status: m.status,
        };
      }),
    }));

    const champion = await this.getChampion(seasonId, leagueId);

    return {
      seasonId,
      leagueId,
      leagueName: league?.name ?? "",
      totalRounds: maxRound,
      series: seriesViews,
      championId: champion?.id ?? null,
      championName: champion?.name ?? null,
    };
  }
}
