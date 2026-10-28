/**
 * A role-less generic element carries no `aria-label` (issue 2297): ARIA 1.2 prohibits naming a
 * `generic` or `paragraph`, and most screen readers drop the name. A name goes on an element with a
 * role that supports one (`group`, `img`, `status`), or into visually hidden text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from 'svelte/compiler';

import {
  attributeNamed,
  elementTag,
  parsedTemplates,
  walkElements,
} from './helpers/svelteTemplateScan.js';

/** Elements whose implicit role is `generic`, `paragraph`, `emphasis`, `strong`, `code`, `deletion`, `insertion`, `subscript` or `superscript`. */
const GENERIC_TAGS = new Set([
  'div',
  'span',
  'p',
  'b',
  'i',
  'em',
  'strong',
  'small',
  'u',
  's',
  'code',
  'sub',
  'sup',
  'del',
  'ins',
]);

/**
 * Files whose offenders are held back by `tests/file-size-ratchet.test.js`: a `role` line grows an
 * oversized file. An entry is exact, so fixing a site, or adding one, fails this gate until the
 * count is edited; the list can only shrink.
 */
const HELD_BY_FILE_SIZE = Object.freeze({
  'src/ui/svelte/apps/ActorSelectTopBar.svelte': 1,
  'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte': 2,
  'src/ui/svelte/apps/manager/environment/CompositionList.svelte': 1,
  'src/ui/svelte/apps/manager/recipes/RecipeBrowserInspector.svelte': 1,
  'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte': 1,
});

/** A spread may supply the role, so an element carrying one is not judged. */
const carriesSpread = (element) =>
  (element.attributes || []).some((attribute) => attribute.type === 'SpreadAttribute');

/** The line of every role-less generic element that names itself with `aria-label`. */
function offenderLines(source, ast = parse(source, { modern: true })) {
  const lines = [];
  walkElements(ast.fragment, (element) => {
    if (element.type !== 'RegularElement' || !GENERIC_TAGS.has(elementTag(element))) return;
    if (!attributeNamed(element, 'aria-label') || attributeNamed(element, 'role')) return;
    if (carriesSpread(element)) return;
    lines.push(source.slice(0, element.start).split('\n').length);
  });
  return lines;
}

test('no role-less generic element in a template carries an aria-label', () => {
  const templates = parsedTemplates();
  assert.ok(templates.length > 300, `only ${templates.length} templates scanned`);
  const found = {};
  for (const { file, source, ast } of templates) {
    const lines = offenderLines(source, ast);
    if (lines.length > 0) found[file] = lines.length;
  }
  assert.deepEqual(
    found,
    HELD_BY_FILE_SIZE,
    'give the element a role that supports a name (`group`, `img`, `status`) or move the name ' +
      'into visually hidden text; when a listed file is fixed, delete its entry'
  );
});

test('the scan flags a bare name and passes every shape that is not one', () => {
  const lines = (markup) => offenderLines(markup);
  assert.deepEqual(lines('<span aria-label="Realm">x</span>'), [1], 'a span');
  assert.deepEqual(
    lines('<main>\n<div aria-label={name}></div></main>'),
    [2],
    'a div, on its line'
  );
  assert.deepEqual(lines('{#if a}<em aria-label="x"></em>{/if}'), [1], 'inside a block');
  assert.deepEqual(lines('<span role="img" aria-label="Realm">x</span>'), [], 'a role');
  assert.deepEqual(lines('<div role={kind} aria-label="x"></div>'), [], 'a dynamic role');
  assert.deepEqual(lines('<span {...combo.list} aria-label="x"></span>'), [], 'a spread');
  assert.deepEqual(lines('<code aria-label="x"></code>'), [1], 'a code element');
  assert.deepEqual(lines('<section aria-label="x"></section>'), [], 'a landmark');
  assert.deepEqual(lines('<li aria-label="x"></li>'), [], 'a list item');
  assert.deepEqual(lines('<Panel aria-label="x" />'), [], 'a component');
  assert.deepEqual(lines('<span aria-labelledby="x"></span>'), [], 'a reference, not a name');
});
