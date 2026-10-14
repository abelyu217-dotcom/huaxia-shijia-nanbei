/**
 * HWO sim worker（BullMQ）
 *
 * 监听 "settle-queue"，处理函数：
 * 1. 调用 @hwo/shared simulate() 引擎
 * 2. 将结果写入 matches + match_results 表
 * 3. 更新 standings 积分榜
 *
 * job.data 结构：{ homeTeamId, awayTeamId, homeTacticId, awayTacticId, seed?, seasonId?, day? }
 */

import { Worker, type Job } from "bullmq";
import Ioredis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import {
  fillTacticDefaults,
  getActiveConfig,
  simulate,
  tacticFromPreset,
  type Abilities,
  type Lineup,
  type Player,
  type TacticModSet,
  type Team,
} from "@hwo/shared";

const QUEUE_NAME = "settle-queue";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo";

// M5 §6.4 多世界并行运行隔离：worker 并发度
// 每个并发 worker 独立处理一个 world 的 job，互不阻塞
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? "8", 10);

// ─── Prisma 客户端 ───
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Redis 连接 ───
const connection = new Ioredis(REDIS_URL, { maxRetriesPerRequest: null });

/** worker 接收的 job 数据结构 */
interface SettleJobData {
  homeTeamId: string;
  awayTeamId: string;
  homeTacticId: string;
  awayTacticId: string;
  seed?: number;
  seasonId?: string;
  day?: number;
}

/** 获取或创建默认赛季 + 联赛 */
async function getSeasonContext(seasonId?: string) {
  let season;
  if (seasonId) {
    season = await prisma.season.findUnique({ where: { id: seasonId } });
  }
  if (!season) {
    season =
      (await prisma.season.findFirst({ where: { status: "regular" } })) ??
      (await prisma.season.create({
        data: {
          year: new Date().getFullYear(),
          name: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          status: "regular",
          currentDay: 1,
        },
      }));
  }

  let league = await prisma.league.findFirst({
    where: { seasonId: season.id },
  });
  if (!league) {
    league = await prisma.league.create({
      data: { seasonId: season.id, name: "HWO Premier", level: 1 },
    });
  }

  return { seasonId: season.id, leagueId: league.id };
}

/** 从 DB 加载球队并组装 Team 对象 */
async function loadTeam(teamId: string): Promise<Team> {
  const row = await prisma.team.findUnique({
    where: { id: teamId },
    include: { players: true, lineup: true, tactic: true },
  });
  if (!row) throw new Error(`Team ${teamId} not found`);

  const players: Player[] = row.players.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position as Player["position"],
    abilities: p.abilities as unknown as Abilities,
    condition: { fatigue: 0, foulTrouble: 0, hot: 0 },
    traits: (p.traits as string[]) ?? [],
  }));

  const lineup: Lineup = row.lineup
    ? {
        starters: row.lineup.starters as string[],
        minutes: row.lineup.minutes as Record<string, number>,
      }
    : { starters: players.slice(0, 5).map((p) => p.id), minutes: {} };

  const tactic: TacticModSet = (row.tactic?.modSet as unknown as TacticModSet) ?? {
    teamId: row.id,
    tendencyMod: { three: 0, midrange: 0, inside: 0, drive: 0, postup: 0 },
    fastBreakChance: 0.15,
    pickRollChance: 0.3,
    defenseContest: 0.2,
    helpDefChance: 0.4,
    stealChance: 0.08,
    possessionTimeDelta: 0,
  };

  return {
    id: row.id,
    name: row.name,
    players,
    lineup,
    tactic,
    chemistry: row.chemistry,
    // M5 §6.3：传递 userId 用于埋点（虽然 worker 不直接埋点，但保持数据完整）
    userId: row.userId,
  };
}

/**
 * M5 §6.4 多世界并行运行隔离：
 * 根据球队的 worldId + leagueId 解析正确的联赛上下文。
 * 多世界模式下，每个世界都有独立的 L1/L2 联赛，必须按 worldId 过滤。
 */
async function resolveLeagueContext(
  homeTeamId: string,
  _awayTeamId: string,
  seasonId?: string,
): Promise<{ seasonId: string; leagueId: string }> {
  // 优先使用球队自身的 leagueId（每支球队都关联到一个联赛）
  const home = await prisma.team.findUnique({
    where: { id: homeTeamId },
    select: { leagueId: true, worldId: true },
  });

  if (home?.leagueId) {
    // 球队已绑定联赛，直接使用
    let sid = seasonId;
    if (!sid) {
      const league = await prisma.league.findUnique({
        where: { id: home.leagueId },
        select: { seasonId: true },
      });
      sid = league?.seasonId;
    }
    if (sid) return { seasonId: sid, leagueId: home.leagueId };
  }

  // 回退：按 seasonId 找第一个联赛（M1 单联赛模式）
  return getSeasonContext(seasonId);
}

