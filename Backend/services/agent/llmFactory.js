const { ChatGroq } = require('@langchain/groq');
const { ChatOpenAI } = require('@langchain/openai');

const createLLM = (options = {}) => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const temperature = options.temperature !== undefined ? options.temperature : (Number(process.env.LLM_TEMPERATURE) || 0.25);
  const maxTokens = options.maxTokens !== undefined ? options.maxTokens : (Number(process.env.LLM_MAX_TOKENS) || 600);

  if (provider === 'groq' && process.env.GROQ_API_KEY) {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile',
      temperature,
      maxTokens,
    });
  }

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini',
      temperature,
      maxTokens,
    });
  }

  return null;
};

module.exports = { createLLM };
