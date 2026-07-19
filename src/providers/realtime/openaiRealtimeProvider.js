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
          eagerness: process.env.OPENAI_VAD_EAGERNESS || 'auto',
          create_response: true,
          interrupt_response: true,
        },
        transcription: {
          model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
        },
      },
      output: {
        voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
      },
    },
    tools: [
      {
        type: 'function',
        name: 'web_research',
        description: 'Search the public web in real time for current research, news, facts, prices, schedules, product information, or anything that may have changed recently.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'A focused web search query that captures the user request.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: 'auto',
  };
}

function parseOpenAIError(responseText) {
  try {
    return JSON.parse(responseText);
  } catch (_err) {
    return responseText;
  }
}

function getPublicOpenAIMessage(status, parsedError) {
  const code = parsedError?.error?.code;
  const type = parsedError?.error?.type;

  if (status === 401) return 'OpenAI rejected the API key. Check OPENAI_API_KEY on Render.';
  if (status === 403) return 'OpenAI Realtime access is not enabled for this key or project.';
  if (status === 429) return 'OpenAI quota or rate limit was reached. Check billing and usage limits.';
  if (status === 400 && (code || type)) return `OpenAI Realtime rejected the request: ${code || type}.`;
  return 'OpenAI Realtime session creation failed.';
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
        const parsedError = parseOpenAIError(responseText);
        throw new ProviderRequestError(
          getPublicOpenAIMessage(response.status, parsedError),
          response.status >= 400 && response.status < 500 ? 400 : 502,
          {
            provider: 'openai',
            status: response.status,
            error: parsedError,
          },
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
