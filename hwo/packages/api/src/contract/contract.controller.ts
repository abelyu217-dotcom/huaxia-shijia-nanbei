/**
 * ContractController——签约与合同端点
 *
 * - GET    /api/contract/team/:teamId               查询球队合同列表
 * - GET    /api/contract/team/:teamId/salary        查询球队薪资状况
 * - GET    /api/contract/free-agents                查询自由球员
 * - POST   /api/contract/sign                       签约（新秀/已有球员）
 * - POST   /api/contract/free-agent/sign            签约自由球员
 * - POST   /api/contract/:contractId/extend         续约
 * - POST   /api/contract/:contractId/waive          裁员
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ContractService } from "./contract.service.js";

@Controller("api/contract")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  /** 查询球队合同 */
  @Get("team/:teamId")
  async getTeamContracts(
    @Param("teamId") teamId: string,
    @Query("status") status?: "active" | "expired" | "waived",
  ) {
    return this.contractService.getTeamContracts(teamId, status);
  }

  /** 查询球队薪资状况 */
  @Get("team/:teamId/salary")
  async getTeamSalary(@Param("teamId") teamId: string) {
    return this.contractService.getTeamSalaryStatus(teamId);
  }

  /** 查询自由球员 */
  @Get("free-agents")
  async getFreeAgents(@Query("worldId") worldId?: string) {
    return this.contractService.getFreeAgents(worldId);
  }

  /** 签约 */
  @Post("sign")
  async signContract(
    @Body()
    body: {
      playerId: string;
      teamId: string;
      yearsTotal: number;
      salaryPerYear: number;
      playerOption?: boolean;
      teamOption?: boolean;
      noTrade?: boolean;
    },
  ) {
    if (!body.playerId || !body.teamId || !body.yearsTotal || !body.salaryPerYear) {
      throw new BadRequestException("playerId/teamId/yearsTotal/salaryPerYear 必填");
    }
    return this.contractService.signContract(body);
  }

  /** 签约自由球员 */
  @Post("free-agent/sign")
  async signFreeAgent(
    @Body()
    body: {
      playerId: string;
      teamId: string;
      yearsTotal: number;
      salaryPerYear: number;
      playerOption?: boolean;
      teamOption?: boolean;
      noTrade?: boolean;
    },
  ) {
    if (!body.playerId || !body.teamId || !body.yearsTotal || !body.salaryPerYear) {
      throw new BadRequestException("playerId/teamId/yearsTotal/salaryPerYear 必填");
    }
    return this.contractService.signFreeAgent(body);
  }

  /** 续约 */
  @Post(":contractId/extend")
  async extendContract(
    @Param("contractId") contractId: string,
    @Body()
    body: {
      addYears: number;
      newSalaryPerYear: number;
      playerOption?: boolean;
      teamOption?: boolean;
      noTrade?: boolean;
    },
  ) {
    if (!body.addYears || !body.newSalaryPerYear) {
      throw new BadRequestException("addYears/newSalaryPerYear 必填");
    }
    return this.contractService.extendContract(contractId, body);
  }

  /** 裁员 */
  @Post(":contractId/waive")
  async waivePlayer(@Param("contractId") contractId: string) {
    return this.contractService.waivePlayer(contractId);
  }
}
