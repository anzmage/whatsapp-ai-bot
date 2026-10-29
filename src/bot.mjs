import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
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

const AUTH_DIR = 'auth';
const log = pino({ level: process.env.LOG_LEVEL || 'info' });
const history = makeHistory(config.historyTurns);
const canReply = makeLimiter(config.maxRepliesPerHour);
const canReplyTo = makePerSenderLimiter(config.maxRepliesPerSenderPerHour);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => config.delayMinMs + Math.random() * Math.max(0, config.delayMaxMs - config.delayMinMs);

// One reply at a time per chat, so two quick messages don't interleave in the history.
const busy = new Set();

// Reconnects reuse the module, so a pairing code is requested once per process, not once per socket.
let pairingRequested = false;

async function handle(sock, msg) {
  const { key } = msg;
  if (!isDirectIncoming(key)) return;

  const text = textOf(msg.message).trim();
  if (!text) return;

  if (!isAllowed(key, config.allowed, config.allowAll)) {
    log.info({ from: senderNumbers(key) }, 'ignored: sender not in ALLOWED_NUMBERS');
    return;
  }
  if (busy.has(key.remoteJid)) return;
  if (config.maxRepliesPerSenderPerHour > 0 && !canReplyTo(key.remoteJid)) {
    log.warn({ from: key.remoteJid }, 'per-sender hourly limit reached; staying silent');
    return;
  }
  if (!canReply()) {
    log.warn('hourly reply limit reached; staying silent');
    return;
  }

  busy.add(key.remoteJid);
  try {
    history.add(key.remoteJid, 'user', text);
    const reply = await complete(history.get(key.remoteJid));
    await sock.sendPresenceUpdate('composing', key.remoteJid);
    await sleep(jitter());
    await sock.sendMessage(key.remoteJid, { text: reply });
    await sock.sendPresenceUpdate('paused', key.remoteJid);
    history.add(key.remoteJid, 'assistant', reply);
  } catch (err) {
    log.error({ err: err.message }, 'reply failed');
  } finally {
    busy.delete(key.remoteJid);
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

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) handle(sock, msg).catch((err) => log.error({ err: err.message }, 'handler crashed'));
  });
}

if (!config.apiKey) {
  log.error('LLM_API_KEY is empty. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (config.allowAll) log.warn('ALLOWED_NUMBERS=*: the bot answers anyone who messages it.');
else if (config.allowed.size === 0) log.warn('ALLOWED_NUMBERS is empty: the bot will answer nobody.');
start();
