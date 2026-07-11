const { saveConversationTurn, saveUsageEvent } = require('../services/conversationService');
const { extractAndSaveMemories } = require('../services/memoryService');
const { getRecentTurns } = require('../services/memoryService');
const { evaluateConversation } = require('../services/conversationQualityService');

function cleanClientMetrics(metrics = {}) {
  const safe = {};
  for (const key of ['connectionLatencyMs', 'reconnectAttempts']) {
    const value = Number(metrics[key]);
    if (Number.isFinite(value) && value >= 0) safe[key] = value;
  }
  return safe;
}

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

      const turns = await getRecentTurns(models, userId, sessionId, 100);
      const quality = evaluateConversation(turns);

      if (session) {
        await session.update({
          status: 'ended',
          endedAt: new Date(),
          metadata: {
            ...(session.metadata || {}),
            quality,
            clientMetrics: cleanClientMetrics(req.body.metrics),
          },
        });
      }

      let result;
      try {
        result = await extractAndSaveMemories(models, {
          userId,
          sessionId,
          extractor: memoryExtractor,
        });
      } catch (err) {
        console.error('Memory extraction failed after session end', {
          sessionId,
          name: err.name,
          message: err.message,
        });
        result = { skipped: true, memories: [], reason: 'Memory extraction will need to be retried.' };
      }

      res.json({ status: 'ok', memoryExtraction: result, quality });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createConversationRouter };
