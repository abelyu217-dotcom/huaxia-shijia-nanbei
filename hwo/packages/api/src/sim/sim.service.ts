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
  fillTacticDefaults,
  getActiveConfig,
  simulate,
  tacticFromPreset,
  type PlaybookAction,
  type SimOutput,
  type Team,
  type TacticModSet,
} from "@hwo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { TeamService } from "../team/team.service.js";
import { SeasonService } from "../season/season.service.js";
import { TacticService } from "../tactic/tactic.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";

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
  /** 已有赛程比赛 ID，传入则更新该比赛而非新建 */
  matchId?: string;
}

@Injectable()
export class SimService {
  private readonly logger = new Logger(SimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
    @Inject(forwardRef(() => SeasonService))
    private readonly seasonService: SeasonService,
    private readonly tacticService: TacticService,
    private readonly analytics: AnalyticsService,
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

    // M4: 使用球队存储的战术（含 familiarity 等自定义参数），
    // 而非从预设重建，以保证熟练度惩罚生效。
    // 若球队未配置战术则回退到预设。
    const homeTactic: TacticModSet = home.tactic
      ? fillTacticDefaults({ ...home.tactic, teamId: home.id })
      : tacticFromPreset(home.id, params.homeTacticId);
    const awayTactic: TacticModSet = away.tactic
      ? fillTacticDefaults({ ...away.tactic, teamId: away.id })
      : tacticFromPreset(away.id, params.awayTacticId);

    const homeTeam: Team = {
      ...home,
      tactic: homeTactic,
    };
    const awayTeam: Team = {
      ...away,
      tactic: awayTactic,
    };

    const seed = params.seed ?? Math.floor(Math.random() * 1_000_000);

    // M5 §6.1：使用热更新配置而非硬编码 DEFAULT_CONFIG（支持灰度调参）
    const config = getActiveConfig();

    const output = simulate({
      matchup: { homeTeam, awayTeam },
      seed,
      config,
    });

    const ctx = params.seasonId
      ? { seasonId: params.seasonId, leagueId: (await this.getOrCreateDefaultSeasonContext()).leagueId }
      : await this.getOrCreateDefaultSeasonContext();
    const { seasonId, leagueId } = ctx;

    const { result } = output;

    const matchData = {
      status: "settled" as const,
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
          // M5 §6.2：rngLog 用于审计 + 重放（防作弊）
          rngLog: output.rngLog as unknown as object,
          seed,
        },
      },
    };

    if (params.matchId) {
      // 更新已有赛程比赛
      await this.prisma.match.update({
        where: { id: params.matchId },
        data: matchData,
      });
    } else {
      // 新建比赛（手动模拟接口）
      await this.prisma.match.create({
        data: {
          seasonId,
          leagueId,
          homeTeamId: params.homeTeamId,
          awayTeamId: params.awayTeamId,
          day: params.day ?? 1,
          ...matchData,
        },
      });
    }

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

    // M4: 更新双方战术熟练度（根据 PBP 中各 action 使用次数）
    await this.updateFamiliarityFromPbp(params.homeTeamId, output.pbp);
    await this.updateFamiliarityFromPbp(params.awayTeamId, output.pbp);

    // M4 #8: 更新战术使用率统计
    await this.recordTacticUsage(params.homeTeamId, params.awayTeamId, result);

    this.logger.log(
      `Match saved: ${params.homeTeamId} ${result.homeScore}-${result.awayScore} ${params.awayTeamId} (seed=${seed})`,
    );

    // M5 §6.3 埋点：对真实玩家（home/away userId 存在）记录 sim_match 行为
    // 用于留存漏斗 + DAU 统计
    const trackedUsers = new Set<string>();
    if (home.userId && !trackedUsers.has(home.userId)) {
      trackedUsers.add(home.userId);
      await this.analytics.track({
        userId: home.userId,
        event: "sim_match",
        category: "game",
        properties: {
          teamId: params.homeTeamId,
          opponentId: params.awayTeamId,
          isHome: true,
          score: result.homeScore,
          opponentScore: result.awayScore,
          won: result.winnerId === params.homeTeamId,
        },
      });
    }
    if (away.userId && !trackedUsers.has(away.userId)) {
      trackedUsers.add(away.userId);
      await this.analytics.track({
        userId: away.userId,
        event: "sim_match",
        category: "game",
        properties: {
          teamId: params.awayTeamId,
          opponentId: params.homeTeamId,
          isHome: false,
          score: result.awayScore,
          opponentScore: result.homeScore,
          won: result.winnerId === params.awayTeamId,
        },
      });
    }

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

  // ─── M4: 熟练度更新 ───

  /**
   * 根据一场比赛的 PBP 统计某队各 action 使用次数，并更新战术熟练度。
   * 每次使用对应 action，熟练度 +1（带递减：越高越难提升），上限 100。
   */
  private async updateFamiliarityFromPbp(
    teamId: string,
    pbp: Array<{ teamId?: string; playAction?: PlaybookAction }>,
  ): Promise<void> {
    // 统计该队各 action 使用次数
    const usage = new Map<PlaybookAction, number>();
    for (const ev of pbp) {
      if (ev.teamId !== teamId || !ev.playAction) continue;
      usage.set(ev.playAction, (usage.get(ev.playAction) ?? 0) + 1);
    }
    if (usage.size === 0) return;

    // 读取当前战术
    const tactic = await this.prisma.tactic.findUnique({ where: { teamId } });
    if (!tactic) return;

    const modSet = tactic.modSet as unknown as TacticModSet;
    const familiarity = { ...(modSet.familiarity ?? {}) };

    let changed = false;
    for (const [action, count] of usage) {
      const current = familiarity[action] ?? 0;
      if (current >= 100) continue;
      // 递减收益：每点熟练度需要更多使用次数
      // current 0-50: +1 per use; 50-80: +1 per 2 uses; 80-100: +1 per 4 uses
      const divisor = current < 50 ? 1 : current < 80 ? 2 : 4;
      const increment = Math.floor(count / divisor);
      if (increment > 0) {
        familiarity[action] = Math.min(100, current + increment);
        changed = true;
      }
    }

    if (!changed) return;

    const updatedModSet = { ...modSet, familiarity };
    await this.prisma.tactic.update({
      where: { teamId },
      data: { modSet: updatedModSet as unknown as object },
    });

    // 清除球队缓存（战术变更）
    await this.teamService.invalidateCache(teamId);
  }

  // ─── M4 #8: 战术使用率统计 ───

  /**
   * 根据比赛结果更新双方战术的使用率统计
   */
  private async recordTacticUsage(
    homeTeamId: string,
    awayTeamId: string,
    result: { homeScore: number; awayScore: number; winnerId: string },
  ): Promise<void> {
    const [homeTactic, awayTactic] = await Promise.all([
      this.prisma.tactic.findUnique({ where: { teamId: homeTeamId } }),
      this.prisma.tactic.findUnique({ where: { teamId: awayTeamId } }),
    ]);

    const homePresetId = homeTactic?.presetId;
    const awayPresetId = awayTactic?.presetId;

    if (homePresetId) {
      await this.tacticService.recordUsage(
        homePresetId,
        result.winnerId === homeTeamId,
        result.homeScore,
        result.awayScore,
      );
    }
    if (awayPresetId) {
      await this.tacticService.recordUsage(
        awayPresetId,
        result.winnerId === awayTeamId,
        result.awayScore,
        result.homeScore,
      );
    }
  }
}
