function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') {
    return responseJson.output_text;
  }

  const chunks = [];
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (content.text) chunks.push(content.text);
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('');
}

async function createMemoryExtraction({ transcript, fetchImpl = global.fetch }) {
  if (!process.env.OPENAI_API_KEY) {
    return { skipped: true, memories: [], reason: 'OPENAI_API_KEY is not set.' };
  }

  const schema = {
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

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MEMORY_EXTRACT_MODEL || 'gpt-5.4-nano',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'Extract durable facts worth remembering about the user.',
                'Remember everything useful for personalization, including sensitive context, but do not extract throwaway small talk.',
                'Do not diagnose or infer crisis status. If crisis language appears, create a safety memory phrased as possible crisis language appeared.',
              ].join('\n'),
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: transcript }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'memory_extraction',
          schema,
          strict: true,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error('Memory extraction request failed.');
    err.details = data;
    throw err;
  }

  const rawText = extractOutputText(data);
  const parsed = JSON.parse(rawText);
  return { skipped: false, memories: parsed.memories || [] };
}

module.exports = {
  createMemoryExtraction,
  extractOutputText,
};
