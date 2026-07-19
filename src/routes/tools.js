const { createWebResearch } = require('../services/webResearchService');

function createToolsRouter({ webResearch = createWebResearch } = {}) {
  const router = require('express').Router();

  router.post('/web-research', async (req, res, next) => {
    try {
      const result = await webResearch({ query: req.body.query });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createToolsRouter };
