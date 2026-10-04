/**
 * sim 控制器——比赛模拟相关端点
 *
 * - GET  /api/sim/demo   用 mock 对阵跑一场比赛（不持久化）
 * - POST /api/sim/match  按指定球队 + 战术跑比赛，返回完整 SimOutput 并持久化
 */

import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { DEFAULT_CONFIG, simulate, type SimOutput } from "@hwo/shared";
import { makeMockMatchup } from "./mock.js";
import { SimService } from "./sim.service.js";

/** POST /api/sim/match 请求体 */
interface MatchDto {
  homeTeamId: string;
  awayTeamId: string;
  homeTacticId: string;
  awayTacticId: string;
  /** 可选随机种子；未传则随机生成以保证每场结果不同 */
  seed?: number;
}

@Controller("api/sim")
export class SimController {
  constructor(private readonly simService: SimService) {}

  @Get("demo")
  demo(): SimOutput {
    return simulate({
      matchup: makeMockMatchup(),
      seed: 12345,
      config: DEFAULT_CONFIG,
    });
  }

  @Post("match")
  async match(@Body() body: MatchDto): Promise<SimOutput> {
    try {
      return await this.simService.simulateAndSave({
        homeTeamId: body.homeTeamId,
        awayTeamId: body.awayTeamId,
        homeTacticId: body.homeTacticId,
        awayTacticId: body.awayTacticId,
        seed: body.seed,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("not found")) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }
}
