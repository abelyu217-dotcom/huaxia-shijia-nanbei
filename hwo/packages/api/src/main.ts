/**
 * NestJS API 入口（ESM）
 *
 * 启动 Nest 应用，监听 3000 端口。
 * 参见：技术架构文档 §2
 */

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn", "debug", "verbose"],
  });
  app.enableCors();
  // 全局异常日志
  app.use((err: any, _req: any, _res: any, next: any) => {
    console.error("[GLOBAL ERROR]", err?.message, err?.stack);
    next(err);
  });
  await app.listen(3000);
  console.log("[@hwo/api] listening on http://localhost:3000");
  console.log("[@hwo/api] DATABASE_URL set:", !!process.env.DATABASE_URL);
}

void bootstrap();
