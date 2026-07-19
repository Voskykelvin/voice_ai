const { createOpenAIRealtimeProvider, buildOpenAIRealtimeSessionConfig } = require('../src/providers/realtime/openaiRealtimeProvider');
const { createGeminiLiveProvider } = require('../src/providers/realtime/geminiLiveProvider');

describe('realtime providers', () => {
  it('configures semantic turn detection for automatic responses and interruptions', () => {
    delete process.env.OPENAI_VAD_EAGERNESS;
    const config = buildOpenAIRealtimeSessionConfig({ instructions: 'Be present.' });
    expect(config.audio.input.turn_detection).toMatchObject({
      type: 'semantic_vad',
      eagerness: 'auto',
      create_response: true,
      interrupt_response: true,
    });
    expect(config.tools).toEqual([
      expect.objectContaining({ type: 'function', name: 'web_research' }),
    ]);
    expect(config.tool_choice).toBe('auto');
  });

  it('creates an OpenAI realtime session through the unified SDP endpoint', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => 'answer-sdp',
    }));
    const provider = createOpenAIRealtimeProvider({ fetchImpl });

    const result = await provider.createSession({
      userId: 'local-user',
      sdpOffer: 'offer-sdp',
      sessionConfig: {
        type: 'realtime',
        model: 'gpt-realtime-2',
        audio: { output: { voice: 'marin' } },
      },
    });

    expect(result.sdpAnswer).toBe('answer-sdp');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps Gemini Live registered as a stub-compatible provider', async () => {
    const provider = createGeminiLiveProvider();
    expect(provider.name).toBe('gemini');
    await expect(provider.createSession()).rejects.toMatchObject({ statusCode: 501 });
  });
});
