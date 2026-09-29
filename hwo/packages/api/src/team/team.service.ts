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
  type TacticModSet,
  type Team,
} from "@hwo/shared";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CACHE_TTL = 300; // 5 分钟

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);
  private readonly redis: Redis | null;

  constructor(private readonly prisma: PrismaService) {
    try {
      this.redis = new Redis(REDIS_URL);
      this.redis.on("error", (err) => {
        this.logger.warn(`Redis 连接失败，降级为直连 DB: ${err.message}`);
      });
    } catch {
      this.redis = null;
    }
  }

  /** 把 DB 的 team + players + lineup + tactic 组装成 shared 的 Team 类型 */
  private assemble(
    row: {
      id: string;
      name: string;
      chemistry: number;
      players: { id: string; name: string; position: string; abilities: unknown; traits: unknown }[];
      lineup: { starters: unknown; minutes: unknown } | null;
      tactic: { modSet: unknown } | null;
    },
  ): Team {
    const players: Player[] = row.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position as Player["position"],
      abilities: p.abilities as Abilities,
      condition: { fatigue: 0, foulTrouble: 0, hot: 0 },
      traits: (p.traits as string[]) ?? [],
    }));

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
      players,
      lineup,
      tactic,
      chemistry: row.chemistry,
    };
  }

  /** 全部球队（带缓存） */
  async getAll(): Promise<Team[]> {
    const cacheKey = "teams:all";
    if (this.redis) {
      const cached = await this.redis.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached) as Team[];
    }

    const rows = await this.prisma.team.findMany({
      include: { players: true, lineup: true, tactic: true },
      orderBy: { id: "asc" },
    });
    const teams = rows.map((r) => this.assemble(r));

    if (this.redis) {
      await this.redis.set(cacheKey, JSON.stringify(teams), "EX", CACHE_TTL).catch(() => {});
    }
    return teams;
  }

  /** 按 id 查单支球队（带缓存） */
  async getById(id: string): Promise<Team | null> {
    const cacheKey = `team:${id}`;
    if (this.redis) {
      const cached = await this.redis.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached) as Team;
    }

    const row = await this.prisma.team.findUnique({
      where: { id },
      include: { players: true, lineup: true, tactic: true },
    });
    if (!row) return null;

    const team = this.assemble(row);
    if (this.redis) {
      await this.redis.set(cacheKey, JSON.stringify(team), "EX", CACHE_TTL).catch(() => {});
    }
    return team;
  }

  /** 清除球队相关缓存（阵容/战术变更后调用） */
  async invalidateCache(teamId?: string): Promise<void> {
    if (!this.redis) return;
    if (teamId) {
      await this.redis.del(`team:${teamId}`).catch(() => {});
    }
    await this.redis.del("teams:all").catch(() => {});
  }
}
