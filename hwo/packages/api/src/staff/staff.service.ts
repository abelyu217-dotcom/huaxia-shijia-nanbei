/**
 * StaffService——职员（Professional）雇佣与管理
 *
 * v0.6 设计：
 * - 球队可雇佣 5 类核心职员：head_coach / asst_coach / trainer / scout / agent
 * - 每个职员有 level（1-10）、proReputation、年薪
 * - 职员加成影响训练 / 球探 / 经济系统
 * - 系统预生成 NPC 职员池（employmentStatus="preset_npc"）供经理雇佣
 * - 雇佣时扣除现金（一次性签约费），每日由财务结算扣薪资
 *
 * 参见：HWO_系统调整方案_v2.md §批次3
 */

import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

/** 职员 job 类型 */
export type StaffJob =
  | "head_coach"
  | "asst_coach"
  | "trainer"
  | "scout"
  | "agent";

/** 职员类型配置：中文名、每队最大雇佣数、加成类别 */
interface JobConfig {
  label: string;
  maxPerTeam: number;
  signOnCostBase: number; // 一次性签约费基础
  salaryPerDayBase: number; // 日薪基础
  /** 该职员提供的训练加成系数（每 level） */
  trainingBonusPerLevel: number;
  /** 球探精度加成系数（每 level） */
  scoutBonusPerLevel: number;
}

export const STAFF_JOB_CONFIG: Record<StaffJob, JobConfig> = {
  head_coach: {
    label: "主教练",
    maxPerTeam: 1,
    signOnCostBase: 200_000,
    salaryPerDayBase: 5_000,
    trainingBonusPerLevel: 0.02,
    scoutBonusPerLevel: 0,
  },
  asst_coach: {
    label: "助理教练",
    maxPerTeam: 2,
    signOnCostBase: 80_000,
    salaryPerDayBase: 2_000,
    trainingBonusPerLevel: 0.012,
    scoutBonusPerLevel: 0,
  },
  trainer: {
    label: "训练师",
    maxPerTeam: 2,
    signOnCostBase: 60_000,
    salaryPerDayBase: 1_500,
    trainingBonusPerLevel: 0.008,
    scoutBonusPerLevel: 0,
  },
  scout: {
    label: "球探",
    maxPerTeam: 3,
    signOnCostBase: 40_000,
    salaryPerDayBase: 1_000,
    trainingBonusPerLevel: 0,
    scoutBonusPerLevel: 0.04,
  },
  agent: {
    label: "经纪人",
    maxPerTeam: 1,
    signOnCostBase: 100_000,
    salaryPerDayBase: 1_800,
    trainingBonusPerLevel: 0.005,
    scoutBonusPerLevel: 0,
  },
};

/** 职员视图（前端 StaffView） */
export interface StaffView {
  id: string;
  userId: string | null;
  line: string;
  job: StaffJob;
  jobLabel: string;
  level: number;
  proReputation: number;
  experience: number;
  employmentStatus: string;
  employerTeamId: string | null;
  signOnCost: number;
  salaryPerDay: number;
  trainingBonus: number;
  scoutBonus: number;
  isPlayer: boolean; // 是否为玩家职业身份
  nickname?: string;
}

