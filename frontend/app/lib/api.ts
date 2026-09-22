const API_BASE =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

export type DownloadMode = "audio" | "video";
export type JobState = "waiting" | "active" | "completed" | "failed";

export interface CreateDownloadRequest {
  ids?: string[];
  playlist?: string;
  mode: DownloadMode;
  bitrate?: number;
  quality?: number;
}

export interface CreateDownloadResponse {
  jobId: string;
  status: string;
}

export interface JobStatus {
  status: JobState;
  progress?: number;
  error?: string;
  errorCode?: string;
  fileCount?: number;
  failedCount?: number;
  fileSizeBytes?: number;
  isZip?: boolean;
}

export async function createDownload(
  req: CreateDownloadRequest
): Promise<CreateDownloadResponse> {
  const res = await fetch(`${API_BASE}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<CreateDownloadResponse>;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/downloads/${jobId}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<JobStatus>;
}

export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/downloads/${jobId}/file`;
}
