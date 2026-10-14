/**
 * SimConfig 热更新服务（M5 §6.1）
 *
 * 包装 @hwo/shared 的 sim-config-store，提供：
 *   - 查询当前生效配置
 *   - 热更新配置（部分覆盖）
 *   - 列出配置历史
 *   - 回滚到指定版本
 *   - 重置为默认
 *
 * 管理员权限保护（M5 §6.2 反作弊：服务端权威）。
 */

import { Injectable } from "@nestjs/common";
import {
  getActiveConfig,
  getActiveVersion,
  listConfigVersions,
  updateConfig,
  rollbackToVersion,
  resetToDefault,
  type SimConfig,
} from "@hwo/shared";

@Injectable()
export class SimconfigService {
  /** 当前生效配置 */
  getActive(): { version: number; config: SimConfig } {
    return { version: getActiveVersion(), config: getActiveConfig() };
  }

  /** 配置历史 */
  history() {
    return listConfigVersions();
  }

  /** 热更新 */
  update(patch: Partial<SimConfig>, note: string): { version: number; config: SimConfig } {
    const version = updateConfig(patch, note);
    return { version, config: getActiveConfig() };
  }

  /** 回滚 */
  rollback(version: number): { ok: boolean; version: number; config: SimConfig } {
    const ok = rollbackToVersion(version);
    return { ok, version: getActiveVersion(), config: getActiveConfig() };
  }

  /** 重置 */
  reset(): { version: number; config: SimConfig } {
    resetToDefault();
    return { version: getActiveVersion(), config: getActiveConfig() };
  }
}
