/**
 * TeamController——球队相关端点
 *
 * - GET /api/teams      全部球队列表（含球员概要 + ovr）
 * - GET /api/teams/:id  单支球队完整信息（每个 player 附加 ovr）
 *
 * ovr 由 overallRating(abilities) 计算。
 */

import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Put, Request, UseGuards } from "@nestjs/common";
import { overallRating, type Player, type Team, type Abilities, type FogValue } from "@hwo/shared";
import { TeamService } from "./team.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScoutService } from "../scout/scout.service.js";

/** 球员概要：列表视图只暴露关键字段 + 综合评分 */
interface PlayerSummary {
  id: string;
  name: string;
  position: Player["position"];
  ovr: number | FogValue;
  /** 是否被本队球探探查过 */
  scouted?: boolean;
}

interface TeamSummary {
  id: string;
  name: string;
  players: PlayerSummary[];
}

/** 详情视图：完整 Player + ovr（可能带雾） */
interface PlayerDetail {
  id: string;
  name: string;
  position: Player["position"];
  ovr: number | FogValue;
  abilities: Abilities | Partial<Record<keyof Abilities, FogValue>>;
  /** 真实能力（仅本队球员可见） */
  realAbilities?: Abilities;
  traits: string[];
  salary?: number;
  age?: number;
  status?: "peak" | "good" | "tired" | "exhausted";
  isCaptain?: boolean;
  isRookie?: boolean;
  /** Peak 估值（带雾） */
  peak?: FogValue | number | null;
  /** 是否已被本队球探探查过 */
  scouted: boolean;
}

/** 详情视图：完整 Team，但 players 带 ovr */
type TeamDetail = Omit<Team, "players"> & { players: PlayerDetail[] };

