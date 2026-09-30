/**
 * SimService——比赛模拟 + 结果持久化
 *
 * 职责：
 * 1. 组装主客队（含战术覆盖）
 * 2. 调用 @hwo/shared simulate() 引擎
 * 3. 将结果写入 matches + match_results 表（带默认赛季）
 */

import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import {
  DEFAULT_CONFIG,
  simulate,
  tacticFromPreset,
  type SimOutput,
  type Team,
} from "@hwo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { TeamService } from "../team/team.service.js";
import { SeasonService } from "../season/season.service.js";

export interface SimMatchParams {
  homeTeamId: string;
  awayTeamId: string;
  homeTacticId: string;
  awayTacticId: string;
  seed?: number;
  /** 赛季 ID，不传则使用默认赛季 */
  seasonId?: string;
  /** 赛季第几日，用于赛程排序 */
  day?: number;
}

@Injectable()
export class SimService {
  private readonly logger = new Logger(SimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
    @Inject(forwardRef(() => SeasonService))
    private readonly seasonService: SeasonService,
  ) {}

  /** 获取或创建默认赛季 + 联赛（M1 阶段单赛季/单联赛模式） */
  private async getOrCreateDefaultSeasonContext(): Promise<{ seasonId: string; leagueId: string }> {
    const season = await this.seasonService.getCurrentSeason();
    let league = await this.prisma.league.findFirst({
      where: { seasonId: season.id },
      select: { id: true },
    });
    if (!league) {
      league = await this.prisma.league.create({
        data: { seasonId: season.id, name: "HWO Premier", level: 1 },
        select: { id: true },
      });
    }
    return { seasonId: season.id, leagueId: league.id };
  }

  /** 执行一场比赛并持久化结果 */
  async simulateAndSave(params: SimMatchParams): Promise<SimOutput> {
    const home = await this.teamService.getById(params.homeTeamId);
    const away = await this.teamService.getById(params.awayTeamId);
    if (!home) {
      throw new Error(`Team ${params.homeTeamId} not found`);
    }
    if (!away) {
      throw new Error(`Team ${params.awayTeamId} not found`);
    }

    const homeTeam: Team = {
      ...home,
      tactic: tacticFromPreset(home.id, params.homeTacticId),
    };
    const awayTeam: Team = {
      ...away,
      tactic: tacticFromPreset(away.id, params.awayTacticId),
    };

    const seed = params.seed ?? Math.floor(Math.random() * 1_000_000);

    const output = simulate({
      matchup: { homeTeam, awayTeam },
      seed,
      config: DEFAULT_CONFIG,
    });

    const ctx = params.seasonId
      ? { seasonId: params.seasonId, leagueId: (await this.getOrCreateDefaultSeasonContext()).leagueId }
      : await this.getOrCreateDefaultSeasonContext();
    const { seasonId, leagueId } = ctx;

    const { result } = output;

    await this.prisma.match.create({
      data: {
        seasonId,
        leagueId,
        homeTeamId: params.homeTeamId,
        awayTeamId: params.awayTeamId,
        day: params.day ?? 1,
        status: "settled",
        seed,
        settledAt: new Date(),
        result: {
          create: {
            homeScore: result.homeScore,
            awayScore: result.awayScore,
            winnerId: result.winnerId,
            loserId: result.loserId,
            isClutch: result.isClutch ?? false,
            pbp: output.pbp as unknown as object,
            boxScore: output.boxScore as unknown as object,
            quarterScores: output.quarterScores as unknown as object,
            seed,
          },
        },
      },
    });

    // 更新积分榜
    await this.seasonService.applyMatchResult(seasonId, leagueId, {
      homeTeamId: params.homeTeamId,
      awayTeamId: params.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerId: result.winnerId,
    });

    // 更新球员疲劳值（#13 状态色体系）：根据出场时间累积疲劳
    await this.applyFatigueFromBoxScore(output.boxScore);

    this.logger.log(
      `Match saved: ${params.homeTeamId} ${result.homeScore}-${result.awayScore} ${params.awayTeamId} (seed=${seed})`,
    );

    return output;
  }

  /** 根据 boxScore 中的出场时间更新球员疲劳值 */
  private async applyFatigueFromBoxScore(boxScore: {
    home: { players: { playerId: string; minutes: number }[] };
    away: { players: { playerId: string; minutes: number }[] };
  }): Promise<void> {
    const allPlayers = [
      ...boxScore.home.players,
      ...boxScore.away.players,
    ];
    // 出场时间 × 0.5 = 疲劳增量（打满 40 分钟 +20 疲劳）
    const updates = allPlayers
      .filter((p) => p.minutes > 0)
      .map((p) => ({
        id: p.playerId,
        fatigueIncrement: Math.round(p.minutes * 0.5),
      }));

    if (updates.length === 0) return;

    await Promise.all(
      updates.map((u) =>
        this.prisma.player.update({
          where: { id: u.id },
          data: {
            fatigue: { increment: u.fatigueIncrement },
          },
        }),
      ),
    );

    // 疲劳值 clamp 到 0-100（increment 可能超过 100，需要修正）
    const players = await this.prisma.player.findMany({
      where: { id: { in: updates.map((u) => u.id) } },
      select: { id: true, fatigue: true },
    });
    const over = players.filter((p) => p.fatigue > 100);
    if (over.length > 0) {
      await Promise.all(
        over.map((p) =>
          this.prisma.player.update({
            where: { id: p.id },
            data: { fatigue: 100 },
          }),
        ),
      );
    }
  }

  /** 纯模拟，不持久化（用于 demo 等无状态场景） */
  simulateOnly(homeTeam: Team, awayTeam: Team, seed: number): SimOutput {
    return simulate({
      matchup: { homeTeam, awayTeam },
      seed,
      config: DEFAULT_CONFIG,
    });
  }
}
