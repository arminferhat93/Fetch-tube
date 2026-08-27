import fs from 'fs';
import path from 'path';
import {
  toUrl,
  getVideoFilename,
  downloadToTemp,
  downloadToFile,
  getPlaylistIds,
  getPlaylistTitle,
  safeStream,
} from '../download/download-mp3';
import { ZipBuilder, ensureStorageDir } from './ZipService';
import { logger } from '../lib/logger';
import type { DownloadJobData, DownloadJobResult, DownloadOptions } from '../types/index';

const CONCURRENCY    = parseInt(process.env.DOWNLOAD_CONCURRENCY ?? '5', 10);
const STORAGE_DIR    = process.env.STORAGE_DIR ?? '/tmp/downloads';
const DEV_KEEP_FILES = process.env.DEV_KEEP_FILES === 'true';

function resolveCookiesFile(): string | undefined {
  const p = process.env.COOKIES_FILE;
  if (!p) return undefined;
  const stat = fs.statSync(p, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.size === 0) {
    if (stat) process.stderr.write(`[cookies] COOKIES_FILE="${p}" is not a valid cookies file — skipping\n`);
    return undefined;
  }
  process.stderr.write(`[cookies] using cookies from ${p}\n`);
  return p;
}

const COOKIES_FILE = resolveCookiesFile();

