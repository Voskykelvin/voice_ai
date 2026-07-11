const persona = require('../config/persona');
const {
  buildRealtimeInstructions,
  formatCurrentLocalTime,
  getTimeOfDay,
  normalizeSessionMode,
} = require('../services/promptService');
const { getRelevantMemories, getRecentTurns } = require('../services/memoryService');
const { ensureUserProfile } = require('../services/conversationService');
const { createGeminiLiveSessionToken } = require('../services/geminiLiveService');
const { cleanLocation, getLocalWeatherContext } = require('../services/localContextService');
const { inferConversationState } = require('../services/conversationStateService');

async function buildRequestContext({ models, req, userId }) {
  const location = cleanLocation(req.body.location);
  const [savedProfile, weatherContext] = await Promise.all([
    ensureUserProfile(models, userId, {
      displayName: req.body.displayName,
      timezone: req.body.timezone,
    }),
    getLocalWeatherContext({ location }),
  ]);
  const userProfile = { ...savedProfile, location };
  const now = new Date();
  const timeOfDay = getTimeOfDay(now, userProfile.timezone);
  const sessionMode = normalizeSessionMode(req.body.sessionMode);

  return {
    userProfile,
    timeOfDay,
    sessionMode,
    localContext: {
      currentLocalTime: formatCurrentLocalTime(now, userProfile.timezone),
      ...(weatherContext || {}),
    },
  };
}

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

      const [requestContext, memories, recentTurns] = await Promise.all([
        buildRequestContext({ models, req, userId }),
        getRelevantMemories(models, userId),
        getRecentTurns(models, userId),
      ]);
      const { userProfile, timeOfDay, sessionMode, localContext } = requestContext;

      const provider = providers.get(providerName);
      const session = await models.VoiceSession.create({
        userId,
        provider: provider.name,
        status: 'creating',
        model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
        metadata: {},
      });

      const instructions = buildRealtimeInstructions({
        memories,
        recentTurns,
        conversationState: inferConversationState(recentTurns),
        userProfile,
        localContext,
        sessionMode,
        timeOfDay,
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
          timeOfDay,
          sessionMode,
          memoryCount: memories.length,
          localContext,
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

  router.post('/gemini/session', async (req, res, next) => {
    try {
      const userId = req.body.userId;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
      }

      const [requestContext, memories, recentTurns] = await Promise.all([
        buildRequestContext({ models, req, userId }),
        getRelevantMemories(models, userId),
        getRecentTurns(models, userId),
      ]);
      const { userProfile, timeOfDay, sessionMode, localContext } = requestContext;

      const session = await models.VoiceSession.create({
        userId,
        provider: 'gemini',
        status: 'creating',
        model: process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview',
        voice: process.env.GEMINI_LIVE_VOICE || 'Kore',
        metadata: {},
      });

      const instructions = buildRealtimeInstructions({
        memories,
        recentTurns,
        conversationState: inferConversationState(recentTurns),
        userProfile,
        localContext,
        sessionMode,
        timeOfDay,
        personaConfig: persona,
      });

      const providerSession = await createGeminiLiveSessionToken({ instructions });

      await session.update({
        providerSessionId: null,
        status: 'active',
        model: providerSession.model,
        voice: providerSession.voice,
        metadata: {
          timeOfDay,
          sessionMode,
          memoryCount: memories.length,
          tokenMode: 'ephemeral',
          localContext,
        },
      });

      res.json({
        sessionId: session.id,
        provider: 'gemini',
        model: providerSession.model,
        voice: providerSession.voice,
        wsUrl: providerSession.wsUrl,
        setup: providerSession.setup,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createRealtimeRouter };
