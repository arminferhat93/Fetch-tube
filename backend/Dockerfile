# ── production dependencies only ─────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── runtime ───────────────────────────────────────
FROM node:22-alpine

# ffmpeg: audio transcoding   yt-dlp: YouTube download engine
RUN apk add --no-cache ffmpeg yt-dlp

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 4000
CMD ["npm", "run", "start:docker"]
