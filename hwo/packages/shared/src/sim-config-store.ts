/**
 * SimConfig 热更新管理（M5 §6.1 灰度调参）
 *
 * 设计目标：
 *   - 运行时热替换 SimConfig，无需重启服务
 *   - 支持 A/B 测试（多版本配置并存）
 *   - 所有 simulate() 调用从 getActiveConfig() 读取，而非直接用 DEFAULT_CONFIG
 *   - 配置版本号追踪变更，便于回滚 + 审计
 *
 * 使用：
 *   import { getActiveConfig, updateConfig, listConfigVersions } from "@hwo/shared";
 *   const cfg = getActiveConfig();
 *   updateConfig({ homeAdvantage: 5 });
 *
 * 注意：该模块为单例（进程级共享状态），生产环境多 worker 时需配合 Redis 同步。
 */

import { DEFAULT_CONFIG, type SimConfig } from "./types.js";

/** 配置版本（用于审计 + 回滚） */
export interface ConfigVersion {
  version: number;
  config: SimConfig;
  /** 变更说明 */
  note: string;
  updatedAt: string;
  /** 是否当前生效 */
  active: boolean;
}

const MAX_HISTORY = 50;

let currentConfig: SimConfig = { ...DEFAULT_CONFIG };
let currentVersion = 1;
const history: ConfigVersion[] = [
  {
    version: 1,
    config: { ...DEFAULT_CONFIG },
    note: "初始默认配置（DEFAULT_CONFIG）",
    updatedAt: new Date().toISOString(),
    active: true,
  },
];

/** 获取当前生效的 SimConfig */
export function getActiveConfig(): SimConfig {
  return { ...currentConfig };
}

/** 获取当前生效的版本号 */
export function getActiveVersion(): number {
  return currentVersion;
}

/** 列出所有历史配置版本（最近 MAX_HISTORY 条） */
export function listConfigVersions(): ConfigVersion[] {
  return [...history].reverse();
}

/**
 * 热更新 SimConfig（部分字段覆盖）
 *
 * @param patch 需要覆盖的字段
 * @param note 变更说明（用于审计）
 * @returns 新的版本号
 */
export function updateConfig(patch: Partial<SimConfig>, note: string): number {
  // 标记旧版本为非活跃
  for (const v of history) v.active = false;

  currentConfig = { ...currentConfig, ...patch };
  currentVersion++;
  const newVersion: ConfigVersion = {
    version: currentVersion,
    config: { ...currentConfig },
    note,
    updatedAt: new Date().toISOString(),
    active: true,
  };
  history.push(newVersion);
  if (history.length > MAX_HISTORY) history.shift();
  return currentVersion;
}

/** 回滚到指定版本（用于紧急调参事故） */
export function rollbackToVersion(version: number): boolean {
  const target = history.find((v) => v.version === version);
  if (!target) return false;
  for (const v of history) v.active = false;
  currentConfig = { ...target.config };
  currentVersion = target.version;
  // 把回滚后的版本作为新版本记录（保留时间线）
  const rollbackVersion: ConfigVersion = {
    version: currentVersion + 1,
    config: { ...target.config },
    note: `回滚到 v${version}`,
    updatedAt: new Date().toISOString(),
    active: true,
  };
  history.push(rollbackVersion);
  currentVersion = rollbackVersion.version;
  if (history.length > MAX_HISTORY) history.shift();
  return true;
}

/** 重置为 DEFAULT_CONFIG（紧急恢复） */
export function resetToDefault(): void {
  for (const v of history) v.active = false;
  currentConfig = { ...DEFAULT_CONFIG };
  currentVersion++;
  history.push({
    version: currentVersion,
    config: { ...DEFAULT_CONFIG },
    note: "重置为 DEFAULT_CONFIG",
    updatedAt: new Date().toISOString(),
    active: true,
  });
  if (history.length > MAX_HISTORY) history.shift();
}
