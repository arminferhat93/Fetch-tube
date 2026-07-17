---
name: youtube-download-backend
description: Build and maintain the YouTube download backend using Node.js, Express, TypeScript, BullMQ, Workers and streaming ZIP downloads.
---

# YouTube Download Backend Skill

## Goal

Build and maintain a production-ready backend service for downloading content from YouTube.

The project already contains a Node.js Express backend. Extend it without breaking existing functionality.

The existing `download-mp3.js` script is the download engine and must be converted to TypeScript while preserving its functionality.

---

# Existing Project

Current backend folder contains:

- Express server
- Existing APIs
- download-mp3.js

The download script should become reusable application code instead of a standalone CLI script.

Convert:

```
download-mp3.js
```

into

```
download-mp3.ts
```

The download logic should expose reusable TypeScript functions that can be called from workers.

---

# Architecture

Implement asynchronous downloads using BullMQ.

```
Client
    │
    ▼
POST /downloads
    │
    ▼
Create BullMQ Job
    │
    ▼
Return HTTP 202

{
    jobId
}

──────────── Background Worker ────────────

Worker
    │
    ▼
Download requested media

(5-10 concurrent downloads)

    │
    ▼
Receive HTTPS streams

    │
    ▼
Stream directly into archiver ZIP

(No temporary song files)

    │
    ▼
Store finished ZIP

/tmp/downloads/{jobId}.zip

    │
    ▼
Update BullMQ Job

status = completed

───────────────────────────────────────────

Client

GET /downloads/:jobId/status

↓

completed

↓

GET /downloads/:jobId/file

↓

ZIP download
```

---

# Required APIs

## 1. Create Download Job

```
POST /api/downloads
```

Supported request:

```json
{
    "ids": [
        "dQw4w9WgXcQ",
        "ScMzIvxBSi4"
    ],
    "playlist": null,
    "mode": "audio",
    "bitrate": 320,
    "quality": 1080
}
```

Supported options

### Audio

Equivalent CLI

```
download-mp3 --ids id1,id2
```

### Video

```
download-mp3 --ids id1 --mode video
```

### Playlist

```
download-mp3 --playlist PLxxxx
```

### Bitrate

```
--bitrate 320
```

### Quality

```
--quality 1080
```

Response

```
202 Accepted

{
    "jobId": "...",
    "status": "processing"
}
```

---

## 2. Job Status

```
GET /api/downloads/:jobId/status
```

Returns

```json
{
    "status":"waiting"
}
```

```json
{
    "status":"active",
    "progress":52
}
```

```json
{
    "status":"completed"
}
```

```json
{
    "status":"failed",
    "error":"..."
}
```

---

## 3. Download Finished ZIP

```
GET /api/downloads/:jobId/file
```

Behavior

If job isn't finished

```
409
```

If completed

```
Stream ZIP to client
```

Delete temporary ZIP after configured TTL.

---

# Worker Requirements

Worker must

- process BullMQ jobs
- support retries
- support cancellation
- clean temporary files
- report progress
- handle failures gracefully

---

# Download Pipeline

The worker must NOT download every song first.

Instead:

```
HTTPS GET

↓

Readable Stream

↓

archiver.append(stream)

↓

ZIP

↓

Temporary ZIP

↓

Finished ZIP
```

Music files must never be fully buffered in memory.

Always stream.

---

# Parallel Downloads

The worker should fetch media concurrently.

Maximum concurrency:

```
5-10 downloads
```

Use a concurrency limiter.

Do not start hundreds of downloads simultaneously.

---

# ZIP

Use

```
archiver
```

Compression

```
zlib level = 0
```

Music is already compressed.

Avoid wasting CPU.

---

# Storage

Temporary ZIP location

```
/tmp/downloads
```

or configurable storage directory.

Finished ZIP expires automatically.

---

# Project Structure

Suggested structure

```
src/

api/
workers/
queues/
services/
download/
utils/

download/

download-mp3.ts

jobs/

DownloadWorker.ts

services/

DownloadService.ts
ZipService.ts

queues/

download.queue.ts

controllers/

DownloadController.ts

routes/

download.routes.ts
```

---

# Tech Stack

- Node.js
- Express
- TypeScript
- BullMQ
- Redis
- Archiver
- Node Streams

---

# TypeScript

Requirements

- strict mode
- no any
- proper interfaces
- reusable services
- dependency injection where appropriate

Never write JavaScript.

---

# Coding Rules

- Keep files under 300 lines where practical.
- Prefer composition over inheritance.
- Keep controllers thin.
- Business logic belongs in services.
- Workers should contain orchestration only.
- Avoid duplicated code.
- Use async/await.
- Handle stream errors correctly.
- Validate all request input.
- Add logging for every job lifecycle event.

---

# Before Making Changes

Always:

1. Read related files.
2. Understand existing architecture.
3. Explain the implementation plan.
4. Wait for approval before major refactors.
5. Preserve backward compatibility.

---

# Never

- Delete existing APIs.
- Break existing functionality.
- Change public API contracts without approval.
- Buffer entire media files into memory.
- Create unnecessary temporary media files.

---

# Deliverables

For every completed task provide:

## Files Changed

List every modified file.

## Why

Explain why each change was necessary.

## Risks

Mention possible edge cases or production risks.

## Next Steps

Suggest logical follow-up improvements if applicable.

create swagger for this, readme documentation for running  
