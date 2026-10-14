/**
 * StatsService——球员赛季累计统计聚合
 *
 * 数据来源：MatchResult 表中已结算比赛的 boxScore JSON。
 * boxScore 形如：{ home: TeamStat, away: TeamStat }，TeamStat.players: PlayerStat[]
 *
 * 聚合方式：
 * 1. 查询所有 settled 比赛，主队或客队 = teamId
 * 2. 取本队一侧 boxScore.players，按 playerId 累加各项统计
 * 3. 计算场均与命中率
 *
 * 参见：开发计划.html §4.6 球员数据统计
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** 单球员赛季累计统计（前端 PlayerSeasonStats 与此对齐） */
export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  position: string;
  age?: number | null;
  gp: number;
  minutes: number;
  points: number;
  offReb: number;
  defReb: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  plusMinus: number;
  // 派生指标
  avgMinutes: number;
  avgPoints: number;
  avgRebounds: number;
  avgAssists: number;
  avgSteals: number;
  avgBlocks: number;
  avgTurnovers: number;
  fgPct: number; // 投篮命中率
  tpPct: number; // 三分命中率
  ftPct: number; // 罚球命中率
  twoPct: number; // 2 分命中率（去除 3 分）
  efficiency: number; // 效率值 = 得分+篮板+助攻+抢断+盖帽 - 投篮失球 - 罚球失球 - 失误 - 犯规
}

/** 球队合计（用于合計行：本队 vs 对手对比） */
export interface TeamTotals {
  gp: number;
  minutes: number;
  points: number;
  offReb: number;
  defReb: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  fgPct: number;
  tpPct: number;
  ftPct: number;
  twoPct: number;
  efficiency: number;
}

/** 球队赛季统计聚合结果：球员列表 + 本队合计 + 对手合计 */
export interface TeamStatsSummary {
  players: PlayerSeasonStats[];
  totals: TeamTotals;
  opponentTotals: TeamTotals;
}

interface PlayerStatRow {
  playerId: string;
  points: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutes: number;
  plusMinus: number;
}

interface TeamStatRow {
  teamId: string;
  score?: number;
  fgm?: number;
  fga?: number;
  tpm?: number;
  tpa?: number;
  ftm?: number;
  fta?: number;
  offReb?: number;
  defReb?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fouls?: number;
  players: PlayerStatRow[];
}

interface BoxScoreRow {
  home: TeamStatRow;
  away: TeamStatRow;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  /** 买断费比例：剩余年限薪资的 50% */
  private static readonly WAIVE_COST_RATE = 0.5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 计算裁员（买断）成本
   * 公式：剩余年限 × 年薪 × 50%
   */
  calcWaiveCost(yearsRemain: number, salaryPerYear: number): number {
    if (yearsRemain <= 0) return 0;
    return Math.round(yearsRemain * salaryPerYear * StatsService.WAIVE_COST_RATE);
  }

  /**
   * 球队球员赛季累计统计
   */
  async getTeamPlayerSeasonStats(teamId: string): Promise<PlayerSeasonStats[]> {
    const summary = await this.getTeamStatsSummary(teamId);
    return summary.players;
  }

