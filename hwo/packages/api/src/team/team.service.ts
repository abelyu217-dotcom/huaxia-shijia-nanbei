/**
 * TeamService——缓存 generateAllTeams(42) 结果（模块级单例）
 *
 * MVP 不连数据库，用确定性生成器作为唯一数据源。
 * 6 支球队在应用启动后由 NestJS DI 注入并复用，避免重复生成。
 */

import { Injectable } from "@nestjs/common";
import { generateAllTeams, type Team } from "@hwo/shared";

/** 生成球队的固定种子——保证每次启动数据一致 */
const TEAM_SEED = 42;

@Injectable()
export class TeamService {
  private readonly teams: Team[];

  constructor() {
    this.teams = generateAllTeams(TEAM_SEED);
  }

  /** 全部球队（原样返回，调用方不应修改） */
  getAll(): Team[] {
    return this.teams;
  }

  /** 按 id 查单支球队；未找到返回 undefined */
  getById(id: string): Team | undefined {
    return this.teams.find((t) => t.id === id);
  }
}