@Controller("api/teams")
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly prisma: PrismaService,
    private readonly scoutService: ScoutService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Request() req: { user: { teamId: string | null } }): Promise<TeamSummary[]> {
    const viewerTeamId = req.user.teamId;
    const teams = await this.teamService.getAll();
    const result: TeamSummary[] = [];

    for (const t of teams) {
      const isOwn = viewerTeamId === t.id;
      const players: PlayerSummary[] = [];
      for (const p of t.players) {
        if (isOwn) {
          players.push({
            id: p.id,
            name: p.name,
            position: p.position,
            ovr: overallRating(p.abilities),
            scouted: true,
          });
        } else {
          // 对手球员：应用 fog（列表视图只显示 OVR 带雾）
          const report = viewerTeamId
            ? await this.scoutService.getReport(viewerTeamId, p.id)
            : null;
          // 粗略 OVR 估值：真实值 ± 默认 fog
          const realOvr = overallRating(p.abilities);
          const est = report
            ? Math.round(
                Object.values(report.abilityFog).reduce((s, f) => s + (f?.est ?? realOvr), 0) /
                  Math.max(1, Object.keys(report.abilityFog).length),
              )
            : realOvr + Math.round((Math.random() - 0.5) * 10);
          const range = report
            ? Math.round(
                Object.values(report.abilityFog).reduce((s, f) => s + (f?.range ?? 20), 0) /
                  Math.max(1, Object.keys(report.abilityFog).length) * 10,
              ) / 10
            : 20;
          players.push({
            id: p.id,
            name: p.name,
            position: p.position,
            ovr: { est, range },
            scouted: !!report,
          });
        }
      }
      result.push({ id: t.id, name: t.name, players });
    }
    return result;
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async detail(
    @Param("id") id: string,
    @Request() req: { user: { teamId: string | null } },
  ): Promise<TeamDetail> {
    const viewerTeamId = req.user.teamId;
    const team = await this.teamService.getById(id);
    if (!team) {
      throw new NotFoundException(`Team ${id} not found`);
    }
    const isOwn = viewerTeamId === id;

    const players: PlayerDetail[] = [];
    for (const p of team.players) {
      if (isOwn) {
        players.push({
          id: p.id,
          name: p.name,
          position: p.position,
          ovr: overallRating(p.abilities),
          abilities: p.abilities,
          realAbilities: p.abilities,
          traits: p.traits,
          salary: p.salary,
          age: p.isRookie ? 22 : undefined,
          status: p.status,
          isCaptain: p.isCaptain,
          isRookie: p.isRookie,
          peak: null,
          scouted: true,
        });
      } else {
        // 对手球员：应用 fog
        const report = viewerTeamId
          ? await this.scoutService.getReport(viewerTeamId, p.id)
          : null;
        const abilityKeys = Object.keys(p.abilities) as (keyof Abilities)[];
        const foggedAbilities: Partial<Record<keyof Abilities, FogValue>> = {};
        for (const key of abilityKeys) {
          const realValue = p.abilities[key];
          const reported = report?.abilityFog[key];
          if (reported) {
            foggedAbilities[key] = reported;
          } else {
            foggedAbilities[key] = {
              est: Math.max(0, Math.min(99, realValue + Math.round((Math.random() - 0.5) * 8))),
              range: 20,
            };
          }
        }
        // OVR 带雾
        const ovrEst = Math.round(
          Object.values(foggedAbilities).reduce((s, f) => s + (f?.est ?? 50), 0) / abilityKeys.length,
        );
        const ovrRange = Math.round(
          (Object.values(foggedAbilities).reduce((s, f) => s + (f?.range ?? 20), 0) / abilityKeys.length) * 10,
        ) / 10;

        players.push({
          id: p.id,
          name: p.name,
          position: p.position,
          ovr: { est: ovrEst, range: ovrRange },
          abilities: foggedAbilities,
          traits: report?.traitHints ?? [],
          salary: p.salary,
          age: p.isRookie ? 22 : undefined,
          status: p.status,
          isCaptain: p.isCaptain,
          isRookie: p.isRookie,
          peak: report?.peakFog ?? null,
          scouted: !!report,
        });
      }
    }

    return { ...team, players };
  }

  /** 设置队长（#20） */
  @UseGuards(JwtAuthGuard)
  @Put(":id/captain")
  async setCaptain(
    @Param("id") teamId: string,
    @Body() body: { playerId: string | null },
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (req.user.teamId !== teamId) {
      throw new ForbiddenException("只能设置自己球队的队长");
    }
    // 验证球员属于该球队
    if (body.playerId) {
      const player = await this.prisma.player.findUnique({
        where: { id: body.playerId },
        select: { teamId: true },
      });
      if (!player || player.teamId !== teamId) {
        throw new ForbiddenException("该球员不属于该球队");
      }
    }
    await this.prisma.team.update({
      where: { id: teamId },
      data: { captainId: body.playerId },
    });
    await this.teamService.invalidateCache(teamId);
    return { captainId: body.playerId };
  }

  /** 修改球队资料（名称 / 城市），仅球队所有者可操作 */
  @UseGuards(JwtAuthGuard)
  @Put(":id")
  async updateTeam(
    @Param("id") teamId: string,
    @Body() body: { name?: string; city?: string },
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (req.user.teamId !== teamId) {
      throw new ForbiddenException("只能修改自己球队的资料");
    }
    const data: { name?: string; city?: string } = {};
    if (body.name !== undefined) data.name = body.name.trim() || undefined;
    if (body.city !== undefined) data.city = body.city.trim() || undefined;
    if (Object.keys(data).length === 0) {
      return { ok: true };
    }
    await this.prisma.team.update({ where: { id: teamId }, data });
    await this.teamService.invalidateCache(teamId);
    return { ok: true };
  }

  /** 修改球员姓名，仅该球员所属球队的所有者可操作 */
  @UseGuards(JwtAuthGuard)
  @Put(":id/players/:playerId")
  async updatePlayer(
    @Param("id") teamId: string,
    @Param("playerId") playerId: string,
    @Body() body: { name: string },
    @Request() req: { user: { teamId: string | null } },
  ) {
    if (req.user.teamId !== teamId) {
      throw new ForbiddenException("只能修改自己球队的球员资料");
    }
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { teamId: true },
    });
    if (!player || player.teamId !== teamId) {
      throw new ForbiddenException("该球员不属于该球队");
    }
    const name = body.name?.trim();
    if (!name) {
      throw new ForbiddenException("球员姓名不能为空");
    }
    await this.prisma.player.update({
      where: { id: playerId },
      data: { name },
    });
    await this.teamService.invalidateCache(teamId);
    return { ok: true, name };
  }
}
