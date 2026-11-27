import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { apiRouter } from './routes/index.js';
import { HttpError } from './utils/http-error.js';

export const app = express();

app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    // Non-browser requests may omit Origin; CORS is not authentication.
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new HttpError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed.'));
  },
}));

app.use(express.json({ limit: '100kb' }));
app.use('/api/v1', apiRouter);
app.use(notFound);
app.use(errorHandler);
