/**
 * The ten `manager-*` root classes issues 1507 and 2543 retired and the `fab-manager-button`
 * token issue 2540 retired stay retired, and each primitive still writes the root that replaced
 * its class.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { parse } from 'svelte/compiler';

import { walkTemplate } from './helpers/primitiveAdoptionContract.js';
import {
  COMPAT_LINES,
  HEADER_ACTION_COMPAT_REMOVE_IN,
  HEADER_ACTION_COMPAT_WHY,
  HISTORICAL_LINES,
  RETIRED_CLASSES,
} from './helpers/retiredManagerClasses.js';
import { collectWorkingTreeSources, repoRoot } from './helpers/sourceScan.js';

const SCANNED_ROOTS = Object.freeze(['src', 'styles', 'tests', 'scripts', 'openspec/specs']);
const SCANNED_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.cjs',
  '.svelte',
  '.css',
  '.scss',
  '.json',
  '.html',
  '.md',
  '.yml',
  '.yaml',
  '.txt',
]);
const SKIPPED = Object.freeze([
  'tests/fixtures/doc-split/',
  'tests/retired-manager-classes.test.js',
  'tests/helpers/retiredManagerClasses.js',
]);

/** One of the eleven exact tokens: a family descendant is not one. */
const RETIRED_TOKEN = new RegExp(
  String.raw`(?:(?<=\\b)|(?<![\w-]))(?:${Object.keys(RETIRED_CLASSES).join('|')})(?![\w-])`,
  'u'
);

const RETIRED_TOKENS = new RegExp(RETIRED_TOKEN.source, 'gu');

const ALLOWED_LINES = Object.freeze([...HISTORICAL_LINES, ...COMPAT_LINES]);

/** Every line naming a retired token, less the allowlisted ones, as `file:line text`. */
function retiredTokenLines(corpus, allowlist = ALLOWED_LINES) {
  const hits = [];
  const allowed = new Map(allowlist.map((entry) => [entry, 0]));
  for (const [file, text] of Object.entries(corpus)) {
    if (SKIPPED.some((prefix) => file.startsWith(prefix))) continue;
    for (const [index, line] of text.split('\n').entries()) {
      if (!RETIRED_TOKEN.test(line)) continue;
      const tokens = line.match(RETIRED_TOKENS).length;
      const entry = allowlist.find(
        (item) => item.file === file && line.includes(item.includes) && item.tokens === tokens
      );
      if (entry) allowed.set(entry, allowed.get(entry) + 1);
      else hits.push(`${file}:${index + 1} ${line.trim().slice(0, 140)}`);
    }
  }
  return { hits, allowed };
}

// ratchet-exempt(source-pin): a whole-tree absence gate for ten retired class names, not a pin on any site's shape
const corpus = collectWorkingTreeSources(SCANNED_ROOTS, SCANNED_EXTENSIONS);

test('no retired manager root class is written in code, styles, tests, scripts or specs', () => {
  for (const root of SCANNED_ROOTS) {
    const files = Object.keys(corpus).filter((file) => file.startsWith(`${root}/`));
    assert.ok(files.length > 0, `the scan read nothing under ${root}/, so its absence is vacuous`);
  }
  const { hits } = retiredTokenLines(corpus);
  assert.deepEqual(
    hits,
    [],
    'a retired class is back. Name its primitive root instead (`RETIRED_CLASSES`), or, for a ' +
      'sentence recording what a primitive replaced, add the line to `HISTORICAL_LINES`; only ' +
      'the header-action seam may still write `fab-manager-button` (`COMPAT_LINES`):\n  ' +
      hits.join('\n  ')
  );
});

test('every allowlisted historical line matches exactly one line naming a retired class', () => {
  const { allowed } = retiredTokenLines(corpus);
  const unmatched = [...allowed]
    .filter(([, count]) => count !== 1)
    .map(([entry, count]) => `${entry.includes} (${count} lines)`);
  assert.deepEqual(
    unmatched,
    [],
    'these allowlist entries do not match exactly one line with their `tokens` count'
  );
  for (const entry of HISTORICAL_LINES) {
    assert.ok(entry.why?.length > 20, `${entry.file} allowlists a line with no stated reason`);
  }
});

