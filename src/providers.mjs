import { config } from './config.mjs';

// Same provider chain as the ZaidanLab website chat (functions/api/chat.js in anzmage/Zlab),
// with the paid LLM_* endpoint (DeepSeek) appended as the last resort. Each provider is
// skipped when its key is missing, so the chain shrinks to whatever is configured.
export function buildProviders(env = process.env) {
  const list = [];
  if (env.CF_ACCOUNT_ID && env.CF_API_TOKEN) {
    list.push({
      name: 'workers-ai',
      model: '@cf/google/gemma-4-26b-a4b-it',
      url: `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/v1/chat/completions`,
      key: env.CF_API_TOKEN,
      timeout: 20_000,
    });
  }
  if (env.OLLAMA_API_KEY) {
    list.push({
      name: 'ollama',
      model: 'gpt-oss:120b',
      url: 'https://ollama.com/v1/chat/completions',
      key: env.OLLAMA_API_KEY,
      timeout: 20_000,
      extra: { reasoning_effort: 'low' },
    });
  }
  if (env.NVIDIA_API_KEY) {
    list.push({
      name: 'nvidia',
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      key: env.NVIDIA_API_KEY,
      timeout: 20_000,
    });
  }
  if (env.REQUESTY_API_KEY) {
    // Requesty's free Gemma always reasons first, so it is slow and needs a larger token budget.
    list.push({
      name: 'requesty',
      model: 'google/gemma-4-31b-it',
      url: 'https://router.requesty.ai/v1/chat/completions',
      key: env.REQUESTY_API_KEY,
      timeout: 45_000,
      maxTokens: 2500,
    });
  }
  if (config.apiKey) {
    // DeepSeek is a reasoning-free chat model here; it gets no chat_template_kwargs.
    list.push({
      name: 'deepseek',
      model: config.model,
      url: `${config.baseUrl}/chat/completions`,
      key: config.apiKey,
      timeout: 60_000,
      plain: true,
    });
  }
  return list;
}
