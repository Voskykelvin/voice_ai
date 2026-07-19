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

  it('reports readiness and adds safe request headers', async () => {
    const app = createApp({ models: createFakeModels(), providers: createMockProviders() });
    const response = await request(app).get('/api/ready').expect(200);
    expect(response.body.status).toBe('ready');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('runs web research through a server-side tool route', async () => {
    const app = createApp({
      models: createFakeModels(),
      providers: createMockProviders(),
      webResearch: async ({ query }) => ({
        query,
        answer: 'Fresh result from the web.',
        model: 'test-web-model',
      }),
    });

    const response = await request(app)
      .post('/api/tools/web-research')
      .send({ query: 'latest AI voice research' })
      .expect(200);

    expect(response.body.answer).toContain('Fresh result');
    expect(response.body.query).toBe('latest AI voice research');
  });

  it('uploads private knowledge and injects it into realtime instructions', async () => {
    const models = createFakeModels();
    const calls = {};
    const app = createApp({ models, providers: createMockProviders(calls) });

    const uploadResponse = await request(app)
      .post('/api/knowledge')
      .send({
        userId: 'local-user',
        name: 'launch-notes.md',
        kind: 'document',
        mimeType: 'text/markdown',
        textContent: 'Mira should know the launch plan includes document upload and web research.',
      })
      .expect(201);

    expect(uploadResponse.body.asset.name).toBe('launch-notes.md');
    expect(uploadResponse.body.asset.content).toContain('launch plan');

    const listResponse = await request(app)
      .get('/api/knowledge?userId=local-user')
      .expect(200);

    expect(listResponse.body.assets).toHaveLength(1);

    await request(app)
      .post('/api/realtime/session')
      .send({ userId: 'local-user', provider: 'openai', sdpOffer: 'offer-sdp' })
      .expect(200);

    expect(calls.instructions).toContain('Uploaded Knowledge');
    expect(calls.instructions).toContain('launch-notes.md');
    expect(calls.instructions).toContain('document upload and web research');
    expect(models.store.VoiceSession[0].metadata.knowledgeAssetCount).toBe(1);
  });

  it('describes photo uploads through the injected image describer', async () => {
    const models = createFakeModels();
    const app = createApp({
      models,
      providers: createMockProviders(),
      imageDescriber: async ({ name }) => `Photo description for ${name}: a clean Mira interface sketch.`,
    });

    const response = await request(app)
      .post('/api/knowledge')
      .send({
        userId: 'local-user',
        name: 'mira-ui.png',
        kind: 'photo',
        mimeType: 'image/png',
        imageDataUrl: 'data:image/png;base64,abc',
      })
      .expect(201);

    expect(response.body.asset.kind).toBe('photo');
    expect(response.body.asset.content).toContain('clean Mira interface sketch');
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
        sessionMode: 'builder',
        provider: 'openai',
        sdpOffer: 'offer-sdp',
      })
      .expect(200);

    expect(calls.instructions).toContain('Preferred name: Kelvin');
    expect(calls.instructions).toContain('Africa/Nairobi');
    expect(calls.instructions).toContain('Active mode: Builder');
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

    const endResponse = await request(app)
      .post(`/api/conversation/${sessionId}/end`)
      .send({ userId: 'local-user', metrics: { connectionLatencyMs: 420, reconnectAttempts: 1 } })
      .expect(200);

    expect(endResponse.body.quality.turnCount).toBe(2);
    expect(models.store.VoiceSession[0].metadata.clientMetrics.connectionLatencyMs).toBe(420);

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

  it('lets the user correct a saved memory', async () => {
    const models = createFakeModels();
    const app = createApp({ models, providers: createMockProviders() });
    await request(app).post('/api/conversation/events').send({
      userId: 'local-user',
      sessionId: '11111111-1111-4111-8111-111111111111',
      events: [{ role: 'user', content: 'I want to die.' }],
    });
    const memoryId = models.store.Memory[0].id;

    const response = await request(app)
      .patch(`/api/memory/${memoryId}`)
      .send({ userId: 'local-user', content: 'Possible distress appeared; check in gently.', lifespan: 'temporary', expiresInDays: 2 })
      .expect(200);

    expect(response.body.memory.content).toContain('check in gently');
    expect(response.body.memory.lifespan).toBe('temporary');
  });
});
