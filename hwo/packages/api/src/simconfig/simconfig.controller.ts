/**
 * SimConfig 热更新 API（M5 §6.1，管理员专用）
 *
 * 端点：
 *   GET    /api/simconfig              获取当前生效配置
 *   GET    /api/simconfig/history       配置历史
 *   POST   /api/simconfig/update        热更新（部分字段覆盖）
 *   POST   /api/simconfig/rollback      回滚到指定版本
 *   POST   /api/simconfig/reset         重置为 DEFAULT_CONFIG
 *
 * 权限：管理员（M5 反作弊：服务端权威 + 审计）。
 * 当前实现：使用 JwtAuthGuard，生产环境应增加 AdminGuard。
 */

import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { SimconfigService } from "./simconfig.service.js";

@Controller("api/simconfig")
@UseGuards(JwtAuthGuard)
export class SimconfigController {
  constructor(private simconfigService: SimconfigService) {}

  @Get()
  getActive() {
    return this.simconfigService.getActive();
  }

  @Get("history")
  history() {
    return this.simconfigService.history();
  }

  @Post("update")
  update(
    @Body() body: { patch: Partial<{ quarterLength: number; possessionsPerQuarter: number; homeAdvantage: number; basePossessionTime: number }>; note: string },
  ) {
    return this.simconfigService.update(body.patch, body.note);
  }

  @Post("rollback")
  rollback(@Body() body: { version: number }) {
    return this.simconfigService.rollback(body.version);
  }

  @Post("reset")
  reset() {
    return this.simconfigService.reset();
  }
}
