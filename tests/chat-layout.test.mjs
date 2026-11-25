import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('chat grid children can shrink below content min-width', () => {
  assert.match(css, /\.chat-layout>\*\{min-width:0\}/);
});

test('chat attachment cards stay within the available narrow-screen width', () => {
  assert.match(css, /\.att\{[^}]*max-width:min\(300px,100%\)/);
});
