/**
 * academy 模块——青训学院
 *
 * 提供球队青训学院管理（查询/升级/投入）和休赛期新秀产出。
 * 参见：开发计划.html §3.2 青训学院
 */

import { Module } from "@nestjs/common";
import { AcademyController } from "./academy.controller.js";
import { AcademyService } from "./academy.service.js";

@Module({
  controllers: [AcademyController],
  providers: [AcademyService],
  exports: [AcademyService],
})
export class AcademyModule {}
