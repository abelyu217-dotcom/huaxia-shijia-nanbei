/**
 * 球员面部外观（facesjs）回填脚本
 *
 * 对所有 Player.face IS NULL 的存量球员，用 seedFromString(id) 派生确定性种子
 * 生成一张随机头像，写入 face 列（JSONB）。同一球员重复运行结果一致。
 *
 * 前置：已执行 prisma migrate（Player.face 列已存在）。
 * 运行：pnpm --filter @hwo/api exec tsx prisma/backfill-face.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateFace, seedFromString } from "@hwo/shared";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hwo";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  });

  const players = await prisma.player.findMany({
    where: { face: { equals: Prisma.DbNull } },
    select: { id: true },
  });

  console.log(`[backfill-face] 待回填球员数: ${players.length}`);

  let ok = 0;
  let fail = 0;

  for (const p of players) {
    try {
      const face = generateFace(seedFromString(p.id));
      await prisma.player.update({
        where: { id: p.id },
        data: { face: face as never },
      });
      ok++;
    } catch (e) {
      fail++;
      console.error(`[backfill-face] 球员 ${p.id} 回填失败:`, e);
    }
  }

  console.log(`[backfill-face] 完成: 成功 ${ok}, 失败 ${fail}`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[backfill-face] 脚本异常:", e);
  process.exit(1);
});