  /**
   * 球队赛季统计聚合：球员列表 + 本队合计 + 对手合计（用于合計行对比）
   */
  async getTeamStatsSummary(teamId: string): Promise<TeamStatsSummary> {
    // 查询所有已结算比赛，本队参与
    const matches = await this.prisma.match.findMany({
      where: {
        status: "settled",
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      include: {
        result: true,
      },
    });

    if (matches.length === 0) {
      return {
        players: [],
        totals: emptyTotals(),
        opponentTotals: emptyTotals(),
      };
    }

    // 查询本队球员元数据
    const players = await this.prisma.player.findMany({
      where: { teamId },
      select: { id: true, name: true, position: true, age: true },
    });
    const playerMap = new Map(players.map((p) => [p.id, p]));

    // 聚合每个球员的统计
    type AggRow = PlayerStatRow & { gp: number };
    const aggMap = new Map<string, AggRow>();

    // 同时聚合本队合计与对手合计
    let teamAgg: AggRow & { gp: number } = {
      playerId: "__team__",
      gp: 0,
      minutes: 0,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      offReb: 0,
      defReb: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      plusMinus: 0,
    };
    let oppAgg: AggRow & { gp: number } = {
      playerId: "__opp__",
      gp: 0,
      minutes: 0,
      points: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      tpa: 0,
      ftm: 0,
      fta: 0,
      offReb: 0,
      defReb: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      plusMinus: 0,
    };

    for (const m of matches) {
      const result = m.result;
      if (!result) continue;

      let boxScore: BoxScoreRow | null = null;
      try {
        boxScore =
          typeof result.boxScore === "string"
            ? (JSON.parse(result.boxScore) as BoxScoreRow)
            : (result.boxScore as unknown as BoxScoreRow);
      } catch {
        continue;
      }
      if (!boxScore) continue;

      // 取本队一侧
      const isHome = m.homeTeamId === teamId;
      const teamStat = isHome ? boxScore.home : boxScore.away;
      const oppStat = isHome ? boxScore.away : boxScore.home;
      if (!teamStat || !Array.isArray(teamStat.players)) continue;

      // 球员级聚合
      for (const ps of teamStat.players) {
        if (!ps.playerId) continue;
        const cur = aggMap.get(ps.playerId) ?? {
          playerId: ps.playerId,
          gp: 0,
          minutes: 0,
          points: 0,
          fgm: 0,
          fga: 0,
          tpm: 0,
          tpa: 0,
          ftm: 0,
          fta: 0,
          offReb: 0,
          defReb: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0,
          plusMinus: 0,
        };
        cur.gp += 1;
        cur.minutes += ps.minutes || 0;
        cur.points += ps.points || 0;
        cur.fgm += ps.fgm || 0;
        cur.fga += ps.fga || 0;
        cur.tpm += ps.tpm || 0;
        cur.tpa += ps.tpa || 0;
        cur.ftm += ps.ftm || 0;
        cur.fta += ps.fta || 0;
        cur.offReb += ps.offReb || 0;
        cur.defReb += ps.defReb || 0;
        cur.rebounds += ps.rebounds || 0;
        cur.assists += ps.assists || 0;
        cur.steals += ps.steals || 0;
        cur.blocks += ps.blocks || 0;
        cur.turnovers += ps.turnovers || 0;
        cur.fouls += ps.fouls || 0;
        cur.plusMinus += ps.plusMinus || 0;
        aggMap.set(ps.playerId, cur);
      }

      // 本队合计：每场比赛累加一次（不按球员，避免重复）
      teamAgg.gp += 1;
      teamAgg.minutes += teamStat.players.reduce((s, p) => s + (p.minutes || 0), 0);
      teamAgg.points += teamStat.score ?? 0;
      teamAgg.fgm += teamStat.fgm ?? 0;
      teamAgg.fga += teamStat.fga ?? 0;
      teamAgg.tpm += teamStat.tpm ?? 0;
      teamAgg.tpa += teamStat.tpa ?? 0;
      teamAgg.ftm += teamStat.ftm ?? 0;
      teamAgg.fta += teamStat.fta ?? 0;
      teamAgg.offReb += teamStat.offReb ?? 0;
      teamAgg.defReb += teamStat.defReb ?? 0;
      teamAgg.rebounds += teamStat.rebounds ?? 0;
      teamAgg.assists += teamStat.assists ?? 0;
      teamAgg.steals += teamStat.steals ?? 0;
      teamAgg.blocks += teamStat.blocks ?? 0;
      teamAgg.turnovers += teamStat.turnovers ?? 0;
      teamAgg.fouls += teamStat.fouls ?? 0;
      teamAgg.plusMinus += teamStat.players.reduce((s, p) => s + (p.plusMinus || 0), 0);

      // 对手合计
      if (oppStat && Array.isArray(oppStat.players)) {
        oppAgg.gp += 1;
        oppAgg.minutes += oppStat.players.reduce((s, p) => s + (p.minutes || 0), 0);
        oppAgg.points += oppStat.score ?? 0;
        oppAgg.fgm += oppStat.fgm ?? 0;
        oppAgg.fga += oppStat.fga ?? 0;
        oppAgg.tpm += oppStat.tpm ?? 0;
        oppAgg.tpa += oppStat.tpa ?? 0;
        oppAgg.ftm += oppStat.ftm ?? 0;
        oppAgg.fta += oppStat.fta ?? 0;
        oppAgg.offReb += oppStat.offReb ?? 0;
        oppAgg.defReb += oppStat.defReb ?? 0;
        oppAgg.rebounds += oppStat.rebounds ?? 0;
        oppAgg.assists += oppStat.assists ?? 0;
        oppAgg.steals += oppStat.steals ?? 0;
        oppAgg.blocks += oppStat.blocks ?? 0;
        oppAgg.turnovers += oppStat.turnovers ?? 0;
        oppAgg.fouls += oppStat.fouls ?? 0;
        oppAgg.plusMinus += oppStat.players.reduce((s, p) => s + (p.plusMinus || 0), 0);
      }
    }

    // 组装结果
    const result: PlayerSeasonStats[] = [];
    for (const [pid, agg] of aggMap.entries()) {
      const meta = playerMap.get(pid);
      result.push(buildPlayerStats(pid, meta, agg));
    }

    // 按得分降序
    result.sort((a, b) => b.points - a.points);

    this.logger.log(
      `球队 ${teamId} 赛季统计聚合：${matches.length} 场比赛，${result.length} 名球员`,
    );

    return {
      players: result,
      totals: buildTotals(teamAgg),
      opponentTotals: buildTotals(oppAgg),
    };
  }
}

function emptyTotals(): TeamTotals {
  return {
    gp: 0, minutes: 0, points: 0, offReb: 0, defReb: 0, rebounds: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
    fgPct: 0, tpPct: 0, ftPct: 0, twoPct: 0, efficiency: 0,
  };
}

function buildTotals(agg: { gp: number; minutes: number; points: number; offReb: number; defReb: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; plusMinus: number }): TeamTotals {
  const twoM = Math.max(0, agg.fgm - agg.tpm);
  const twoA = Math.max(0, agg.fga - agg.tpa);
  return {
    gp: agg.gp,
    minutes: agg.minutes,
    points: agg.points,
    offReb: agg.offReb,
    defReb: agg.defReb,
    rebounds: agg.rebounds,
    assists: agg.assists,
    steals: agg.steals,
    blocks: agg.blocks,
    turnovers: agg.turnovers,
    fouls: agg.fouls,
    fgm: agg.fgm,
    fga: agg.fga,
    tpm: agg.tpm,
    tpa: agg.tpa,
    ftm: agg.ftm,
    fta: agg.fta,
    fgPct: agg.fga > 0 ? round3(agg.fgm / agg.fga) : 0,
    tpPct: agg.tpa > 0 ? round3(agg.tpm / agg.tpa) : 0,
    ftPct: agg.fta > 0 ? round3(agg.ftm / agg.fta) : 0,
    twoPct: twoA > 0 ? round3(twoM / twoA) : 0,
    efficiency: calcEfficiency(agg),
  };
}

function buildPlayerStats(
  pid: string,
  meta: { name: string; position: string; age: number | null } | undefined,
  agg: { gp: number; minutes: number; points: number; offReb: number; defReb: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; plusMinus: number },
): PlayerSeasonStats {
  const gp = agg.gp || 1;
  const twoM = Math.max(0, agg.fgm - agg.tpm);
  const twoA = Math.max(0, agg.fga - agg.tpa);
  return {
    playerId: pid,
    name: meta?.name ?? "—",
    position: meta?.position ?? "—",
    age: meta?.age ?? null,
    gp: agg.gp,
    minutes: agg.minutes,
    points: agg.points,
    offReb: agg.offReb,
    defReb: agg.defReb,
    rebounds: agg.rebounds,
    assists: agg.assists,
    steals: agg.steals,
    blocks: agg.blocks,
    turnovers: agg.turnovers,
    fouls: agg.fouls,
    fgm: agg.fgm,
    fga: agg.fga,
    tpm: agg.tpm,
    tpa: agg.tpa,
    ftm: agg.ftm,
    fta: agg.fta,
    plusMinus: agg.plusMinus,
    avgMinutes: round1(agg.minutes / gp),
    avgPoints: round1(agg.points / gp),
    avgRebounds: round1(agg.rebounds / gp),
    avgAssists: round1(agg.assists / gp),
    avgSteals: round1(agg.steals / gp),
    avgBlocks: round1(agg.blocks / gp),
    avgTurnovers: round1(agg.turnovers / gp),
    fgPct: agg.fga > 0 ? round3(agg.fgm / agg.fga) : 0,
    tpPct: agg.tpa > 0 ? round3(agg.tpm / agg.tpa) : 0,
    ftPct: agg.fta > 0 ? round3(agg.ftm / agg.fta) : 0,
    twoPct: twoA > 0 ? round3(twoM / twoA) : 0,
    efficiency: calcEfficiency(agg),
  };
}

/** 效率值 = 得分+篮板+助攻+抢断+盖帽 - 投篮失球 - 罚球失球 - 失误 - 犯规 */
function calcEfficiency(s: { points: number; rebounds: number; assists: number; steals: number; blocks: number; fga: number; fgm: number; ftm: number; fta: number; turnovers: number; fouls: number }): number {
  const missedFg = Math.max(0, s.fga - s.fgm);
  const missedFt = Math.max(0, s.fta - s.ftm);
  return (
    s.points +
    s.rebounds +
    s.assists +
    s.steals +
    s.blocks -
    missedFg -
    missedFt -
    s.turnovers -
    s.fouls
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
