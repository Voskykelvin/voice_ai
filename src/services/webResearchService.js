function extractOutputText(responseJson = {}) {
  if (typeof responseJson.output_text === 'string') return responseJson.output_text.trim();

  const chunks = [];
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.text && typeof content.text === 'string') chunks.push(content.text);
    }
  }

  return chunks.join('\n').trim();
}

function cleanResearchQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

async function createWebResearch({ query, fetchImpl = global.fetch } = {}) {
  const cleanQuery = cleanResearchQuery(query);

  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY is required for web research.');
    err.statusCode = 500;
    err.publicMessage = 'Web research is not configured yet.';
    throw err;
  }

  if (!cleanQuery) {
    const err = new Error('query is required.');
    err.statusCode = 400;
    err.publicMessage = 'A research query is required.';
    throw err;
  }

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.WEB_RESEARCH_MODEL || 'gpt-5.6',
      tools: [{ type: 'web_search' }],
      input: [
        {
          role: 'system',
          content: [
            'Research the web in real time.',
            'Return a concise answer for a spoken conversation.',
            'Include key source names and dates when available.',
            'If sources disagree or freshness matters, say so.',
          ].join(' '),
        },
        {
          role: 'user',
          content: cleanQuery,
        },
      ],
    }),
  });

  const responseJson = await response.json().catch(() => null);

  if (!response.ok) {
    const err = new Error(responseJson?.error?.message || 'OpenAI web research failed.');
    err.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    err.publicMessage = 'Mira could not complete that web search.';
    err.details = { provider: 'openai', status: response.status, error: responseJson?.error || responseJson };
    throw err;
  }

  return {
    query: cleanQuery,
    answer: extractOutputText(responseJson) || 'No useful web result was returned.',
    model: responseJson?.model || process.env.WEB_RESEARCH_MODEL || 'gpt-5.6',
  };
}

module.exports = {
  cleanResearchQuery,
  createWebResearch,
  extractOutputText,
};
