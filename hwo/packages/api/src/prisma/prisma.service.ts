/**
 * PrismaService——NestJS 全局单例 PrismaClient
 *
 * Prisma 7 使用 @prisma/adapter-pg 适配器连接 PostgreSQL。
 * 参见：开发计划.html §2.1
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo";

function buildAdapter(): PrismaPg {
  return new PrismaPg({ connectionString: DATABASE_URL });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: buildAdapter() });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
