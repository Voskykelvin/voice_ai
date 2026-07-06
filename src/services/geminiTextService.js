function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
}

function buildMemorySchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      memories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            content: { type: 'string' },
            category: {
              type: 'string',
              enum: ['preference', 'fact', 'relationship', 'goal', 'sensitive', 'safety'],
            },
            importance: { type: 'integer', minimum: 1, maximum: 5 },
            sensitive: { type: 'boolean' },
          },
          required: ['content', 'category', 'importance', 'sensitive'],
        },
      },
    },
    required: ['memories'],
  };
}

async function createGeminiMemoryExtraction({ transcript }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { skipped: true, memories: [], reason: 'GEMINI_API_KEY is not set.' };
  }

  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  const prompt = [
    'Extract durable facts worth remembering about the user.',
    'Remember everything useful for personalization, including sensitive context, but do not extract throwaway small talk.',
    'Do not diagnose or infer crisis status. If crisis language appears, create a safety memory phrased as possible crisis language appeared.',
    'Return only JSON that matches the requested schema.',
    '',
    transcript,
  ].join('\n');

  const response = await client.models.generateContent({
    model: process.env.GEMINI_MEMORY_MODEL || 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: buildMemorySchema(),
    },
  });

  const parsed = JSON.parse(response.text || '{"memories":[]}');
  return { skipped: false, memories: parsed.memories || [] };
}

module.exports = {
  buildMemorySchema,
  createGeminiMemoryExtraction,
};
