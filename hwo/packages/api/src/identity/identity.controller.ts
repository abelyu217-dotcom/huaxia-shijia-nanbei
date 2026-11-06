/**
 * IdentityController——三身份系统端点（P3-1）
 *
 * - GET    /api/identity                      获取三身份总览
 * - POST   /api/identity/avatar               创建球员化身
 * - POST   /api/identity/profession           选择职业人职业
 * - POST   /api/identity/profession/switch    转职
 * - POST   /api/identity/profession/skill     分配技能点
 * - GET    /api/identity/professions          获取全部职业列表
 */

import { Body, Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { IdentityService, PROFESSION_DEFS, type AvatarCreateParams, type ProJob } from "./identity.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

@Controller("api/identity")
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getIdentity(@Request() req: { user: { id: string } }) {
    return this.identityService.getIdentity(req.user.id);
  }

  @Get("professions")
  async getProfessions() {
    return PROFESSION_DEFS;
  }

  @UseGuards(JwtAuthGuard)
  @Post("avatar")
  async createAvatar(
    @Request() req: { user: { id: string } },
    @Body() body: AvatarCreateParams,
  ) {
    return this.identityService.createAvatar(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("profession")
  async chooseProfession(
    @Request() req: { user: { id: string } },
    @Body() body: { job: ProJob },
  ) {
    return this.identityService.chooseProfession(req.user.id, body.job);
  }

  @UseGuards(JwtAuthGuard)
  @Post("profession/switch")
  async switchProfession(
    @Request() req: { user: { id: string } },
    @Body() body: { job: ProJob },
  ) {
    return this.identityService.switchProfession(req.user.id, body.job);
  }

  @UseGuards(JwtAuthGuard)
  @Post("profession/skill")
  async addSkill(
    @Request() req: { user: { id: string } },
    @Body() body: { branch: string; points: number },
  ) {
    return this.identityService.addSkillPoint(req.user.id, body.branch, body.points);
  }
}
