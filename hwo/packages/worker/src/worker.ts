/**
 * HWO sim worker（BullMQ）
 *
 * 监听 "settle-queue"，处理函数接收 job 后调用 @hwo/shared simulate()，
 * console.log 结果比分。MVP 占位：暂不连 DB、暂不写回结果。
 *
 * 参见：技术架构文档 §4（worker）、§8（sim 引擎）
 */

import { Worker, type Job } from "bullmq";
import Ioredis from "ioredis";
import { simulate, type SimInput } from "@hwo/shared";

const QUEUE_NAME = "settle-queue";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = new Ioredis(REDIS_URL, { maxRetriesPerRequest: null });

/**
 * 处理函数：调用 simulate() 并打印比分。
 * job.data 应为 SimInput（matchup + seed + config）。
 * 后续接入 DB 时在此持久化 SimOutput。
 */
async function handleSettle(job: Job<SimInput>): Promise<void> {
  const out = simulate(job.data);
  console.log(
    `[worker] job ${job.id} settled: home ${out.result.homeScore} : away ${out.result.awayScore} (winner=${out.result.winnerId})`,
  );
}

const worker = new Worker<SimInput>(QUEUE_NAME, handleSettle, { connection });

worker.on("ready", () => {
  console.log(`[@hwo/worker] listening on queue "${QUEUE_NAME}"`);
});

worker.on("failed", (job, err) => {
  console.error(`[@hwo/worker] job ${job?.id} failed:`, err);
});

export { worker, handleSettle, QUEUE_NAME };
