import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply, complete } from '../src/llm.mjs';
import { detectLanguage } from '../src/persona.mjs';

test('cleanReply strips a leaked DeepSeek safety block', () => {
  const leaked = 'Haii! Ada yang bisa aku b<ds_safety>[用户未成年]否\n[分类]其他\n[规则]无</ds_safety>antu? 😊';
  assert.equal(cleanReply(leaked), 'Haii! Ada yang bisa aku bantu? 😊');
  assert.equal(cleanReply('Hai b<ds_safety>[判定]x</ds_safety>Safe'), 'Hai b');
  assert.equal(cleanReply('Halo <ds_safety>unclosed'), 'Halo');
  assert.equal(cleanReply('Halo!'), 'Halo!');
});

test('cleanReply drops website markers and converts markdown for WhatsApp', () => {
  assert.equal(cleanReply('**Halo**, lihat [portfolio](https://zaidanlab.dev/x/)\nCONTACT'), '*Halo*, lihat portfolio https://zaidanlab.dev/x/');
  assert.equal(cleanReply('<think>hmm</think>Oke.\nHANDOFF: saya mau bikin bot'), 'Oke.');
});

test('complete falls through failing providers and ends with the last one', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes('a.test')) return new Response('down', { status: 503 });
    if (url.includes('b.test')) return Response.json({ choices: [{ message: { content: '' } }] });
    return Response.json({ choices: [{ message: { content: 'Halo dari C' } }] });
  };
  const p = (name) => ({ name, model: 'm', url: `https://${name}.test/v1/chat/completions`, key: 'k', timeout: 1000 });
  const r = await complete([{ role: 'user', content: 'halo' }], { providers: [p('a'), p('b'), p('c')], fetcher, log: {} });
  assert.deepEqual(r, { text: 'Halo dari C', provider: 'c' });
  assert.equal(calls.length, 3);
});

test('detectLanguage and greetings', () => {
  assert.equal(detectLanguage('Heyy'), null);
  assert.equal(detectLanguage('saya mau bikin aplikasi kasir dong'), 'Bahasa Indonesia');
  assert.equal(detectLanguage('Can you build a chatbot for my shop?'), 'English');
});
