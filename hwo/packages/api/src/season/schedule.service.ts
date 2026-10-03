/**
 * ScheduleService——赛程生成 + 推进一日 + 赛季交接
 *
 * - generateSchedule: 单循环赛程（N 队 = N*(N-1)/2 场），分配到每日
 * - advanceDay: 推进一日，结算当日所有 scheduled 比赛
 * - seasonTransition: 常规赛结束 → 季后赛 → 休赛期 → 新赛季
 */

import { Injectable, Logger, OnModuleInit, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SimService } from "../sim/sim.service.js";
import { SeasonService } from "./season.service.js";
import { AiManagerService } from "../ai/ai-manager.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { TrainingService } from "../training/training.service.js";
import { BoardService } from "../board/board.service.js";
import { PrService } from "../pr/pr.service.js";
import { OperationsService } from "../operations/operations.service.js";

/**
 * 每日结算时刻（北京时间，小时 0-23）。
 * 设计：10:00 结算当日比赛并推进至下一日。
 * v0.6 调整：改为按可配速率自动推进（WorldClockScheduler），1 秒 = 1 赛季分钟（默认）。
 *             旧版每日 10:00 结算逻辑保留作为兜底（仅当 rapid 模式未启动时生效）。
 */
const SETTLEMENT_HOUR = 10;

/**
 * v0.6 自动走时间配置。
 * - rapidEnabled: 是否启用快速推进（true 时按 RAPID_INTERVAL_MS 间隔推进 day）
 * - rapidIntervalMs: 推进间隔，默认 60000ms（即 1 分钟现实时间推进 1 个赛季日）
 * - 1 秒:1 赛季分钟 ≈ 1 分钟现实时间推进 1 个赛季日（60 秒/小时 × 24 = 1440 分钟现实 = 1 赛季日）
 *   但为可玩性，默认压缩为 1 分钟现实推进 1 个赛季日（即 1 现实秒 ≈ 1440 赛季分钟）
 *   用户可设置环境变量 WORLD_CLOCK_INTERVAL_MS 覆盖
 */
