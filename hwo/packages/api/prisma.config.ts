// Prisma 7 配置文件
// 连接 URL 从环境变量读取，支持 migrate 和 PrismaClient
// 参见：https://pris.ly/d/config-datasource

import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://hwo:hwo_dev@localhost:5432/hwo",
  },
});
