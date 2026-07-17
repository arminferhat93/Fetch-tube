import { Worker } from 'bullmq';
import { redisConnection } from '../queues/download.queue';
import { processDownloadJob } from '../services/DownloadService';
import { logger } from '../lib/logger';
import type { DownloadJobData, DownloadJobResult } from '../types/index';

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '3', 10);
const log = logger.child({ component: 'worker' });

export function startDownloadWorker(): Worker<DownloadJobData, DownloadJobResult> {
  const worker = new Worker<DownloadJobData, DownloadJobResult>(
    'downloads',
    async (job) => {
      const jobLog = log.child({ jobId: job.id });
      jobLog.info({ mode: job.data.mode, tracks: job.data.ids?.length ?? 0, playlist: job.data.playlist ?? null }, 'job started');

      const result = await processDownloadJob(
        job.id!,
        job.data,
        async (pct) => { await job.updateProgress(pct); },
      );

      jobLog.info({ fileCount: result.fileCount, failedCount: result.failedCount, isZip: result.isZip }, 'job completed');
      return result;
    },
    {
      connection: redisConnection,
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'job failed');
  });

  log.info({ concurrency: WORKER_CONCURRENCY }, 'worker started');
  return worker;
}
