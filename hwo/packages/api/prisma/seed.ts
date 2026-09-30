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
import { generateAllTeams, overallRating, tacticFromPreset, type Team } from "@hwo/shared";

/** 年薪计算（单位：万元）。与 world.service.calculateSalary 一致：
 * OVR 60 → 200万, OVR 75 → 800万, OVR 90 → 2000万 */
function calcSalary(ovr: number): number {
  return Math.round(50 + (ovr - 55) * 40);
}

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
  const playerData = team.players.map((p) => {
    const ovr = overallRating(p.abilities);
    return {
      id: p.id,
      teamId: team.id,
      name: p.name,
      position: p.position,
      abilities: p.abilities,
      traits: p.traits,
      salary: calcSalary(ovr),
    };
  });
  await prisma.player.createMany({ data: playerData });

  // 2.5 为每位球员创建初始合同
  // 年限：基于 OVR，明星球员长约，角色球员短约
  // 年薪：基于 OVR，与球员 salary 一致
  const contracts = team.players.map((p) => {
    const ovr = overallRating(p.abilities);
    const salary = calcSalary(ovr);
    // OVR >= 88: 4-5 年; 80-87: 3-4 年; 70-79: 2-3 年; <70: 1-2 年
    let yearsTotal: number;
    if (ovr >= 88) yearsTotal = 4 + (ovr >= 92 ? 1 : 0);
    else if (ovr >= 80) yearsTotal = 3 + (ovr >= 85 ? 1 : 0);
    else if (ovr >= 70) yearsTotal = 2 + (ovr >= 75 ? 1 : 0);
    else yearsTotal = 1 + (ovr >= 65 ? 1 : 0);
    yearsTotal = Math.min(5, Math.max(1, yearsTotal));
    // 高薪球员可能有球员选项
    const hasPlayerOption = ovr >= 88 && Math.random() > 0.5;
    return {
      playerId: p.id,
      teamId: team.id,
      yearsTotal,
      yearsRemain: yearsTotal,
      salaryPerYear: salary,
      playerOption: hasPlayerOption,
      teamOption: false,
      noTrade: ovr >= 92,
      status: "active" as const,
    };
  });
  // 先删除旧合同再批量创建
  const playerIds = team.players.map((p) => p.id);
  await prisma.contract.deleteMany({ where: { playerId: { in: playerIds } } });
  await prisma.contract.createMany({ data: contracts });

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
