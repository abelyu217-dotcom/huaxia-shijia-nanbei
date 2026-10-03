/**
 * TeamService——从 PostgreSQL 读取球队数据，Redis 缓存。
 *
 * M1 改造：原 generateAllTeams 内存生成 → Prisma 查询 + Redis 缓存。
 * 生成器仅用于 seed 脚本。
 * 参见：开发计划.html §2.1
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import Redis from "ioredis";
import {
  type Abilities,
  type Lineup,
  type Player,
  type PlayerProfile,
  type TacticModSet,
  type Team,
  getPlayerStatus,
} from "@hwo/shared";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CACHE_TTL = 300; // 5 分钟

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);
  private readonly redis: Redis | null;

  constructor(private readonly prisma: PrismaService) {
    try {
      this.redis = new Redis(REDIS_URL, {
        // Redis 不可用时让命令快速失败（reject），而不是无限排队挂死请求。
        // 默认 maxRetriesPerRequest=null 会导致离线命令永不 reject，引发 504。
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1000,
        retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
        lazyConnect: true,
      });
      this.redis.on("error", (err) => {
        this.logger.warn(`Redis 连接失败，降级为直连 DB: ${err.message}`);
      });
      // 后台尝试连接；连不上也不影响服务（命令会快速 reject）
      this.redis.connect().catch(() => {});
    } catch {
      this.redis = null;
    }
  }

  /** 仅在 Redis 处于就绪态时才用缓存，否则直连 DB，避免命令排队挂起 */
  private async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.redis || this.redis.status !== "ready") return null;
    const cached = await this.redis.get(key).catch(() => null);
    return cached ? (JSON.parse(cached) as T) : null;
  }

  private async cacheSet(key: string, value: string): Promise<void> {
    if (!this.redis || this.redis.status !== "ready") return;
    await this.redis.set(key, value, "EX", CACHE_TTL).catch(() => {});
  }

  /** 把 DB 的 team + players + lineup + tactic 组装成 shared 的 Team 类型 */
  private assemble(
    row: {
      id: string;
      name: string;
      city?: string | null;
      chemistry: number;
      captainId?: string | null;
      userId?: string | null;
      players: { id: string; name: string; position: string; abilities: unknown; traits: unknown; salary?: number | null; fatigue?: number; age?: number; profile?: unknown }[];
      lineup: { starters: unknown; minutes: unknown } | null;
      tactic: { modSet: unknown } | null;
    },
  ): Team {
    const captainId = row.captainId ?? null;
    const players: Player[] = row.players.map((p) => {
      const fatigue = p.fatigue ?? 0;
      return {
        id: p.id,
        name: p.name,
        position: p.position as Player["position"],
        abilities: p.abilities as Abilities,
        // DB fatigue 是 0-100 整数，condition.fatigue 是 0-1 浮点
        condition: { fatigue: fatigue / 100, foulTrouble: 0, hot: 0 },
        traits: (p.traits as string[]) ?? [],
        salary: p.salary ?? 0,
        status: getPlayerStatus(fatigue),
        // 队长标记（#20）
        isCaptain: p.id === captainId,
        // 新秀标记（#20）：年龄 ≤ 22 视为新秀
        isRookie: (p.age ?? 25) <= 22,
        // P0-①：38 项档案层（可能为 null，存量球员回填后才有值）
        profile: (p.profile as PlayerProfile | null) ?? undefined,
      };
    });

    const lineup: Lineup = row.lineup
      ? {
          starters: row.lineup.starters as string[],
          minutes: row.lineup.minutes as Record<string, number>,
        }
      : { starters: players.slice(0, 5).map((p) => p.id), minutes: {} };

    const tactic = (row.tactic?.modSet as TacticModSet) ?? {
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
      city: row.city ?? null,
      players,
      lineup,
      tactic,
      chemistry: row.chemistry,
      captainId,
      userId: row.userId ?? null,
    };
  }

  /** 全部球队（带缓存） */
  async getAll(): Promise<Team[]> {
    const cacheKey = "teams:all";
    const cached = await this.cacheGet<Team[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.team.findMany({
      include: { players: true, lineup: true, tactic: true },
      orderBy: { id: "asc" },
    });
    const teams = rows.map((r) => this.assemble(r));

    await this.cacheSet(cacheKey, JSON.stringify(teams));
    return teams;
  }

  /** 按 id 查单支球队（带缓存） */
  async getById(id: string): Promise<Team | null> {
    const cacheKey = `team:${id}`;
    const cached = await this.cacheGet<Team>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.team.findUnique({
      where: { id },
      include: { players: true, lineup: true, tactic: true },
    });
    if (!row) return null;

    const team = this.assemble(row);
    await this.cacheSet(cacheKey, JSON.stringify(team));
    return team;
  }

  /** 清除球队相关缓存（阵容/战术变更后调用） */
  async invalidateCache(teamId?: string): Promise<void> {
    if (!this.redis || this.redis.status !== "ready") return;
    if (teamId) {
      await this.redis.del(`team:${teamId}`).catch(() => {});
    }
    await this.redis.del("teams:all").catch(() => {});
  }

  /**
   * v0.6 §批次6：球队模糊搜索（名称/城市/ID 包含关键字）
   * - 支持按 leagueId / worldId 过滤
   * - 仅返回概要（id / name / city / leagueId / worldId / worldName / captainName），不嵌套完整 players
   * - limit 默认 30
   */
  async search(opts: {
    q?: string;
    leagueId?: string;
    worldId?: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    name: string;
    city: string | null;
    leagueId: string | null;
    worldId: string | null;
    worldName: string | null;
    playerCount: number;
    captainName: string | null;
  }>> {
    const where: {
      OR?: Array<Record<string, unknown>>;
      leagueId?: string;
      worldId?: string;
    } = {};

    if (opts.q && opts.q.trim()) {
      const kw = opts.q.trim();
      where.OR = [
        { name: { contains: kw, mode: "insensitive" } },
        { city: { contains: kw, mode: "insensitive" } },
        { id: { contains: kw, mode: "insensitive" } },
      ];
    }
    if (opts.leagueId) where.leagueId = opts.leagueId;
    if (opts.worldId) where.worldId = opts.worldId;

    const rows = await this.prisma.team.findMany({
      where,
      select: {
        id: true,
        name: true,
        city: true,
        leagueId: true,
        worldId: true,
        world: { select: { name: true } },
        captainId: true,
        players: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      take: opts.limit ?? 30,
    });

    return rows.map((r) => {
      const captain = r.captainId ? r.players.find((p) => p.id === r.captainId) : null;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        leagueId: r.leagueId,
        worldId: r.worldId,
        worldName: r.world?.name ?? null,
        playerCount: r.players.length,
        captainName: captain?.name ?? null,
      };
    });
  }
}
