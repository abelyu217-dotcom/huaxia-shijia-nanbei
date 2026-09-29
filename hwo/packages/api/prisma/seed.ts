/**
 * 数据库 seed 脚本
 *
 * 用 @hwo/shared 的 generateAllTeams 生成 6 支球队，写入 PostgreSQL。
 * 包括：teams、players、lineups、tactics。
 *
 * 运行：pnpm --filter @hwo/api exec tsx prisma/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateAllTeams, tacticFromPreset, type Team } from "@hwo/shared";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const TEAM_SEED = 42;

/** 把 shared 的 Team 对象持久化到数据库 */
async function seedTeam(team: Team): Promise<void> {
  // 1. 创建 team
  await prisma.team.upsert({
    where: { id: team.id },
    update: { name: team.name, chemistry: team.chemistry },
    create: {
      id: team.id,
      name: team.name,
      chemistry: team.chemistry,
    },
  });

  // 2. 写入 players（先删后写，保证幂等）
  await prisma.player.deleteMany({ where: { teamId: team.id } });
  await prisma.player.createMany({
    data: team.players.map((p) => ({
      id: p.id,
      teamId: team.id,
      name: p.name,
      position: p.position,
      abilities: p.abilities,
      traits: p.traits,
    })),
  });

  // 3. 写入 lineup
  await prisma.lineup.upsert({
    where: { teamId: team.id },
    update: { starters: team.lineup.starters, minutes: team.lineup.minutes },
    create: {
      teamId: team.id,
      starters: team.lineup.starters,
      minutes: team.lineup.minutes,
    },
  });

  // 4. 写入 tactic（用第一个预设作为默认）
  const tactic = tacticFromPreset(team.id, "pace_space");
  await prisma.tactic.upsert({
    where: { teamId: team.id },
    update: { presetId: "pace_space", modSet: tactic },
    create: {
      teamId: team.id,
      presetId: "pace_space",
      modSet: tactic,
    },
  });
}

async function main(): Promise<void> {
  console.log(`🌱 Seeding teams with seed=${TEAM_SEED}...`);

  const teams = generateAllTeams(TEAM_SEED);
  for (const team of teams) {
    await seedTeam(team);
    console.log(`  ✓ ${team.name} (${team.players.length} players)`);
  }

  const count = await prisma.team.count();
  console.log(`\n✅ Done. ${count} teams in database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
