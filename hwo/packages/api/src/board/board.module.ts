/**
 * BoardModule——董事会 + 赞助商模块
 *
 * 暴露 BoardService 供其他模块（schedule/season）注入使用，
 * 同时注册 BoardController 提供 REST 接口。
 */

import { Module } from "@nestjs/common";
import { BoardController } from "./board.controller.js";
import { BoardService } from "./board.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [BoardController],
  providers: [BoardService],
  exports: [BoardService],
})
export class BoardModule {}
