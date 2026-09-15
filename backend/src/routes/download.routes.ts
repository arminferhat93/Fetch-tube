import { Router } from 'express';
import { createDownload, getDownloadStatus, downloadFile, uploadCookies } from '../controllers/DownloadController';
import { createJobLimiter, statusLimiter, fileLimiter } from '../lib/rateLimiters';

const router = Router();

router.post('/downloads', createJobLimiter, createDownload);
router.get('/downloads/:jobId/status', statusLimiter, getDownloadStatus);
router.get('/downloads/:jobId/file', fileLimiter, downloadFile);

export = router;
