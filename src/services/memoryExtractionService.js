const { createGeminiMemoryExtraction } = require('./geminiTextService');
const { createMemoryExtraction: createOpenAIMemoryExtraction } = require('./openaiTextService');

async function createMemoryExtraction(args) {
  const provider = String(
    process.env.MEMORY_EXTRACT_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'gemini'),
  ).toLowerCase();

  if (provider === 'gemini' || provider === 'google') {
    return createGeminiMemoryExtraction(args);
  }

  return createOpenAIMemoryExtraction(args);
}

module.exports = {
  createMemoryExtraction,
};
