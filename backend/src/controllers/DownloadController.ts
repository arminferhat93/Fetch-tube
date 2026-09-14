import fs from 'fs';
import type { Request, Response } from 'express';
import { downloadQueue } from '../queues/download.queue';
import { ensureStorageDir, scheduleCleanup } from '../services/ZipService';
import { logger } from '../lib/logger';
import type { CreateDownloadRequest, DownloadJobResult } from '../types/index';

const log = logger.child({ component: 'controller' });

function isValidJobId(id: string): boolean {
  return /^[\w-]{1,64}$/.test(id);
}

// HTTP headers are ASCII-only. Use RFC 5987 to send a UTF-8 filename alongside
// an ASCII fallback so browsers that don't support filename* still get something.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '').trim() || 'download';
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function createDownload(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateDownloadRequest;

  if (!body.ids?.length && !body.playlist) {
    res.status(400).json({ error: 'Provide at least one id in ids[] or a playlist ID' });
    return;
  }

  const job = await downloadQueue.add('download', {
    ids:      body.ids      ?? [],
    playlist: body.playlist ?? undefined,
    mode:     body.mode     ?? 'audio',
    bitrate:  body.bitrate,
    quality:  body.quality,
  });

  log.info({ jobId: job.id, mode: body.mode ?? 'audio', ids: body.ids?.length ?? 0, playlist: body.playlist ?? null }, 'job queued');
  res.status(202).json({ jobId: job.id, status: 'processing' });
}

export async function getDownloadStatus(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) { res.status(400).json({ error: 'Invalid job ID' }); return; }

  const job = await downloadQueue.getJob(jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const state    = await job.getState();
  const progress = job.progress;

  switch (state) {
    case 'completed': {
      const rv = job.returnvalue as DownloadJobResult | null;
      res.json({
        status:        'completed',
        fileCount:     rv?.fileCount     ?? 0,
        failedCount:   rv?.failedCount   ?? 0,
        fileSizeBytes: rv?.fileSizeBytes ?? 0,
        isZip:         rv?.isZip         ?? true,
      });
      break;
    }
    case 'failed': {
      const reason = job.failedReason ?? '';
      const match = reason.match(/^\[([A-Z_]+)\]\s*([\s\S]*)/);
      const errorCode = match?.[1];
      const error = match ? match[2].trim() : reason;
      res.json({ status: 'failed', error: error || 'Download failed.', ...(errorCode ? { errorCode } : {}) });
      break;
    }
    case 'active':  res.json({ status: 'active', progress: typeof progress === 'number' ? progress : 0 }); break;
    default:        res.json({ status: 'waiting' });
  }
}

export async function downloadFile(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;
  if (!isValidJobId(jobId)) { res.status(400).json({ error: 'Invalid job ID' }); return; }

  const job = await downloadQueue.getJob(jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const state = await job.getState();
  if (state !== 'completed') {
    res.status(409).json({ error: 'Job not completed yet', status: state });
    return;
  }

  const rv = job.returnvalue as DownloadJobResult | null;
  if (!rv?.filePath || !fs.existsSync(rv.filePath)) {
    res.status(410).json({ error: 'File has expired or was not found' });
    return;
  }

  const { filePath, filename, isZip } = rv;
  const stat        = fs.statSync(filePath);
  const contentType = isZip
    ? 'application/zip'
    : filePath.endsWith('.mp4') ? 'video/mp4' : 'audio/mpeg';

  log.info({ jobId, filename, isZip, bytes: stat.size }, 'streaming file to client');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.setHeader('Content-Length', stat.size);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  res.on('finish', () => {
    log.info({ jobId }, 'file delivered');
    scheduleCleanup(filePath);
  });
  fileStream.on('error', (err) => {
    log.error({ jobId, err: err.message }, 'file stream error');
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file' });
  });
}

export async function uploadCookies(req: Request, res: Response): Promise<void> {
  const cookiesFile = process.env.COOKIES_FILE;
  if (!cookiesFile) {
    res.status(503).json({ error: 'Server is not configured for cookies (COOKIES_FILE not set).' });
    return;
  }

  const content = req.body as string;
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Request body must be non-empty cookies file content.' });
    return;
  }

  try {
    fs.writeFileSync(cookiesFile, content, 'utf-8');
    log.info({ cookiesFile }, 'cookies file updated via API');
    res.json({ ok: true });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'failed to write cookies file');
    res.status(500).json({ error: 'Failed to write cookies file — check COOKIES_HOST_PATH is set on the server.' });
  }
}
