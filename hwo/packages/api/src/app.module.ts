/**
 * 应用根模块
 */

import { Module } from "@nestjs/common";
import { SimModule } from "./sim/sim.module.js";

@Module({
  imports: [SimModule],
})
export class AppModule {}
