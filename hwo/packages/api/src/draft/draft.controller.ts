/**
 * DraftController——选秀大会端点
 *
 * - POST /api/draft/init                   初始化选秀大会（乐透抽签 + 生成选秀池）
 * - GET  /api/draft/:seasonId/:worldId     获取选秀看板（顺位 + 可用球员）
 * - POST /api/draft/:draftPickId/pick      手动选人
 * - POST /api/draft/:seasonId/:worldId/auto AI 自动选秀剩余顺位
 * - GET  /api/draft/:seasonId/:worldId/results  获取选秀结果
 */

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
} from "@nestjs/common";
import { DraftService } from "./draft.service.js";

@Controller("api/draft")
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  /** 初始化选秀大会 */
  @Post("init")
  async initDraft(@Body() body: { seasonId: string; worldId?: string }) {
    if (!body.seasonId) {
      throw new BadRequestException("seasonId 必填");
    }
    return this.draftService.initDraft(body.seasonId, body.worldId ?? "");
  }

  /** 获取选秀看板 */
  @Get(":seasonId/:worldId")
  async getDraftBoard(
    @Param("seasonId") seasonId: string,
    @Param("worldId") worldId: string,
  ) {
    return this.draftService.getDraftBoard(seasonId, worldId);
  }

  /** 手动选人 */
  @Post(":draftPickId/pick")
  async makePick(
    @Param("draftPickId") draftPickId: string,
    @Body() body: { playerId: string },
  ) {
    if (!body.playerId) {
      throw new BadRequestException("playerId 必填");
    }
    return this.draftService.makePick(draftPickId, body.playerId);
  }

  /** AI 自动选秀 */
  @Post(":seasonId/:worldId/auto")
  async autoDraft(
    @Param("seasonId") seasonId: string,
    @Param("worldId") worldId: string,
  ) {
    return this.draftService.autoDraft(seasonId, worldId);
  }

  /** 获取选秀结果 */
  @Get(":seasonId/:worldId/results")
  async getDraftResults(
    @Param("seasonId") seasonId: string,
    @Param("worldId") worldId: string,
  ) {
    return this.draftService.getDraftResults(seasonId, worldId);
  }
}
