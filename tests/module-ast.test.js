/** Proves `tests/helpers/moduleAst.js`, which lives outside the `npm test` glob (issue 1658). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calledName,
  identifierNames,
  literalStrings,
  parseModule,
  walkNodes,
} from './helpers/moduleAst.js';
import { byCodePoint } from './helpers/ratchetBaseline.js';

test('positions are unshifted, unlike a synthetic script wrapper', () => {
  const { ast } = parseModule('const a = 1;\nconst b = 2;\n');
  // Field-wise, not deep-equal: the parser returns a `Position` instance, not a plain object.
  assert.equal(ast.body[0].loc.start.line, 1);
  assert.equal(ast.body[0].loc.start.column, 0);
  assert.equal(ast.body[0].range[0], 0);
});

test('a regex is a literal, so its quantifier braces are not code braces', () => {
  const { ast } = parseModule('const RE = /[a-z]{1,32}/gu;');
  const [declaration] = ast.body[0].declarations;
  assert.equal(declaration.init.type, 'Literal');
  assert.ok(declaration.init.regex, 'the literal carries its regex parts');
});

test('an unbalanced quote inside a regex class does not derange the parse', () => {
  const { ast } = parseModule('const RE = /["\\\\]/gu;\nexport const after = 1;\n');
  assert.equal(ast.body.length, 2);
  assert.equal(ast.body[1].type, 'ExportNamedDeclaration');
});

test('the scope chain resolves a function nested inside another', () => {
  const { scopeManager } = parseModule(
    'export function outer() {\n  function inner() { return 1; }\n  return inner;\n}\n'
  );
  const kinds = scopeManager.scopes.map((scope) => scope.type);
  assert.deepStrictEqual(kinds, ['global', 'module', 'function', 'function']);
});

test('a hashbang parses, which the rejected wrapper could not', () => {
  const { ast } = parseModule('#!/usr/bin/env node\nexport const ok = 1;\n');
  assert.equal(ast.body[0].type, 'ExportNamedDeclaration');
});

test('a closing script tag in a string parses, which the rejected wrapper could not', () => {
  const { ast } = parseModule("export const s = '</script>';");
  assert.equal(ast.body[0].type, 'ExportNamedDeclaration');
});

test('walkNodes visits every node once and terminates on a genuine cycle', () => {
  const { ast } = parseModule('const a = { b: 1 };');
  // A real back-reference, so the `seen` guard is exercised rather than assumed.
  ast.body[0].cycle = ast;
  const seen = [...walkNodes(ast)];
  assert.ok(seen.length > 3);
  assert.equal(new Set(seen).size, seen.length);
});

test('calledName reads a bare call and a member call, and declines a computed one', () => {
  const { ast } = parseModule('f(); o.g(); o[h]();');
  const calls = [...walkNodes(ast)].filter((node) => node.type === 'CallExpression');
  assert.deepStrictEqual(calls.map(calledName), ['f', 'g', undefined]);
});

test('literalStrings collects plain and template chunks; identifierNames collects names', () => {
  const { ast } = parseModule('const x = `a${y}b` + "c";');
  assert.deepStrictEqual(literalStrings(ast).sort(byCodePoint), ['a', 'b', 'c']);
  assert.ok(identifierNames(ast).has('y'));
});
