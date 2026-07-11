const {
  listMemories,
  deleteMemory,
  forgetByText,
  updateMemory,
} = require('../services/memoryService');

function createMemoryRouter({ models }) {
  const router = require('express').Router();

  router.get('/', async (req, res, next) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      const memories = await listMemories(models, userId);
      res.json({ memories });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const userId = req.body.userId || req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      const deleted = await deleteMemory(models, {
        userId,
        memoryId: req.params.id,
      });

      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { userId, content, importance, lifespan, expiresInDays } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const memory = await updateMemory(models, {
        userId,
        memoryId: req.params.id,
        content,
        importance,
        lifespan,
        expiresInDays,
      });
      if (!memory) return res.status(404).json({ error: 'Memory not found.' });
      res.json({ memory });
    } catch (err) {
      next(err);
    }
  });

  router.post('/forget', async (req, res, next) => {
    try {
      const { userId, memoryId, text } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      if (memoryId) {
        const deleted = await deleteMemory(models, {
          userId,
          memoryId,
          reason: 'forget_memory_id',
        });
        return res.json({ deleted, matches: deleted ? [memoryId] : [] });
      }

      const matches = await forgetByText(models, { userId, text });
      res.json({ deleted: matches.length > 0, matches });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createMemoryRouter };
