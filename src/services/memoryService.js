const { encryptText, decryptText, stableContentHash } = require('./cryptoService');
const { createMemoryExtraction } = require('./memoryExtractionService');

function clampImportance(value) {
  const number = Number(value || 3);
  return Math.max(1, Math.min(5, Number.isFinite(number) ? number : 3));
}

function decryptMemory(memory) {
  const metadata = memory.metadata || {};
  return {
    id: memory.id,
    userId: memory.userId,
    content: memory.content || decryptText(memory),
    category: memory.category,
    importance: memory.importance,
    isSensitive: Boolean(memory.isSensitive),
    sourceSessionId: memory.sourceSessionId,
    lastReferencedAt: memory.lastReferencedAt,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    lifespan: metadata.lifespan || 'durable',
    expiresAt: metadata.expiresAt || null,
    reason: metadata.reason || 'Mira heard this in a conversation and judged it useful for continuity.',
    reinforcementCount: Number(metadata.reinforcementCount || 1),
  };
}

function isExpired(memory, now = Date.now()) {
  const expiresAt = memory.metadata?.expiresAt;
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= now);
}

function decryptTurn(turn) {
  return {
    id: turn.id,
    userId: turn.userId,
    sessionId: turn.sessionId,
    role: turn.role,
    content: turn.content || decryptText(turn),
    isCrisis: Boolean(turn.isCrisis),
    metadata: turn.metadata || {},
    createdAt: turn.createdAt,
  };
}

async function getRelevantMemories(models, userId, limit = 15) {
  const memories = await models.Memory.findAll({
    where: { userId },
    order: [
      ['importance', 'DESC'],
      ['lastReferencedAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
  });

  return memories.filter((memory) => !isExpired(memory)).map(decryptMemory);
}

async function getRecentTurns(models, userId, sessionId = null, limit = 12) {
  const where = sessionId ? { userId, sessionId } : { userId };
  const turns = await models.ConversationTurn.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
  });

  return turns.reverse().map(decryptTurn);
}

