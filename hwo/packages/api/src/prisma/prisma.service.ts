/**
 * PrismaService——NestJS 全局单例 PrismaClient
 *
 * Prisma 7 需要驱动适配器：
 * - 云端（CloudBase Cloud Run）：设置 CLOUDBASE_API_KEY + CLOUDBASE_ENV_ID 时，
 *   使用 CloudBasePgAdapter 通过 HTTP 网关 exec-pgsql 访问 PostgreSQL
 *   （Cloud Run 容器无法 TCP 直连 CloudBase SQL 内网地址）。
 * - 本地开发：使用 @prisma/adapter-pg 直连 DATABASE_URL。
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CloudBasePgAdapter } from "./cloudbase-adapter.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo";

function buildAdapter(): PrismaPg | CloudBasePgAdapter {
  const envId = process.env.CLOUDBASE_ENV_ID;
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (envId && apiKey) {
    return new CloudBasePgAdapter({ envId, apiKey });
  }
  return new PrismaPg({ connectionString: DATABASE_URL });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: buildAdapter() as any });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}