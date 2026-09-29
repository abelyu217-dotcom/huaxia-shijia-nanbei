/**
 * ScheduleService——赛程生成 + 推进一日 + 赛季交接
 *
 * - generateSchedule: 单循环赛程（N 队 = N*(N-1)/2 场），分配到每日
 * - advanceDay: 推进一日，结算当日所有 scheduled 比赛
 * - seasonTransition: 常规赛结束 → 季后赛 → 休赛期 → 新赛季
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SimService } from "../sim/sim.service.js";
import { SeasonService } from "./season.service.js";
import { AiManagerService } from "../ai/ai-manager.service.js";

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly simService: SimService,
    private readonly seasonService: SeasonService,
    private readonly aiManager: AiManagerService,
  ) {}

  /** 为赛季中的所有球队生成单循环赛程 */
  async generateSchedule(seasonId: string, leagueId: string): Promise<number> {
    // 检查是否已有赛程
    const existing = await this.prisma.match.count({
      where: { seasonId, leagueId },
    });
    if (existing > 0) {
      this.logger.log(`赛程已存在（${existing} 场），跳过生成`);
      return existing;
    }

    // 获取联赛所有球队
    const teams = await this.prisma.team.findMany({
      where: { leagueId },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (teams.length < 2) {
      this.logger.warn(`联赛 ${leagueId} 球队不足，无法生成赛程`);
      return 0;
    }

    // 单循环赛程：round-robin 算法
    const teamIds = teams.map((t) => t.id);
    const matchups = this.roundRobin(teamIds);

    // 分配到每日（每天 3 场，最后一日可能不满）
    const matchesPerDay = 3;
    let day = 1;
    let created = 0;

    for (let i = 0; i < matchups.length; i++) {
      const [homeId, awayId] = matchups[i];

      await this.prisma.match.create({
        data: {
          seasonId,
          leagueId,
          homeTeamId: homeId,
          awayTeamId: awayId,
          day,
          status: "scheduled",
        },
      });
      created++;

      // 每 matchesPerDay 场推进一天
      if ((i + 1) % matchesPerDay === 0) {
        day++;
      }
    }

    this.logger.log(`赛程已生成：${created} 场，${day} 天`);
    return created;
  }

  /** 推进一日：先让 AI 经理刷新阵容/战术，再结算当日所有 scheduled 比赛 */
  async advanceDay(seasonId: string): Promise<{ settled: number; nextDay: number; seasonEnded: boolean }> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new Error(`Season ${seasonId} not found`);

    const currentDay = season.currentDay;

    // 1. AI 经理刷新阵容 + 战术（影响当日 sim 输入）
    try {
      const refreshed = await this.aiManager.refreshAllAiTeams("normal");
      this.logger.log(`AI 经理刷新 ${refreshed} 支球队阵容/战术`);
    } catch (e) {
      this.logger.warn(
        `AI 经理刷新失败（不影响结算）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 获取当日所有未结算比赛
    const todayMatches = await this.prisma.match.findMany({
      where: { seasonId, day: currentDay, status: "scheduled" },
      include: { result: true },
    });

    this.logger.log(`推进至第 ${currentDay} 日，结算 ${todayMatches.length} 场比赛`);

    // 2. 逐场结算（使用每支球队持久化的战术预设）
    for (const match of todayMatches) {
      const [homeTactic, awayTactic] = await Promise.all([
        this.getTeamTacticPresetId(match.homeTeamId),
        this.getTeamTacticPresetId(match.awayTeamId),
      ]);
      await this.simService.simulateAndSave({
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTacticId: homeTactic,
        awayTacticId: awayTactic,
        seasonId,
        day: currentDay,
      });
    }

    // 3. 结算后 AI 经理训练（微弱能力成长，M1 阶段占位实现）
    try {
      await this.aiManager.applyTrainingForAllAiTeams();
    } catch (e) {
      this.logger.warn(
        `AI 训练失败（不影响结算）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 检查是否还有后续比赛
    const remaining = await this.prisma.match.count({
      where: { seasonId, status: "scheduled" },
    });

    // 推进日期
    const updated = await this.prisma.season.update({
      where: { id: seasonId },
      data: { currentDay: { increment: 1 } },
      select: { currentDay: true },
    });

    // 如果没有剩余比赛，触发赛季交接
    let seasonEnded = false;
    if (remaining === 0) {
      seasonEnded = await this.seasonService.handleSeasonEnd(seasonId);
    }

    return {
      settled: todayMatches.length,
      nextDay: updated.currentDay,
      seasonEnded,
    };
  }

  /** 读取球队当前持久化的战术预设 ID；未配置则回退到 pace_space */
  private async getTeamTacticPresetId(teamId: string): Promise<string> {
    const tactic = await this.prisma.tactic.findUnique({
      where: { teamId },
      select: { presetId: true },
    });
    return tactic?.presetId ?? "pace_space";
  }

  /** Round-Robin 算法：返回 [home, away] 对阵列表 */
  private roundRobin(teamIds: string[]): [string, string][] {
    const ids = [...teamIds];
    if (ids.length % 2 !== 0) {
      ids.push("BYE"); // 奇数队补 BYE
    }

    const n = ids.length;
    const rounds = n - 1;
    const half = n / 2;
    const matchups: [string, string][] = [];

    const arr = [...ids];

    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < half; i++) {
        const home = arr[i];
        const away = arr[n - 1 - i];
        if (home !== "BYE" && away !== "BYE") {
          // 交替主客场
          if (round % 2 === 0) {
            matchups.push([home, away]);
          } else {
            matchups.push([away, home]);
          }
        }
      }
      // 轮转：固定第一个，其余顺时针
      const last = arr.pop()!;
      arr.splice(1, 0, last);
    }

    return matchups;
  }
}