async function listMemories(models, userId) {
  const memories = await models.Memory.findAll({
    where: { userId },
    order: [
      ['importance', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  return memories.filter((memory) => !isExpired(memory)).map(decryptMemory);
}

function buildExpiry(lifespan, expiresInDays) {
  if (lifespan !== 'temporary') return null;
  const days = Math.max(1, Math.min(365, Number(expiresInDays) || 7));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function createMemory(models, {
  userId,
  content,
  category = 'fact',
  importance = 3,
  isSensitive = false,
  sourceSessionId = null,
  metadata = {},
  lifespan = 'durable',
  expiresInDays = null,
  subject = null,
}) {
  const cleanContent = String(content || '').trim();
  const contentHash = stableContentHash(cleanContent);
  const duplicate = await models.Memory.findOne?.({ where: { userId, contentHash } });
  if (duplicate && !isExpired(duplicate)) {
    const reinforcementCount = Number(duplicate.metadata?.reinforcementCount || 1) + 1;
    await duplicate.update({
      importance: Math.max(duplicate.importance || 3, clampImportance(importance)),
      lastReferencedAt: new Date(),
      metadata: { ...duplicate.metadata, reinforcementCount, lastReinforcedAt: new Date().toISOString() },
    });
    await models.MemoryEvent.create({
      userId,
      memoryId: duplicate.id,
      action: 'reinforced',
      reason: 'duplicate_extraction',
      metadata: { reinforcementCount },
    });
    return decryptMemory(duplicate);
  }

  if (subject) {
    const candidates = await models.Memory.findAll({ where: { userId } });
    const evolving = candidates.find((item) => !isExpired(item) && item.metadata?.subject === subject);
    if (evolving) {
      await evolving.update({
        ...encryptText(cleanContent),
        contentHash,
        category,
        importance: clampImportance(importance),
        isSensitive: Boolean(isSensitive || category === 'sensitive' || category === 'safety'),
        sourceSessionId,
        lastReferencedAt: new Date(),
        metadata: {
          ...(evolving.metadata || {}),
          ...metadata,
          subject,
          lifespan: lifespan === 'temporary' ? 'temporary' : 'durable',
          expiresAt: buildExpiry(lifespan === 'temporary' ? 'temporary' : 'durable', expiresInDays),
          updatedFromConversationAt: new Date().toISOString(),
          reason: metadata.reason || 'Mira updated an earlier memory when your situation changed.',
        },
      });
      await models.MemoryEvent.create({
        userId,
        memoryId: evolving.id,
        action: 'superseded',
        reason: 'evolving_fact',
        metadata: { subject },
      });
      return decryptMemory(evolving);
    }
  }

  const encrypted = encryptText(cleanContent);
  const normalizedLifespan = lifespan === 'temporary' ? 'temporary' : 'durable';
  const memory = await models.Memory.create({
    userId,
    ...encrypted,
    contentHash,
    category,
    importance: clampImportance(importance),
    isSensitive: Boolean(isSensitive || category === 'sensitive' || category === 'safety'),
    sourceSessionId,
    lastReferencedAt: new Date(),
    metadata: {
      ...metadata,
      lifespan: normalizedLifespan,
      expiresAt: buildExpiry(normalizedLifespan, expiresInDays),
      reinforcementCount: 1,
      reason: metadata.reason || 'Mira heard this in a conversation and judged it useful for continuity.',
      subject: subject || null,
    },
  });

  await models.MemoryEvent.create({
    userId,
    memoryId: memory.id,
    action: 'created',
    reason: 'memory_extraction',
    metadata: { category },
  });

  return decryptMemory(memory);
}

async function updateMemory(models, { userId, memoryId, content, importance, lifespan, expiresInDays }) {
  const memory = await models.Memory.findOne({ where: { id: memoryId, userId } });
  if (!memory) return null;

  const changes = {};
  if (content !== undefined) {
    const cleanContent = String(content).trim();
    if (!cleanContent) throw new Error('Memory content cannot be empty.');
    Object.assign(changes, encryptText(cleanContent), { contentHash: stableContentHash(cleanContent) });
  }
  if (importance !== undefined) changes.importance = clampImportance(importance);
  if (lifespan !== undefined) {
    const normalized = lifespan === 'temporary' ? 'temporary' : 'durable';
    changes.metadata = {
      ...(memory.metadata || {}),
      lifespan: normalized,
      expiresAt: buildExpiry(normalized, expiresInDays),
      correctedAt: new Date().toISOString(),
      reason: 'You reviewed or corrected this memory.',
    };
  } else {
    changes.metadata = { ...(memory.metadata || {}), correctedAt: new Date().toISOString(), reason: 'You reviewed or corrected this memory.' };
  }

  await memory.update(changes);
  await models.MemoryEvent.create({ userId, memoryId, action: 'updated', reason: 'user_correction', metadata: {} });
  return decryptMemory(memory);
}

async function deleteMemory(models, { userId, memoryId, reason = 'user_delete' }) {
  const memory = await models.Memory.findOne({ where: { id: memoryId, userId } });
  if (!memory) return false;

  await memory.destroy();
  await models.MemoryEvent.create({
    userId,
    memoryId,
    action: 'deleted',
    reason,
    metadata: {},
  });

  return true;
}

async function forgetByText(models, { userId, text }) {
  const needle = String(text || '').trim().toLowerCase();
  if (!needle) return [];

  const memories = await listMemories(models, userId);
  const matches = memories.filter((memory) => memory.content.toLowerCase().includes(needle));

  for (const memory of matches) {
    await deleteMemory(models, {
      userId,
      memoryId: memory.id,
      reason: 'forget_text_match',
    });
  }

  return matches;
}

async function extractAndSaveMemories(models, {
  userId,
  sessionId,
  extractor = createMemoryExtraction,
} = {}) {
  const turns = await getRecentTurns(models, userId, sessionId, 80);
  if (turns.length < 2) {
    return { skipped: true, memories: [], reason: 'Not enough conversation yet.' };
  }

  const transcript = turns
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n');

  const existingMemories = await listMemories(models, userId);
  const result = await extractor({ transcript, existingMemories });
  if (result.skipped) return result;

  const saved = [];
  for (const item of result.memories || []) {
    if (!item.content || !String(item.content).trim()) continue;
    saved.push(await createMemory(models, {
      userId,
      content: item.content.trim(),
      category: item.category || 'fact',
      importance: item.importance || 3,
      isSensitive: item.sensitive || item.category === 'sensitive' || item.category === 'safety',
      sourceSessionId: sessionId,
      metadata: {
        extractorProvider: process.env.MEMORY_EXTRACT_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'gemini'),
        extractor: process.env.MEMORY_EXTRACT_MODEL || process.env.GEMINI_MEMORY_MODEL || 'gpt-5.4-nano',
        reason: item.reason || 'Mira extracted this because it may help personalize future conversations.',
      },
      lifespan: item.lifespan || 'durable',
      expiresInDays: item.expiresInDays,
      subject: item.subject,
    }));
  }

  return { skipped: false, memories: saved };
}

module.exports = {
  getRelevantMemories,
  getRecentTurns,
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  forgetByText,
  extractAndSaveMemories,
  decryptMemory,
  decryptTurn,
};
