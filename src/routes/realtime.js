const persona = require('../config/persona');
const { buildRealtimeInstructions, getTimeOfDay } = require('../services/promptService');
const { getRelevantMemories, getRecentTurns } = require('../services/memoryService');
const { ensureUser } = require('../services/conversationService');

function createRealtimeRouter({ models, providers }) {
  const router = require('express').Router();

  router.post('/session', async (req, res, next) => {
    try {
      const userId = req.body.userId;
      const providerName = req.body.provider || process.env.REALTIME_PROVIDER || 'openai';
      const sdpOffer = req.body.sdpOffer;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }
      if (!sdpOffer) {
        return res.status(400).json({ error: 'sdpOffer is required.' });
      }

      await ensureUser(models, userId);

      const provider = providers.get(providerName);
      const session = await models.VoiceSession.create({
        userId,
        provider: provider.name,
        status: 'creating',
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
        metadata: {},
      });

      const [memories, recentTurns] = await Promise.all([
        getRelevantMemories(models, userId),
        getRecentTurns(models, userId, session.id),
      ]);

      const instructions = buildRealtimeInstructions({
        memories,
        recentTurns,
        timeOfDay: getTimeOfDay(),
        personaConfig: persona,
      });

      const sessionConfig = provider.buildSessionConfig({ instructions, userId, sessionId: session.id });
      const providerSession = await provider.createSession({
        sdpOffer,
        sessionConfig,
        userId,
        sessionId: session.id,
      });

      await session.update({
        providerSessionId: providerSession.providerSessionId,
        status: 'active',
        model: providerSession.model || sessionConfig.model,
        voice: providerSession.voice || sessionConfig.audio?.output?.voice || null,
        metadata: {
          timeOfDay: getTimeOfDay(),
          memoryCount: memories.length,
        },
      });

      res.json({
        sessionId: session.id,
        provider: provider.name,
        model: providerSession.model || sessionConfig.model,
        voice: providerSession.voice || null,
        sdpAnswer: providerSession.sdpAnswer,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createRealtimeRouter };
