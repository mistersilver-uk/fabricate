/**
 * Every SHIPPED `<h5>…API</h5>` section of `openspec/specs/design-system/library.html` agrees with
 * the `$props()` of the component its SHIPPED line cites (issue 1784).
 *
 * The rows are prose, so the two directions are read at different strengths. A row's LEADING `<b>`
 * run (`<b>value</b> · <b>onChange</b>`) is a CLAIM that the prop exists; every claim must be
 * declared. Every declared prop must be MENTIONED by name in the section's rows, anywhere in their
 * text: a `data-*` or `onblur` prop is rarely a row of its own. `...rest` is mentioned by the word
 * `rest`. The other `<b>` tags carry values and phrases and are not claims.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import { readDesignLibrary } from './helpers/designLibrary.js';
import { readShippedApiGroups } from './helpers/designLibrarySections.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { declaredPropNames } from './helpers/sveltePropsDeclaration.js';

/** Below this the scan has lost sections rather than found none; the library has 59. */
const GROUP_FLOOR = 55;

/** A claim shaped like a prop; `Props:`, `the bar` and `onRow(id)` are labels and signatures. */
const PROP_SHAPED = /^[A-Za-z_$][\w$]*$/;

const escape = (name) => name.replaceAll(/[$.*+?^{}()|[\]\\]/g, String.raw`\$&`);

/** @returns {boolean} whether `name` appears as its own token in `text` */
function mentions(text, name) {
  if (name === '...rest') return /\brest\b/i.test(text);
  return new RegExp(String.raw`(?<![\w-])${escape(name)}(?![\w-])`).test(text);
}

/**
 * @param {{files: string[], names: string[], text: string}} group a parsed SHIPPED group
 * @param {Map<string, string[]>} componentsByName `.svelte` basename to full source text
 * @returns {{undocumented: string[], unknown: string[]}} the drift in each direction
 */
function drift(group, componentsByName) {
  const declared = new Set();
  for (const file of group.files) {
    const sources = componentsByName.get(file) ?? [];
    assert.equal(
      sources.length,
      1,
      `${group.heading}: ${file} resolves to ${sources.length} files`
    );
    for (const name of declaredPropNames(sources[0])) declared.add(name);
  }
  const claimed = group.names.filter((name) => PROP_SHAPED.test(name));
  return {
    undocumented: [...declared].filter((name) => !mentions(group.text, name)),
    unknown: [...new Set(claimed)].filter((name) => !declared.has(name)),
  };
}

// ratchet-exempt(source-pin): reads each component's `$props()` destructure through the parser, not its text
const sources = collectSources(join(repoRoot, 'src'), { extensions: ['.svelte'] });
const componentsByName = new Map();
for (const [file, text] of Object.entries(sources)) {
  const name = file.split('/').at(-1);
  componentsByName.set(name, [...(componentsByName.get(name) ?? []), text]);
}
const groups = readShippedApiGroups(readDesignLibrary());

test('the library has its SHIPPED API groups, each citing a component', () => {
  assert.ok(groups.length >= GROUP_FLOOR, `only ${groups.length} SHIPPED API groups were read`);
  assert.deepEqual(
    groups.filter((group) => group.files.length === 0).map((group) => group.heading),
    []
  );
});

test('every SHIPPED API section names every prop its component declares and no other', () => {
  const failures = [];
  for (const group of groups) {
    const { undocumented, unknown } = drift(group, componentsByName);
    if (undocumented.length > 0 || unknown.length > 0) {
      failures.push(
        `${group.files.join(' + ')} (${group.heading}): undocumented [${undocumented}]; ` +
          `claimed but not declared [${unknown}]`
      );
    }
  }
  assert.deepEqual(failures, []);
});

test('a renamed prop fails both directions', () => {
  const button = componentsByName.get('Button.svelte');
  assert.equal(button.length, 1);
  const renamed = new Map([
    ['Button.svelte', [button[0].replace('fullWidth = false', 'wide = false')]],
  ]);
  const group = groups.find((candidate) => candidate.files[0] === 'Button.svelte');
  assert.ok(group);
  const { undocumented, unknown } = drift(group, renamed);
  assert.deepEqual(undocumented, ['wide']);
  assert.deepEqual(unknown, ['fullWidth']);
});

test('only a leading bold run is a claim', () => {
  const button = groups.find((candidate) => candidate.files[0] === 'Button.svelte');
  assert.ok(button.names.includes('role'));
  // `<b>closed set of ten</b>` sits mid-row, so it is a phrase, never a claim.
  assert.ok(!button.names.includes('closed set of ten'));
});
