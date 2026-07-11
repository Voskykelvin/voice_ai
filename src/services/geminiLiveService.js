const { ProviderRequestError } = require('../providers/realtime/errors');

const GEMINI_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

function getGeminiModel() {
  return process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
}

function modelResourceName(model) {
  return model.startsWith('models/') ? model : `models/${model}`;
}

function buildGeminiLiveConfig({ instructions, resumeHandle = null }) {
  const config = {
    responseModalities: ['AUDIO'],
    temperature: Number(process.env.GEMINI_LIVE_TEMPERATURE || 0.7),
    systemInstruction: {
      parts: [{ text: instructions }],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    thinkingConfig: {
      thinkingLevel: process.env.GEMINI_LIVE_THINKING_LEVEL || 'low',
    },
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
        prefixPaddingMs: 40,
        silenceDurationMs: Number(process.env.GEMINI_VAD_SILENCE_MS || 500),
      },
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
      turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
    },
    sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
    contextWindowCompression: { slidingWindow: {} },
  };

  const voiceName = process.env.GEMINI_LIVE_VOICE || 'Kore';
  if (voiceName) {
    config.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    };
  }

  return config;
}

function buildGeminiLiveSetup({ model, liveConfig }) {
  const generationConfig = {
    responseModalities: liveConfig.responseModalities,
    temperature: liveConfig.temperature,
    thinkingConfig: liveConfig.thinkingConfig,
    speechConfig: liveConfig.speechConfig,
  };

  Object.keys(generationConfig).forEach((key) => {
    if (generationConfig[key] === undefined) delete generationConfig[key];
  });

  return {
    model: modelResourceName(model),
    generationConfig,
    systemInstruction: liveConfig.systemInstruction,
    inputAudioTranscription: liveConfig.inputAudioTranscription,
    outputAudioTranscription: liveConfig.outputAudioTranscription,
    realtimeInputConfig: liveConfig.realtimeInputConfig,
    sessionResumption: liveConfig.sessionResumption,
    contextWindowCompression: liveConfig.contextWindowCompression,
  };
}

async function createGeminiLiveSessionToken({ instructions, resumeHandle = null }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new ProviderRequestError('GEMINI_API_KEY is required for Gemini Live.', 500);
  }

  const model = getGeminiModel();
  const liveConfig = buildGeminiLiveConfig({ instructions, resumeHandle });
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  try {
    const expireTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model,
          config: liveConfig,
        },
        lockAdditionalFields: [],
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    return {
      provider: 'gemini',
      model,
      voice: process.env.GEMINI_LIVE_VOICE || 'Kore',
      tokenName: token.name,
      wsUrl: `${GEMINI_WS_BASE}?access_token=${encodeURIComponent(token.name)}`,
      setup: {
        setup: buildGeminiLiveSetup({ model, liveConfig }),
      },
    };
  } catch (err) {
    throw new ProviderRequestError(
      'Gemini Live token creation failed.',
      err.status || err.statusCode || 502,
      {
        provider: 'gemini',
        status: err.status || err.statusCode || null,
        message: err.message,
        error: err.error || null,
      },
    );
  }
}

module.exports = {
  buildGeminiLiveConfig,
  buildGeminiLiveSetup,
  createGeminiLiveSessionToken,
  getGeminiModel,
};
