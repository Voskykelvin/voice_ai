const { createFakeModels } = require('./fakeModels');
const { saveConversationTurn } = require('../src/services/conversationService');
const { extractAndSaveMemories, listMemories } = require('../src/services/memoryService');

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
});
