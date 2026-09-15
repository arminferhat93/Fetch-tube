import createError from 'http-errors';
import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import http from 'http';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import { logger } from './src/lib/logger';
import downloadRoutes from './src/routes/download.routes';
import { startDownloadWorker } from './src/jobs/DownloadWorker';

const app = express();

// Security headers — CSP off because Swagger UI uses inline scripts
app.use(helmet({ contentSecurityPolicy: false }));

// CORS — restrict to a known origin in production via CORS_ORIGIN env var
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use(cors({ origin: corsOrigin }));

// HTTP request logging
app.use(pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
}));

// Body parsing — 10 kb cap prevents oversized-payload attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

app.use(express.static(path.join(__dirname, 'public')));

// Tell all crawlers to stay away — this is a private tool, not a public website
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// Swagger UI
const swaggerDoc = yaml.load(
  fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8'),
) as object;
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// Text body parser scoped to the cookies upload endpoint
app.use('/api/cookies', express.text({ limit: '2mb', type: 'text/plain' }));

// API routes (rate limiters applied per-route inside the router)
app.use('/api', downloadRoutes);

// 404
app.use((_req, _res, next) => {
  next(createError(404));
});

// Error handler — always JSON
app.use((err: { status?: number; statusCode?: number; message?: string }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: err.message ?? 'Internal server error' });
});

// Background worker (shares process with the HTTP server)
startDownloadWorker();

const port = Number(process.env.PORT ?? 4000);
http.createServer(app).listen(port, () => {
  logger.info({ port }, 'server listening');
});
