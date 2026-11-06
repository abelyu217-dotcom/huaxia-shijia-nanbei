/**
 * AiManagerController——AI 经理控制端点
 *
 * 参见：开发计划.html §2.5
 *
 * - POST /api/ai/refresh      手动触发 AI 球队刷新阵容 + 战术（需 JWT）
 * - POST /api/ai/train        手动触发 AI 球队训练（需 JWT）
 *
 * 难度通过 query 参数 ?difficulty=easy|normal|hard 指定，默认 normal。
 */

import { Body, Controller, Post, Query, UseGuards } from "@nestjs/common";
import { AiManagerService, type AiDifficulty } from "./ai-manager.service.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";

interface RefreshDto {
  /** 不传则刷新全部 AI 球队；传 teamId 则只刷新该球队 */
  teamId?: string;
}

@Controller("api/ai")
export class AiManagerController {
  constructor(private readonly aiManager: AiManagerService) {}

  @UseGuards(JwtAuthGuard)
  @Post("refresh")
  async refresh(
    @Body() body: RefreshDto,
    @Query("difficulty") difficulty?: string,
  ): Promise<{ updated: number }> {
    const diff = this.parseDifficulty(difficulty);
    if (body.teamId) {
      await this.aiManager.refreshTeam(body.teamId, diff);
      return { updated: 1 };
    }
    const updated = await this.aiManager.refreshAllAiTeams(diff);
    return { updated };
  }

  @UseGuards(JwtAuthGuard)
  @Post("train")
  async train(): Promise<{ playersTrained: number }> {
    const playersTrained = await this.aiManager.applyTrainingForAllAiTeams();
    return { playersTrained };
  }

  private parseDifficulty(s?: string): AiDifficulty {
    if (s === "easy" || s === "normal" || s === "hard") return s;
    return "normal";
  }
}
