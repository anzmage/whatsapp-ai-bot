import { config } from './config.mjs';

// DeepSeek sometimes leaks its internal safety-classifier block into the reply text.
export const cleanReply = (text) =>
  String(text ?? '')
    .replace(/<ds_safety>[\s\S]*?(<\/ds_safety>\s*(Safe|Unsafe)?|$)/gi, '')
    .trim();

// One call to an OpenAI-compatible /chat/completions endpoint.
export async function complete(history) {
  if (!config.apiKey) throw new Error('LLM_API_KEY is not set');

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: config.systemPrompt }, ...history],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const text = cleanReply((await res.json()).choices?.[0]?.message?.content);
  if (!text) throw new Error('LLM returned an empty reply');
  return text;
}
