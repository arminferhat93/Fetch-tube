# ── production dependencies only ─────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── runtime ───────────────────────────────────────
FROM node:22-alpine

# ffmpeg: audio transcoding   yt-dlp: YouTube download engine (pip for latest version)
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    python3 -m venv /opt/yt-dlp && \
    /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp
ENV PATH="/opt/yt-dlp/bin:$PATH"

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 4000
CMD ["npm", "run", "start:docker"]
