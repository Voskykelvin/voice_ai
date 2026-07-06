const path = require('path');
const cors = require('cors');
const express = require('express');

const { createRealtimeRouter } = require('./routes/realtime');
const { createConversationRouter } = require('./routes/conversation');
const { createMemoryRouter } = require('./routes/memory');
const { createProviderRegistry } = require('./providers/realtime');

function createApp({ models, providers, memoryExtractor } = {}) {
  const app = express();
  const registry = providers || createProviderRegistry();

  app.use(cors({ origin: process.env.APP_ORIGIN || true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      realtimeProvider: process.env.REALTIME_PROVIDER || 'openai',
    });
  });

  app.use('/api/realtime', createRealtimeRouter({ models, providers: registry }));
  app.use('/api/conversation', createConversationRouter({ models, memoryExtractor }));
  app.use('/api/memory', createMemoryRouter({ models }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.publicMessage || 'Something went wrong.',
    });
  });

  return app;
}

module.exports = { createApp };
