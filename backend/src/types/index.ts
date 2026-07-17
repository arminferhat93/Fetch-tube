export type DownloadMode = 'audio' | 'video';

export interface DownloadOptions {
  mode: DownloadMode;
  bitrate?: number;
  quality?: number;
  cookies?: string;
}

export interface DownloadJobData {
  ids?: string[];
  playlist?: string;
  mode: DownloadMode;
  bitrate?: number;
  quality?: number;
}

export interface DownloadJobResult {
  filePath: string;
  filename: string;
  fileCount: number;
  failedCount: number;
  fileSizeBytes: number;
  isZip: boolean;
}

export interface CreateDownloadRequest {
  ids?: string[];
  playlist?: string | null;
  mode?: DownloadMode;
  bitrate?: number;
  quality?: number;
}
