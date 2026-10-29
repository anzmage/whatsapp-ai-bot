import { digits } from './config.mjs';

// Which numbers a message could come from. Newer WhatsApp addresses people by an
// opaque @lid id and puts the phone-number jid in remoteJidAlt, so check both.
export const senderNumbers = (key) =>
  [key.remoteJid, key.remoteJidAlt, key.participantAlt].filter(Boolean).map((j) => digits(j.split('@')[0]));

export const isAllowed = (key, allowed, allowAll = false) =>
  allowAll || senderNumbers(key).some((n) => allowed.has(n));

// One limiter per sender, so a single chatty (or abusive) number can't use up the shared cap.
export function makePerSenderLimiter(max, windowMs = 3_600_000, now = Date.now) {
  const bySender = new Map();
  return (id) => {
    if (!bySender.has(id)) bySender.set(id, makeLimiter(max, windowMs, now));
    return bySender.get(id)();
  };
}

// Direct chats only: no groups, status updates, newsletters or our own messages.
export const isDirectIncoming = (key) =>
  !key.fromMe && !!key.remoteJid && !/@(g\.us|broadcast|newsletter)$/.test(key.remoteJid);

export const textOf = (message) =>
  message?.conversation || message?.extendedTextMessage?.text || '';

// Sliding-window cap on replies, so a loop or a flood can't burn the number or the API budget.
export function makeLimiter(max, windowMs = 3_600_000, now = Date.now) {
  const stamps = [];
  return () => {
    const cutoff = now() - windowMs;
    while (stamps.length && stamps[0] <= cutoff) stamps.shift();
    if (max > 0 && stamps.length >= max) return false;
    stamps.push(now());
    return true;
  };
}

// Keeps the last `turns` user/assistant pairs per chat, in memory only.
export function makeHistory(turns) {
  const chats = new Map();
  return {
    get: (id) => chats.get(id) ?? [],
    add(id, role, content) {
      const list = [...(chats.get(id) ?? []), { role, content }].slice(-turns * 2);
      chats.set(id, list);
    },
  };
}
