const path = require('path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT || 3001);
const publicRoot = path.join(__dirname, '..', 'public');

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'preview', realtimeProvider: 'openai' });
});

app.get('/api/memory', (_req, res) => {
  res.json({ memories: [] });
});

app.delete('/api/memory/:id', (_req, res) => {
  res.json({ deleted: true });
});

app.post('/api/memory/forget', (_req, res) => {
  res.json({ forgotten: 0 });
});

app.post('/api/conversation/events', (_req, res) => {
  res.json({ saved: 0 });
});

app.post('/api/conversation/:sessionId/end', (_req, res) => {
  res.json({ ended: true, extractedMemories: 0 });
});

app.post('/api/realtime/session', (_req, res) => {
  res.status(503).json({
    error: 'Preview mode is UI-only. Add .env with Neon DATABASE_URL and OPENAI_API_KEY, then run npm start for live voice.',
  });
});

app.use(express.static(publicRoot));
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicRoot, 'index.html'));
});

app.listen(port, () => {
  console.log(`Mira Voice preview listening on http://localhost:${port}`);
});