/** 更新积分榜（单支球队） */
async function upsertStanding(
  seasonId: string,
  leagueId: string,
  teamId: string,
  win: boolean,
  pointsFor: number,
  pointsAgainst: number,
) {
  const existing = await prisma.standing.findUnique({
    where: { leagueId_teamId: { leagueId, teamId } },
  });

  if (!existing) {
    return prisma.standing.create({
      data: {
        seasonId,
        leagueId,
        teamId,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        pointsFor,
        pointsAgainst,
        streak: win ? "W1" : "L1",
      },
    });
  }

  const newWins = existing.wins + (win ? 1 : 0);
  const newLosses = existing.losses + (win ? 0 : 1);
  const prefix = existing.streak?.[0] ?? "";
  const count = parseInt(existing.streak?.slice(1) ?? "0", 10) || 0;
  const newStreak =
    (win && prefix === "W") || (!win && prefix === "L")
      ? `${prefix}${count + 1}`
      : win
        ? "W1"
        : "L1";

  return prisma.standing.update({
    where: { leagueId_teamId: { leagueId, teamId } },
    data: {
      wins: newWins,
      losses: newLosses,
      pointsFor: existing.pointsFor + pointsFor,
      pointsAgainst: existing.pointsAgainst + pointsAgainst,
      streak: newStreak,
    },
  });
}

/**
 * 处理函数：模拟比赛 → 持久化 → 更新积分榜
 *
 * M5 §6.4：多世界并行运行隔离
 *   - 使用球队自身的 worldId/leagueId，避免误写他世界积分榜
 *   - 配合 WORKER_CONCURRENCY 实现多世界并行消费
 */
async function handleSettle(job: Job<SettleJobData>): Promise<void> {
  const data = job.data;
  const [home, away] = await Promise.all([
    loadTeam(data.homeTeamId),
    loadTeam(data.awayTeamId),
  ]);

  // M4：优先使用球队自身战术，无则回退到预设
  const homeTeam: Team = home.tactic
    ? { ...home, tactic: fillTacticDefaults({ ...home.tactic, teamId: home.id }) }
    : { ...home, tactic: tacticFromPreset(home.id, data.homeTacticId) };
  const awayTeam: Team = away.tactic
    ? { ...away, tactic: fillTacticDefaults({ ...away.tactic, teamId: away.id }) }
    : { ...away, tactic: tacticFromPreset(away.id, data.awayTacticId) };

  const seed = data.seed ?? Math.floor(Math.random() * 1_000_000);

  // M5 §6.1：使用热更新配置（支持灰度调参）
  const config = getActiveConfig();

  const output = simulate({
    matchup: { homeTeam, awayTeam },
    seed,
    config,
  });

  const { result } = output;
  // M5 §6.4：按球队自身 leagueId 解析上下文（多世界隔离）
  const { seasonId, leagueId } = await resolveLeagueContext(
    data.homeTeamId,
    data.awayTeamId,
    data.seasonId,
  );

  // 持久化比赛 + 结果
  await prisma.match.create({
    data: {
      seasonId,
      leagueId,
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      day: data.day ?? 1,
      status: "settled",
      seed,
      settledAt: new Date(),
      result: {
        create: {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winnerId: result.winnerId,
          loserId: result.loserId,
          isClutch: result.isClutch ?? false,
          pbp: output.pbp as unknown as object,
          boxScore: output.boxScore as unknown as object,
          quarterScores: output.quarterScores as unknown as object,
          // M5 §6.2：rngLog 审计（防作弊）
          rngLog: output.rngLog as unknown as object,
          seed,
        },
      },
    },
  });

  // 更新积分榜
  const homeWin = result.winnerId === data.homeTeamId;
  await Promise.all([
    upsertStanding(seasonId, leagueId, data.homeTeamId, homeWin, result.homeScore, result.awayScore),
    upsertStanding(seasonId, leagueId, data.awayTeamId, !homeWin, result.awayScore, result.homeScore),
  ]);

  console.log(
    `[worker] job ${job.id} settled: ${data.homeTeamId} ${result.homeScore}:${result.awayScore} ${data.awayTeamId} (winner=${result.winnerId}, seed=${seed})`,
  );
}

// M5 §6.4：多 worker 并发处理（默认 8 个，可通过 WORKER_CONCURRENCY 调整）
const worker = new Worker<SettleJobData>(QUEUE_NAME, handleSettle, {
  connection,
  concurrency: WORKER_CONCURRENCY,
});

worker.on("ready", () => {
  console.log(`[@hwo/worker] listening on queue "${QUEUE_NAME}"`);
});

worker.on("failed", (job, err) => {
  console.error(`[@hwo/worker] job ${job?.id} failed:`, err);
});

export { worker, handleSettle, QUEUE_NAME };
