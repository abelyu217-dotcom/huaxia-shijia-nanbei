/**
 * ai 模块——AI 经理自动决策
 *
 * 暴露端点 + 导出 AiManagerService 供 ScheduleService 在每日结算时调用。
 */

import { Module } from "@nestjs/common";
import { AiManagerController } from "./ai-manager.controller.js";
import { AiManagerService } from "./ai-manager.service.js";
import { TeamModule } from "../team/team.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [TeamModule, AuthModule],
  controllers: [AiManagerController],
  providers: [AiManagerService],
  exports: [AiManagerService],
})
export class AiManagerModule {}
