/**
 * 球员面部外观（基于 facesjs 的确定性随机生成）
 *
 * facesjs 的 generate() 内部直接使用 Math.random，无法传入种子。
 * 为了让同一球员的头像稳定可复现（刷新页面不变、可持久化到 DB），
 * 这里在调用 generate() 期间临时用确定性 PRNG 覆盖 Math.random。
 * generate() 是纯同步函数（内部无 await），因此不存在并发交错问题。
 *
 * 前端渲染：faceToSvg() 返回 SVG 字符串，可直接注入页面。
 * 参见：.uploads/HWO球员外观编辑器demo.html
 */

import { generate, faceToSvgString, svgsIndex } from "facesjs";
import type { FaceConfig, Feature, Gender, Overrides } from "facesjs";
import { mulberry32 } from "./prng.js";

/** 球员面部数据（结构等价于 facesjs 的 FaceConfig），存于 Player.face */
export type PlayerFace = FaceConfig;

/** 由任意字符串派生 32 位无符号种子（FNV-1a hash） */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 生成一张面部数据。
 * @param seed 提供则确定性生成（同一 seed 恒等）；省略则每次随机。
 * @param gender 默认 "male"（篮球球员）。
 */
export function generateFace(seed?: number, gender: Gender = "male"): PlayerFace {
  if (seed === undefined) return generate(undefined, { gender });

  const original = Math.random;
  const rand = mulberry32(seed >>> 0);
  Math.random = () => rand();
  try {
    return generate(undefined, { gender });
  } finally {
    Math.random = original;
  }
}

/** 将面部数据渲染为 SVG 字符串（无需真实 DOM，可在任意环境调用） */
export function faceToSvg(face: PlayerFace, overrides?: Overrides): string {
  return faceToSvgString(face, overrides);
}

/** 接口入参防御：校验一个值是否为可用的面部数据 */
export function isPlayerFace(v: unknown): v is PlayerFace {
  if (!v || typeof v !== "object") return false;
  const f = v as Partial<PlayerFace>;
  return typeof f.fatness === "number" && !!f.body?.id && !!f.hair?.id;
}

// ── 外观编辑器选项 ──

/** 肤色（取自 facesjs 四大人种调色板的并集） */
export const FACE_SKIN_COLORS = [
  "#fedac7", "#f0c5a3", "#eab687", "#bb876f", "#a67358", "#ad6453", "#74453d", "#5c3937",
  "#f2d6cb", "#ddb7a0",
];

/** 发色 */
export const FACE_HAIR_COLORS = [
  "#272421", "#3D2314", "#5A3825", "#CC9966", "#2C1608", "#B55239", "#e9c67b", "#D7BF91",
  "#1c1008", "#0f0902",
];

/** 球衣配色（用于 teamColors） */
export const FACE_JERSEY_COLORS = [
  "#0c2340", "#c8102e", "#1d428a", "#2c5234", "#3d3d3d", "#6b2d5c", "#d4a017",
  "#89bfd3", "#7a1319", "#07364f", "#ffffff",
];

/** 可编辑的部位（排除仅用于内部尺寸的 body/ear 等细粒度项） */
export type EditableFeature =
  | "head" | "hair" | "eye" | "eyebrow" | "nose" | "mouth"
  | "facialHair" | "glasses" | "accessories" | "jersey";

/**
 * 返回某个部位在男性球员下可选的外观 id 列表。
 * facesjs 未导出 svgsGenders，故按命名规则剔除仅女性可用的 "femaleN"。
 */
export function faceFeatureIds(feature: EditableFeature, gender: Gender = "male"): string[] {
  const ids = svgsIndex[feature as Feature] as readonly string[];
  return ids.filter((id) => gender === "female" || !/^female\d+$/.test(id));
}
