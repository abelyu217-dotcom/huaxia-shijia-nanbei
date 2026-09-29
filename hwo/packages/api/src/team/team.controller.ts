/**
 * TeamController——球队相关端点
 *
 * - GET /api/teams      全部球队列表（含球员概要 + ovr）
 * - GET /api/teams/:id  单支球队完整信息（每个 player 附加 ovr）
 *
 * ovr 由 overallRating(abilities) 计算。
 */

import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { overallRating, type Player, type Team } from "@hwo/shared";
import { TeamService } from "./team.service.js";

/** 球员概要：列表视图只暴露关键字段 + 综合评分 */
interface PlayerSummary {
  id: string;
  name: string;
  position: Player["position"];
  ovr: number;
}

interface TeamSummary {
  id: string;
  name: string;
  players: PlayerSummary[];
}

/** 详情视图：完整 Player + ovr */
interface PlayerDetail extends Player {
  ovr: number;
}

/** 详情视图：完整 Team，但 players 带 ovr */
type TeamDetail = Omit<Team, "players"> & { players: PlayerDetail[] };

@Controller("api/teams")
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  async list(): Promise<TeamSummary[]> {
    const teams = await this.teamService.getAll();
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      players: t.players.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        ovr: overallRating(p.abilities),
      })),
    }));
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<TeamDetail> {
    const team = await this.teamService.getById(id);
    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }
    return {
      ...team,
      players: team.players.map((p) => ({
        ...p,
        ovr: overallRating(p.abilities),
      })),
    };
  }
}
