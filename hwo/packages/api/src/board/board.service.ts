/**
 * BoardService——董事会 + 赞助商满意度服务
 *
 * v0.6 §批次4 设计：
 * - 赞助商满意度（Sponsor.satisfaction）：每日根据战绩/媒体/球迷/罚款计算
 * - 赛季目标（SeasonGoal）：赛季开始时依据球队 OVR/上赛季战绩/薪资占比自动生成
 * - 董事会提案（BoardProposal）：每日检测触发条件，董事按 loyalty 加权投票
 * - 董事初始化（BoardDirector）：新球队自动创建 5 名董事
 * - 满意度档位：< 30 终止 / 30-50 警告 / 50-80 正常 / > 80 续约
 *
 * 参见：HW0_系统调整方案_v2.md §三 董事会模块
 */

import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// ── 董事角色配置 ──

type BoardRole = "chair" | "ceo" | "sports_director" | "finance_director" | "investor";

const BOARD_ROLES: { role: BoardRole; name: string; baseLoyalty: number }[] = [
  { role: "chair", name: "主席", baseLoyalty: 65 },
  { role: "ceo", name: "首席执行官", baseLoyalty: 60 },
  { role: "sports_director", name: "体育总监", baseLoyalty: 60 },
  { role: "finance_director", name: "财务总监", baseLoyalty: 60 },
  { role: "investor", name: "投资方代表", baseLoyalty: 55 },
];

// ── 赞助商档位（与 finance.service 一致；本模块暂只查询不写入） ──

// type SponsorTier = "D" | "C" | "B" | "A" | "S";

// ── 视图类型 ──

export interface SponsorView {
  id: string;
  type: string;
  name: string;
  tier: string;
  basePerSeason: number;
  bonusPerWin: number;
  titleBonus: number;
  satisfaction: number;
  expectedWinRate: number;
  expectedPlayoff: boolean;
  contractSeasons: number;
  startSeason: number;
  endSeason: number | null;
}

export interface BoardDirectorView {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  loyalty: number;
}

export interface SeasonGoalView {
  id: string;
  seasonId: string;
  season: number;
  expectedWinRate: number;
  expectedPlayoff: boolean;
  expectedChampionship: boolean;
  expectedRank: number | null;
  basisNote: string;
  achievedNote: string | null;
}

export interface BoardProposalView {
  id: string;
  seasonId: string;
  day: number;
  type: string;
  typeLabel: string;
  payload: unknown;
  reason: string;
  status: string;
  votes: unknown;
  createdAt: string;
}

export interface BoardView {
  directors: BoardDirectorView[];
  sponsors: SponsorView[];
  goal: SeasonGoalView | null;
  proposals: BoardProposalView[];
  // 满意度汇总
  fanSatisfaction: number;
  bossSatisfaction: number;
  avgSponsorSatisfaction: number;
}

const ROLE_LABEL: Record<string, string> = {
  chair: "主席",
  ceo: "首席执行官",
  sports_director: "体育总监",
  finance_director: "财务总监",
  investor: "投资方代表",
};

const PROPOSAL_LABEL: Record<string, string> = {
  budget_request: "追加预算",
  facility_upgrade: "训练馆升级",
  fire_manager: "提议解雇经理",
  sign_sponsor: "新赞助商洽谈",
  academy_invest: "青训追加投入",
};

// ── 工具 ──

const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.max(lo, Math.min(hi, Math.round(v)));