// Strip non-ASCII (emojis, accented chars like ć č š đ ž) and filesystem-unsafe chars.
// Keeps the filename clean and safe across all OS / HTTP layers.
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\x20-\x7E]/g, '')   // non-ASCII out
    .replace(/[/\\:*?"<>|]/g, '_')  // unsafe filesystem chars → _
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
    || 'download';
}

interface VideoEntry {
  url: string;
  filename: string;
}

async function resolveIds(data: DownloadJobData): Promise<string[]> {
  const ids: string[] = [...(data.ids ?? [])];
  if (data.playlist) {
    ids.push(...await getPlaylistIds(data.playlist, COOKIES_FILE));
  }
  return ids.filter(Boolean);
}

async function fetchMetadata(urls: string[], opts: DownloadOptions): Promise<VideoEntry[]> {
  const ext = opts.mode === 'audio' ? 'mp3' : 'mp4';
  return Promise.all(
    urls.map(async (url) => {
      const filename = await getVideoFilename(url, opts).catch(
        () => `${Date.now()}.${ext}`,
      );
      return { url, filename };
    }),
  );
}

export async function processDownloadJob(
  jobId: string,
  data: DownloadJobData,
  onProgress: (pct: number) => Promise<void>,
): Promise<DownloadJobResult> {
  const log = logger.child({ component: 'service', jobId });

  const opts: DownloadOptions = {
    mode: data.mode,
    bitrate: data.bitrate,
    quality: data.quality,
    cookies: COOKIES_FILE,
  };

  const rawIds = await resolveIds(data);
  const urls   = rawIds.map(toUrl).filter((u): u is string => u !== null);
  if (urls.length === 0) throw new Error('No valid video IDs to download');
  log.info({ count: urls.length }, 'resolved IDs');

  ensureStorageDir();

  log.info({ count: urls.length }, 'fetching metadata');
  const [entries, playlistTitle] = await Promise.all([
    fetchMetadata(urls, opts),
    data.playlist ? getPlaylistTitle(data.playlist, COOKIES_FILE) : Promise.resolve(null),
  ]);

  // ── Single file: stream directly to disk, no ZIP ──────────────────────────
  if (entries.length === 1 && !data.playlist) {
    const { url, filename } = entries[0];
    const ext     = opts.mode === 'audio' ? 'mp3' : 'mp4';
    const base    = sanitizeFilename(filename.replace(/\.[^.]+$/, ''));
    const outName = `${base || 'download'}.${ext}`;
    const outPath = path.join(STORAGE_DIR, `${jobId}.${ext}`);

    log.info({ outPath, outName }, 'single file — skipping ZIP');

    await downloadToFile(url, opts, outPath, (pct) => {
      void onProgress(pct).catch(() => {});
    });

    void onProgress(100).catch(() => {});
    const fileSizeBytes = fs.statSync(outPath).size;
    log.info({ outPath, outName, fileSizeBytes }, 'single file ready');
    return { filePath: outPath, filename: outName, fileCount: 1, failedCount: 0, fileSizeBytes, isZip: false };
  }

  // ── Multi-file: build ZIP ─────────────────────────────────────────────────
  let zipName: string;
  if (data.playlist && playlistTitle) {
    zipName = `${sanitizeFilename(playlistTitle)}.zip`;
  } else {
    zipName = `download-${jobId}.zip`;
  }
  log.info({ zipName }, 'resolved zip name');

  const zip       = new ZipBuilder(jobId);
  let failedCount = 0;
  const total     = entries.length;
  const batches   = Math.ceil(total / CONCURRENCY);

  const trackProgress = new Array<number>(total).fill(0);
  let lastReported = 0;

  const reportOverall = () => {
    const avg = trackProgress.reduce((s, p) => s + p, 0) / total;
    const pct = Math.max(1, Math.round(avg));
    if (pct > lastReported) {
      lastReported = pct;
      void onProgress(pct).catch(() => {});
    }
  };

  let debugDir: string | null = null;
  if (DEV_KEEP_FILES) {
    debugDir = path.join(STORAGE_DIR, 'debug', jobId);
    fs.mkdirSync(debugDir, { recursive: true });
    log.info({ debugDir }, 'DEV: raw files will be kept for inspection');
  }

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch    = entries.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    log.info({ batch: batchNum, of: batches, tracks: batch.map(e => e.filename) }, 'downloading batch');

    const streamResults = await Promise.all(
      batch.map(async ({ url, filename }, batchIdx) => {
        const globalIdx = i + batchIdx;

        const ytProgress = (pct: number) => {
          if (pct > trackProgress[globalIdx]) {
            trackProgress[globalIdx] = pct;
            reportOverall();
          }
        };

        log.debug({ url, filename }, 'starting track');
        try {
          let raw;
          if (debugDir) {
            const outPath = path.join(debugDir, sanitizeFilename(filename));
            log.debug({ outPath }, 'DEV: writing track to file');
            raw = await downloadToFile(url, opts, outPath, ytProgress);
          } else {
            raw = await downloadToTemp(url, opts, STORAGE_DIR, ytProgress);
          }

          const stream = safeStream(raw, (err) => {
            log.error({ url, err: err.message }, 'stream error');
            failedCount++;
          });
          return { filename, stream, globalIdx };
        } catch (err) {
          log.error({ url, err: (err as Error).message }, 'track failed');
          failedCount++;
          trackProgress[globalIdx] = 100;
          reportOverall();
          return { filename, stream: null, globalIdx };
        }
      }),
    );

    const donePromises: Promise<void>[] = [];

    for (const { filename, stream, globalIdx } of streamResults) {
      if (!stream) continue;
      zip.append(stream, sanitizeFilename(filename));
      donePromises.push(
        new Promise<void>((resolve) => {
          stream.once('end', () => {
            trackProgress[globalIdx] = 100;
            reportOverall();
            log.info({ track: filename, overall: lastReported }, 'track done');
            resolve();
          });
          stream.once('error', () => resolve());
        }),
      );
    }

    await Promise.all(donePromises);
  }

  const zipPath       = await zip.finalize();
  const fileSizeBytes = fs.statSync(zipPath).size;
  log.info({ zipPath, zipName, fileCount: total - failedCount, failedCount, fileSizeBytes }, 'ZIP finalized');
  return { filePath: zipPath, filename: zipName, fileCount: total - failedCount, failedCount, fileSizeBytes, isZip: true };
}
