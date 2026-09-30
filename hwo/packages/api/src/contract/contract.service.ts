/**
 * ContractService——签约与合同服务
 *
 * 职责：
 * 1. 新秀/自由球员签约（年限 + 年薪 + 选项 + 交易否决权）
 * 2. 合同续约
 * 3. 裁员（waive）
 * 4. 自由市场查询（合同到期的球员）
 * 5. 赛季结束时推进合同：剩余年数 -1，处理球员/球队选项，标记到期
 *
 * 参见：开发计划.html §4.5 签约与合同
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/** 工资帽（每年总薪资上限，单位：万） */
const SALARY_CAP = 10_000;
/** 最低合同年限 */
const MIN_YEARS = 1;
/** 最高合同年限 */
const MAX_YEARS = 5;
/** 最低年薪（万） */
const MIN_SALARY = 50;

export interface SignContractParams {
  playerId: string;
  teamId: string;
  yearsTotal: number;
  salaryPerYear: number;
  playerOption?: boolean;
  teamOption?: boolean;
  noTrade?: boolean;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 签约：为球员创建合同
   * - 球员当前不能有 active 合同
   * - 校验工资帽（球队总薪资 + 新合同年薪 ≤ 工资帽）
   */
  async signContract(params: SignContractParams) {
    const {
      playerId,
      teamId,
      yearsTotal,
      salaryPerYear,
      playerOption = false,
      teamOption = false,
      noTrade = false,
    } = params;

    // 参数校验
    if (yearsTotal < MIN_YEARS || yearsTotal > MAX_YEARS) {
      throw new BadRequestException(
        `合同年限必须在 ${MIN_YEARS}-${MAX_YEARS} 年之间`,
      );
    }
    if (salaryPerYear < MIN_SALARY) {
      throw new BadRequestException(`年薪不能低于 ${MIN_SALARY} 万`);
    }

    // 球员是否存在 + 是否已有 active 合同
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player) {
      throw new NotFoundException("球员不存在");
    }
    if (player.teamId !== teamId) {
      throw new BadRequestException("球员不属于该球队");
    }

    const existing = await this.prisma.contract.findUnique({
      where: { playerId },
    });
    if (existing && existing.status === "active") {
      throw new BadRequestException("球员已有生效合同，请使用续约接口");
    }

    // 工资帽检查
    await this.assertUnderSalaryCap(teamId, salaryPerYear);

    // 创建合同
    const contract = await this.prisma.contract.create({
      data: {
        playerId,
        teamId,
        yearsTotal,
        yearsRemain: yearsTotal,
        salaryPerYear,
        playerOption,
        teamOption,
        noTrade,
        status: "active",
      },
    });

    // 同步更新球员年薪
    await this.prisma.player.update({
      where: { id: playerId },
      data: { salary: salaryPerYear },
    });

    this.logger.log(
      `签约：${player.name} ← ${teamId}，${yearsTotal} 年 / ${salaryPerYear} 万每年`,
    );