@Injectable()
export class BoardService implements OnModuleInit {
  private readonly logger = new Logger(BoardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 启动时为缺董事的球队初始化董事 */
  async onModuleInit(): Promise<void> {
    try {
      const created = await this.ensureDirectorsForAllTeams();
      if (created > 0) {
        this.logger.log(`[Board] 启动时为 ${created} 支球队初始化了董事`);
      }
    } catch (e) {
      this.logger.warn(
        `[Board] 董事初始化失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ─── 查询 ───

  /** 董事会总览 */
  async getBoardView(teamId: string, seasonId: string): Promise<BoardView> {
    const [directors, sponsors, goal, proposals] = await Promise.all([
      this.prisma.boardDirector.findMany({
        where: { teamId },
        orderBy: { loyalty: "desc" },
      }),
      this.prisma.sponsor.findMany({
        where: { teamId },
        orderBy: { type: "asc" },
      }),
      this.prisma.seasonGoal.findUnique({ where: { teamId_seasonId: { teamId, seasonId } } }),
      this.prisma.boardProposal.findMany({
        where: { teamId, seasonId },
        orderBy: { day: "desc" },
        take: 20,
      }),
    ]);

    const [fanSatisfaction, bossSatisfaction] = await Promise.all([
      this.computeFanSatisfaction(teamId, seasonId),
      this.computeBossSatisfaction(teamId),
    ]);

    const sponsorViews = sponsors.map((s) => this.toSponsorView(s));
    const avgSponsor =
      sponsorViews.length > 0
        ? sponsorViews.reduce((sum, s) => sum + s.satisfaction, 0) / sponsorViews.length
        : 60;

    return {
      directors: directors.map((d) => this.toDirectorView(d)),
      sponsors: sponsorViews,
      goal: goal ? this.toGoalView(goal) : null,
      proposals: proposals.map((p) => this.toProposalView(p)),
      fanSatisfaction,
      bossSatisfaction,
      avgSponsorSatisfaction: Math.round(avgSponsor),
    };
  }

  // ─── 满意度计算 ───

  /**
   * 球迷满意度 = 50 + (近10场胜率 - 0.5) × 100 × 0.6 + (MediaNews条数 - 联盟均值) × 0.4
   * 简化：50 + (winRate - 0.5) × 60
   */
  async computeFanSatisfaction(teamId: string, seasonId: string): Promise<number> {
    const standings = await this.prisma.standing.findFirst({
      where: { teamId, seasonId },
      select: { wins: true, losses: true },
    });
    if (!standings || standings.wins + standings.losses === 0) return 50;

    const winRate = standings.wins / (standings.wins + standings.losses);
    return clamp(50 + (winRate - 0.5) * 60);
  }

  /**
   * 老板满意度 = 50 + (薪资占比健康度) × 30 + (现金健康度) × 20
   * 薪资占比 60-90% 视为健康（满分 30），<60% 阵容不足，>90% 财务紧张
   */
  async computeBossSatisfaction(teamId: string): Promise<number> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { cash: true },
    });
    if (!team) return 50;

    // 球员总薪资
    const players = await this.prisma.player.findMany({
      where: { teamId, retired: false },
      select: { salary: true },
    });
    const totalSalary = players.reduce((s, p) => s + (p.salary ?? 0), 0);

    // 薪资帽（硬编码 5,000,000，与 finance 一致）
    const salaryCap = 5_000_000;
    const capUsagePct = salaryCap > 0 ? (totalSalary / salaryCap) * 100 : 0;
    const capHealthScore =
      capUsagePct >= 60 && capUsagePct <= 90
        ? 30
        : capUsagePct < 60
          ? 15
          : 5;

    // 现金健康度：余额 >= 1,000,000 满分 20，否则按比例
    const balance = team.cash?.balance ?? 0;
    const cashScore = clamp((balance / 1_000_000) * 20, 0, 20);

    return clamp(50 + capHealthScore + Math.round(cashScore));
  }

  /**
   * 赞助商满意度（每日计算）
   * = clamp(50 + (近10场胜率 - expectedWinRate) × 100 × 0.4
   *         + (本队 MediaNews条数 - 联盟均值) × 0.5  // 媒体曝光
   *         + (fanSatisfaction - 50) × 0.3            // 球迷士气
   *         - 当季罚款次数 × 10
   *         - 当季阵容大变动次数 × 5)
   *
   * 简化实现：暂只取战绩 + 球迷士气；罚款/阵容变动暂取 0
   */
  async computeSponsorSatisfaction(
    sponsorId: string,
    recentWinRate: number,
    fanSatisfaction: number,
  ): Promise<number> {
    const sponsor = await this.prisma.sponsor.findUnique({
      where: { id: sponsorId },
      select: { expectedWinRate: true },
    });
    if (!sponsor) return 50;

    return clamp(
      50 +
        (recentWinRate - sponsor.expectedWinRate) * 100 * 0.4 +
        (fanSatisfaction - 50) * 0.3,
    );
  }

  // ─── 赛季目标生成（赛季开始时调用） ───

  /**
   * 为球队在新赛季生成 SeasonGoal
   * 依据：球队 OVR 中位数 + 上赛季战绩 + 薪资占比 + 联赛等级
   */
  async generateSeasonGoal(teamId: string, seasonId: string, seasonYear: number): Promise<SeasonGoalView> {
    const existing = await this.prisma.seasonGoal.findUnique({
      where: { teamId_seasonId: { teamId, seasonId } },
    });
    if (existing) return this.toGoalView(existing);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { league: true, cash: true },
    });
    if (!team) throw new NotFoundException("球队不存在");

    // 球员 OVR 中位数
    const players = await this.prisma.player.findMany({
      where: { teamId, retired: false },
      select: { abilities: true, salary: true },
    });
    const ovrs = players
      .map((p) => {
        const ab = p.abilities as Record<string, number> | null;
        if (!ab) return 60;
        const vals = Object.values(ab);
        return vals.length > 0
          ? vals.reduce((s, v) => s + v, 0) / vals.length
          : 60;
      })
      .sort((a, b) => a - b);
    const ovrMedian = ovrs.length > 0 ? ovrs[Math.floor(ovrs.length / 2)]! : 60;

    // 上赛季战绩
    const prevSeason = await this.prisma.season.findFirst({
      where: { year: seasonYear - 1 },
      orderBy: { year: "desc" },
    });
    let prevWinRate = 0.5;
    let prevRank: number | null = null;
    let madePlayoff = false;
    if (prevSeason) {
      const prevStanding = await this.prisma.standing.findFirst({
        where: { teamId, seasonId: prevSeason.id },
        include: { league: { include: { standings: { orderBy: [{ wins: "desc" }] } } } },
      });
      if (prevStanding) {
        const total = prevStanding.wins + prevStanding.losses;
        prevWinRate = total > 0 ? prevStanding.wins / total : 0.5;
        // 简化：胜率 >= 0.5 视为进过季后赛（schema 中 Standing 无 madePlayoff 字段）
        madePlayoff = prevWinRate >= 0.5;
        const standingsInLeague = prevStanding.league?.standings ?? [];
        const idx = standingsInLeague.findIndex((s) => s.teamId === teamId);
        prevRank = idx >= 0 ? idx + 1 : null;
      }
    }

    // 薪资占比
    const totalSalary = players.reduce((s, p) => s + (p.salary ?? 0), 0);
    const salaryCap = 5_000_000;
    const salaryPct = salaryCap > 0 ? (totalSalary / salaryCap) * 100 : 0;

    // 目标设定规则
    const expectedWinRate = clampTargetWinRate(ovrMedian, prevWinRate);
    const expectedPlayoff = expectedWinRate >= 0.5;
    const expectedChampionship = ovrMedian >= 80 && prevWinRate >= 0.6;
    const expectedRank = expectedPlayoff ? Math.max(1, Math.round((prevRank ?? 8) - 1)) : null;

    const basisNote = buildBasisNote({
      prevWinRate,
      prevRank,
      madePlayoff,
      ovrMedian,
      salaryPct,
      leagueLevel: team.league?.level ?? 1,
      expectedWinRate,
      expectedPlayoff,
      expectedChampionship,
    });

    const created = await this.prisma.seasonGoal.create({
      data: {
        teamId,
        seasonId,
        season: seasonYear,
        expectedWinRate,
        expectedPlayoff,
        expectedChampionship,
        expectedRank,
        basisNote,
      },
    });

    this.logger.log(
      `[Board] 球队 ${team.name} 赛季目标已生成：胜率 ${expectedWinRate.toFixed(2)} / 季后赛 ${expectedPlayoff}`,
    );
    return this.toGoalView(created);
  }

  // ─── 董事初始化 ───

  /** 为新球队初始化 5 名董事 */
  async initBoardForTeam(teamId: string): Promise<number> {
    const existing = await this.prisma.boardDirector.count({ where: { teamId } });
    if (existing > 0) return 0;

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    });
    if (!team) return 0;

    await this.prisma.boardDirector.createMany({
      data: BOARD_ROLES.map((r) => ({
        teamId,
        name: `${team.name} ${r.name}`,
        role: r.role,
        loyalty: r.baseLoyalty,
      })),
    });
    return BOARD_ROLES.length;
  }

  /** 启动时为缺董事的球队初始化 */
  async ensureDirectorsForAllTeams(): Promise<number> {
    const teams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true },
    });
    let created = 0;
    for (const t of teams) {
      created += await this.initBoardForTeam(t.id);
    }
    return created;
  }

  /** 赛季交接：为所有球队生成新赛季目标 + 初始化董事 */
  async initForNewSeason(seasonId: string, seasonYear: number): Promise<{ goals: number; directors: number }> {
    const teams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true },
    });
    let goals = 0;
    let directors = 0;
    for (const t of teams) {
      directors += await this.initBoardForTeam(t.id);
      try {
        await this.generateSeasonGoal(t.id, seasonId, seasonYear);
        goals++;
      } catch (e) {
        this.logger.warn(
          `[Board] 球队 ${t.id} 目标生成失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    this.logger.log(`[Board] 赛季初始化：${goals} 个目标，${directors} 名董事`);
    return { goals, directors };
  }

  // ─── 每日推进：满意度更新 + 提案触发 ───

  /** 每日为所有球队更新赞助商满意度 + 检测提案触发 */
  async runDailyAllTeams(seasonId: string, day: number): Promise<void> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return;

    const teams = await this.prisma.team.findMany({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true },
    });

    for (const t of teams) {
      try {
        await this.runDailyForTeam(t.id, seasonId, day);
      } catch (e) {
        this.logger.warn(
          `[Board] 球队 ${t.id} 董事会结算失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /** 单支球队每日：更新满意度 + 触发提案 */
  async runDailyForTeam(teamId: string, seasonId: string, day: number): Promise<void> {
    // 1. 计算球迷满意度（用于赞助商公式）
    const fanSatisfaction = await this.computeFanSatisfaction(teamId, seasonId);

    // 2. 近 10 场胜率
    const recentWinRate = await this.getRecentWinRate(teamId, 10);

    // 3. 更新所有赞助商满意度
    const sponsors = await this.prisma.sponsor.findMany({
      where: { teamId },
      select: { id: true, satisfaction: true, expectedWinRate: true },
    });

    for (const s of sponsors) {
      const newSat = await this.computeSponsorSatisfaction(s.id, recentWinRate, fanSatisfaction);
      if (Math.abs(newSat - s.satisfaction) >= 1) {
        await this.prisma.sponsor.update({
          where: { id: s.id },
          data: { satisfaction: newSat },
        });
      }
      // 档位行为：< 30 终止，30-50 警告
      if (newSat < 30) {
        await this.notifyTeam(teamId, seasonId, day, "sponsor", "sponsor_terminated",
          "赞助商终止合作",
          `${await this.getSponsorName(s.id)} 满意度跌至 ${newSat}，已终止合作。建议尽快洽谈新赞助商。`,
          s.id,
        );
      } else if (newSat < 50 && s.satisfaction >= 50) {
        await this.notifyTeam(teamId, seasonId, day, "sponsor", "sponsor_warning",
          "赞助商发出警告",
          `${await this.getSponsorName(s.id)} 满意度 ${newSat}，已发出警告。请改善战绩避免合同终止。`,
          s.id,
        );
      }
    }

    // 4. 提案触发检测（去重：当日同类型已存在则不再生成）
    await this.detectAndCreateProposals(teamId, seasonId, day, recentWinRate);
  }

  /** 获取近 N 场胜率（通过 MatchResult.winnerId 判断） */
  private async getRecentWinRate(teamId: string, n: number): Promise<number> {
    const recent = await this.prisma.matchResult.findMany({
      where: {
        OR: [{ winnerId: teamId }, { loserId: teamId }],
      },
      orderBy: { createdAt: "desc" },
      take: n,
      select: { winnerId: true },
    });
    if (recent.length === 0) return 0.5;
    const wins = recent.filter((m) => m.winnerId === teamId).length;
    return wins / recent.length;
  }

  /** 检测触发条件并生成提案 */
  private async detectAndCreateProposals(teamId: string, seasonId: string, day: number, recentWinRate: number): Promise<void> {
    // 检查今日是否已有同类提案（去重）
    const todayProposals = await this.prisma.boardProposal.findMany({
      where: { teamId, seasonId, day },
      select: { type: true },
    });
    const todayTypes = new Set(todayProposals.map((p) => p.type));

    // 1. fire_manager：近 10 场胜率 < 0.3
    if (recentWinRate < 0.3 && !todayTypes.has("fire_manager")) {
      await this.createAndVoteProposal(teamId, seasonId, day, "fire_manager",
        { recentWinRate: Math.round(recentWinRate * 100) / 100, threshold: 0.3 },
        `近 10 场胜率 ${(recentWinRate * 100).toFixed(1)}% 远低于目标 50%，提议解雇经理`,
      );
    }

    // 2. budget_request：现金 < 1,000,000
    const cash = await this.prisma.teamCash.findUnique({ where: { teamId } });
    if (cash && cash.balance < 1_000_000 && !todayTypes.has("budget_request")) {
      await this.createAndVoteProposal(teamId, seasonId, day, "budget_request",
        { balance: cash.balance, threshold: 1_000_000, requestAmount: 1_000_000 },
        `现金余额 ${cash.balance.toLocaleString()} 低于安全线 1,000,000，请求追加预算 1,000,000`,
      );
    }

    // 3. sign_sponsor：主赞助商满意度 < 50
    const mainSponsor = await this.prisma.sponsor.findFirst({
      where: { teamId, type: "main" },
      select: { id: true, satisfaction: true, endSeason: true },
    });
    if (mainSponsor && !todayTypes.has("sign_sponsor")) {
      const season = await this.prisma.season.findUnique({ where: { id: seasonId }, select: { year: true } });
      const endingSoon = mainSponsor.endSeason && season && mainSponsor.endSeason <= season.year + 1;
      if (mainSponsor.satisfaction < 50 || endingSoon) {
        await this.createAndVoteProposal(teamId, seasonId, day, "sign_sponsor",
          { sponsorId: mainSponsor.id, satisfaction: mainSponsor.satisfaction, endingSoon },
          `主赞助商满意度 ${mainSponsor.satisfaction}${endingSoon ? "，合同即将到期" : ""}，建议启动新赞助商洽谈`,
        );
      }
    }

    // 4. facility_upgrade：训练馆等级 < 联盟均值 - 1
    const facility = await this.prisma.facility.findUnique({ where: { teamId } });
    const avgFacilityLv = await this.computeLeagueAvgFacilityLevel(teamId);
    if (facility && facility.trainingHallLv < avgFacilityLv - 1 && !todayTypes.has("facility_upgrade")) {
      await this.createAndVoteProposal(teamId, seasonId, day, "facility_upgrade",
        { currentLv: facility.trainingHallLv, avgLv: avgFacilityLv, targetLv: Math.ceil(avgFacilityLv), budget: 800_000 },
        `训练馆 Lv${facility.trainingHallLv} 低于联盟均值 Lv${avgFacilityLv.toFixed(1)}，建议升级至 Lv${Math.ceil(avgFacilityLv)}，预算 800,000`,
      );
    }
  }

  /** 创建提案 + 自动投票 + 通知经理 */
  private async createAndVoteProposal(teamId: string, seasonId: string, day: number, type: string, payload: unknown, reason: string): Promise<void> {
    const directors = await this.prisma.boardDirector.findMany({
      where: { teamId },
      select: { id: true, loyalty: true, name: true, role: true },
    });

    // 按 loyalty 加权投票：loyalty < 40 倾向 reject，> 60 倾向 approve
    const votes = directors.map((d) => {
      // loyalty 越低越倾向反对（特别对 fire_manager / budget_request）
      let approveChance = d.loyalty / 100;
      if (type === "fire_manager") approveChance -= 0.2; // 反对解雇倾向
      if (type === "budget_request") approveChance += 0.1; // 倾向支持追加预算
      const approved = Math.random() < Math.max(0.1, Math.min(0.9, approveChance));
      return {
        directorId: d.id,
        directorName: d.name,
        directorRole: d.role,
        approved,
        loyalty: d.loyalty,
      };
    });

    const approveWeight = votes.reduce((s, v) => s + (v.approved ? v.loyalty : 0), 0);
    const rejectWeight = votes.reduce((s, v) => s + (!v.approved ? v.loyalty : 0), 0);
    const status = approveWeight > rejectWeight ? "approved" : "rejected";

    const created = await this.prisma.boardProposal.create({
      data: {
        teamId,
        seasonId,
        day,
        type,
        payload: payload as never,
        reason,
        status,
        votes: votes as never,
      },
    });

    // 通知经理
    const label = PROPOSAL_LABEL[type] ?? type;
    await this.notifyTeam(teamId, seasonId, day, "board", `board_${status}`,
      `${label}：${status === "approved" ? "已通过" : "已否决"}`,
      `${reason}\n投票：${votes.filter((v) => v.approved).length} 赞成，${votes.filter((v) => !v.approved).length} 反对`,
      created.id,
    );

    this.logger.log(`[Board] 球队 ${teamId} 提案 ${type} → ${status}（赞成权重 ${approveWeight} / 反对 ${rejectWeight}）`);
  }

  /** 计算球队所属联赛的训练馆平均等级 */
  private async computeLeagueAvgFacilityLevel(teamId: string): Promise<number> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true },
    });
    if (!team?.leagueId) return 2;

    const leagueTeams = await this.prisma.team.findMany({
      where: { leagueId: team.leagueId },
      select: { id: true },
    });

    const facilities = await this.prisma.facility.findMany({
      where: { teamId: { in: leagueTeams.map((t) => t.id) } },
      select: { trainingHallLv: true },
    });

    if (facilities.length === 0) return 1;
    return facilities.reduce((s, f) => s + f.trainingHallLv, 0) / facilities.length;
  }

  // ─── 经理操作 ───

  /** 经理标记提案已读/忽略（status 改为 expired） */
  async dismissProposal(proposalId: string, teamId: string): Promise<void> {
    const proposal = await this.prisma.boardProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new NotFoundException("提案不存在");
    if (proposal.teamId !== teamId) throw new Error("无权操作其他球队的提案");
    if (proposal.status !== "approved") throw new Error("仅 approved 状态提案可忽略");

    await this.prisma.boardProposal.update({
      where: { id: proposalId },
      data: { status: "expired" },
    });
  }

  // ─── 工具方法 ───

  private async getSponsorName(sponsorId: string): Promise<string> {
    const s = await this.prisma.sponsor.findUnique({
      where: { id: sponsorId },
      select: { name: true },
    });
    return s?.name ?? "赞助商";
  }

  /** 写入 TeamMessage 通知经理 */
  private async notifyTeam(
    teamId: string,
    seasonId: string,
    day: number,
    channel: string,
    type: string,
    title: string,
    content: string,
    refId?: string,
  ): Promise<void> {
    await this.prisma.teamMessage.create({
      data: { teamId, seasonId, day, channel, type, title, content, refId },
    });
  }

  // ─── 视图转换 ───

  private toSponsorView(s: { id: string; type: string; name: string; tier: string; basePerSeason: number; bonusPerWin: number; titleBonus: number; satisfaction: number; expectedWinRate: number; expectedPlayoff: boolean; contractSeasons: number; startSeason: number; endSeason: number | null; }): SponsorView {
    return { ...s };
  }

  private toDirectorView(d: { id: string; name: string; role: string; loyalty: number; }): BoardDirectorView {
    return {
      id: d.id,
      name: d.name,
      role: d.role,
      roleLabel: ROLE_LABEL[d.role] ?? d.role,
      loyalty: d.loyalty,
    };
  }

  private toGoalView(g: { id: string; seasonId: string; season: number; expectedWinRate: number; expectedPlayoff: boolean; expectedChampionship: boolean; expectedRank: number | null; basisNote: string; achievedNote: string | null; }): SeasonGoalView {
    return { ...g };
  }

  private toProposalView(p: { id: string; seasonId: string; day: number; type: string; payload: unknown; reason: string; status: string; votes: unknown; createdAt: Date; }): BoardProposalView {
    return {
      id: p.id,
      seasonId: p.seasonId,
      day: p.day,
      type: p.type,
      typeLabel: PROPOSAL_LABEL[p.type] ?? p.type,
      payload: p.payload,
      reason: p.reason,
      status: p.status,
      votes: p.votes,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

// ── 目标胜率推算：综合 OVR 中位数 + 上赛季战绩 ──

function clampTargetWinRate(ovrMedian: number, prevWinRate: number): number {
  // OVR 中位数 80+ 期望胜率高，60- 期望低
  const ovrExpectation = (ovrMedian - 60) / 100; // 80 → 0.2, 70 → 0.1, 60 → 0
  // 上赛季战绩权重更大
  const blended = prevWinRate * 0.6 + (0.5 + ovrExpectation) * 0.4;
  // 范围 [0.30, 0.75]
  return Math.round(Math.max(0.3, Math.min(0.75, blended)) * 100) / 100;
}

function buildBasisNote(args: {
  prevWinRate: number;
  prevRank: number | null;
  madePlayoff: boolean;
  ovrMedian: number;
  salaryPct: number;
  leagueLevel: number;
  expectedWinRate: number;
  expectedPlayoff: boolean;
  expectedChampionship: boolean;
}): string {
  const rankStr = args.prevRank ? `排名第 ${args.prevRank}` : "无排名数据";
  const playoffStr = args.madePlayoff ? "进季后赛" : "未进季后赛";
  const salaryStr = args.salaryPct > 0 ? `薪资占比 ${args.salaryPct.toFixed(0)}%` : "薪资数据缺失";
  const leagueStr = args.leagueLevel === 1 ? "L1" : args.leagueLevel === 2 ? "L2" : `L${args.leagueLevel}`;
  const champStr = args.expectedChampionship ? "是" : "否";
  const playoffGoalStr = args.expectedPlayoff ? "进季后赛" : "不要求季后赛";
  return `上赛季胜率 ${args.prevWinRate.toFixed(2)}（${rankStr}，${playoffStr}），OVR 中位数 ${args.ovrMedian.toFixed(0)}，${salaryStr}（${leagueStr}）。目标设定：胜率 ${args.expectedWinRate.toFixed(2)}、${playoffGoalStr}、夺冠 ${champStr}`;
}
