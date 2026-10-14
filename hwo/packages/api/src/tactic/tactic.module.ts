/**
 * tactic 模块——暴露战术相关端点
 */

import { Module } from "@nestjs/common";
import { TacticController } from "./tactic.controller.js";
import { TacticService } from "./tactic.service.js";

@Module({
  controllers: [TacticController],
  providers: [TacticService],
  exports: [TacticService],
})
export class TacticModule {}
