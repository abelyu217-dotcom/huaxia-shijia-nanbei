/**
 * trade 模块——跨经理交易系统
 */

import { Module } from "@nestjs/common";
import { TradeController } from "./trade.controller.js";
import { TradeService } from "./trade.service.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [AuthModule],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
