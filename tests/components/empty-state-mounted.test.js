/**
 * The manager's ONE no-state primitive, pinned at the PRIMITIVE level (issue 1286).
 *
 * `EmptyState` had no dedicated suite before this file: every assertion about it went
 * through some host screen, so the `inline` variant this change adds would have shipped
 * unpinned and a regression in the primitive itself would surface as an unrelated screen's
 * failure, or not at all.
 *
 * Two kinds of assertion, deliberately:
 *
 * - the CLASS AND DOM contract, mounted. `is-compact` / `is-filtered` / `is-inline` are
 *   opt-in, so the bare panel must carry `manager-empty` and nothing else — a variant that
 *   leaked a class onto every panel would repaint every "nothing here" state in the manager.
 * - the CSS SOURCE of the `inline` variant. Its whole point is two declarations
 *   (`flex-direction: row` on the stack, and the 46px icon TILE reduced to a bare glyph)
 *   that `is-compact` does not make, and a scoped `<style>` block injected into happy-dom
 *   is not something `getComputedStyle` can be trusted to resolve. Asserting the source is
 *   what makes "inline is not just a smaller compact" a fact a test can hold.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const emptyStateSource = readFileSync(
  resolve(repoRoot, 'src/ui/svelte/apps/manager/EmptyState.svelte'),
  'utf8'
);

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-empty-state-',
  compiledModules: ['src/ui/svelte/apps/manager/EmptyState.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/EmptyState.svelte',
});

function panelOf(target) {
  return target.querySelector('.manager-empty');
}

/** Authored classes, with Svelte's per-component scope hash removed. */
function authoredClasses(node) {
  return [...node.classList].filter((name) => !name.startsWith('svelte-'));
}

/** The declaration body of one rule in the component's scoped `<style>` block. */
function ruleBody(selector) {
  const start = emptyStateSource.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `the scoped style block declares \`${selector}\``);
  const open = emptyStateSource.indexOf('{', start);
  const close = emptyStateSource.indexOf('}', open);
  return emptyStateSource.slice(open + 1, close);
}

describe('1286 EmptyState — variant contract', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => harness.teardown());

  it('renders the bare panel with the hook class and NOTHING else', async () => {
    const target = await harness.mount({});
    assert.deepEqual(
      authoredClasses(panelOf(target)),
      ['manager-empty'],
      'a variant that leaked a class onto every panel would repaint every empty state'
    );
    harness.remount();
  });

  it('renders icon, title and hint inside the inner stack, in that order', async () => {
    const target = await harness.mount({
      icon: 'fas fa-feather',
      title: 'Nothing here',
      hint: 'Add one to get started.',
    });
    const stack = panelOf(target).querySelector(':scope > div');
    assert.ok(Boolean(stack), 'the inner stack wrapper is part of the DOM contract');
    const tags = [...stack.children].map((child) => child.tagName);
    assert.deepEqual(tags, ['I', 'H3', 'P'], 'the icon tile, the serif title, then the body');
    assert.equal(stack.querySelector('i').getAttribute('aria-hidden'), 'true');
    harness.remount();
  });

  it('adds each opt-in variant class only when asked', async () => {
    for (const [prop, expected] of [
      ['compact', 'is-compact'],
      ['filtered', 'is-filtered'],
      ['inline', 'is-inline'],
    ]) {
      const target = await harness.mount({ [prop]: true });
      assert.deepEqual(
        authoredClasses(panelOf(target)),
        ['manager-empty', expected],
        `${prop} paints exactly ${expected}`
      );
      harness.remount();
    }
  });

  it('keeps the data hook and the context class a host container needs', async () => {
    const target = await harness.mount({
      contextClass: 'manager-task-required-tools-empty',
      dataAttr: 'data-complications-empty',
    });
    const panel = panelOf(target);
    assert.ok(
      panel.classList.contains('manager-task-required-tools-empty'),
      'the context class survives so global placement rules still reach the panel'
    );
    assert.equal(panel.getAttribute('data-complications-empty'), 'true');
    harness.remount();
  });

  it('the INLINE variant flips the stack to a row AND drops the 46px icon tile', () => {
    // Both halves are load-bearing. `is-compact` already shrinks the tile to 32px, so a
    // variant that only shrank it further would be a third size rather than the prototype's
    // bare 13px glyph on one line.
    const stack = ruleBody('.manager-empty.is-inline > div');
    assert.match(stack, /flex-direction:\s*row/, 'the inner stack becomes a row');

    const glyph = ruleBody('.manager-empty.is-inline > div > i');
    assert.match(glyph, /width:\s*auto/, 'the 46px tile width is released');
    assert.match(glyph, /height:\s*auto/, 'and its height with it');
    assert.match(glyph, /background:\s*none/, 'the tile FILL is gone, not merely resized');
  });

  it('leaves the shipped compact tile at 32px, so inline is not a second compact', () => {
    const compactGlyph = ruleBody('.manager-empty.is-compact > div > i');
    assert.match(compactGlyph, /width:\s*32px/, 'the compact tile is unchanged');
    assert.match(
      compactGlyph,
      /border-radius:\s*9px/,
      'and still a tile — the inline variant did not reach into it'
    );
  });
});
