import { UX_EVALUATION_QUEUE_NAME } from "@autonomous-ux/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { getEnv } from "./env";

type EvaluationQueue = Queue;

const globalForQueue = globalThis as typeof globalThis & {
  __uxEvalRedis?: IORedis;
  __uxEvalQueue?: EvaluationQueue;
};

function getRedisConnection(): IORedis {
  if (!globalForQueue.__uxEvalRedis) {
    const { REDIS_URL } = getEnv();
    globalForQueue.__uxEvalRedis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return globalForQueue.__uxEvalRedis;
}

export function getEvaluationQueue(): EvaluationQueue {
  if (!globalForQueue.__uxEvalQueue) {
    globalForQueue.__uxEvalQueue = new Queue(UX_EVALUATION_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return globalForQueue.__uxEvalQueue;
}
