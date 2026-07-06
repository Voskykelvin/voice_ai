const crypto = require('crypto');
const { ProviderRequestError } = require('./errors');

function createSafetyIdentifier(userId) {
  return crypto
    .createHash('sha256')
    .update(String(userId))
    .digest('hex');
}

function buildOpenAIRealtimeSessionConfig({ instructions }) {
  return {
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
    instructions,
    output_modalities: ['audio'],
    reasoning: {
      effort: process.env.OPENAI_REALTIME_REASONING_EFFORT || 'low',
    },
    audio: {
      input: {
        turn_detection: {
          type: 'semantic_vad',
        },
        transcription: {
          model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
        },
      },
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
      },
    },
  };
}

function createOpenAIRealtimeProvider({ fetchImpl = global.fetch } = {}) {
  return {
    name: 'openai',

    buildSessionConfig: buildOpenAIRealtimeSessionConfig,

    async createSession({ sdpOffer, sessionConfig, userId }) {
      if (!process.env.OPENAI_API_KEY) {
        throw new ProviderRequestError('OPENAI_API_KEY is required for OpenAI Realtime.', 500);
      }

      if (!sdpOffer || typeof sdpOffer !== 'string') {
        throw new ProviderRequestError('sdpOffer is required.', 400);
      }

      const formData = new FormData();
      formData.set('sdp', sdpOffer);
      formData.set('session', JSON.stringify(sessionConfig));

      const response = await fetchImpl(
        process.env.OPENAI_REALTIME_BASE_URL || 'https://api.openai.com/v1/realtime/calls',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Safety-Identifier': createSafetyIdentifier(userId),
          },
          body: formData,
        },
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new ProviderRequestError(
          'OpenAI Realtime session creation failed.',
          response.status >= 400 && response.status < 500 ? 400 : 502,
          responseText,
        );
      }

      return {
        sdpAnswer: responseText,
        providerSessionId: null,
        model: sessionConfig.model,
        voice: sessionConfig.audio?.output?.voice,
      };
    },
  };
}

module.exports = {
  createOpenAIRealtimeProvider,
  buildOpenAIRealtimeSessionConfig,
  createSafetyIdentifier,
};
