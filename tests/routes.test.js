const request = require('supertest');
const { createApp } = require('../src/app');
const { createFakeModels } = require('./fakeModels');

function createMockProviders(calls = {}) {
  return {
    get() {
      return {
        name: 'openai',
        buildSessionConfig({ instructions }) {
          calls.instructions = instructions;
          return {
            type: 'realtime',
            model: 'gpt-realtime-2',
            instructions,
            audio: { output: { voice: 'marin' } },
          };
        },
        async createSession() {
          return {
            sdpAnswer: 'mock-answer-sdp',
            model: 'gpt-realtime-2',
            voice: 'marin',
          };
        },
      };
    },
  };
}

describe('API routes', () => {
  beforeEach(() => {
    process.env.MEMORY_ENCRYPTION_KEY = 'test-secret-that-is-long-enough-for-keying';
  });

  it('creates a realtime session', async () => {
    const models = createFakeModels();
    const app = createApp({ models, providers: createMockProviders() });

    const response = await request(app)
      .post('/api/realtime/session')
      .send({ userId: 'local-user', provider: 'openai', sdpOffer: 'offer-sdp' })
      .expect(200);

    expect(response.body.sdpAnswer).toBe('mock-answer-sdp');
    expect(response.body.sessionId).toBeTruthy();
    expect(models.store.VoiceSession[0].status).toBe('active');
  });

  it('adds the preferred display name to realtime instructions', async () => {
    const models = createFakeModels();
    const calls = {};
    const app = createApp({ models, providers: createMockProviders(calls) });

    await request(app)
      .post('/api/realtime/session')
      .send({
        userId: 'local-user',
        displayName: 'Kelvin',
        timezone: 'Africa/Nairobi',
        provider: 'openai',
        sdpOffer: 'offer-sdp',
      })
      .expect(200);

    expect(calls.instructions).toContain('Preferred name: Kelvin');
    expect(calls.instructions).toContain('Africa/Nairobi');
    expect(models.store.User[0].displayName).toBe('Kelvin');
  });

  it('saves conversation events and ends a session with memory extraction', async () => {
    const models = createFakeModels();
    const app = createApp({
      models,
      providers: createMockProviders(),
      memoryExtractor: async () => ({
        memories: [{
          content: 'The user is testing memory.',
          category: 'fact',
          importance: 3,
          sensitive: false,
        }],
      }),
    });

    const sessionResponse = await request(app)
      .post('/api/realtime/session')
      .send({ userId: 'local-user', provider: 'openai', sdpOffer: 'offer-sdp' });

    const sessionId = sessionResponse.body.sessionId;

    await request(app)
      .post('/api/conversation/events')
      .send({
        userId: 'local-user',
        sessionId,
        events: [
          { role: 'user', content: 'I am testing memory.' },
          { role: 'assistant', content: 'Got it.' },
        ],
      })
      .expect(200);

    await request(app)
      .post(`/api/conversation/${sessionId}/end`)
      .send({ userId: 'local-user' })
      .expect(200);

    const memories = await request(app)
      .get('/api/memory?userId=local-user')
      .expect(200);

    expect(memories.body.memories[0].content).toContain('testing memory');
  });

  it('deletes and forgets memories', async () => {
    const models = createFakeModels();
    const app = createApp({ models, providers: createMockProviders() });

    await request(app)
      .post('/api/conversation/events')
      .send({
        userId: 'local-user',
        sessionId: '11111111-1111-4111-8111-111111111111',
        events: [{ role: 'user', content: 'I want to die.' }],
      })
      .expect(200);

    let memories = await request(app)
      .get('/api/memory?userId=local-user')
      .expect(200);

    expect(memories.body.memories).toHaveLength(1);

    await request(app)
      .post('/api/memory/forget')
      .send({ userId: 'local-user', text: 'Possible crisis language' })
      .expect(200);

    memories = await request(app)
      .get('/api/memory?userId=local-user')
      .expect(200);

    expect(memories.body.memories).toHaveLength(0);
  });
});
