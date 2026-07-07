const { encryptText, stableContentHash } = require('./cryptoService');
const { detectCrisis } = require('./safetyService');
const { createMemory } = require('./memoryService');

function cleanProfileValue(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

function normalizeUserProfile({ displayName, timezone } = {}) {
  return {
    displayName: cleanProfileValue(displayName),
    timezone: cleanProfileValue(timezone),
  };
}

async function ensureUser(models, userId, profile = {}) {
  if (!models.User || !userId) return;

  const normalizedProfile = normalizeUserProfile(profile);
  const hasProfileUpdate = Object.values(normalizedProfile).some(Boolean);

  if (models.User.findOrCreate) {
    const [user] = await models.User.findOrCreate({
      where: { id: userId },
      defaults: { id: userId, ...normalizedProfile },
    });
    if (hasProfileUpdate && user?.update) {
      await user.update(Object.fromEntries(
        Object.entries(normalizedProfile).filter(([, value]) => value),
      ));
    }
    return user;
  }

  if (models.User.findOne) {
    const existing = await models.User.findOne({ where: { id: userId } });
    if (existing) {
      if (hasProfileUpdate && existing.update) {
        await existing.update(Object.fromEntries(
          Object.entries(normalizedProfile).filter(([, value]) => value),
        ));
      }
      return existing;
    }
  }

  if (models.User.create) {
    try {
      return await models.User.create({ id: userId, ...normalizedProfile });
    } catch (_err) {
      // Fake test stores and unique constraints can safely ignore duplicates.
    }
  }
}

async function getUserProfile(models, userId) {
  if (!models.User?.findOne || !userId) return {};

  const user = await models.User.findOne({ where: { id: userId } });
  if (!user) return {};

  return {
    displayName: user.displayName || null,
    timezone: user.timezone || null,
  };
}

async function ensureUserProfile(models, userId, profile = {}) {
  const user = await ensureUser(models, userId, profile);

  if (user) {
    return {
      displayName: user.displayName || null,
      timezone: user.timezone || null,
    };
  }

  const normalizedProfile = normalizeUserProfile(profile);
  if (Object.values(normalizedProfile).some(Boolean)) {
    return normalizedProfile;
  }

  return getUserProfile(models, userId);
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
  ensureUserProfile,
  getUserProfile,
  normalizeUserProfile,
  saveConversationTurn,
  saveUsageEvent,
};
