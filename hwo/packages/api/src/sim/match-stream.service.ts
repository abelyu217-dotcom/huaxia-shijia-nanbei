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

  // 每条 PBP 事件的推送间隔（毫秒），模拟实时节奏
  private readonly EVENT_INTERVAL_MS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
  ) {}

  /**
   * 订阅比赛实时事件流。
   * 返回 Observable，由 NestJS SSE 装饰器转换为 text/event-stream。
   */
  async streamMatch(matchId: string): Promise<Observable<MessageEvent>> {
    const subject = new Subject<MessageEvent>();

    // 异步推送事件
    this.pushEvents(matchId, subject).catch((err) => {
      this.logger.error(`比赛流推送失败: ${err.message}`);
      subject.next({
        data: JSON.stringify({ type: "error", message: err.message }),
      } as MessageEvent);
      subject.complete();
    });

    return subject.asObservable();
  }

  private async pushEvents(matchId: string, subject: Subject<MessageEvent>): Promise<void> {
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
      this.logger.log(`观战已结算比赛 ${matchId}，共 ${pbpEvents.length} 条 PBP`);
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
      this.logger.log(`观战模拟比赛 ${matchId}，共 ${pbpEvents.length} 条 PBP`);
    }

    // 逐条推送 PBP 事件
    for (const event of pbpEvents) {
      subject.next({
        data: JSON.stringify({ type: "pbp", event }),
      } as MessageEvent);
      await this.delay(this.EVENT_INTERVAL_MS);
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
