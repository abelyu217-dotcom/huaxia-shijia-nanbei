/**
 * TacticController——战术相关端点
 *
 * - GET /api/tactics  返回全部 20 个战术预设（不含 params 内部细节）
 */

import { Controller, Get } from "@nestjs/common";
import { PRESET_TACTICS, type PresetTactic } from "@hwo/shared";

/** 列表视图：暴露战术预设的展示字段，隐藏 params 实现细节 */
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
}
