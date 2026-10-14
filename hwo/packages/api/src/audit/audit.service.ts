/**
 * 审计服务（M5 §6.2 反作弊）
 *
 * 职责：
 *   1. 比赛重放验证：通过 seed + rngLog 重放 sim，对比输出一致性
 *   2. 异常比赛检测：分数差距过大、总得分异常、疑似摆烂
 *   3. 异常交易检测：筹码价值失衡 → 触发人工复核队列
 *
 * 设计：所有 sim 结果由服务端权威产生（rngLog 已持久化到 MatchResult）。
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  detectMatchAnomaly,
  detectTradeAnomaly,
  replayMatch,
  type AnomalyDetection,
  type TradeAnomaly,
} from "@hwo/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { TeamService } from "../team/team.service.js";
import {
  getActiveConfig,
  tacticFromPreset,
  type Team,
  type TacticModSet,
  fillTacticDefaults,
} from "@hwo/shared";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private teamService: TeamService,
  ) {}

  /** 重放单场比赛，验证 sim 完整性 */
  async replayMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { result: true },
    });
    if (!match) throw new NotFoundException("比赛不存在");
    if (!match.result) throw new NotFoundException("比赛无结果记录");

    // 重新加载球队
    const home = await this.teamService.getById(match.homeTeamId);
    const away = await this.teamService.getById(match.awayTeamId);
    if (!home || !away) throw new NotFoundException("球队不存在");

    const homeTactic: TacticModSet = home.tactic
      ? fillTacticDefaults({ ...home.tactic, teamId: home.id })
      : tacticFromPreset(home.id, "pace");
    const awayTactic: TacticModSet = away.tactic
      ? fillTacticDefaults({ ...away.tactic, teamId: away.id })
      : tacticFromPreset(away.id, "pace");

    const homeTeam: Team = { ...home, tactic: homeTactic };
    const awayTeam: Team = { ...away, tactic: awayTactic };

    const result = replayMatch(
      matchId,
      {
        matchup: { homeTeam, awayTeam },
        seed: match.seed ?? 0,
        config: getActiveConfig(),
      },
      {
        homeScore: match.result.homeScore,
        awayScore: match.result.awayScore,
        rngLog: match.result.rngLog as unknown as any,
      },
    );

    this.logger.log(`重放 ${matchId}: ${result.verified ? "✓ 通过" : "✗ 失败"} ${result.note}`);
    return result;
  }

  /** 异常比赛检测 */
  detectMatchAnomaly(matchId: string, homeScore: number, awayScore: number): AnomalyDetection {
    return detectMatchAnomaly(matchId, homeScore, awayScore);
  }

  /** 异常交易检测 */
  detectTradeAnomaly(tradeId: string, offerValue: number, counterValue: number, threshold?: number): TradeAnomaly {
    return detectTradeAnomaly(tradeId, offerValue, counterValue, threshold);
  }

  /** 批量扫描近期比赛，输出异常列表（用于风控巡检） */
  async scanRecentMatches(limit = 100) {
    const matches = await this.prisma.match.findMany({
      where: { status: "settled" },
      include: { result: true },
      orderBy: { settledAt: "desc" },
      take: limit,
    });

    const anomalies: Array<AnomalyDetection & { settledAt: Date | null }> = [];
    for (const m of matches) {
      if (!m.result) continue;
      const det = detectMatchAnomaly(m.id, m.result.homeScore, m.result.awayScore);
      if (det.isAnomaly) {
        anomalies.push({ ...det, settledAt: m.settledAt });
      }
    }
    return { scanned: matches.length, anomalies, anomalyRate: anomalies.length / Math.max(matches.length, 1) };
  }
}
