/**
 * tactic 模块——暴露战术相关端点
 */

import { Module } from "@nestjs/common";
import { TacticController } from "./tactic.controller.js";

@Module({
  controllers: [TacticController],
})
export class TacticModule {}
