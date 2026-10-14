/**
 * draft 模块——选秀系统
 *
 * 提供选秀大会初始化、乐透抽签、手动/AI 选秀、结果查询。
 * 参见：开发计划.html §4.4 选秀系统
 */

import { Module } from "@nestjs/common";
import { DraftController } from "./draft.controller.js";
import { DraftService } from "./draft.service.js";

@Module({
  controllers: [DraftController],
  providers: [DraftService],
  exports: [DraftService],
})
export class DraftModule {}
