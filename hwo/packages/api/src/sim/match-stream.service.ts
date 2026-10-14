/**
 * MatchStreamService——比赛实时观战（SSE）
 *
 * M2：通过 Server-Sent Events 将比赛 PBP 事件实时推送给前端。
 *
 * 工作模式：
 * 1. 已结算比赛：从数据库读取 PBP，逐条推送（带时间间隔模拟实时感）
 * 2. 未结算比赛：先模拟比赛，再逐条推送 PBP 事件
 *
 * 每条 SSE 消息格式：{ data: { type, event, score } }
 * type: "pbp" | "final"
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { PrismaService } from "../prisma/prisma.service.js";
import { TeamService } from "../team/team.service.js";
import {
  simulate,
  tacticFromPreset,
  DEFAULT_CONFIG,
  type PbpEvent,
  type Team,
} from "@hwo/shared";

@Injectable()
export class MatchStreamService {
  private readonly logger = new Logger(MatchStreamService.name);

  /**
   * 比赛时间流速倍率：N 个比赛秒 = 1 个真实秒。
   * 默认 4 → 一节 12 分钟（720 比赛秒）约 3 分钟真实时间，全场约 12 分钟。
   * 设为 1 则 1:1 真实流速（全场约 48 分钟）。
   */
  private readonly DEFAULT_GAME_TIME_SCALE = 4;

  /** 单条事件最大推送间隔（毫秒），避免节间/死球时过长等待 */
  private readonly MAX_EVENT_DELAY_MS = 5000;
  /** 单条事件最小推送间隔（毫秒），保证可读性 */
  private readonly MIN_EVENT_DELAY_MS = 200;
  /** 节间额外停顿（毫秒） */
  private readonly PERIOD_BREAK_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * 订阅比赛实时事件流。
   * 返回 Observable，由 NestJS SSE 装饰器转换为 text/event-stream。
   * @param speed 可选流速倍率（比赛秒/真实秒），默认 4
   */
  async streamMatch(
    matchId: string,
    speed?: number,
  ): Promise<Observable<MessageEvent>> {
    const subject = new Subject<MessageEvent>();
    const scale = this.resolveScale(speed);

    // 异步推送事件
    this.pushEvents(matchId, subject, scale).catch((err) => {
      this.logger.error(`比赛流推送失败: ${err.message}`);
      subject.next({
        data: JSON.stringify({ type: "error", message: err.message }),
      } as MessageEvent);
      subject.complete();
    });

    return subject.asObservable();
  }

  private resolveScale(speed: number | undefined): number {
    if (speed == null || Number.isNaN(speed)) return this.DEFAULT_GAME_TIME_SCALE;
    return Math.max(0.5, Math.min(60, speed));
  }

  /** 解析 "mm:ss" 为剩余秒数 */
  private parseClock(clock: string): number {
    const [m, s] = clock.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
  }

  private async pushEvents(
    matchId: string,
    subject: Subject<MessageEvent>,
    scale: number,
  ): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { result: true, homeTeam: true, awayTeam: true },
    });

    if (!match) {
      throw new NotFoundException(`Match ${matchId} not found`);
    }

    let pbpEvents: PbpEvent[];
    let finalData: { homeScore: number; awayScore: number; winnerId: string };

    if (match.result) {
      // 已结算：从数据库读取 PBP
      pbpEvents = match.result.pbp as unknown as PbpEvent[];
      finalData = {
        homeScore: match.result.homeScore,
        awayScore: match.result.awayScore,
        winnerId: match.result.winnerId,
      };
      this.logger.log(`观战已结算比赛 ${matchId}，共 ${pbpEvents.length} 条 PBP，流速 ${scale}x`);
    } else {
      // 未结算：模拟比赛
      const home = await this.teamService.getById(match.homeTeamId);
      const away = await this.teamService.getById(match.awayTeamId);
      if (!home || !away) {
        throw new NotFoundException(`Team not found for match ${matchId}`);
      }

      const homeTactic = await this.getTeamTacticPresetId(match.homeTeamId);
      const awayTactic = await this.getTeamTacticPresetId(match.awayTeamId);

      const homeTeam: Team = { ...home, tactic: tacticFromPreset(home.id, homeTactic) };
      const awayTeam: Team = { ...away, tactic: tacticFromPreset(away.id, awayTactic) };

      const seed = match.seed ?? Math.floor(Math.random() * 1_000_000);
      const output = simulate({
        matchup: { homeTeam, awayTeam },
        seed,
        config: DEFAULT_CONFIG,
      });

      pbpEvents = output.pbp;
      finalData = {
        homeScore: output.result.homeScore,
        awayScore: output.result.awayScore,
        winnerId: output.result.winnerId,
      };
      this.logger.log(`观战模拟比赛 ${matchId}，共 ${pbpEvents.length} 条 PBP，流速 ${scale}x`);
    }

    // 逐条推送 PBP 事件，按事件间真实比赛时间差决定间隔
    let prevClockSec: number | null = null;
    let prevQuarter: number | null = null;

    for (const event of pbpEvents) {
      subject.next({
        data: JSON.stringify({ type: "pbp", event }),
      } as MessageEvent);

      const curClockSec = this.parseClock(event.clock);

      // 节间停顿：进入新的一节（period_start 且 quarter 变化）
      if (prevQuarter !== null && event.quarter !== prevQuarter) {
        await this.delay(this.PERIOD_BREAK_MS);
        prevClockSec = curClockSec;
        prevQuarter = event.quarter;
        continue;
      }

      if (prevClockSec !== null) {
        // 比赛时间流逝 = 上一事件剩余秒 - 当前事件剩余秒
        const gameDeltaSec = prevClockSec - curClockSec;
        if (gameDeltaSec > 0) {
          // 比赛秒 / 倍率 = 真实秒
          let delayMs = (gameDeltaSec / scale) * 1000;
          delayMs = Math.max(this.MIN_EVENT_DELAY_MS, Math.min(this.MAX_EVENT_DELAY_MS, delayMs));
          await this.delay(delayMs);
        } else {
          // 时钟未推进（如同回合内多次罚球/犯规），用最小间隔
          await this.delay(this.MIN_EVENT_DELAY_MS);
        }
      }

      prevClockSec = curClockSec;
      prevQuarter = event.quarter;
    }

    // 推送最终结果
    subject.next({
      data: JSON.stringify({ type: "final", data: finalData }),
    } as MessageEvent);

    subject.complete();
  }

  private async getTeamTacticPresetId(teamId: string): Promise<string> {
    const tactic = await this.prisma.tactic.findUnique({
      where: { teamId },
      select: { presetId: true },
    });
    return tactic?.presetId ?? "pace_space";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
