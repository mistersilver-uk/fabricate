/**
 * The `no-restricted-properties` guard on the secure-context-only id API (issue 3032): every read
 * shape under `src/` is flagged, the `globalThis.fabricate` guard beside it survives, and tests
 * stay free to use the API.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ESLint } from 'eslint';

const SHAPES = [
  'export const a = crypto.randomUUID();',
  'export const b = globalThis.crypto?.randomUUID?.();',
  'export const { randomUUID } = crypto;',
  "export const d = crypto['randomUUID']();",
  'export const e = typeof globalThis.crypto?.randomUUID;',
];
const MACRO_READ = 'export const f = globalThis.fabricate.x;';

async function linesByRule(source, filePath) {
  const [result] = await new ESLint().lintText(source, { filePath });
  const lines = (ruleId) => result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.line);
  return {
    properties: lines('no-restricted-properties'),
    syntax: lines('no-restricted-syntax'),
  };
}

test('flags every read shape in a src module, and keeps the macro-global guard', async () => {
  const { properties, syntax } = await linesByRule(
    [...SHAPES, MACRO_READ].join('\n') + '\n',
    'src/utils/x.js'
  );
  assert.deepEqual(properties, [1, 2, 3, 4, 5]);
  assert.deepEqual(syntax, [6]);
});

test('flags every read shape inside a src component script', async () => {
  const source = ['<script>', ...SHAPES, MACRO_READ, '</script>', ''].join('\n');
  const { properties, syntax } = await linesByRule(source, 'src/ui/x.svelte');
  assert.deepEqual(properties, [2, 3, 4, 5, 6]);
  assert.deepEqual(syntax, [7]);
});

test('leaves a test file free to read the API', async () => {
  const { properties } = await linesByRule(SHAPES.join('\n') + '\n', 'tests/x.test.js');
  assert.deepEqual(properties, []);
});
