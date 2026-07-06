const { createOpenAIRealtimeProvider } = require('./openaiRealtimeProvider');
const { createGeminiLiveProvider } = require('./geminiLiveProvider');

function createProviderRegistry(overrides = {}) {
  const providers = {
    openai: createOpenAIRealtimeProvider(),
    gemini: createGeminiLiveProvider(),
    ...overrides,
  };

  return {
    get(name) {
      const providerName = name || process.env.REALTIME_PROVIDER || 'openai';
      const provider = providers[providerName];
      if (!provider) {
        const allowed = Object.keys(providers).join(', ');
        const err = new Error(`Unknown realtime provider "${providerName}". Allowed: ${allowed}`);
        err.statusCode = 400;
        err.publicMessage = err.message;
        throw err;
      }
      return provider;
    },
    list() {
      return Object.keys(providers);
    },
  };
}

module.exports = { createProviderRegistry };
