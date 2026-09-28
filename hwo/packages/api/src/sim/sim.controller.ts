/**
 * sim 控制器——比赛模拟相关端点
 *
 * - GET  /api/sim/demo   用 mock 对阵跑一场比赛（原 demo 端点）
 * - POST /api/sim/match  按指定球队 + 战术跑比赛，返回完整 SimOutput
 *
 * /api/sim/demo 调用 @hwo/shared 的 simulate() 用 mock 对阵返回 SimOutput JSON，
 * 证明前后端类型共享 + sim 引擎在服务端可运行。
 */

import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import {
  DEFAULT_CONFIG,
  simulate,
  tacticFromPreset,
  type SimOutput,
  type Team,
} from "@hwo/shared";
import { makeMockMatchup } from "./mock.js";
import { TeamService } from "../team/team.service.js";

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
  constructor(private readonly teamService: TeamService) {}

  @Get("demo")
  demo(): SimOutput {
    return simulate({
      matchup: makeMockMatchup(),
      seed: 12345,
      config: DEFAULT_CONFIG,
    });
  }

  @Post("match")
  match(@Body() body: MatchDto): SimOutput {
    const home = this.teamService.getById(body.homeTeamId);
    const away = this.teamService.getById(body.awayTeamId);
    if (!home) {
      throw new NotFoundException(`Team ${body.homeTeamId} not found`);
    }
    if (!away) {
      throw new NotFoundException(`Team ${body.awayTeamId} not found`);
    }

    // 用预设战术覆盖球队默认 tactic（tacticFromPreset 内部对未知 id 回退到首个预设）
    const homeTeam: Team = {
      ...home,
      tactic: tacticFromPreset(home.id, body.homeTacticId),
    };
    const awayTeam: Team = {
      ...away,
      tactic: tacticFromPreset(away.id, body.awayTacticId),
    };

    const seed = body.seed ?? Math.floor(Math.random() * 1_000_000);

    return simulate({
      matchup: { homeTeam, awayTeam },
      seed,
      config: DEFAULT_CONFIG,
    });
  }
}
