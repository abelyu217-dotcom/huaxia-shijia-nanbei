/**
 * TacticService——高级战术编辑器
 *
 * M2：支持战术参数微调与反制策略推荐。
 *
 * 职责：
 * 1. getTeamTactic: 获取球队当前战术（预设 + 自定义参数）
 * 2. updateTeamTactic: 更新球队战术参数（modSet）
 * 3. suggestCounter: 根据对手战术预设推荐反制策略
 */

import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  PRESET_TACTICS,
  getPresetById,
  tacticFromPreset,
  type PresetTactic,
  type TacticModSet,
} from "@hwo/shared";

@Injectable()
export class TacticService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取球队当前战术配置 */
  async getTeamTactic(teamId: string) {
    const tactic = await this.prisma.tactic.findUnique({
      where: { teamId },
    });
    if (!tactic) {
      // 未配置战术，返回默认预设
      const preset = getPresetById("pace_space")!;
      return {
        teamId,
        presetId: preset.id,
        presetName: preset.name,
        modSet: tacticFromPreset(teamId, preset.id),
      };
    }

    const preset = getPresetById(tactic.presetId);
    return {
      teamId,
      presetId: tactic.presetId,
      presetName: preset?.name ?? "自定义",
      modSet: tactic.modSet as unknown as TacticModSet,
    };
  }

  /**
   * 更新球队战术参数
   * 可选择切换预设或微调参数
   */
  async updateTeamTactic(
    teamId: string,
    data: { presetId?: string; modSet?: Partial<Omit<TacticModSet, "teamId">> },
  ) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException(`Team ${teamId} not found`);

    let presetId: string = data.presetId ?? "pace_space";
    let modSet: TacticModSet;

    if (data.presetId) {
      // 切换预设
      const preset = getPresetById(data.presetId);
      if (!preset) throw new BadRequestException(`Unknown preset: ${data.presetId}`);
      modSet = tacticFromPreset(teamId, data.presetId);
    } else {
      // 微调当前参数
      const current = await this.prisma.tactic.findUnique({ where: { teamId } });
      if (!current) {
        modSet = tacticFromPreset(teamId, "pace_space");
        presetId = "pace_space";
      } else {
        modSet = current.modSet as unknown as TacticModSet;
        presetId = current.presetId;
      }
    }

    // 应用自定义参数覆盖
    if (data.modSet) {
      modSet = {
        ...modSet,
        ...data.modSet,
        tendencyMod: { ...modSet.tendencyMod, ...(data.modSet.tendencyMod ?? {}) },
      };
    }

    // 验证参数范围
    this.validateModSet(modSet);

    const result = await this.prisma.tactic.upsert({
      where: { teamId },
      create: { teamId, presetId, modSet: modSet as unknown as object },
      update: { presetId, modSet: modSet as unknown as object },
    });

    return {
      teamId,
      presetId: result.presetId,
      modSet: result.modSet as unknown as TacticModSet,
    };
  }

  /**
   * 反制策略推荐：根据对手战术预设，推荐最有效的反制战术
   *
   * 规则：
   * - 对手外线为主 → 推荐收缩内线（放三分）或全场紧逼（施压失误）
   * - 对手内线为主 → 推荐外线施压 + 包夹内线
   * - 对手快节奏 → 推荐慢节奏绞肉机（拖慢比赛）
   * - 对手慢节奏 → 推荐跑轰（加速打乱节奏）
   */
  suggestCounter(opponentPresetId: string): {
    counter: PresetTactic;
    reason: string;
    adjustments: Partial<TacticModSet>;
  } {
    const opponent = getPresetById(opponentPresetId);
    if (!opponent) {
      throw new BadRequestException(`Unknown preset: ${opponentPresetId}`);
    }

    let counterId: string;
    let reason: string;
    let adjustments: Partial<TacticModSet> = {};

    if (opponent.offenseTendency === "outside") {
      // 对手外线为主：收缩内线 + 放三分
      counterId = "wall_paint";
      reason = "对手以外线三分为主，收缩禁区保护篮下，放对手投三分赌命中率";
      adjustments = {
        defenseContest: 0.5,
        helpDefChance: 0.7,
        stealChance: 0.04,
      };
    } else if (opponent.offenseTendency === "inside") {
      // 对手内线为主：包夹内线 + 外线施压
      counterId = "grind_it_out";
      reason = "对手以内线进攻为主，收缩包夹内线，切断传球路线";
      adjustments = {
        defenseContest: 0.4,
        helpDefChance: 0.6,
        possessionTimeDelta: 5,
      };
    } else if (opponent.tempo === "ultra_fast" || opponent.tempo === "fast") {
      // 对手快节奏：拖慢比赛
      counterId = "grind_it_out";
      reason = "对手打快攻，用慢节奏阵地战拖垮其节奏，降低回合数";
      adjustments = {
        fastBreakChance: 0.05,
        possessionTimeDelta: 6,
      };
    } else if (opponent.tempo === "slow") {
      // 对手慢节奏：加速冲击
      counterId = "run_and_gun";
      reason = "对手打慢节奏，用跑轰加速冲击，在对手落位前完成进攻";
      adjustments = {
        fastBreakChance: 0.35,
        possessionTimeDelta: -4,
      };
    } else if (opponent.defenseTendency === "press") {
      // 对手紧逼：用挡拆破解
      counterId = "pick_roll_pop";
      reason = "对手全场紧逼，用高位挡拆创造传球和投篮空间";
      adjustments = {
        pickRollChance: 0.5,
      };
    } else if (opponent.defenseTendency === "pack") {
      // 对手收缩：外线投射
      counterId = "pace_space";
      reason = "对手收缩内线，用五外站位 + 三分球拉开空间";
      adjustments = {
        tendencyMod: { three: 0.6, midrange: -0.1, inside: -0.3, drive: 0.2, postup: -0.5 },
      };
    } else {
      // 均衡对手：用动态进攻
      counterId = "motion_offense";
      reason = "对手战术均衡，用动态进攻寻找最佳出手选择";
      adjustments = {};
    }

    const counter = getPresetById(counterId)!;
    return { counter, reason, adjustments };
  }

  /** 获取全部战术预设（含参数详情，供编辑器使用） */
  listPresets() {
    return PRESET_TACTICS;
  }

  // ── 内部方法 ──

  private validateModSet(modSet: TacticModSet): void {
    const { tendencyMod } = modSet;
    const bounds: Record<string, [number, number]> = {
      three: [-1, 1],
      midrange: [-1, 1],
      inside: [-1, 1],
      drive: [-1, 1],
      postup: [-1, 1],
    };

    for (const [key, [min, max]] of Object.entries(bounds)) {
      const val = (tendencyMod as Record<string, number>)[key];
      if (val < min || val > max) {
        throw new BadRequestException(`tendencyMod.${key} 必须在 [${min}, ${max}] 范围内`);
      }
    }

    if (modSet.fastBreakChance < 0 || modSet.fastBreakChance > 1) {
      throw new BadRequestException("fastBreakChance 必须在 [0, 1] 范围内");
    }
    if (modSet.defenseContest < -1 || modSet.defenseContest > 1) {
      throw new BadRequestException("defenseContest 必须在 [-1, 1] 范围内");
    }
    if (modSet.helpDefChance < 0 || modSet.helpDefChance > 1) {
      throw new BadRequestException("helpDefChance 必须在 [0, 1] 范围内");
    }
    if (modSet.stealChance < 0 || modSet.stealChance > 1) {
      throw new BadRequestException("stealChance 必须在 [0, 1] 范围内");
    }
    if (modSet.pickRollChance < 0 || modSet.pickRollChance > 1) {
      throw new BadRequestException("pickRollChance 必须在 [0, 1] 范围内");
    }
  }
}
