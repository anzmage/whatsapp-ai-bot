import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply } from '../src/llm.mjs';

test('cleanReply strips a leaked DeepSeek safety block', () => {
  const leaked = 'Haii! Ada yang bisa aku b<ds_safety>[用户未成年]否\n[分类]其他\n[规则]无</ds_safety>antu? 😊';
  assert.equal(cleanReply(leaked), 'Haii! Ada yang bisa aku bantu? 😊');
  assert.equal(cleanReply('Hai b<ds_safety>[判定]x</ds_safety>Safe'), 'Hai b');
  assert.equal(cleanReply('Halo <ds_safety>unclosed'), 'Halo');
  assert.equal(cleanReply('Halo!'), 'Halo!');
});
