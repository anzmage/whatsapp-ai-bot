import { config } from './config.mjs';
import { buildProviders } from './providers.mjs';
import { detectLanguage, loadKnowledge, zaiPrompt } from './persona.mjs';

const MAX_REPLY_TOKENS = 700;

// Removes what some models leak into the text (reasoning, DeepSeek's safety-classifier block,
// the website widget's HANDOFF/CONTACT markers) and turns markdown into WhatsApp formatting.
export const cleanReply = (text) =>
  String(text ?? '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/<ds_safety>[\s\S]*?(<\/ds_safety>\s*(Safe|Unsafe)?|$)/gi, '')
    .replace(/(^|\n)[\s*_]*CONTACT[\s*_.]*(?=\n|$)/gi, '$1')
    .replace(/(^|\n)[\s*_]*HANDOFF[\s*_]*:[^\n]*/gi, '$1')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();

const contentOf = (r) => r?.choices?.[0]?.message?.content ?? r?.result?.response ?? '';

export async function callProvider(p, messages, fetcher = fetch) {
  const body = { model: p.model, messages, max_tokens: p.maxTokens || MAX_REPLY_TOKENS, temperature: 0.3, ...p.extra };
  if (!p.plain) body.chat_template_kwargs = { enable_thinking: false };
  const res = await fetcher(p.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(p.timeout),
  });
  if (!res.ok) throw new Error(`http ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return cleanReply(contentOf(await res.json()));
}

export async function systemPrompt(history, fetcher = fetch) {
  if (!config.knowledgeUrl) return config.systemPrompt;
  const knowledge = await loadKnowledge(config.knowledgeUrl, fetcher);
  const last = [...history].reverse().find((m) => m.role === 'user');
  return zaiPrompt(knowledge, detectLanguage(last?.content));
}

// Tries each configured provider in order; returns the first non-empty reply.
export async function complete(history, { providers = buildProviders(), fetcher = fetch, log = console } = {}) {
  if (!providers.length) throw new Error('no LLM provider configured');
  const messages = [{ role: 'system', content: await systemPrompt(history, fetcher) }, ...history];
  for (const p of providers) {
    try {
      const text = await callProvider(p, messages, fetcher);
      if (text) return { text, provider: p.name };
      log.warn?.({ provider: p.name }, 'empty reply, trying next provider');
    } catch (err) {
      log.warn?.({ provider: p.name, err: String(err?.message || err).slice(0, 160) }, 'provider failed');
    }
  }
  throw new Error('all providers failed');
}
