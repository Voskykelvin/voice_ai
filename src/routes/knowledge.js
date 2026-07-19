const {
  createKnowledgeAsset,
  deleteKnowledgeAsset,
  listKnowledgeAssets,
} = require('../services/knowledgeService');

function createKnowledgeRouter({ models, imageDescriber } = {}) {
  const router = require('express').Router();

  router.get('/', async (req, res, next) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const assets = await listKnowledgeAssets(models, userId);
      res.json({ assets });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const asset = await createKnowledgeAsset(models, {
        userId: req.body.userId,
        name: req.body.name,
        kind: req.body.kind,
        mimeType: req.body.mimeType,
        textContent: req.body.textContent,
        imageDataUrl: req.body.imageDataUrl,
        imageDescriber,
      });
      res.status(201).json({ asset });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const userId = req.body.userId || req.query.userId;
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const deleted = await deleteKnowledgeAsset(models, { userId, assetId: req.params.id });
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createKnowledgeRouter };
