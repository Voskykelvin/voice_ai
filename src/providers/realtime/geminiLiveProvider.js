const { ProviderUnavailableError } = require('./errors');

function createGeminiLiveProvider() {
  return {
    name: 'gemini',

    buildSessionConfig({ instructions }) {
      return {
        type: 'realtime',
        model: process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview',
        instructions,
      };
    },

    async createSession() {
      throw new ProviderUnavailableError(
        'Gemini Live is registered as a provider adapter but is not wired for v1 yet.',
      );
    },
  };
}

module.exports = { createGeminiLiveProvider };
