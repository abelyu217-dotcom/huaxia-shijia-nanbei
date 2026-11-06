/**
 * RelationshipController——球员关系网端点（P3-4）
 *
 * - GET    /api/relationship/player/:playerId    球员关系网
 * - PUT    /api/relationship/player/:playerId/family  设置家庭背景
 * - POST   /api/relationship                       创建人际关系
 * - GET    /api/relationship/team/:teamId/chemistry  球队化学反应
 * - GET    /api/relationship/player/:playerId/morale 球员士气
 */

import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { RelationshipService, type RelationshipType } from "./relationship.service.js";

@Controller("api/relationship")
export class RelationshipController {
  constructor(private readonly relationshipService: RelationshipService) {}

  @Get("player/:playerId")
  async getPlayerNetwork(@Param("playerId") playerId: string) {
    return this.relationshipService.getPlayerNetwork(playerId);
  }

  @Put("player/:playerId/family")
  async setFamily(
    @Param("playerId") playerId: string,
    @Body() body: { background: string; members?: Array<{ name: string; relation: string; age: number }> },
  ) {
    return this.relationshipService.setPlayerFamily(playerId, body.background, body.members);
  }

  @Post()
  async createRelationship(
    @Body() body: { sourceId: string; targetId: string; type: RelationshipType; bond?: number; note?: string },
  ) {
    return this.relationshipService.createRelationship(
      body.sourceId,
      body.targetId,
      body.type,
      body.bond ?? 50,
      body.note,
    );
  }

  @Get("team/:teamId/chemistry")
  async getTeamChemistry(@Param("teamId") teamId: string) {
    return this.relationshipService.calculateTeamChemistry(teamId);
  }

  @Get("player/:playerId/morale")
  async getPlayerMorale(@Param("playerId") playerId: string) {
    return this.relationshipService.calculatePlayerMorale(playerId);
  }
}
