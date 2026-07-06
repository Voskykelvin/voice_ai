const { encryptText, decryptText, stableContentHash } = require('./cryptoService');
const { createMemoryExtraction } = require('./openaiTextService');

function clampImportance(value) {
  const number = Number(value || 3);
  return Math.max(1, Math.min(5, Number.isFinite(number) ? number : 3));
}

function decryptMemory(memory) {
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
  };
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

  return memories.map(decryptMemory);
}

async function getRecentTurns(models, userId, sessionId, limit = 12) {
  const turns = await models.ConversationTurn.findAll({
    where: { userId, sessionId },
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

  return memories.map(decryptMemory);
}

async function createMemory(models, {
  userId,
  content,
  category = 'fact',
  importance = 3,
  isSensitive = false,
  sourceSessionId = null,
  metadata = {},
}) {
  const encrypted = encryptText(content);
  const memory = await models.Memory.create({
    userId,
    ...encrypted,
    contentHash: stableContentHash(content),
    category,
    importance: clampImportance(importance),
    isSensitive: Boolean(isSensitive || category === 'sensitive' || category === 'safety'),
    sourceSessionId,
    lastReferencedAt: new Date(),
    metadata,
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

  const result = await extractor({ transcript });
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
      metadata: { extractor: process.env.MEMORY_EXTRACT_MODEL || 'gpt-5.4-nano' },
    }));
  }

  return { skipped: false, memories: saved };
}

module.exports = {
  getRelevantMemories,
  getRecentTurns,
  listMemories,
  createMemory,
  deleteMemory,
  forgetByText,
  extractAndSaveMemories,
  decryptMemory,
  decryptTurn,
};
