declare function gtag(...args: unknown[]): void;

function fire(eventName: string, params: Record<string, unknown>): void {
  if (typeof gtag === "undefined") return;
  gtag("event", eventName, params);
}

export type InputType = "playlist" | "ids";

export function trackDownloadStarted(params: {
  mode: string;
  inputType: InputType;
  trackCount: number;
  bitrate?: number;
  quality?: number;
}): void {
  fire("download_started", {
    mode:        params.mode,
    input_type:  params.inputType,
    track_count: params.trackCount,
    ...(params.bitrate  !== undefined && { bitrate_kbps:  params.bitrate  }),
    ...(params.quality  !== undefined && { quality_p:     params.quality  }),
  });
}

export function trackDownloadCompleted(params: {
  mode: string;
  inputType: InputType;
  fileCount: number;
  failedCount: number;
  zipSizeBytes: number;
}): void {
  fire("download_completed", {
    mode:            params.mode,
    input_type:      params.inputType,
    file_count:      params.fileCount,
    failed_count:    params.failedCount,
    zip_size_bytes:  params.zipSizeBytes,
    zip_size_mb:     parseFloat((params.zipSizeBytes / 1_048_576).toFixed(2)),
  });
}

export function trackDownloadFailed(params: {
  mode: string;
  inputType: InputType;
  errorMessage: string;
}): void {
  fire("download_failed", {
    mode:          params.mode,
    input_type:    params.inputType,
    error_message: params.errorMessage,
  });
}
