const { encryptText, stableContentHash } = require('./cryptoService');
const { detectCrisis } = require('./safetyService');
const { createMemory } = require('./memoryService');

async function ensureUser(models, userId) {
  if (!models.User || !userId) return;

  if (models.User.findOrCreate) {
    await models.User.findOrCreate({
      where: { id: userId },
      defaults: { id: userId },
    });
    return;
  }

  if (models.User.create) {
    try {
      await models.User.create({ id: userId });
    } catch (_err) {
      // Fake test stores and unique constraints can safely ignore duplicates.
    }
  }
}

async function maybeCreateSafetyMarker(models, { userId, sessionId, content }) {
  if (!detectCrisis(content)) return false;

  const existing = await models.Memory.findOne?.({
    where: {
      userId,
      sourceSessionId: sessionId,
      category: 'safety',
    },
  });

  if (existing) return true;

  await createMemory(models, {
    userId,
    sourceSessionId: sessionId,
    category: 'safety',
    importance: 5,
    isSensitive: true,
    content: 'Possible crisis language appeared in this session; respond calmly, avoid diagnosis, and encourage real-world support if it continues.',
    metadata: { markerOnly: true },
  });

  return true;
}

async function saveConversationTurn(models, {
  userId,
  sessionId,
  role,
  content,
  providerEventId = null,
  metadata = {},
}) {
  await ensureUser(models, userId);

  const cleanContent = String(content || '').trim();
  if (!cleanContent) return null;

  const isCrisis = detectCrisis(cleanContent);
  const encrypted = encryptText(cleanContent);

  const turn = await models.ConversationTurn.create({
    userId,
    sessionId,
    providerEventId,
    role,
    ...encrypted,
    contentHash: stableContentHash(cleanContent),
    isCrisis,
    metadata,
  });

  if (isCrisis) {
    await maybeCreateSafetyMarker(models, { userId, sessionId, content: cleanContent });
  }

  return turn;
}

async function saveUsageEvent(models, {
  userId,
  sessionId,
  provider,
  model,
  eventType,
  usage = {},
  metadata = {},
}) {
  if (!models.UsageEvent) return null;

  return models.UsageEvent.create({
    userId,
    sessionId,
    provider,
    model,
    eventType,
    inputTokens: usage.input_tokens || usage.inputTokens || null,
    outputTokens: usage.output_tokens || usage.outputTokens || null,
    audioInputSeconds: usage.audio_input_seconds || usage.audioInputSeconds || null,
    audioOutputSeconds: usage.audio_output_seconds || usage.audioOutputSeconds || null,
    estimatedCostUsd: usage.estimated_cost_usd || usage.estimatedCostUsd || null,
    metadata,
  });
}

module.exports = {
  ensureUser,
  saveConversationTurn,
  saveUsageEvent,
};
