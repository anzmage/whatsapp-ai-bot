import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateMessageIDV2,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { config } from './config.mjs';
import { complete } from './llm.mjs';
import {
  isAllowed,
  isDirectIncoming,
  makeHistory,
  makeLimiter,
  makePerSenderLimiter,
  senderNumbers,
  textOf,
} from './guard.mjs';
import { makeChatIds, makeHandover } from './handover.mjs';

const AUTH_DIR = 'auth';
const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const history = makeHistory(config.historyTurns);
const canReply = makeLimiter(config.maxRepliesPerHour);
const canReplyTo = makePerSenderLimiter(config.maxRepliesPerSenderPerHour);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => config.delayMinMs + Math.random() * Math.max(0, config.delayMaxMs - config.delayMinMs);

// One reply at a time per chat; messages that arrive meanwhile get one follow-up reply.
const busy = new Set();
const again = new Set();
const chatId = makeChatIds();
const handover = makeHandover({ waitMs: config.ownerWaitMinutes * 60_000 });
// Ids of messages the bot sent, so its own echoes are not mistaken for the owner typing.
const botSent = new Set();
const remember = (id) => {
  botSent.add(id);
  if (botSent.size > 500) botSent.delete(botSent.values().next().value);
};

// Reconnects reuse the module, so a pairing code is requested once per process, not once per socket.
let pairingRequested = false;

async function handle(sock, msg, type) {
  const { key } = msg;
  if (!key.remoteJid || /@(g\.us|broadcast|newsletter)$/.test(key.remoteJid)) return;
  const text = textOf(msg.message).trim();

  if (key.fromMe) {
    if (botSent.has(key.id)) return;
    // Skip old messages replayed on reconnect; a recent one means the owner is answering.
    const ageMs = Date.now() - Number(msg.messageTimestamp || 0) * 1000;
    if (ageMs > Math.max(config.ownerWaitMinutes * 60_000, 120_000)) return;
    const chat = chatId(key);
    if (handover.pending(chat)) log.info({ chat }, 'owner replied; bot stands down');
    handover.ownerReplied(chat);
    if (text) history.add(chat, 'assistant', text);
    return;
  }

  // Customer messages: live ones only, never history replayed on reconnect.
  if (type !== 'notify' || !isDirectIncoming(key) || !text) return;
  if (!isAllowed(key, config.allowed, config.allowAll)) {
    log.info({ from: senderNumbers(key) }, 'ignored: sender not in ALLOWED_NUMBERS');
    return;
  }

  const chat = chatId(key);
  history.add(chat, 'user', text);
  const when = handover.incoming(chat, () => respond(sock, chat));
  if (when !== 'now') log.info({ chat, minutes: config.ownerWaitMinutes, when }, 'waiting for the owner to reply');
}

async function respond(sock, chat) {
  if (busy.has(chat)) {
    again.add(chat);
    return;
  }
  if (config.maxRepliesPerSenderPerHour > 0 && !canReplyTo(chat)) {
    log.warn({ chat }, 'per-sender hourly limit reached; staying silent');
    return;
  }
  if (!canReply()) {
    log.warn('hourly reply limit reached; staying silent');
    return;
  }

  busy.add(chat);
  const startedAt = Date.now();
  try {
    const { text: reply, provider } = await complete(history.get(chat), { log });
    await sock.sendPresenceUpdate('composing', chat);
    await sleep(jitter());
    // The owner may have jumped in while the model was thinking.
    if (handover.ownerSince(chat, startedAt)) {
      log.info({ chat }, 'owner replied while generating; reply dropped');
      return;
    }
    // Register the id before sending: our own echo can arrive before sendMessage resolves.
    const messageId = generateMessageIDV2(sock.user?.id);
    remember(messageId);
    await sock.sendMessage(chat, { text: reply }, { messageId });
    await sock.sendPresenceUpdate('paused', chat);
    history.add(chat, 'assistant', reply);
    handover.botReplied(chat);
    log.info({ provider }, 'replied');
  } catch (err) {
    log.error({ err: err.message }, 'reply failed');
  } finally {
    busy.delete(chat);
    if (again.delete(chat)) respond(sock, chat);
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: log.child({ level: 'warn' }), markOnlineOnConnect: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && config.botNumber) {
      if (!pairingRequested) {
        pairingRequested = true;
        sock
          .requestPairingCode(config.botNumber)
          .then((code) => log.info(`pairing code: ${code}. On the phone: WhatsApp > Linked devices > Link with phone number instead`))
          .catch((err) => log.error({ err: err.message }, 'could not request a pairing code'));
      }
    } else if (qr) {
      log.info('scan this QR with the bot number: WhatsApp > Linked devices > Link a device');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') log.info({ allowed: config.allowed.size }, 'connected');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log.error(`logged out. Delete the "${AUTH_DIR}" folder and start again to re-link.`);
        process.exit(1);
      }
      log.warn({ code }, 'connection closed; reconnecting');
      setTimeout(start, 3000);
    }
  });

  // 'notify' = live messages; 'append' also carries the owner's messages sent while we reconnected.
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const msg of messages) handle(sock, msg, type).catch((err) => log.error({ err: err.message }, 'handler crashed'));
  });
}

if (!config.apiKey) {
  log.error('LLM_API_KEY is empty. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (config.allowAll) log.warn('ALLOWED_NUMBERS=*: the bot answers anyone who messages it.');
else if (config.allowed.size === 0) log.warn('ALLOWED_NUMBERS is empty: the bot will answer nobody.');
start();
