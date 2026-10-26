/**
 * The `no-restricted-syntax` entry that keeps a focused DOM node out of an equality assertion
 * (issue 2439): `node:assert` walks a mounted element's circular tree when the comparison fails.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ESLint } from 'eslint';

const FILE = 'tests/components/example-mounted.test.js';

async function restrictedSyntaxLines(source) {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(source, { filePath: FILE });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line);
}

test('flags an equality assertion whose argument is a *.activeElement member', async () => {
  for (const method of [
    'equal',
    'strictEqual',
    'deepEqual',
    'deepStrictEqual',
    'notEqual',
    'notStrictEqual',
  ]) {
    assert.deepEqual(
      await restrictedSyntaxLines(`assert.${method}(document.activeElement, node);\n`),
      [1],
      `assert.${method} on the actual argument`
    );
  }
  assert.deepEqual(
    await restrictedSyntaxLines('assert.equal(node, target.ownerDocument.activeElement);\n'),
    [1],
    'the expected argument is flagged too'
  );
});

test('leaves identity checks and value comparisons alone', async () => {
  const source = [
    'assert.ok(document.activeElement === node, "focus");',
    'assert.equal(document.activeElement?.id, "x");',
    'assert.equal(document.activeElement.id, "x");',
    'assert.equal(describe(document.activeElement), "x");',
    'assert.equal(node.getAttribute("id"), "x");',
  ].join('\n');
  assert.deepEqual(await restrictedSyntaxLines(source), []);
});
