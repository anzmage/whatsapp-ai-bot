const int = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== '' && process.env[name] !== undefined ? n : fallback;
};

export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export const config = {
  baseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'deepseek-chat',
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    'Kamu asisten WhatsApp pribadi. Jawab singkat, ramah, dalam bahasa yang sama dengan pengirim.',
  botNumber: digits(process.env.BOT_NUMBER),
  allowAll: (process.env.ALLOWED_NUMBERS || '').trim() === '*',
  allowed: new Set((process.env.ALLOWED_NUMBERS || '').split(',').map(digits).filter(Boolean)),
  maxRepliesPerHour: int('MAX_REPLIES_PER_HOUR', 30),
  maxRepliesPerSenderPerHour: int('MAX_REPLIES_PER_SENDER_PER_HOUR', 10),
  historyTurns: int('HISTORY_TURNS', 10),
  delayMinMs: int('REPLY_DELAY_MIN_MS', 2000),
  delayMaxMs: int('REPLY_DELAY_MAX_MS', 5000),
};
