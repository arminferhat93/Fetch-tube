# YouTube Downloader

Download YouTube videos and playlists as MP3 or MP4, packed into a single ZIP. Paste a URL or playlist link, pick your format, and get a ZIP back.

**Stack:** React (React Router v7) · Node/Express · BullMQ · Redis · yt-dlp · Docker

---

## Quick start (Docker)

The recommended way to run everything locally. Redis, backend, and frontend all start with one command.

```bash
# 1. Copy the env file and fill in any values you want to change
cp .env.example .env   # or just edit .env directly — defaults work out of the box

# 2. Start all services
docker compose up
```

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000        |
| Backend  | http://localhost:4000        |
| Swagger  | http://localhost:4000/api-docs |

Hot reload is enabled for both frontend and backend — save a file and changes apply instantly.

---

## Running without Docker

You need **yt-dlp**, **ffmpeg**, **Redis**, and **Node.js 18+** installed locally.

```bash
# macOS — install system deps
brew install yt-dlp ffmpeg redis
brew services start redis

# Install dependencies for both services
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Start backend + frontend together from the root
npm install
npm run dev
```

---

## Environment variables

All variables live in a single `.env` file at the project root.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Backend port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `STORAGE_DIR` | `/tmp/downloads` | Where finished ZIPs are stored |
| `DOWNLOAD_CONCURRENCY` | `5` | Max parallel yt-dlp processes per job |
| `WORKER_CONCURRENCY` | `3` | Max parallel BullMQ jobs |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `DEV_KEEP_FILES` | `false` | Keep raw track files on disk before zipping (dev debug) |
| `VITE_API_URL` | `http://localhost:4000` | Backend URL used by the frontend |
| `VITE_GA_MEASUREMENT_ID` | _(empty)_ | Google Analytics 4 Measurement ID — tracking is disabled when blank |
| `FRONTEND_PORT` | `3000` | Host port for the frontend container |
| `BACKEND_PORT` | `4000` | Host port for the backend container |
| `REDIS_PORT` | `6379` | Host port for the Redis container |

---

## API

### POST `/api/downloads`

Enqueue a download job.

**Request body**

| Field | Type | Default | Description |
|---|---|---|---|
| `ids` | `string[]` | — | YouTube video IDs or full URLs |
| `playlist` | `string` | — | YouTube playlist ID |
| `mode` | `audio` \| `video` | `audio` | Output format |
| `bitrate` | `128` \| `192` \| `320` | `192` | MP3 kbps (audio only) |
| `quality` | `720` \| `1080` \| `1440` \| `2160` | `1080` | Max height px (video only) |

At least one of `ids` or `playlist` is required.

```bash
curl -X POST http://localhost:4000/api/downloads \
  -H 'Content-Type: application/json' \
  -d '{"ids":["dQw4w9WgXcQ"],"mode":"audio","bitrate":320}'
```

**Response** `202 Accepted`

```json
{ "jobId": "42", "status": "processing" }
```

---

### GET `/api/downloads/:jobId/status`

Poll job progress.

```bash
curl http://localhost:4000/api/downloads/42/status
```

**Responses**

```json
{ "status": "waiting" }
{ "status": "active", "progress": 52 }
{ "status": "completed", "fileCount": 12, "failedCount": 0, "zipSizeBytes": 48234567 }
{ "status": "failed", "error": "yt-dlp exited with code 1" }
```

---

### GET `/api/downloads/:jobId/file`

Download the finished ZIP. Only available when `status = completed`.
The file is deleted 1 hour after this endpoint is first called.

```bash
curl -OJ http://localhost:4000/api/downloads/42/file
```

| Status | Meaning |
|---|---|
| `404` | Job not found |
| `409` | Job not completed yet |
| `410` | File expired or missing |

---

## How a download works

```
POST /api/downloads
    │
    ▼
BullMQ job created → 202 Accepted

────────── Background Worker ──────────

1. Resolve IDs (expand playlist if needed)
2. Fetch video titles concurrently
3. Per batch of 5:
   Audio → yt-dlp stdout piped directly into ZIP (no temp file)
   Video → yt-dlp writes temp file → stream into ZIP → delete temp
4. archiver.finalize() → STORAGE_DIR/{jobId}.zip
5. Job marked completed with fileCount, failedCount, zipSizeBytes

───────────────────────────────────────

GET /api/downloads/:jobId/file
    │
    ▼
Stream ZIP → client → schedule delete after 1 hour
```

ZIP is named after the playlist title, single track title, or `download-{jobId}.zip` for multi-ID batches.

---

## Project structure

```
youtube-downloader/
├── .env                          all environment variables
├── docker-compose.yml            single compose file for all services
├── package.json                  root scripts (npm run dev runs both services)
│
├── backend/
│   ├── app.js                    Express app entry point
│   └── src/
│       ├── types/index.ts        shared interfaces
│       ├── lib/logger.ts         pino logger singleton
│       ├── download/
│       │   └── download-mp3.ts   yt-dlp wrappers (stream, metadata, playlist)
│       ├── queues/
│       │   └── download.queue.ts BullMQ queue + Redis connection
│       ├── services/
│       │   ├── DownloadService.ts orchestration (resolve → fetch → batch → zip)
│       │   └── ZipService.ts      ZipBuilder, cleanup helpers
│       ├── jobs/
│       │   └── DownloadWorker.ts  BullMQ worker
│       ├── controllers/
│       │   └── DownloadController.ts
│       └── routes/
│           └── download.routes.ts
│
└── frontend/
    └── app/
        ├── root.tsx              HTML shell, GA4 script injection
        ├── routes/home.tsx       download form + polling UI
        ├── components/Toast.tsx  toast notification system
        └── lib/
            ├── api.ts            typed API client
            └── analytics.ts      GA4 event helpers
```

---

## Troubleshooting

**`ECONNREFUSED` on port 6379** — Redis is not running. With Docker: `docker compose up redis`. Locally: `brew services start redis`.

**`yt-dlp not found`** — Install yt-dlp and make sure it's on your `PATH`: `which yt-dlp`.

**`ffmpeg not found`** — Install ffmpeg and make sure it's on your `PATH`: `which ffmpeg`.

**`409 Job not completed yet`** — The job is still running. Keep polling `/status` until `completed`.

**`410 File has expired`** — The ZIP was already downloaded and cleaned up (1 hour TTL). Re-submit the job.

**Port already in use** — Change `BACKEND_PORT` or `FRONTEND_PORT` in `.env`.
# Fetch-tube