const RAPID_INTERVAL_MS = Number(process.env.WORLD_CLOCK_INTERVAL_MS ?? 60_000);

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleService.name);

  /** 上一次结算日期（YYYY-MM-DD），防止同一日重复结算 */
  private lastSettlementDate: string | null = null;

  /** v0.6 快速推进：是否暂停（前端可调） */
  private rapidPaused = false;

  /** v0.6 加速倍率（1/2/4） */
  private rapidSpeed: 1 | 2 | 4 = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly simService: SimService,
    private readonly seasonService: SeasonService,
    private readonly aiManager: AiManagerService,
    @Inject(forwardRef(() => FinanceService))
    private readonly finance: FinanceService,
    @Inject(forwardRef(() => TrainingService))
    private readonly training: TrainingService,
    @Inject(forwardRef(() => BoardService))
    private readonly board: BoardService,
    @Inject(forwardRef(() => PrService))
    private readonly pr: PrService,
    @Inject(forwardRef(() => OperationsService))
    private readonly operations: OperationsService,
  ) {}

  /**
   * 模块启动时开启定时结算时钟。
   * v0.6：启用快速推进（每 RAPID_INTERVAL_MS 推进 1 个赛季日），同时保留每日 10:00 兜底。
   */
  onModuleInit() {
    // 每 60 秒检查一次兜底
    setInterval(() => this.checkSettlement(), 60_000);
    // v0.6 快速推进：按配置间隔推进
    setInterval(() => this.rapidTick(), RAPID_INTERVAL_MS);
    this.logger.log(
      `[WorldClock] 自动走时间已启动：每 ${RAPID_INTERVAL_MS}ms 推进 1 个赛季日（每日 ${SETTLEMENT_HOUR}:00 兜底）`,
    );
  }

  /** v0.6 快速推进 tick：按 speed 倍率在 1 个 interval 内推进 N 个 day */
  private async rapidTick() {
    if (this.rapidPaused) return;
    try {
      const season = await this.seasonService.getCurrentSeason();
      if (!season) return;
      for (let i = 0; i < this.rapidSpeed; i++) {
        await this.advanceDay(season.id);
      }
    } catch (e) {
      this.logger.error(
        `[WorldClock] 推进失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** v0.6 控制接口：暂停/恢复快速推进 */
  setRapidPaused(paused: boolean) {
    this.rapidPaused = paused;
    this.logger.log(`[WorldClock] ${paused ? "已暂停" : "已恢复"}`);
  }

  /** v0.6 控制接口：设置加速倍率 */
  setRapidSpeed(speed: 1 | 2 | 4) {
    this.rapidSpeed = speed;
    this.logger.log(`[WorldClock] 加速倍率：${speed}x`);
  }

  /** v0.6 状态查询 */
  getRapidStatus() {
    return {
      paused: this.rapidPaused,
      speed: this.rapidSpeed,
      intervalMs: RAPID_INTERVAL_MS,
    };
  }

  private async checkSettlement() {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      // 到达结算小时且今日尚未结算
      if (now.getUTCHours() >= SETTLEMENT_HOUR && this.lastSettlementDate !== today) {
        this.lastSettlementDate = today;
        const season = await this.seasonService.getCurrentSeason();
        if (!season) return;
        this.logger.log(`[定时结算] 到达 ${SETTLEMENT_HOUR}:00，开始推进赛季`);
        await this.advanceDay(season.id);
      }
    } catch (e) {
      this.logger.error(
        `[定时结算] 失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

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

    // 获取联赛信息（判断是否为国际联赛）
    const league = await this.prisma.league.findUnique({
      where: { id: leagueId },
      select: { type: true },
    });

    // 获取联赛所有球队：
    // - 国内联赛(domestic)：通过 Team.leagueId 查询
    // - 国际联赛(international)：通过 LeagueTeam 关联表查询
    let teamIds: string[];
    if (league?.type === "international") {
      const leagueTeams = await this.prisma.leagueTeam.findMany({
        where: { leagueId },
        select: { teamId: true },
      });
      teamIds = leagueTeams.map((lt) => lt.teamId);
    } else {
      const teams = await this.prisma.team.findMany({
        where: { leagueId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      teamIds = teams.map((t) => t.id);
    }

    if (teamIds.length < 2) {
      this.logger.warn(`联赛 ${leagueId} 球队不足，无法生成赛程`);
      return 0;
    }
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

    // 0. 疲劳恢复（#13）：每日所有球员疲劳值 -15，模拟休息日恢复
    try {
      // fatigue >= 15 的直接 -15
      const recovered = await this.prisma.player.updateMany({
        where: { fatigue: { gte: 15 } },
        data: { fatigue: { decrement: 15 } },
      });
      // fatigue 在 1-14 之间的归零
      const zeroed = await this.prisma.player.updateMany({
        where: { fatigue: { gt: 0, lt: 15 } },
        data: { fatigue: 0 },
      });
      this.logger.log(`疲劳恢复：${recovered.count} 名 -15，${zeroed.count} 名归零`);
    } catch (e) {
      this.logger.warn(
        `疲劳恢复失败（不影响结算）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

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
        matchId: match.id,
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

    // 4. v0.6 财务结算：所有球队当日收支写入 CashLedger，更新 TeamCash.balance
    try {
      await this.finance.runDailyAllTeams(seasonId, currentDay);
    } catch (e) {
      this.logger.warn(
        `财务结算失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 5. v0.6 训练结算：每支球队所有未退役球员按计划小幅成长，写入 TrainingLog
    try {
      await this.training.runDailyAllTeams(seasonId, currentDay);
    } catch (e) {
      this.logger.warn(
        `训练结算失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 6. v0.6 §批次4 董事会结算：更新赞助商满意度 + 检测提案触发 + 通知经理
    try {
      await this.board.runDailyAllTeams(seasonId, currentDay);
    } catch (e) {
      this.logger.warn(
        `董事会结算失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 7. v0.6 §批次5 公关部：每日生成媒体新闻 + 联盟公告
    try {
      await this.pr.runDailyAllTeams(seasonId, currentDay);
    } catch (e) {
      this.logger.warn(
        `公关部新闻生成失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // 8. v0.6 §批次5 运营中心：每日生成球迷事件 + 更新球迷中心
    try {
      await this.operations.runDailyAllTeams(seasonId, currentDay);
    } catch (e) {
      this.logger.warn(
        `运营中心结算失败（不影响比赛）：${e instanceof Error ? e.message : String(e)}`,
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
