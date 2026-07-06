const { saveConversationTurn, saveUsageEvent } = require('../services/conversationService');
const { extractAndSaveMemories } = require('../services/memoryService');

function createConversationRouter({ models, memoryExtractor }) {
  const router = require('express').Router();

  router.post('/events', async (req, res, next) => {
    try {
      const userId = req.body.userId;
      const sessionId = req.body.sessionId;
      const incomingEvents = req.body.events || [req.body];

      if (!userId || !sessionId) {
        return res.status(400).json({ error: 'userId and sessionId are required.' });
      }

      const savedTurns = [];
      for (const event of incomingEvents) {
        if (event.role && event.content) {
          const turn = await saveConversationTurn(models, {
            userId,
            sessionId,
            role: event.role,
            content: event.content,
            providerEventId: event.providerEventId || event.eventId || null,
            metadata: {
              providerEventType: event.providerEventType || event.type || null,
              ...(event.metadata || {}),
            },
          });
          if (turn) savedTurns.push(turn.id);
        }

        if (event.usage) {
          await saveUsageEvent(models, {
            userId,
            sessionId,
            provider: event.provider || null,
            model: event.model || null,
            eventType: event.providerEventType || event.type || 'usage',
            usage: event.usage,
            metadata: event.metadata || {},
          });
        }
      }

      res.json({ status: 'ok', savedTurns });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:sessionId/end', async (req, res, next) => {
    try {
      const userId = req.body.userId || req.query.userId;
      const { sessionId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      const session = await models.VoiceSession.findOne({
        where: { id: sessionId, userId },
      });

      if (session) {
        await session.update({
          status: 'ended',
          endedAt: new Date(),
        });
      }

      const result = await extractAndSaveMemories(models, {
        userId,
        sessionId,
        extractor: memoryExtractor,
      });

      res.json({ status: 'ok', memoryExtraction: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createConversationRouter };