    return contract;
  }

  /**
   * 续约：延长现有合同
   * - 仅对 active 合同有效
   * - 在原合同剩余年数基础上叠加新年限
   * - 可调整年薪
   */
  async extendContract(
    contractId: string,
    params: {
      addYears: number;
      newSalaryPerYear: number;
      playerOption?: boolean;
      teamOption?: boolean;
      noTrade?: boolean;
    },
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) {
      throw new NotFoundException("合同不存在");
    }
    if (contract.status !== "active") {
      throw new BadRequestException("仅生效合同可续约");
    }

    const newYearsTotal = contract.yearsTotal + params.addYears;
    if (newYearsTotal > MAX_YEARS) {
      throw new BadRequestException(
        `续约后总年限 ${newYearsTotal} 超过上限 ${MAX_YEARS}`,
      );
    }
    if (params.newSalaryPerYear < MIN_SALARY) {
      throw new BadRequestException(`年薪不能低于 ${MIN_SALARY} 万`);
    }

    // 工资帽检查：用新年薪减去年薪差额
    const salaryDelta = params.newSalaryPerYear - contract.salaryPerYear;
    if (salaryDelta > 0) {
      await this.assertUnderSalaryCap(contract.teamId, salaryDelta);
    }

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        yearsTotal: newYearsTotal,
        yearsRemain: contract.yearsRemain + params.addYears,
        salaryPerYear: params.newSalaryPerYear,
        playerOption: params.playerOption ?? contract.playerOption,
        teamOption: params.teamOption ?? contract.teamOption,
        noTrade: params.noTrade ?? contract.noTrade,
      },
    });

    // 同步球员年薪
    await this.prisma.player.update({
      where: { id: contract.playerId },
      data: { salary: params.newSalaryPerYear },
    });

    this.logger.log(
      `续约：合同 ${contractId} 续 ${params.addYears} 年，新年薪 ${params.newSalaryPerYear} 万`,
    );

    return updated;
  }

  /**
   * 裁员：终止合同
   * - 球员成为自由球员（teamId 置空需要可空，这里改为标记 waived）
   * - 合同标记为 waived
   */
  async waivePlayer(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { player: true },
    });
    if (!contract) {
      throw new NotFoundException("合同不存在");
    }
    if (contract.status !== "active") {
      throw new BadRequestException("仅生效合同可裁员");
    }

    await this.prisma.$transaction([
      this.prisma.contract.update({
        where: { id: contractId },
        data: { status: "waived", yearsRemain: 0 },
      }),
    ]);

    this.logger.log(
      `裁员：${contract.player.name}（球队 ${contract.teamId}）`,
    );

    return { waived: true, playerId: contract.playerId };
  }

  /** 查询球队所有合同（含球员信息） */
  async getTeamContracts(teamId: string, status?: "active" | "expired" | "waived") {
    return this.prisma.contract.findMany({
      where: { teamId, ...(status ? { status } : {}) },
      orderBy: [{ salaryPerYear: "desc" }],
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            age: true,
            potential: true,
            abilities: true,
            retired: true,
          },
        },
      },
    });
  }

  /**
   * 查询自由球员：合同到期或被裁员的球员
   * - 可选 worldId 过滤（同世界内）
   * - 注意：仅返回合同状态为 expired/waived 的球员，
   *   不包含仍在队中但未签合同的球员（如初始阵容）
   */
  async getFreeAgents(_worldId?: string) {
    const expiredContracts = await this.prisma.contract.findMany({
      where: { status: { in: ["expired", "waived"] } },
      select: { playerId: true },
    });
    const expiredPlayerIds = expiredContracts.map((c) => c.playerId);

    if (expiredPlayerIds.length === 0) return [];

    const players = await this.prisma.player.findMany({
      where: {
        retired: false,
        id: { in: expiredPlayerIds },
      },
      include: {
        team: { select: { id: true, name: true, worldId: true } },
      },
      orderBy: { potential: "desc" },
    });

    return players;
  }

  /**
   * 签约自由球员
   * - 球员必须是自由球员状态（合同到期/无合同）
   * - 签约后球员转移到该球队
   */
  async signFreeAgent(params: SignContractParams) {
    const { playerId, teamId } = params;

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { contract: true },
    });
    if (!player) {
      throw new NotFoundException("球员不存在");
    }
    if (player.retired) {
      throw new BadRequestException("球员已退役");
    }

    // 必须是自由球员：无合同 或 合同到期/被裁
    const isFree =
      !player.contract ||
      player.contract.status === "expired" ||
      player.contract.status === "waived";
    if (!isFree) {
      throw new BadRequestException("该球员非自由球员");
    }

    // 工资帽检查
    await this.assertUnderSalaryCap(teamId, params.salaryPerYear);

    // 转移球员到新球队
    await this.prisma.player.update({
      where: { id: playerId },
      data: { teamId },
    });

    // 创建新合同
    return this.signContract(params);
  }

  /**
   * 赛季结束推进合同：
   * - 所有 active 合同 yearsRemain -1
   * - yearsRemain == 0 时标记 expired（成为自由球员）
   * - 处理球员选项（自动跳出）和球队选项（标记待决定，这里简化为执行）
   */
  async advanceAllContracts(): Promise<{
    decremented: number;
    expired: number;
  }> {
    const activeContracts = await this.prisma.contract.findMany({
      where: { status: "active" },
    });

    let decremented = 0;
    let expired = 0;
    const expiredIds: string[] = [];

    for (const contract of activeContracts) {
      const newRemain = contract.yearsRemain - 1;

      if (newRemain <= 0) {
        // 合同到期
        // 球员选项：球员可跳出（这里默认跳出成为自由球员）
        // 球队选项：球队可执行（这里默认执行——简化处理）
        if (contract.teamOption) {
          // 球队执行选项：续一年
          await this.prisma.contract.update({
            where: { id: contract.id },
            data: { yearsRemain: 1, yearsTotal: contract.yearsTotal + 1 },
          });
          decremented++;
        } else {
          expiredIds.push(contract.id);
          expired++;
        }
      } else {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: { yearsRemain: newRemain },
        });
        decremented++;
      }
    }

    // 批量标记到期并将球员转为自由球员
    if (expiredIds.length > 0) {
      // 获取到期合同的球员 ID
      const expiredContracts = await this.prisma.contract.findMany({
        where: { id: { in: expiredIds } },
        select: { playerId: true },
      });
      const expiredPlayerIds = expiredContracts.map((c) => c.playerId);

      await this.prisma.$transaction([
        this.prisma.contract.updateMany({
          where: { id: { in: expiredIds } },
          data: { status: "expired", yearsRemain: 0 },
        }),
        // 将球员转为自由球员（teamId 置空）
        this.prisma.player.updateMany({
          where: { id: { in: expiredPlayerIds } },
          data: { teamId: null },
        }),
      ]);
    }

    this.logger.log(
      `合同推进：${decremented} 份续期，${expired} 份到期成为自由球员`,
    );

    return { decremented, expired };
  }

  /** 根据球员 OVR 计算建议年薪（万），与 seed 公式一致 */
  suggestSalary(ovr: number): number {
    return Math.max(MIN_SALARY, Math.round(50 + (ovr - 55) * 40));
  }

  /** 查询球队薪资状况 */
  async getTeamSalaryStatus(teamId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { teamId, status: "active" },
      select: { salaryPerYear: true, playerId: true },
    });
    const totalSalary = contracts.reduce((s, c) => s + c.salaryPerYear, 0);
    return {
      teamId,
      totalSalary,
      salaryCap: SALARY_CAP,
      remaining: SALARY_CAP - totalSalary,
      capHit: totalSalary / SALARY_CAP,
      contractCount: contracts.length,
    };
  }

  // ─── 内部工具 ───

  /** 工资帽校验：球队当前总薪资 + 新增年薪 ≤ 工资帽 */
  private async assertUnderSalaryCap(teamId: string, addedSalary: number) {
    const status = await this.getTeamSalaryStatus(teamId);
    if (status.totalSalary + addedSalary > SALARY_CAP) {
      throw new BadRequestException(
        `超过工资帽：当前 ${status.totalSalary} 万 + 新增 ${addedSalary} 万 > 上限 ${SALARY_CAP} 万`,
      );
    }
  }
}
