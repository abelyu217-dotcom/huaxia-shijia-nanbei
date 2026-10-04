/**
 * IdentityService——三身份系统服务（P3-1）
 *
 * 职责：
 * 1. 查询用户三身份状态（经理/化身/职业人）
 * 2. 创建球员化身（自创一名球员进入本队）
 * 3. 选择职业人职业（11 职选一）
 * 4. 职业人转职、升级技能点
 *
 * 三身份共享同一账号资源池：
 *   - 经理：Team.userId 隐式表示
 *   - 化身：Avatar → 关联一个 Player
 *   - 职业人：Professional → 职业/等级/技能
 *
 * 参见：三身份系统设计.html
 */

import { Injectable, BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** 11 职业定义 */
export const PROFESSION_DEFS = [
  { job: "scout", line: "tech", name: "球探", desc: "探查球员/苗子，产出 fog 收窄报告" },
  { job: "asst_coach", line: "tech", name: "助理教练", desc: "提升训练效率/特定能力培养" },
  { job: "head_coach", line: "tech", name: "主教练", desc: "接管他队战术执行（高级）" },
  { job: "trainer", line: "tech", name: "训练师", desc: "降低伤病风险、加速恢复" },
  { job: "agent", line: "biz", name: "经纪人", desc: "代理球员谈判合同，抽成" },
  { job: "merchant", line: "biz", name: "商人", desc: "运营赞助/周边，拉赞助分成" },
  { job: "arena_ops", line: "biz", name: "球馆运营", desc: "提升球馆收入与上座率" },
  { job: "reporter", line: "media", name: "记者", desc: "撰写报道，影响舆论与 Fame" },
  { job: "caster", line: "media", name: "解说员", desc: "解说关键战，提升曝光" },
  { job: "arbiter", line: "gov", name: "联盟仲裁人", desc: "裁决失衡交易申诉（高级）" },
  { job: "union_rep", line: "gov", name: "球员工会代表", desc: "代表球员利益，影响劳资规则" },
] as const;

export type ProJob = (typeof PROFESSION_DEFS)[number]["job"];
export type ProLine = "tech" | "biz" | "media" | "gov";

/** 经验阈值表（等级 1-10） */
const EXP_THRESHOLDS = [0, 0, 200, 600, 1200, 2000, 3000, 4500, 6500, 9000, 13000];

export interface IdentityView {
  manager: { teamId: string | null; teamName: string | null };
  avatar: {
    exists: boolean;
    playerId?: string;
    playerName?: string;
    position?: string;
    status?: string;
    controlMode?: string;
  };
  professional: {
    exists: boolean;
    job?: string;
    jobName?: string;
    line?: string;
    level?: number;
    proReputation?: number;
    experience?: number;
    nextLevelExp?: number | null;
    employmentStatus?: string;
  };
}

export interface AvatarCreateParams {
  name: string;
  position: string; // PG | SG | SF | PF | C
  /** 球员风格 */
  playStyle?: string;
  /** 家庭背景 */
  familyBackground?: string;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 获取用户三身份总览 */
  async getIdentity(userId: string): Promise<IdentityView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        teams: { take: 1, select: { id: true, name: true } },
        avatar: {
          include: { player: { select: { name: true, position: true } } },
        },
        professional: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");

    const team = user.teams[0];
    const jobDef = user.professional
      ? PROFESSION_DEFS.find((d) => d.job === user.professional!.job)
      : null;

    return {
      manager: {
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
      },
      avatar: user.avatar
        ? {
            exists: true,
            playerId: user.avatar.playerId,
            playerName: user.avatar.player.name,
            position: user.avatar.player.position,
            status: user.avatar.status,
            controlMode: user.avatar.controlMode,
          }
        : { exists: false },
      professional: user.professional
        ? {
            exists: true,
            job: user.professional.job,
            jobName: jobDef?.name,
            line: user.professional.line,
            level: user.professional.level,
            proReputation: user.professional.proReputation,
            experience: user.professional.experience,
            nextLevelExp:
              user.professional.level < 10
                ? EXP_THRESHOLDS[user.professional.level + 1] ?? null
                : null,
            employmentStatus: user.professional.employmentStatus,
          }
        : { exists: false },
    };
  }

  /** 创建球员化身——在本队创建一名自定义球员 */
  async createAvatar(userId: string, params: AvatarCreateParams) {
    const existing = await this.prisma.avatar.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException("已创建过化身，每人仅 1 名");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { teams: { take: 1, select: { id: true } } },
    });
    if (!user) throw new NotFoundException("User not found");
    const team = user.teams[0];
    if (!team) throw new BadRequestException("需先加入球队才能创建化身");

    // 创建球员（初始能力 60，潜力 75）
    // Player.id 无默认值，需手动生成唯一 ID
    const playerId = `avatar-${userId.slice(0, 8)}-${Date.now()}`;
    const player = await this.prisma.player.create({
      data: {
        id: playerId,
        name: params.name,
        position: params.position,
        teamId: team.id,
        age: 22,
        abilities: this.baseAbilities(),
        traits: [],
        potential: 75,
      },
    });

    const avatar = await this.prisma.avatar.create({
      data: {
        userId,
        playerId: player.id,
        status: "home_team",
        controlMode: "owner_controlled",
      },
    });

    this.logger.log(`创建化身：user=${userId} player=${player.id} name=${params.name}`);
    return { avatarId: avatar.id, playerId: player.id };
  }

  /** 选择职业人职业 */
  async chooseProfession(userId: string, job: ProJob) {
    const existing = await this.prisma.professional.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException("已选择职业，需使用转职接口");

    const def = PROFESSION_DEFS.find((d) => d.job === job);
    if (!def) throw new BadRequestException(`未知职业: ${job}`);

    const pro = await this.prisma.professional.create({
      data: {
        userId,
        line: def.line,
        job: def.job,
        level: 1,
        proReputation: 0,
        experience: 0,
        skillPoints: {},
        employmentStatus: "unemployed",
      },
    });

    this.logger.log(`选择职业：user=${userId} job=${job}`);
    return { professionalId: pro.id, job: pro.job, line: pro.line };
  }

  /** 职业人转职 */
  async switchProfession(userId: string, newJob: ProJob) {
    const pro = await this.prisma.professional.findUnique({ where: { userId } });
    if (!pro) throw new BadRequestException("尚未选择职业");

    const def = PROFESSION_DEFS.find((d) => d.job === newJob);
    if (!def) throw new BadRequestException(`未知职业: ${newJob}`);

    // 跨线转职损失 30% 经验；同线无损
    const expLoss = def.line !== pro.line ? Math.floor(pro.experience * 0.3) : 0;
    const newExp = pro.experience - expLoss;

    // 自动按经验重算等级
    let newLevel = 1;
    for (let l = 10; l >= 1; l--) {
      if (newExp >= (EXP_THRESHOLDS[l] ?? 0)) {
        newLevel = l;
        break;
      }
    }

    const updated = await this.prisma.professional.update({
      where: { userId },
      data: {
        job: newJob,
        line: def.line,
        experience: newExp,
        level: newLevel,
        proReputation: 0, // 转职声望归零
        employmentStatus: "unemployed",
        employerTeamId: null,
      },
    });

    this.logger.log(`转职：user=${userId} ${pro.job}→${newJob} 经验损失=${expLoss}`);
    return { job: updated.job, level: updated.level, experience: updated.experience };
  }

  /** 分配技能点（简化版：直接给某分支加 n 点） */
  async addSkillPoint(userId: string, branch: string, points: number) {
    const pro = await this.prisma.professional.findUnique({ where: { userId } });
    if (!pro) throw new BadRequestException("尚未选择职业");

    const sp = (pro.skillPoints as Record<string, number>) ?? {};
    sp[branch] = (sp[branch] ?? 0) + points;

    const updated = await this.prisma.professional.update({
      where: { userId },
      data: { skillPoints: sp },
    });

    return { skillPoints: updated.skillPoints };
  }

  /** 基础能力值（化身初始） */
  private baseAbilities() {
    const attrs = [
      "close", "midRange", "threePoint", "freeThrow",
      "ballHandle", "passing", "offRebound", "defRebound",
      "postDefense", "perimeterDefense", "steal", "block",
      "strength", "speed", "vertical", "stamina", "iq",
    ];
    const obj: Record<string, number> = {};
    for (const a of attrs) obj[a] = 60;
    return obj;
  }
}
