import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeChatIds, makeHandover } from '../src/handover.mjs';

const WAIT = 30 * 60_000;
function clock() {
  let t = 1_000_000;
  const timers = new Map();
  let seq = 0;
  return {
    now: () => t,
    setTimer: (fn, ms) => (timers.set(++seq, { fn, at: t + ms }), seq),
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); }
    },
  };
}

test('bot replies after 30 minutes without an owner reply', () => {
  const c = clock();
  const h = makeHandover({ waitMs: WAIT, ...c });
  let due = 0;
  assert.equal(h.incoming('a', () => due++), 'scheduled');
  assert.equal(h.incoming('a', () => due++), 'waiting'); // second message joins the same wait
  c.advance(WAIT - 1);
  assert.equal(due, 0);
  c.advance(1);
  assert.equal(due, 1);
});

test('owner reply within the window cancels the bot', () => {
  const c = clock();
  const h = makeHandover({ waitMs: WAIT, ...c });
  let due = 0;
  h.incoming('a', () => due++);
  c.advance(10 * 60_000);
  h.ownerReplied('a');
  c.advance(WAIT);
  assert.equal(due, 0);
});

test('after taking over the bot answers at once until the owner returns or the chat goes quiet', () => {
  const c = clock();
  const h = makeHandover({ waitMs: WAIT, ...c });
  h.botReplied('a');
  assert.equal(h.incoming('a', () => {}), 'now');
  c.advance(WAIT);
  assert.equal(h.incoming('a', () => {}), 'scheduled'); // quiet for 30 min: owner gets first go again
  h.ownerReplied('a');
  h.botReplied('b');
  h.ownerReplied('b');
  assert.equal(h.incoming('b', () => {}), 'scheduled');
});

test('ownerSince detects an owner reply during generation', () => {
  const c = clock();
  const h = makeHandover({ waitMs: WAIT, ...c });
  const start = c.now();
  assert.equal(h.ownerSince('a', start), false);
  c.advance(1000);
  h.ownerReplied('a');
  assert.equal(h.ownerSince('a', start), true);
});

test('waitMs 0 replies immediately', () => {
  const h = makeHandover({ waitMs: 0 });
  assert.equal(h.incoming('a', () => {}), 'now');
});

test('chat ids: @lid and phone jid map to one chat', () => {
  const id = makeChatIds();
  assert.equal(id({ remoteJid: '111@lid', remoteJidAlt: '628@s.whatsapp.net' }), '111@lid');
  assert.equal(id({ remoteJid: '628@s.whatsapp.net' }), '111@lid');
  assert.equal(id({ remoteJid: '999@lid' }), '999@lid');
});
