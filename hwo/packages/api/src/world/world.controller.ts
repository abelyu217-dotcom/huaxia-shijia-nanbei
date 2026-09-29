/**
 * WorldController——世界管理端点
 *
 * - POST /api/worlds          创建新世界
 * - GET  /api/worlds          列出所有世界
 * - GET  /api/worlds/:id      世界详情
 * - POST /api/worlds/:id/join 加入世界（认领球队）
 */

import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { WorldService } from "./world.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@Controller("api/worlds")
export class WorldController {
  constructor(private readonly worldService: WorldService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: { name: string; seed?: number }) {
    return this.worldService.createWorld(body.name, body.seed ?? 42);
  }

  @Get()
  async list() {
    return this.worldService.listWorlds();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.worldService.getWorld(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/join")
  async join(
    @Param("id") worldId: string,
    @Body() body: { userId: string; teamId: string },
  ) {
    return this.worldService.joinWorld(worldId, body.userId, body.teamId);
  }
}
