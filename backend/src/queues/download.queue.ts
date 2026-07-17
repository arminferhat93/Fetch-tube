import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { DownloadJobData } from '../types/index';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 500, 10_000),
});

export const downloadQueue = new Queue<DownloadJobData>('downloads', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 3_600 },
    removeOnFail:    { age: 86_400 },
  },
});
