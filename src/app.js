const path = require('path');
const cors = require('cors');
const express = require('express');
const crypto = require('crypto');

const { createRealtimeRouter } = require('./routes/realtime');
const { createConversationRouter } = require('./routes/conversation');
const { createMemoryRouter } = require('./routes/memory');
const { createProviderRegistry } = require('./providers/realtime');

function createApp({ models, providers, memoryExtractor } = {}) {
  const app = express();
  const registry = providers || createProviderRegistry();

  const corsOrigin = process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? false : true);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.set('x-request-id', req.id);
    res.set('x-content-type-options', 'nosniff');
    if (req.path.startsWith('/api/')) res.set('cache-control', 'no-store');
    next();
  });
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      realtimeProvider: process.env.REALTIME_PROVIDER || 'openai',
    });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      if (models?.sequelize?.authenticate) await models.sequelize.authenticate();
      res.json({ status: 'ready' });
    } catch (_err) {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/realtime', createRealtimeRouter({ models, providers: registry }));
  app.use('/api/conversation', createConversationRouter({ models, memoryExtractor }));
  app.use('/api/memory', createMemoryRouter({ models }));

  app.use((err, req, res, _next) => {
    console.error('Request failed', {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
      stack: err.stack,
      requestId: req.id,
    });

    const body = {
      error: err.publicMessage || 'Something went wrong.',
      requestId: req.id,
    };

    if (process.env.EXPOSE_ERROR_DETAILS === 'true' && err.details) {
      body.details = err.details;
    }

    res.status(err.statusCode || 500).json(body);
  });

  return app;
}

module.exports = { createApp };
