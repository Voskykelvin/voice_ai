const { buildGeminiLiveConfig, buildGeminiLiveSetup } = require('../src/services/geminiLiveService');

describe('geminiLiveService', () => {
  it('builds a Live API setup payload with generation config fields nested correctly', () => {
    const liveConfig = buildGeminiLiveConfig({ instructions: 'Be concise and warm.' });
    const setup = buildGeminiLiveSetup({
      model: 'gemini-3.1-flash-live-preview',
      liveConfig,
    });

    expect(setup.model).toBe('models/gemini-3.1-flash-live-preview');
    expect(setup.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(setup.generationConfig.temperature).toBe(0.7);
    expect(setup.generationConfig.speechConfig).toEqual(liveConfig.speechConfig);
    expect(setup.generationConfig.thinkingConfig).toEqual(liveConfig.thinkingConfig);
    expect(setup.systemInstruction).toEqual(liveConfig.systemInstruction);
    expect(setup).not.toHaveProperty('responseModalities');
    expect(setup).not.toHaveProperty('speechConfig');
  });
});
