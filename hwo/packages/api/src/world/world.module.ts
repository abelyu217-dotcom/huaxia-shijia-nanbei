/**
 * world 模块——多玩家世界管理
 *
 * 暴露世界创建、列表、详情、加入端点。
 * 依赖 SeasonModule（赛程生成）和 TeamModule（球队服务）。
 */

import { Module } from "@nestjs/common";
import { WorldController } from "./world.controller.js";
import { WorldService } from "./world.service.js";
import { SeasonModule } from "../season/season.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [SeasonModule, AuthModule],
  controllers: [WorldController],
  providers: [WorldService],
  exports: [WorldService],
})
export class WorldModule {}
