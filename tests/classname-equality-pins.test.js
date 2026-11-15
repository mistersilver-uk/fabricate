/**
 * No suite pins a primitive's root class with an exact `className` equality, except the
 * primitive's own mounted suite (issue 1555).
 *
 * `assert.equal(node.className, 'fabricate-button is-primary')` fails when the primitive adds,
 * reorders or renames a token it owns, in every suite that merely MOUNTS the primitive. A suite
 * that is not the primitive's own asks the class set (`assertClassSet`, or `classList.contains`).
 *
 * A primitive's root token is `fabricate-<kebab name>` or `fab-<kebab name>`, kept only when the
 * primitive's own source writes it, so the list follows the manifest rather than a copy of it.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import designSystemPrimitives from '../scripts/lib/designSystemPrimitives.json' with { type: 'json' };

import { parseModule, walkNodes } from './helpers/moduleAst.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

/**
 * The suites that legitimately pin their own primitive's composed root class, with the root
 * tokens each may pin. A new row needs a reviewer: it widens what the gate lets through.
 */
const OWN_SUITES = new Map([
  ['tests/components/manager-button-mounted.test.js', new Set(['fabricate-button'])],
  // The Typeahead's root is the search shell it composes, so its own suite pins both.
  [
    'tests/components/published-typeahead-mounted.test.js',
    new Set(['fabricate-typeahead', 'fabricate-search']),
  ],
]);

/** Below this the manifest is truncated rather than clean; it lists 100 rows. */
const MANIFEST_FLOOR = 90;

const ASSERTERS = new Set(['equal', 'strictEqual']);

const kebab = (name) => name.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const escape = (text) => text.replaceAll(/[$.*+?^{}()|[\]\\]/g, String.raw`\$&`);

/**
 * @param {Record<string, string>} sources repo-relative path to text
 * @returns {Set<string>} the primitives' root class tokens
 */
function primitiveRoots(sources) {
  const roots = new Set();
  for (const { path } of designSystemPrimitives.designSystemPrimitives) {
    const text = sources[path];
    assert.equal(typeof text, 'string', `${path} is listed in the manifest but not on disk`);
    const words = kebab(path.split('/').at(-1).replace('.svelte', '')).split('-');
    // `SearchField` roots at `fabricate-search`, so each leading run of words is a candidate.
    for (let count = 1; count <= words.length; count += 1) {
      const name = words.slice(0, count).join('-');
      for (const token of [`fabricate-${name}`, `fab-${name}`]) {
        if (new RegExp(String.raw`(?<![\w-])${escape(token)}(?![\w-])`).test(text)) {
          roots.add(token);
        }
      }
    }
  }
  return roots;
}

/** @returns {Map<string, string>} each top-level `const NAME = 'text'` of `ast` */
function stringConstants(ast) {
  const constants = new Map();
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') continue;
    for (const { id, init } of node.declarations) {
      if (id.type === 'Identifier' && init?.type === 'Literal' && typeof init.value === 'string') {
        constants.set(id.name, init.value);
      }
    }
  }
  return constants;
}

/** @returns {string|null} the text of a pinned operand; an unresolved hole reads as a space */
function pinnedText(node, constants) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'Identifier') return constants.get(node.name) ?? null;
  if (node?.type !== 'TemplateLiteral') return null;
  const parts = [];
  for (const [index, quasi] of node.quasis.entries()) {
    parts.push(quasi.value.cooked);
    const hole = node.expressions[index];
    if (hole) parts.push(pinnedText(hole, constants) ?? ' ');
  }
  return parts.join('');
}

/**
 * @param {string} source a test module's text
 * @param {Set<string>} roots primitive root tokens
 * @returns {{line: number, tokens: string[]}[]} each `<expr>.className` equality naming a root
 */
function findRootClassNamePins(source, roots) {
  if (!source.includes('className')) return [];
  const { ast } = parseModule(source);
  const constants = stringConstants(ast);
  const pins = [];
  for (const node of walkNodes(ast)) {
    if (node.type !== 'CallExpression') continue;
    const { callee } = node;
    const name = callee.type === 'MemberExpression' ? callee.property?.name : callee.name;
    if (!ASSERTERS.has(name)) continue;
    const [actual, expected] = node.arguments;
    const isClassName =
      actual?.type === 'MemberExpression' &&
      !actual.computed &&
      actual.property.name === 'className';
    const text = isClassName ? pinnedText(expected, constants) : null;
    const named = (text?.split(/\s+/u) ?? []).filter((candidate) => roots.has(candidate));
    if (named.length > 0) pins.push({ line: node.loc.start.line, tokens: named });
  }
  return pins;
}

// ratchet-exempt(source-pin): reads each primitive's root class token, then parses the tests to an AST
const sources = collectSources(join(repoRoot, 'src'), { extensions: ['.svelte'] });
const testSources = collectSources(join(repoRoot, 'tests'), { extensions: ['.js', '.mjs'] });
const roots = primitiveRoots(sources);

test('the manifest yields primitive roots to pin against', () => {
  assert.ok(designSystemPrimitives.designSystemPrimitives.length >= MANIFEST_FLOOR);
  for (const root of ['fabricate-button', 'fabricate-field', 'fabricate-search']) {
    assert.ok(roots.has(root), `${root} is not read as a primitive root`);
  }
});

test('no suite but a primitive’s own pins its root class with an exact className equality', () => {
  const failures = [];
  for (const [file, text] of Object.entries(testSources)) {
    const allowed = OWN_SUITES.get(file) ?? new Set();
    for (const { line, tokens } of findRootClassNamePins(text, roots)) {
      const stray = tokens.filter((token) => !allowed.has(token));
      if (stray.length > 0) {
        failures.push(`${file}:${line} pins ${stray}; assert the class set with assertClassSet`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('the own-suite exemptions name suites that still pin their own roots', () => {
  for (const [file, allowed] of OWN_SUITES) {
    const pinned = new Set(
      findRootClassNamePins(testSources[file] ?? '', roots).flatMap((pin) => pin.tokens)
    );
    for (const token of allowed) {
      assert.ok(roots.has(token), `${token} is no longer a primitive root`);
      assert.ok(pinned.has(token), `${file} no longer pins ${token}; drop its exemption`);
    }
  }
});

test('the scan reads a literal, a template, a resolved constant and a strictEqual, and not a class set', () => {
  const probe = new Set(['fabricate-button']);
  const found = (source) => findRootClassNamePins(source, probe).length;
  assert.equal(found("assert.equal(n.className, 'fabricate-button is-primary');"), 1);
  assert.equal(found('assert.strictEqual(n.className, `fabricate-button ${tone}`);'), 1);
  assert.equal(found("const R = 'fabricate-button'; assert.equal(n.className, `${R} x`);"), 1);
  assert.equal(found("assert.equal(\n  n.firstChild.className,\n  'is-a fabricate-button'\n);"), 1);
  assert.equal(found("assert.equal(n.className, 'fas fa-plus');"), 0);
  assert.equal(found("assert.equal(n.className, 'fabricate-buttons');"), 0);
  assert.equal(found("assertClassSet(n, 'fabricate-button is-primary');"), 0);
  assert.equal(found("assert.ok(n.classList.contains('fabricate-button'));"), 0);
});
