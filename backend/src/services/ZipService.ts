import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import type { Archiver, ArchiverError, ArchiverOptions } from 'archiver';
import { logger } from '../lib/logger';
// @types/archiver doesn't type the factory fn; use require with explicit cast
// eslint-disable-next-line @typescript-eslint/no-var-requires
const createArchiver = require('archiver') as (format: string, options?: ArchiverOptions) => Archiver;

const log = logger.child({ component: 'zip' });

const STORAGE_DIR = process.env.STORAGE_DIR ?? '/tmp/downloads';

export function ensureStorageDir(): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export function getZipPath(jobId: string): string {
  return path.join(STORAGE_DIR, `${jobId}.zip`);
}

export function zipExists(jobId: string): boolean {
  return fs.existsSync(getZipPath(jobId));
}

export function scheduleCleanup(filePath: string, ttlMs = 3_600_000): void {
  log.info({ filePath, ttlMinutes: Math.round(ttlMs / 60_000) }, 'cleanup scheduled');
  setTimeout(() => {
    fs.rm(filePath, { force: true }, () => {
      log.info({ filePath }, 'file deleted');
    });
  }, ttlMs);
}

export class ZipBuilder {
  private readonly archive: Archiver;
  private readonly output: fs.WriteStream;
  readonly zipPath: string;

  constructor(jobId: string) {
    ensureStorageDir();
    this.zipPath = getZipPath(jobId);
    this.output = fs.createWriteStream(this.zipPath);
    this.archive = createArchiver('zip', { zlib: { level: 0 } });
    this.archive.pipe(this.output);
    this.archive.on('warning', (err: ArchiverError) => {
      if (err.code !== 'ENOENT') log.warn({ err: err.message }, 'archiver warning');
    });
  }

  append(stream: Readable, filename: string): void {
    this.archive.append(stream, { name: filename });
  }

  finalize(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.output.on('close', () => resolve(this.zipPath));
      this.archive.on('error', reject);
      this.output.on('error', reject);
      this.archive.finalize();
    });
  }
}
