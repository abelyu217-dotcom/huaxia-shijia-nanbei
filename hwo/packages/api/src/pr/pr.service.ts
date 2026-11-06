/**
 * PrService——公关部服务
 *
 * v0.6 §批次5 设计：
 * - TeamMessage：球队讯息（董事/赞助商/球员/职员/球探/联盟各频道）
 *   - 已被 board/staff/finance/scout 等模块写入；本模块提供查询与已读管理
 * - MediaNews：媒体中心新闻（每日按当日事件自动生成ESPN/NBA TV/本地报纸/内幕等来源的报道）
 * - LeagueAnnouncement：联盟公告（交易/伤病/禁赛/里程碑/规则变更/赛程变更）
 *
 * 参见：HW0_系统调整方案_v2.md §批次5
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

// ── 视图类型 ──

export interface TeamMessageView {
  id: string;
  teamId: string;
  seasonId: string;
  day: number;
  channel: string;
  type: string;
  title: string;
  content: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

export interface MediaNewsView {
  id: string;
  worldId: string | null;
  seasonId: string;
  day: number;
  source: string;
  category: string;
  title: string;
  content: string;
  refId: string | null;
  tags: string[];
  createdAt: string;
}

export interface LeagueAnnouncementView {
  id: string;
  leagueId: string | null;
  worldId: string | null;
  seasonId: string;
  day: number;
  category: string;
  title: string;
  content: string;
  refId: string | null;
  createdAt: string;
}

export interface PrOverviewView {
  messages: TeamMessageView[];
  news: MediaNewsView[];
  announcements: LeagueAnnouncementView[];
  unreadCount: number;
}

// ── 频道与类型标签（与前端对齐） ──

const CHANNEL_LABEL: Record<string, string> = {
  board: "董事会",
  sponsor: "赞助商",
  player: "球员",
  staff: "职员",
  scout: "球探",
  league: "联盟",
};

const SOURCE_LABEL: Record<string, string> = {
  espn: "ESPN",
  nba_tv: "NBA TV",
  local_paper: "本地报纸",
  insider: "内幕",
};

const CATEGORY_LABEL: Record<string, string> = {
  trade: "交易",
  game: "比赛",
  injury: "伤病",
  rumor: "传闻",
  front_office: "前线办公",
  fan: "球迷",
};

const ANNOUNCE_CATEGORY_LABEL: Record<string, string> = {
  trade: "交易",
  injury: "伤病",
  suspension: "禁赛",
  milestone: "里程碑",
  rule_change: "规则变更",
  schedule_change: "赛程变更",
};

// ── 媒体新闻模板池（按 category + 当日事件触发） ──

interface NewsTemplate {
  category: string;
  source: string;
  titleTpl: string;
  contentTpl: string;
}

const NEWS_TEMPLATES: NewsTemplate[] = [
  {
    category: "game",
    source: "espn",
    titleTpl: "{winner} 击败 {loser}，{topPlayer} 砍下 {points} 分",
    contentTpl: "在 {day} 日的较量中，{winner} 以 {homeScore}-{awayScore} 击败 {loser}。{topPlayer} 出场 {minutes} 分钟，贡献 {points} 分 {rebounds} 篮板 {assists} 助攻，成为本场 MVP。",
  },
  {
    category: "game",
    source: "nba_tv",
    titleTpl: "{loser} 状态低迷，{winner} 主场告捷",
    contentTpl: "{winner} 主场迎战 {loser}，最终比分 {homeScore}-{awayScore}。客队全场未能找到节奏，主队 {topPlayer} 表现稳定。",
  },
  {
    category: "trade",
    source: "insider",
    titleTpl: "重磅交易：{teamA} 与 {teamB} 达成协议",
    contentTpl: "据内幕消息，{teamA} 与 {teamB} 接近完成一笔交易，涉及多名球员。详情待官方确认。",
  },
  {
    category: "injury",
    source: "local_paper",
    titleTpl: "{player} 因伤缺阵，{team} 阵容受挫",
    contentTpl: "{team} 主力 {player} 在训练中受伤，预计缺席数场比赛。这对球队阵容深度是一次考验。",
  },
  {
    category: "rumor",
    source: "insider",
    titleTpl: "传闻：{team} 有意追逐明星球员",
    contentTpl: "据多位内幕人士透露，{team} 正在酝酿大动作，目标直指明星级球员。球队经理拒绝置评。",
  },
  {
    category: "front_office",
    source: "espn",
    titleTpl: "{team} 调整教练组，新战术浮出水面",
    contentTpl: "{team} 训练馆出现新面孔，据悉是教练组补强信号。新战术体系或将亮相。",
  },
  {
    category: "fan",
    source: "local_paper",
    titleTpl: "{team} 球迷发起请愿，要求保留核心球员",
    contentTpl: "{team} 球迷在主场外发起请愿活动，呼吁管理层保留核心阵容。球迷代表表示：'我们的球队不能散'。",
  },
];

@Injectable()
export class PrService {
  private readonly logger = new Logger(PrService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 查询 ───

  /** 球队讯息列表（按 day 倒序，默认 30 条） */
  async listMessages(teamId: string, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<TeamMessageView[]> {
    const limit = Math.min(opts.limit ?? 30, 100);
    const where: { teamId: string; read?: boolean } = { teamId };
    if (opts.unreadOnly) where.read = false;

    const rows = await this.prisma.teamMessage.findMany({
      where,
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => this.toMessageView(r));
  }

  /** 球队未读讯息数 */
  async countUnread(teamId: string): Promise<number> {
    return this.prisma.teamMessage.count({ where: { teamId, read: false } });
  }

  /** 媒体新闻列表（默认最近 30 条，可按 category 过滤） */
  async listNews(opts: { seasonId?: string; category?: string; limit?: number } = {}): Promise<MediaNewsView[]> {
    const limit = Math.min(opts.limit ?? 30, 100);
    const where: { seasonId?: string; category?: string } = {};
    if (opts.seasonId) where.seasonId = opts.seasonId;
    if (opts.category) where.category = opts.category;

    const rows = await this.prisma.mediaNews.findMany({
      where,
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => this.toNewsView(r));
  }

  /** 联盟公告列表 */
  async listAnnouncements(opts: { seasonId?: string; category?: string; limit?: number } = {}): Promise<LeagueAnnouncementView[]> {
    const limit = Math.min(opts.limit ?? 30, 100);
    const where: { seasonId?: string; category?: string } = {};
    if (opts.seasonId) where.seasonId = opts.seasonId;
    if (opts.category) where.category = opts.category;

    const rows = await this.prisma.leagueAnnouncement.findMany({
      where,
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => this.toAnnouncementView(r));
  }

  /** 公关部总览：球队讯息 + 联盟级媒体新闻 + 联盟公告 */
  async getOverview(teamId: string, seasonId: string): Promise<PrOverviewView> {
    const [messages, news, announcements, unreadCount] = await Promise.all([
      this.listMessages(teamId, { limit: 30 }),
      this.listNews({ seasonId, limit: 30 }),
      this.listAnnouncements({ seasonId, limit: 20 }),
      this.countUnread(teamId),
    ]);
    return { messages, news, announcements, unreadCount };
  }

  // ─── 已读管理 ───

  /** 标记单条讯息为已读 */
  async markRead(messageId: string, teamId: string): Promise<void> {
    const msg = await this.prisma.teamMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException("讯息不存在");
    if (msg.teamId !== teamId) throw new Error("无权操作其他球队的讯息");
    if (msg.read) return;
    await this.prisma.teamMessage.update({
      where: { id: messageId },
      data: { read: true },
    });
  }

  /** 标记球队全部讯息为已读 */
  async markAllRead(teamId: string): Promise<{ updated: number }> {
    const r = await this.prisma.teamMessage.updateMany({
      where: { teamId, read: false },
      data: { read: true },
    });
    return { updated: r.count };
  }

  // ─── 每日生成（由 schedule.service.advanceDay 调用） ───

  /**
   * 每日为所有球队生成媒体新闻 + 联盟公告
   * - 基于当日比赛结果生成 game 类新闻
   * - 随机生成 rumor / front_office / fan 类新闻（增加沉浸感）
   */
  async runDailyAllTeams(seasonId: string, day: number): Promise<void> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) return;

    // 1. 当日比赛结果 → game 类新闻（通过 Match 表关联查询 MatchResult）
    const todayMatches = await this.prisma.match.findMany({
      where: { seasonId, day, status: "settled" },
      take: 50,
      orderBy: { settledAt: "desc" },
      include: { result: true },
    });

    let newsCreated = 0;
    for (const m of todayMatches) {
      // 30% 概率为这场比赛生成一条新闻（避免每天过多）
      if (Math.random() > 0.3) continue;
      if (!m.result) continue;
      try {
        await this.generateGameNews(seasonId, day, m);
        newsCreated++;
      } catch (e) {
        this.logger.warn(
          `[PR] 比赛 ${m.id} 新闻生成失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // 2. 随机生成 1-2 条 rumor/front_office/fan 类新闻
    const extraCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < extraCount; i++) {
      try {
        await this.generateSoftNews(seasonId, day);
        newsCreated++;
      } catch (e) {
        this.logger.warn(
          `[PR] 软新闻生成失败：${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (newsCreated > 0) {
      this.logger.log(`[PR] 第 ${day} 日生成 ${newsCreated} 条媒体新闻`);
    }
  }

  /** 为单场比赛生成新闻 */
  private async generateGameNews(
    seasonId: string,
    day: number,
    match: { id: string; homeTeamId: string; awayTeamId: string; result: { homeScore: number; awayScore: number; winnerId: string; loserId: string; id: string } | null },
  ): Promise<void> {
    if (!match.result) return;
    const [winner, loser] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: match.result.winnerId }, select: { id: true, name: true } }),
      this.prisma.team.findUnique({ where: { id: match.result.loserId }, select: { id: true, name: true } }),
    ]);
    if (!winner || !loser) return;

    // 找表现最好的球员（简化：占位，后续可从 boxScore 选最高分）
    const topPlayer = "本队核心";
    const points = 20 + Math.floor(Math.random() * 15);
    const rebounds = 5 + Math.floor(Math.random() * 8);
    const assists = 3 + Math.floor(Math.random() * 7);
    const minutes = 30 + Math.floor(Math.random() * 8);

    const isHomeWin = match.result.winnerId === match.homeTeamId;
    const homeScore = isHomeWin ? match.result.homeScore : match.result.awayScore;
    const awayScore = isHomeWin ? match.result.awayScore : match.result.homeScore;

    // 选模板（轮换 ESPN / NBA TV）
    const tpl = NEWS_TEMPLATES.filter((t) => t.category === "game")[
      Math.floor(Math.random() * 2)
    ]!;

    const title = fillTemplate(tpl.titleTpl, {
      winner: winner.name,
      loser: loser.name,
      topPlayer,
      points: String(points),
    });
    const content = fillTemplate(tpl.contentTpl, {
      day: String(day),
      winner: winner.name,
      loser: loser.name,
      homeScore: String(homeScore),
      awayScore: String(awayScore),
      topPlayer,
      minutes: String(minutes),
      points: String(points),
      rebounds: String(rebounds),
      assists: String(assists),
    });

    await this.prisma.mediaNews.create({
      data: {
        worldId: null,
        seasonId,
        day,
        source: tpl.source,
        category: "game",
        title,
        content,
        refId: match.id,
        tags: [winner.name, loser.name] as never,
      },
    });
  }

  /** 生成软新闻（rumor / front_office / fan） */
  private async generateSoftNews(seasonId: string, day: number): Promise<void> {
    // 随机选一支球队作为主角
    const team = await this.prisma.team.findFirst({
      where: { id: { not: { startsWith: "DRAFT_POOL_" } } },
      select: { id: true, name: true },
    });
    if (!team) return;

    const softCats = ["rumor", "front_office", "fan"];
    const cat = softCats[Math.floor(Math.random() * softCats.length)]!;
    const tpl = NEWS_TEMPLATES.find((t) => t.category === cat);
    if (!tpl) return;

    const title = fillTemplate(tpl.titleTpl, { team: team.name });
    const content = fillTemplate(tpl.contentTpl, { team: team.name });

    await this.prisma.mediaNews.create({
      data: {
        worldId: null,
        seasonId,
        day,
        source: tpl.source,
        category: cat,
        title,
        content,
        tags: [team.name] as never,
      },
    });
  }

  // ─── 工具：写入讯息（供其他模块调用） ───

  /** 写入球队讯息 */
  async notifyTeam(
    teamId: string,
    seasonId: string,
    day: number,
    channel: string,
    type: string,
    title: string,
    content: string,
    refId?: string,
  ): Promise<void> {
    await this.prisma.teamMessage.create({
      data: { teamId, seasonId, day, channel, type, title, content, refId },
    });
  }

  // ─── 视图转换 ───

  private toMessageView(r: { id: string; teamId: string; seasonId: string; day: number; channel: string; type: string; title: string; content: string; refId: string | null; read: boolean; createdAt: Date; }): TeamMessageView {
    return {
      id: r.id,
      teamId: r.teamId,
      seasonId: r.seasonId,
      day: r.day,
      channel: r.channel,
      type: r.type,
      title: r.title,
      content: r.content,
      refId: r.refId,
      read: r.read,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toNewsView(r: { id: string; worldId: string | null; seasonId: string; day: number; source: string; category: string; title: string; content: string; refId: string | null; tags: unknown; createdAt: Date; }): MediaNewsView {
    const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
    return {
      id: r.id,
      worldId: r.worldId,
      seasonId: r.seasonId,
      day: r.day,
      source: r.source,
      category: r.category,
      title: r.title,
      content: r.content,
      refId: r.refId,
      tags,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toAnnouncementView(r: { id: string; leagueId: string | null; worldId: string | null; seasonId: string; day: number; category: string; title: string; content: string; refId: string | null; createdAt: Date; }): LeagueAnnouncementView {
    return {
      id: r.id,
      leagueId: r.leagueId,
      worldId: r.worldId,
      seasonId: r.seasonId,
      day: r.day,
      category: r.category,
      title: r.title,
      content: r.content,
      refId: r.refId,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

// ── 模板填充 ──

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? `{${k}}`);
}

// 导出标签常量供 controller 使用
export { CHANNEL_LABEL, SOURCE_LABEL, CATEGORY_LABEL, ANNOUNCE_CATEGORY_LABEL };
