/**
 * RelationshipService——球员家庭与人际关系系统服务（P3-4）
 *
 * 职责：
 * 1. 查询/创建球员家庭背景
 * 2. 查询/创建球员人际关系（家庭/队友/师徒/宿敌/朋友）
 * 3. 基于关系计算球队化学反应（chemistry）加成
 * 4. 关系对球员士气（morale）的影响
 *
 * 参见：球员家庭与人际关系系统设计.html
 */

import { Injectable, BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type RelationshipType = "family" | "teammate" | "mentor" | "rival" | "friend" | "external";

const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  family: "家人",
  teammate: "队友",
  mentor: "师徒",
  rival: "宿敌",
  friend: "朋友",
  external: "外部",
};

const FAMILY_BACKGROUND_LABEL: Record<string, string> = {
  sports_family: "体育世家",
  normal: "普通家庭",
  single_parent: "单亲家庭",
  overseas: "留学背景",
  sports_school: "体校出身",
};

@Injectable()
export class RelationshipService {
  private readonly logger = new Logger(RelationshipService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 获取球员完整关系网 */
  async getPlayerNetwork(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, position: true },
    });
    if (!player) throw new NotFoundException(`Player ${playerId} not found`);

    const family = await this.prisma.playerFamily.findUnique({ where: { playerId } });
    const relationships = await this.prisma.playerRelationship.findMany({
      where: { OR: [{ sourceId: playerId }, { targetId: playerId }] },
      include: {
        source: { select: { id: true, name: true, position: true } },
        target: { select: { id: true, name: true, position: true } },
      },
    });

    // 按类型分组
    const grouped: Record<string, unknown[]> = {};
    for (const r of relationships) {
      const isSource = r.sourceId === playerId;
      const other = isSource ? r.target : r.source;
      const key = r.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id: r.id,
        otherPlayerId: other.id,
        otherPlayerName: other.name,
        otherPosition: other.position,
        bond: r.bond,
        note: r.note,
        direction: isSource ? "out" : "in",
      });
    }

    return {
      playerId,
      playerName: player.name,
      position: player.position,
      family: family
        ? {
            background: family.background,
            backgroundLabel: FAMILY_BACKGROUND_LABEL[family.background] ?? family.background,
            members: family.members as Array<{ name: string; relation: string; age: number }>,
          }
        : null,
      relationships: grouped,
    };
  }

  /** 创建/更新球员家庭背景 */
  async setPlayerFamily(playerId: string, background: string, members?: Array<{ name: string; relation: string; age: number }>) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId }, select: { id: true } });
    if (!player) throw new NotFoundException(`Player ${playerId} not found`);

    const family = await this.prisma.playerFamily.upsert({
      where: { playerId },
      create: { playerId, background, members: members ?? [] },
      update: { background, members: members ?? [] },
    });

    return {
      playerId,
      background: family.background,
      backgroundLabel: FAMILY_BACKGROUND_LABEL[family.background] ?? family.background,
      members: family.members,
    };
  }

  /** 创建一条人际关系 */
  async createRelationship(
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    bond: number = 50,
    note?: string,
  ) {
    if (sourceId === targetId) throw new BadRequestException("不能与自己建立关系");

    const [src, tgt] = await Promise.all([
      this.prisma.player.findUnique({ where: { id: sourceId }, select: { id: true } }),
      this.prisma.player.findUnique({ where: { id: targetId }, select: { id: true } }),
    ]);
    if (!src) throw new NotFoundException(`Player ${sourceId} not found`);
    if (!tgt) throw new NotFoundException(`Player ${targetId} not found`);

    const rel = await this.prisma.playerRelationship.upsert({
      where: { sourceId_targetId_type: { sourceId, targetId, type } },
      create: { sourceId, targetId, type, bond, note },
      update: { bond, note },
    });

    this.logger.log(`建立关系：${sourceId} → ${targetId} type=${type} bond=${bond}`);
    return { id: rel.id, type: rel.type, typeLabel: RELATIONSHIP_LABEL[type], bond: rel.bond };
  }

  /** 计算球队化学反应（基于队友关系羁绊值） */
  async calculateTeamChemistry(teamId: string) {
    const players = await this.prisma.player.findMany({
      where: { teamId, retired: false },
      select: { id: true, name: true },
    });

    if (players.length < 2) return { teamId, chemistry: 60, details: [] };

    // 取所有队友关系
    const playerIds = players.map((p) => p.id);
    const rels = await this.prisma.playerRelationship.findMany({
      where: {
        type: "teammate",
        sourceId: { in: playerIds },
        targetId: { in: playerIds },
      },
    });

    // 平均羁绊 → 化学反应 0-100
    const totalBond = rels.reduce((s, r) => s + r.bond, 0);
    const avgBond = rels.length > 0 ? totalBond / rels.length : 50;
    const chemistry = Math.round(avgBond);

    const details = players.map((p) => {
      const pRels = rels.filter((r) => r.sourceId === p.id || r.targetId === p.id);
      const bond = pRels.length > 0 ? pRels.reduce((s, r) => s + r.bond, 0) / pRels.length : 50;
      return { playerId: p.id, playerName: p.name, avgBond: Math.round(bond) };
    });

    return { teamId, chemistry, details };
  }

  /** 计算球员士气（基于家庭+关系羁绊） */
  async calculatePlayerMorale(playerId: string) {
    const network = await this.getPlayerNetwork(playerId);

    // 基础士气 60
    let morale = 60;

    // 家庭背景加成
    if (network.family) {
      const bgBonus: Record<string, number> = {
        sports_family: 8,
        normal: 0,
        single_parent: -5,
        overseas: 3,
        sports_school: 4,
      };
      morale += bgBonus[network.family.background] ?? 0;
    }

    // 关系羁绊加成
    const allRels = Object.values(network.relationships).flat() as Array<{ bond: number }>;
    if (allRels.length > 0) {
      const avgBond = allRels.reduce((s, r) => s + r.bond, 0) / allRels.length;
      morale += Math.round((avgBond - 50) * 0.3);
    }

    // 宿敌关系扣分
    const rivals = (network.relationships.rival ?? []) as Array<{ bond: number }>;
    morale -= rivals.length * 3;

    morale = Math.max(0, Math.min(100, morale));

    return { playerId, morale, factors: { family: network.family?.background ?? null, relationshipCount: allRels.length, rivalCount: rivals.length } };
  }
}
