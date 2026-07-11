const { createFakeModels } = require('./fakeModels');
const { saveConversationTurn } = require('../src/services/conversationService');
const { createMemory, extractAndSaveMemories, listMemories, updateMemory } = require('../src/services/memoryService');

describe('memoryService', () => {
  beforeEach(() => {
    process.env.MEMORY_ENCRYPTION_KEY = 'test-secret-that-is-long-enough-for-keying';
  });

  it('extracts, validates, encrypts, and lists memories', async () => {
    const models = createFakeModels();
    const session = await models.VoiceSession.create({
      userId: 'local-user',
      provider: 'openai',
      model: 'gpt-realtime-2',
      status: 'active',
    });

    await saveConversationTurn(models, {
      userId: 'local-user',
      sessionId: session.id,
      role: 'user',
      content: 'Remember that I like quiet late night talks.',
    });
    await saveConversationTurn(models, {
      userId: 'local-user',
      sessionId: session.id,
      role: 'assistant',
      content: 'I will remember that.',
    });

    const result = await extractAndSaveMemories(models, {
      userId: 'local-user',
      sessionId: session.id,
      extractor: async () => ({
        memories: [{
          content: 'The user likes quiet late night talks.',
          category: 'preference',
          importance: 4,
          sensitive: false,
        }],
      }),
    });

    expect(result.memories).toHaveLength(1);
    expect(models.store.Memory[0].encryptedContent).not.toContain('late night');

    const memories = await listMemories(models, 'local-user');
    expect(memories[0].content).toContain('late night');
  });

  it('reinforces exact memories instead of creating duplicates', async () => {
    const models = createFakeModels();
    await createMemory(models, { userId: 'local-user', content: 'The user loves jazz.', importance: 3 });
    const reinforced = await createMemory(models, { userId: 'local-user', content: 'The user loves jazz.', importance: 4 });

    expect(models.store.Memory).toHaveLength(1);
    expect(reinforced.reinforcementCount).toBe(2);
    expect(reinforced.importance).toBe(4);
    expect(models.store.MemoryEvent.at(-1).action).toBe('reinforced');
  });

  it('allows corrections and temporary memories with provenance', async () => {
    const models = createFakeModels();
    const original = await createMemory(models, {
      userId: 'local-user',
      content: 'The user has an interview soon.',
      lifespan: 'temporary',
      expiresInDays: 3,
    });
    expect(original.expiresAt).toBeTruthy();

    const corrected = await updateMemory(models, {
      userId: 'local-user',
      memoryId: original.id,
      content: 'The user has an interview on Friday.',
      lifespan: 'durable',
    });
    expect(corrected.content).toContain('Friday');
    expect(corrected.lifespan).toBe('durable');
    expect(corrected.expiresAt).toBeNull();
    expect(corrected.reason).toContain('corrected');
  });

  it('updates an evolving fact by stable subject instead of keeping a contradiction', async () => {
    const models = createFakeModels();
    const first = await createMemory(models, {
      userId: 'local-user', content: 'The user lives in Nairobi.', category: 'fact', subject: 'home_city',
    });
    const changed = await createMemory(models, {
      userId: 'local-user', content: 'The user now lives in Mombasa.', category: 'fact', subject: 'home_city',
    });

    expect(models.store.Memory).toHaveLength(1);
    expect(changed.id).toBe(first.id);
    expect(changed.content).toContain('Mombasa');
    expect(models.store.MemoryEvent.at(-1).action).toBe('superseded');
  });
});
