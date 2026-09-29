/**
 * LineupController——阵容编辑端点
 *
 * - GET  /api/teams/:id/lineup   获取球队阵容
 * - PUT  /api/teams/:id/lineup   更新阵容（首发 + 出场时间）
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  Request,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { TeamService } from "./team.service.js";

interface UpdateLineupDto {
  starters: string[]; // 5 个 player id
  minutes: Record<string, number>; // 每个球员目标出场时间
}

@Controller("api/teams")
export class LineupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamService,
  ) {}

  @Get(":id/lineup")
  async getLineup(@Param("id") teamId: string) {
    const team = await this.teamService.getById(teamId);
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    const lineup = await this.prisma.lineup.findUnique({
      where: { teamId },
    });

    return {
      teamId,
      starters: lineup?.starters ?? team.lineup.starters,
      minutes: lineup?.minutes ?? team.lineup.minutes,
      players: team.players.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
      })),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id/lineup")
  async updateLineup(
    @Param("id") teamId: string,
    @Body() body: UpdateLineupDto,
    @Request() req: { user: { teamId: string | null } },
  ) {
    // 验证用户拥有该球队
    if (req.user.teamId !== teamId) {
      throw new ForbiddenException("只能编辑自己的球队阵容");
    }

    // 验证首发 5 人
    if (!body.starters || body.starters.length !== 5) {
      throw new ForbiddenException("首发必须为 5 人");
    }

    // 验证首发球员属于该球队
    const team = await this.teamService.getById(teamId);
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);
    const playerIds = new Set(team.players.map((p) => p.id));
    for (const sid of body.starters) {
      if (!playerIds.has(sid)) {
        throw new ForbiddenException(`球员 ${sid} 不属于该球队`);
      }
    }

    // upsert lineup
    const lineup = await this.prisma.lineup.upsert({
      where: { teamId },
      create: {
        teamId,
        starters: body.starters,
        minutes: body.minutes,
      },
      update: {
        starters: body.starters,
        minutes: body.minutes,
      },
    });

    // 清除缓存
    await this.teamService.invalidateCache(teamId);

    return {
      teamId,
      starters: lineup.starters as string[],
      minutes: lineup.minutes as Record<string, number>,
    };
  }
}
