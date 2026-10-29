import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, isDirectIncoming, makeHistory, makeLimiter, makePerSenderLimiter, textOf } from '../src/guard.mjs';

test('allowlist matches the phone jid and the alt jid behind a @lid', () => {
  const allowed = new Set(['628123456789']);
  assert.ok(isAllowed({ remoteJid: '628123456789@s.whatsapp.net' }, allowed));
  assert.ok(isAllowed({ remoteJid: '99887766@lid', remoteJidAlt: '628123456789@s.whatsapp.net' }, allowed));
  assert.ok(!isAllowed({ remoteJid: '620000000000@s.whatsapp.net' }, allowed));
  assert.ok(!isAllowed({ remoteJid: '628123456789@s.whatsapp.net' }, new Set()));
});

test('allowAll lets any sender through', () => {
  assert.ok(isAllowed({ remoteJid: '620000000000@s.whatsapp.net' }, new Set(), true));
});

test('per-sender limiter caps each sender separately', () => {
  const ok = makePerSenderLimiter(1, 1000, () => 0);
  assert.ok(ok('a'));
  assert.ok(!ok('a'));
  assert.ok(ok('b'));
});

test('only direct incoming chats pass', () => {
  assert.ok(isDirectIncoming({ remoteJid: '1@s.whatsapp.net', fromMe: false }));
  assert.ok(!isDirectIncoming({ remoteJid: '1@s.whatsapp.net', fromMe: true }));
  assert.ok(!isDirectIncoming({ remoteJid: '1-2@g.us', fromMe: false }));
  assert.ok(!isDirectIncoming({ remoteJid: 'status@broadcast', fromMe: false }));
});

test('textOf reads plain and extended text only', () => {
  assert.equal(textOf({ conversation: 'hi' }), 'hi');
  assert.equal(textOf({ extendedTextMessage: { text: 'yo' } }), 'yo');
  assert.equal(textOf({ imageMessage: {} }), '');
});

test('limiter blocks past the cap and recovers after the window', () => {
  let t = 0;
  const ok = makeLimiter(2, 1000, () => t);
  assert.ok(ok());
  assert.ok(ok());
  assert.ok(!ok());
  t = 1001;
  assert.ok(ok());
  assert.ok(makeLimiter(0)(), '0 means no cap');
});

test('history keeps the last N turns per chat', () => {
  const h = makeHistory(1);
  h.add('a', 'user', '1');
  h.add('a', 'assistant', '2');
  h.add('a', 'user', '3');
  assert.deepEqual(h.get('a').map((m) => m.content), ['2', '3']);
  assert.deepEqual(h.get('b'), []);
});
