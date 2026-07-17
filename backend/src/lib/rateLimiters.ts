import rateLimit from 'express-rate-limit';

const limitMessage = (msg: string) => ({ error: msg });

// 10 new jobs per IP per minute — creating a job is expensive (spawns yt-dlp)
export const createJobLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many download requests. Try again in a minute.'),
});

// 120 status polls per IP per minute — frontend polls every 2 s, so 30/min normally
export const statusLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// 20 file downloads per IP per minute
export const fileLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Too many file requests. Try again in a minute.'),
});