test('the absence scan reds on a retired class in src, tests and scripts alone', () => {
  const planted = {
    'src/ui/svelte/apps/Planted.svelte': '<section class="fabricate-card manager-inspector-card">',
    'tests/components/planted.test.js': "root.querySelector('.manager-pagination')",
    'scripts/foundry-smoke/planted.mjs': String.raw`page.locator('\bmanager-icon-button\b')`,
    'src/ui/svelte/components/PlantedModal.svelte': ':global(.manager-modal) .fab-well {',
    // The token issue 2540 retired, planted where it used to live: a rung chained beside the root.
    'styles/planted.css': '.fabricate-button.fabricate-button.fab-manager-button { height: 34px }',
    'tests/components/survivors.test.js':
      'manager-pagination-nav manager-status-toggle-track manager-travel-picker fab-manager-buttons',
    'tests/components/modal-survivors.test.js':
      "'.manager-modal-footer [data-manager-modal]' width: var(--manager-modal-width)",
  };
  const { hits } = retiredTokenLines(planted, []);
  assert.deepEqual(
    hits.map((hit) => hit.slice(0, hit.indexOf(':'))),
    [
      'src/ui/svelte/apps/Planted.svelte',
      'tests/components/planted.test.js',
      'scripts/foundry-smoke/planted.mjs',
      'src/ui/svelte/components/PlantedModal.svelte',
      'styles/planted.css',
    ],
    'the scan must red on each planted token and on none of the out-of-scope names'
  );
});

/** A `major.minor.patch` version as three numbers, ignoring any prerelease tag. */
const versionParts = (version) => version.split('-', 1)[0].split('.').map(Number);

/** Whether `left` is an earlier release than `right`. */
function isBefore(left, right) {
  const [earlier, later] = [versionParts(left), versionParts(right)];
  const at = earlier.findIndex((part, index) => part !== later[index]);
  return at !== -1 && earlier[at] < later[at];
}

test('the header-action compat lines state why they survive and the release removing them', () => {
  assert.ok(COMPAT_LINES.length > 0, 'the compat seam still writes the token somewhere');
  for (const entry of COMPAT_LINES) {
    assert.equal(entry.why, HEADER_ACTION_COMPAT_WHY, `${entry.file} states the compat reason`);
    assert.equal(entry.removeIn, HEADER_ACTION_COMPAT_REMOVE_IN, `${entry.file} names the release`);
  }
  assert.match(HEADER_ACTION_COMPAT_REMOVE_IN, /^\d+\.\d+\.0$/, 'removal lands on a minor release');
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  assert.ok(
    isBefore(version, HEADER_ACTION_COMPAT_REMOVE_IN),
    `package.json is at ${version}, which has reached ${HEADER_ACTION_COMPAT_REMOVE_IN}: remove ` +
      '`fab-manager-button` from the header-action seam and drop `COMPAT_LINES`'
  );
});

/** Every class token a template writes on an element, a composed `classes` array included. */
function writtenClassTokens(source, file) {
  const ast = parse(source, { modern: true });
  const literalsOf = (name) => {
    const tokens = [];
    const visit = (node, parentIsArray) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const child of node) visit(child, parentIsArray);
        return;
      }
      if (node.type === 'Literal' && typeof node.value === 'string' && parentIsArray) {
        tokens.push(...node.value.split(/\s+/u));
      }
      for (const [key, child] of Object.entries(node)) {
        if (key !== 'parent') visit(child, node.type === 'ArrayExpression' && key === 'elements');
      }
    };
    const declarations = ast.instance?.content.body.flatMap((statement) =>
      statement.type === 'VariableDeclaration' ? statement.declarations : []
    );
    for (const declaration of declarations ?? []) {
      if (declaration.id.name === name) visit(declaration.init, false);
    }
    return tokens;
  };
  const tokens = [];
  walkTemplate(ast.fragment, (element) => {
    const attribute = element.attributes.find((item) => item.name === 'class');
    if (!attribute || attribute.value === true) return;
    for (const part of [attribute.value].flat()) {
      if (part.type === 'Text') tokens.push(...part.data.split(/\s+/u));
      else if (part.expression?.type === 'Identifier')
        tokens.push(...literalsOf(part.expression.name));
    }
  });
  assert.ok(tokens.length > 0, `${file} writes no class this reader can see`);
  return tokens.filter(Boolean);
}

test('each retired class’s root is written by its primitive’s template', () => {
  for (const [token, { root, primitive }] of Object.entries(RETIRED_CLASSES)) {
    const written = writtenClassTokens(readFileSync(join(repoRoot, primitive), 'utf8'), primitive);
    assert.ok(
      written.includes(root),
      `${primitive} no longer writes \`${root}\`, which replaced \`${token}\``
    );
  }
});

test('the root reader reds when a template stops writing its root', () => {
  const composed = (literals) =>
    [
      '<script>',
      `  const classes = $derived([${literals}, extraClass]);`,
      '</script>',
      '<b class={classes}></b>',
    ].join('\n');
  const read = (literals) => writtenClassTokens(composed(literals), 'Synthetic.svelte');
  assert.ok(read("'fabricate-button', 'fab-manager-button'").includes('fabricate-button'));
  assert.ok(
    !read("'fab-manager-button'").includes('fabricate-button'),
    'the reader still finds it'
  );
});
