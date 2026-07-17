import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import type { DownloadOptions } from '../types/index';

export type ProgressCallback = (pct: number) => void;

export function toUrl(idOrUrl: string): string | null {
  const trimmed = idOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://www.youtube.com/watch?v=${trimmed}`;
}

export async function checkBinaries(): Promise<void> {
  const [hasYtDlp, hasFfmpeg] = await Promise.all([
    checkBinary('yt-dlp'),
    checkBinary('ffmpeg', '-version'),
  ]);
  if (!hasYtDlp) throw new Error('yt-dlp not found. Install: brew install yt-dlp');
  if (!hasFfmpeg) throw new Error('ffmpeg not found. Install: brew install ffmpeg');
}

function checkBinary(bin: string, versionFlag = '--version'): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, [versionFlag]);
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

function buildFormatArgs(opts: DownloadOptions): string[] {
  if (opts.mode === 'video') {
    const quality = opts.quality ?? 1080;
    return [
      '-f', `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}]`,
      '--merge-output-format', 'mp4',
    ];
  }
  const bitrate = opts.bitrate ?? 192;
  return ['-x', '--audio-format', 'mp3', '--audio-quality', `${bitrate}K`];
}

// Attaches a stderr listener that parses yt-dlp's "[download] X%" progress lines.
function watchProgress(stderr: NodeJS.ReadableStream, onProgress: ProgressCallback): void {
  stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    // yt-dlp uses \r to overwrite the same line; grab the last percentage in the chunk.
    const matches = [...text.matchAll(/\[download\]\s+([\d.]+)%/g)];
    if (matches.length > 0) {
      const pct = Math.round(parseFloat(matches[matches.length - 1][1]));
      onProgress(pct);
    }
  });
}

export function getVideoFilename(url: string, opts: DownloadOptions): Promise<string> {
  const ext = opts.mode === 'audio' ? 'mp3' : 'mp4';
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', [url, '--print', `%(title)s.${ext}`, '--no-download', '--no-warnings']);
    let out = '';
    p.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error(`yt-dlp metadata failed (code ${code})`)); return; }
      resolve(out.trim() || `video.${ext}`);
    });
  });
}

// Audio-only: pipes yt-dlp stdout directly — no temp file written.
export function createAudioStream(url: string, opts: DownloadOptions, onProgress?: ProgressCallback): Readable {
  const args = [url, ...buildFormatArgs(opts), '-o', '-', '--no-playlist', '--no-warnings'];
  if (opts.cookies) args.push('--cookies', opts.cookies);
  const proc = spawn('yt-dlp', args);
  if (onProgress) {
    watchProgress(proc.stderr, onProgress);
  } else {
    proc.stderr.pipe(process.stderr);
  }
  return proc.stdout;
}

// Video mode requires muxing, so yt-dlp must write to a temp file first.
// The returned stream deletes the temp file on close.
export function downloadToTemp(url: string, opts: DownloadOptions, tmpDir: string, onProgress?: ProgressCallback): Promise<Readable> {
  const ext = opts.mode === 'audio' ? 'mp3' : 'mp4';
  const tmpPath = path.join(tmpDir, `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  const args = [url, ...buildFormatArgs(opts), '-o', tmpPath, '--no-playlist'];
  if (opts.cookies) args.push('--cookies', opts.cookies);

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    if (onProgress) {
      watchProgress(proc.stderr, onProgress);
    } else {
      proc.stderr.pipe(process.stderr);
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) { reject(new Error(`yt-dlp exited ${code}`)); return; }
      const fileStream = fs.createReadStream(tmpPath);
      fileStream.on('close', () => fs.rm(tmpPath, { force: true }, () => {}));
      resolve(fileStream);
    });
  });
}

// Writes to a persistent path — file is kept after streaming.
// Used in DEV_KEEP_FILES mode so raw tracks can be inspected before the ZIP.
export function downloadToFile(url: string, opts: DownloadOptions, outPath: string, onProgress?: ProgressCallback): Promise<Readable> {
  const args = [url, ...buildFormatArgs(opts), '-o', outPath, '--no-playlist'];
  if (opts.cookies) args.push('--cookies', opts.cookies);

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    if (onProgress) {
      watchProgress(proc.stderr, onProgress);
    } else {
      proc.stderr.pipe(process.stderr);
    }
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) { reject(new Error(`yt-dlp exited ${code}`)); return; }
      resolve(fs.createReadStream(outPath));
    });
  });
}

export function getPlaylistIds(playlistId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('yt-dlp', [
      `https://www.youtube.com/playlist?list=${playlistId}`,
      '--flat-playlist', '--print', 'id', '--no-warnings',
    ]);
    let out = '';
    p.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error(`yt-dlp playlist failed (code ${code})`)); return; }
      resolve(out.split('\n').map(l => l.trim()).filter(Boolean));
    });
  });
}

export function getPlaylistTitle(playlistId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn('yt-dlp', [
      `https://www.youtube.com/playlist?list=${playlistId}`,
      '--print', 'playlist_title',
      '--playlist-items', '1',
      '--no-warnings',
    ]);
    let out = '';
    p.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      const title = out.trim();
      resolve(code === 0 && title ? title : null);
    });
  });
}

// Wraps a stream so that source errors gracefully end the PassThrough
// instead of crashing the archiver pipeline.
export function safeStream(raw: Readable, onError: (err: Error) => void): PassThrough {
  const pass = new PassThrough();
  raw.on('error', (err: Error) => {
    onError(err);
    raw.unpipe(pass);
    pass.end();
  });
  raw.pipe(pass);
  return pass;
}
