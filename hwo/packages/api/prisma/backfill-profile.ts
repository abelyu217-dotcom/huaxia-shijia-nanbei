/**
 * P0-① 属性双层结构：存量球员 38 项档案回填脚本
 *
 * 对所有 Player.profile IS NULL 的球员，用 deriveProfileFromAbilities
 * 从已有 17 项 abilities 逆推 38 项 PlayerProfile，写入 profile 列。
 *
 * 前置：已执行 prisma migrate（Player.profile 列已存在）。
 * 运行：pnpm --filter @hwo/api exec tsx prisma/backfill-profile.ts
 *
 * 注意：逆映射存在 ≤±1 的能力偏差（见 profile.test.ts 往返一致性），
 *      回填后 abilities 列保持原值不变，profile 作为新数据源供后续赛季成长使用。
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveProfileFromAbilities } from "@hwo/shared";
import type { Abilities, Position } from "@hwo/shared";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hwo";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  });

  const players = await prisma.player.findMany({
    where: { profile: null },
    select: { id: true, position: true, age: true, abilities: true },
  });

  console.log(`[backfill] 待回填球员数: ${players.length}`);

  let ok = 0;
  let fail = 0;

  for (const p of players) {
    try {
      const abilities = p.abilities as unknown as Abilities;
      const position = p.position as Position;
      const profile = deriveProfileFromAbilities(
        abilities,
        position,
        p.age,
        hashSeed(p.id),
      );

      await prisma.player.update({
        where: { id: p.id },
        data: { profile: profile as never },
      });
      ok++;
    } catch (e) {
      fail++;
      console.error(`[backfill] 球员 ${p.id} 回填失败:`, e);
    }
  }

  console.log(`[backfill] 完成: 成功 ${ok}, 失败 ${fail}`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[backfill] 脚本异常:", e);
  process.exit(1);
});
