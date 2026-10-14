/**
 * 外观商品 seed 脚本 —— 填充默认外观到 CosmeticItem 表
 * 运行：pnpm --filter @hwo/api exec tsx seed-cosmetics.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEFAULT_COSMETICS = [
  { type: "jersey", name: "经典主场球衣", description: "红白配色经典球衣", price: 50, rarity: "common", data: { primary: "#c0392b", secondary: "#ffffff" } },
  { type: "jersey", name: "暗夜星辰球衣", description: "深蓝金色配色", price: 120, rarity: "rare", data: { primary: "#1a1a2e", secondary: "#ffd700" } },
  { type: "jersey", name: "火焰风暴球衣", description: "橙红渐变特效", price: 200, rarity: "epic", data: { primary: "#ff4757", secondary: "#ffa502" } },
  { type: "jersey", name: "传奇紫金球衣", description: "紫金王朝配色", price: 300, rarity: "legendary", data: { primary: "#5b2c6f", secondary: "#ffd700" } },
  { type: "arena_skin", name: "标准球馆", description: "基础球馆皮肤", price: 80, rarity: "common", data: { theme: "default" } },
  { type: "arena_skin", name: "霓虹球馆", description: "赛博朋克风霓虹灯", price: 180, rarity: "rare", data: { theme: "neon" } },
  { type: "arena_skin", name: "皇家球馆", description: "金色大理石风格", price: 250, rarity: "epic", data: { theme: "royal" } },
  { type: "avatar_frame", name: "青铜头像框", description: "简约青铜边框", price: 30, rarity: "common", data: { color: "#cd7f32" } },
  { type: "avatar_frame", name: "白银头像框", description: "闪耀银色边框", price: 60, rarity: "rare", data: { color: "#c0c0c0" } },
  { type: "avatar_frame", name: "钻石头像框", description: "璀璨钻石边框", price: 150, rarity: "epic", data: { color: "#b9f2ff" } },
  { type: "avatar_frame", name: "传奇金框", description: "金色粒子特效", price: 280, rarity: "legendary", data: { color: "#ffd700", effect: "particles" } },
];

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

async function main() {
  const existing = await prisma.cosmeticItem.count();
  if (existing > 0) {
    console.log(`Already seeded: ${existing} cosmetics`);
    return;
  }
  const created = await prisma.cosmeticItem.createMany({ data: DEFAULT_COSMETICS });
  console.log(`Seeded ${created.count} cosmetics`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
