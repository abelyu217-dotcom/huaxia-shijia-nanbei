/**
 * facility 模块——球馆设施（P2-3）
 *
 * 提供球馆设施查询/升级，训练馆等级影响训练成长，主场馆等级影响比赛日营收与主场优势。
 * 参见：开发计划.html §P2-3 球馆系统深化
 */

import { Module } from "@nestjs/common";
import { FacilityController } from "./facility.controller.js";
import { FacilityService } from "./facility.service.js";
import { WalletModule } from "../wallet/wallet.module.js";

@Module({
  imports: [WalletModule],
  controllers: [FacilityController],
  providers: [FacilityService],
  exports: [FacilityService],
})
export class FacilityModule {}
