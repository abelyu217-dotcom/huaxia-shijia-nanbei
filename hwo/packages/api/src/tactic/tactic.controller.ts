/**
 * TacticController——战术相关端点
 *
 * - GET  /api/tactics                    返回全部战术预设（简要）
 * - GET  /api/tactics/presets            返回全部战术预设（含参数详情）
 * - GET  /api/tactics/team/:teamId       获取球队当前战术
 * - PUT  /api/tactics/team/:teamId       更新球队战术（切换预设或微调参数）
 * - GET  /api/tactics/counter/:presetId  反制策略推荐
 */

import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { PRESET_TACTICS, type PresetTactic, type TacticModSet } from "@hwo/shared";
import { TacticService } from "./tactic.service.js";

type TacticSummary = Pick<
  PresetTactic,
  | "id"
  | "name"
  | "nameEn"
  | "category"
  | "tempo"
  | "offenseTendency"
  | "defenseTendency"
  | "desc"
>;

@Controller("api/tactics")
export class TacticController {
  constructor(private readonly tacticService: TacticService) {}

  @Get()
  list(): TacticSummary[] {
    return PRESET_TACTICS.map((t) => ({
      id: t.id,
      name: t.name,
      nameEn: t.nameEn,
      category: t.category,
      tempo: t.tempo,
      offenseTendency: t.offenseTendency,
      defenseTendency: t.defenseTendency,
      desc: t.desc,
    }));
  }

  @Get("presets")
  listPresets() {
    return this.tacticService.listPresets();
  }

  @Get("team/:teamId")
  async getTeamTactic(@Param("teamId") teamId: string) {
    return this.tacticService.getTeamTactic(teamId);
  }

  @Put("team/:teamId")
  async updateTeamTactic(
    @Param("teamId") teamId: string,
    @Body() body: { presetId?: string; modSet?: Partial<Omit<TacticModSet, "teamId">> },
  ) {
    return this.tacticService.updateTeamTactic(teamId, body);
  }

  @Get("counter/:presetId")
  suggestCounter(@Param("presetId") presetId: string) {
    return this.tacticService.suggestCounter(presetId);
  }
}