@Injectable()
export class StaffService implements OnModuleInit {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 模块启动时自动 seed NPC 职员池 */
  async onModuleInit() {
    try {
      const result = await this.seedPresetNpcs();
      if (result.created > 0) {
        this.logger.log(`[Staff] 启动时生成 ${result.created} 名 NPC 职员`);
      }
    } catch (e) {
      this.logger.warn(
        `[Staff] NPC seed 失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ── 查询 ──

  /** 列出球队雇佣的职员 */
  async listByTeam(teamId: string): Promise<StaffView[]> {
    const pros = await this.prisma.professional.findMany({
      where: { employerTeamId: teamId, employmentStatus: "hired_by_manager" },
      orderBy: { level: "desc" },
    });
    return pros.map((p) => this.toView(p));
  }

  /** 列出可雇佣的 NPC 池（按 job 过滤，排除已被本队雇佣的） */
  async listHiringPool(opts: { job?: StaffJob; limit?: number }): Promise<StaffView[]> {
    const where: Prisma.ProfessionalWhereInput = {
      employmentStatus: "preset_npc",
    };
    if (opts.job) where.job = opts.job;

    const pros = await this.prisma.professional.findMany({
      where,
      orderBy: { level: "desc" },
      take: opts.limit ?? 50,
    });
    return pros.map((p) => this.toView(p));
  }

  /** 计算球队的职员训练加成（0.0 = 无加成，0.1 = +10% 训练效率） */
  async getTrainingBonus(teamId: string): Promise<number> {
    const staff = await this.prisma.professional.findMany({
      where: { employerTeamId: teamId, employmentStatus: "hired_by_manager" },
      select: { job: true, level: true },
    });

    let bonus = 0;
    for (const s of staff) {
      const cfg = STAFF_JOB_CONFIG[s.job as StaffJob];
      if (cfg) {
        bonus += cfg.trainingBonusPerLevel * s.level;
      }
    }
    // 上限 30%
    return Math.min(0.3, bonus);
  }

  /** 计算球队的球探加成（0.0 = 无加成） */
  async getScoutBonus(teamId: string): Promise<number> {
    const staff = await this.prisma.professional.findMany({
      where: { employerTeamId: teamId, employmentStatus: "hired_by_manager" },
      select: { job: true, level: true },
    });

    let bonus = 0;
    for (const s of staff) {
      const cfg = STAFF_JOB_CONFIG[s.job as StaffJob];
      if (cfg) {
        bonus += cfg.scoutBonusPerLevel * s.level;
      }
    }
    return Math.min(0.4, bonus);
  }

  // ── 雇佣 / 解雇 ──

  /** 雇佣一名职员（扣除签约费） */
  async hire(professionalId: string, teamId: string): Promise<StaffView> {
    const [pro, team] = await Promise.all([
      this.prisma.professional.findUnique({ where: { id: professionalId } }),
      this.prisma.team.findUnique({ where: { id: teamId }, include: { cash: true } }),
    ]);

    if (!pro) throw new NotFoundException("职员不存在");
    if (!team) throw new NotFoundException("球队不存在");

    if (pro.employmentStatus !== "preset_npc" && pro.employmentStatus !== "unemployed") {
      throw new BadRequestException("该职员已被雇佣");
    }

    const job = pro.job as StaffJob;
    const cfg = STAFF_JOB_CONFIG[job];
    if (!cfg) throw new BadRequestException(`未知职员类型：${pro.job}`);

    // 检查每队最大雇佣数
    const sameJobCount = await this.prisma.professional.count({
      where: { employerTeamId: teamId, employmentStatus: "hired_by_manager", job: pro.job },
    });
    if (sameJobCount >= cfg.maxPerTeam) {
      throw new BadRequestException(`${cfg.label}已达上限（${cfg.maxPerTeam} 名）`);
    }

    // 计算签约费（与 level 正相关）
    const signOnCost = cfg.signOnCostBase + pro.level * 30_000;

    // 检查现金账户
    const cash = team.cash;
    if (!cash || cash.balance < signOnCost) {
      throw new BadRequestException(
        `现金不足：签约费 ${signOnCost.toLocaleString()} 元，当前余额 ${cash?.balance.toLocaleString() ?? 0} 元`,
      );
    }

    // 执行：扣现金 + 更新职员状态 + 记录流水
    await this.prisma.$transaction(async (tx) => {
      await tx.teamCash.update({
        where: { teamId },
        data: { balance: { decrement: signOnCost } },
      });
      await tx.professional.update({
        where: { id: professionalId },
        data: {
          employmentStatus: "hired_by_manager",
          employerTeamId: teamId,
        },
      });
      // 写入 CashLedger 流水
      await tx.cashLedger.create({
        data: {
          teamId,
          seasonId: await this.getCurrentSeasonId(),
          day: await this.getCurrentDay(),
          category: "staff",
          subType: `${job}_signon`,
          amount: -signOnCost,
          refId: professionalId,
          note: `签约 ${cfg.label}（Lv${pro.level}）`,
        },
      });
    });

    this.logger.log(
      `[Staff] 球队 ${teamId} 雇佣 ${cfg.label}（Lv${pro.level}），签约费 ${signOnCost.toLocaleString()} 元`,
    );

    const updated = await this.prisma.professional.findUnique({ where: { id: professionalId } });
    return this.toView(updated!);
  }

  /** 解雇一名职员（不退签约费） */
  async fire(professionalId: string, teamId: string): Promise<{ ok: true }> {
    const pro = await this.prisma.professional.findUnique({
      where: { id: professionalId },
    });
    if (!pro) throw new NotFoundException("职员不存在");
    if (pro.employerTeamId !== teamId) {
      throw new BadRequestException("该职员不属于本球队");
    }

    const job = pro.job as StaffJob;
    const cfg = STAFF_JOB_CONFIG[job];

    await this.prisma.$transaction(async (tx) => {
      await tx.professional.update({
        where: { id: professionalId },
        data: {
          employmentStatus: pro.userId ? "unemployed" : "preset_npc",
          employerTeamId: null,
        },
      });
      if (cfg) {
        await tx.cashLedger.create({
          data: {
            teamId,
            seasonId: await this.getCurrentSeasonId(),
            day: await this.getCurrentDay(),
            category: "staff",
            subType: `${job}_release`,
            amount: 0,
            refId: professionalId,
            note: `解约 ${cfg.label}（Lv${pro.level}）`,
          },
        });
      }
    });

    this.logger.log(
      `[Staff] 球队 ${teamId} 解约 ${cfg?.label ?? pro.job}（Lv${pro.level}）`,
    );

    return { ok: true };
  }

  // ── 种子：自动生成 NPC 职员池 ──

  /** 初始化 NPC 职员池（系统启动时调用一次） */
  async seedPresetNpcs(): Promise<{ created: number }> {
    const count = await this.prisma.professional.count({
      where: { employmentStatus: "preset_npc" },
    });
    if (count >= 50) {
      this.logger.log(`[Staff] NPC 职员池已存在 ${count} 名，跳过种子`);
      return { created: 0 };
    }

    const lines = ["tech", "biz", "media"] as const;
    const jobs: StaffJob[] = ["head_coach", "asst_coach", "trainer", "scout", "agent"];
    const surnames = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴", "徐", "孙"];
    const givenNames = ["志强", "建国", "伟", "军", "明辉", "海涛", "国华", "立新", "建华", "卫东", "晓东", "永康"];

    let created = 0;
    for (let i = 0; i < 60; i++) {
      const job = jobs[i % jobs.length]!;
      const line = lines[i % lines.length]!;
      const level = 1 + Math.floor(Math.random() * 9); // 1-9
      const reputation = 10 + Math.floor(Math.random() * 80);
      const s = surnames[Math.floor(Math.random() * surnames.length)];
      const g = givenNames[Math.floor(Math.random() * givenNames.length)];

      // 为 NPC 创建一个伪 userId（即不绑定真实用户）
      // 注意：Professional.userId 是 unique，不能重复
      // 因此用 cuid 生成假的 id 字符串（实际不会查询到 User）
      // 但 schema 要求 Professional.userId 引用 User.id
      // 改为创建轻量 User 记录
      const fakeUser = await this.prisma.user.create({
        data: {
          email: `npc_staff_${Date.now()}_${i}@hwo.npc`,
          passwordHash: "$npc$",
          nickname: `${s}${g}`,
        },
      });

      await this.prisma.professional.create({
        data: {
          userId: fakeUser.id,
          line,
          job,
          level,
          proReputation: reputation,
          experience: 0,
          skillPoints: {},
          employmentStatus: "preset_npc",
        },
      });
      created++;
    }

    this.logger.log(`[Staff] NPC 职员池已生成 ${created} 名`);
    return { created };
  }

  // ── 内部工具 ──

  private toView(p: {
    id: string;
    userId: string;
    line: string;
    job: string;
    level: number;
    proReputation: number;
    experience: number;
    employmentStatus: string;
    employerTeamId: string | null;
  }): StaffView {
    const job = p.job as StaffJob;
    const cfg = STAFF_JOB_CONFIG[job];
    return {
      id: p.id,
      userId: p.userId,
      line: p.line,
      job,
      jobLabel: cfg?.label ?? p.job,
      level: p.level,
      proReputation: p.proReputation,
      experience: p.experience,
      employmentStatus: p.employmentStatus,
      employerTeamId: p.employerTeamId,
      signOnCost: (cfg?.signOnCostBase ?? 0) + p.level * 30_000,
      salaryPerDay: (cfg?.salaryPerDayBase ?? 0) + p.level * 200,
      trainingBonus: cfg ? cfg.trainingBonusPerLevel * p.level : 0,
      scoutBonus: cfg ? cfg.scoutBonusPerLevel * p.level : 0,
      isPlayer: false,
    };
  }

  private cachedSeason: { id: string; day: number; ts: number } | null = null;

  private async getCurrentSeasonId(): Promise<string> {
    const s = await this.ensureSeasonCache();
    return s.id;
  }

  private async getCurrentDay(): Promise<number> {
    const s = await this.ensureSeasonCache();
    return s.day;
  }

  private async ensureSeasonCache(): Promise<{ id: string; day: number }> {
    const now = Date.now();
    if (this.cachedSeason && now - this.cachedSeason.ts < 10_000) {
      return { id: this.cachedSeason.id, day: this.cachedSeason.day };
    }
    const season = await this.prisma.season.findFirst({
      orderBy: { currentDay: "desc" },
      select: { id: true, currentDay: true },
    });
    if (!season) {
      return { id: "unknown", day: 1 };
    }
    this.cachedSeason = { id: season.id, day: season.currentDay, ts: now };
    return { id: season.id, day: season.currentDay };
  }
}
