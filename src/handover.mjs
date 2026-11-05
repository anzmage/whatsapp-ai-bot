// Owner-first replies. The owner answers from the phone; the bot only steps in when a chat has
// waited `waitMs` without an owner reply. Once the bot has answered, it keeps answering that
// chat right away until the owner writes there again or the chat goes quiet for `waitMs`.
export function makeHandover({ waitMs, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const chats = new Map(); // chat -> { timer, botAt }
  const state = (chat) => {
    if (!chats.has(chat)) chats.set(chat, { timer: null, botAt: 0, ownerAt: 0 });
    return chats.get(chat);
  };

  return {
    // A customer message arrived. Calls `due` now (bot is active or waiting is off) or after waitMs.
    // Returns 'now', 'scheduled' or 'waiting' (a timer for this chat is already running).
    incoming(chat, due) {
      const s = state(chat);
      if (waitMs <= 0 || (s.botAt && now() - s.botAt < waitMs)) {
        due();
        return 'now';
      }
      if (s.timer) return 'waiting';
      s.timer = setTimer(() => {
        s.timer = null;
        due();
      }, waitMs);
      return 'scheduled';
    },
    // The owner wrote in this chat from the phone: cancel any pending bot reply and step back.
    ownerReplied(chat) {
      const s = state(chat);
      if (s.timer) clearTimer(s.timer);
      s.timer = null;
      s.botAt = 0;
      s.ownerAt = now();
    },
    botReplied(chat) {
      state(chat).botAt = now();
    },
    pending: (chat) => !!chats.get(chat)?.timer,
    // True when the owner wrote in this chat at or after time t (e.g. while a reply was generated).
    ownerSince: (chat, t) => (chats.get(chat)?.ownerAt ?? 0) >= t,
  };
}

// WhatsApp may address one chat by an @lid id and by a phone-number jid. Messages we receive
// carry both (remoteJid + remoteJidAlt); the owner's own messages may use either, so map every
// alias seen to the id the chat was first seen with.
export function makeChatIds() {
  const alias = new Map();
  return (key) => {
    const ids = [key.remoteJid, key.remoteJidAlt].filter(Boolean);
    const known = ids.map((id) => alias.get(id)).find(Boolean);
    const canonical = known || ids[0];
    for (const id of ids) alias.set(id, canonical);
    return canonical;
  };
}
