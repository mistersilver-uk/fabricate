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
  const styles = emptyStateSource
    .slice(emptyStateSource.search(/^<style>$/m))
    .replaceAll(/\/\*[\s\S]*?\*\//g, '');
  const start = styles.indexOf(`\n  ${selector} {`);
  assert.notEqual(start, -1, `the scoped style block declares \`${selector}\``);
  const open = styles.indexOf('{', start);
  const close = styles.indexOf('}', open);
  return styles.slice(open + 1, close);
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
      ['note', 'is-note'],
      ['field', 'is-field'],
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

  it('field sizing composes with inline without introducing an interactive placeholder', async () => {
    const target = await harness.mount({ inline: true, field: true, hint: 'Any Weather' });
    const panel = panelOf(target);
    assert.deepEqual(authoredClasses(panel), ['manager-empty', 'is-inline', 'is-field']);
    assert.equal(panel.textContent.trim(), 'Any Weather');
    assert.ok(!panel.hasAttribute('tabindex'));
    assert.ok(!panel.hasAttribute('role'));
    assert.equal(panel.querySelectorAll('button, input, select, a').length, 0);
    const geometry = ruleBody('.manager-empty.is-field');
    assert.match(geometry, /width:\s*100%/);
    assert.match(geometry, /height:\s*34px/);
    assert.match(geometry, /padding:\s*var\(--fab-space-1\) var\(--fab-space-2\)/);
    assert.match(ruleBody('.manager-empty'), /box-sizing:\s*border-box/);
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

  it('the NOTE variant releases the panel itself — no edge, no corner, no tile', () => {
    // The popover empty (issue 1373). `proto:2262` is one line and nothing else —
    // `padding:7px; font:500 10px var(--sans); color:var(--subtle)` — where every other
    // variant here keeps the dashed panel. That is the distinction: `is-inline` puts the
    // sentence on one LINE and keeps the box, `is-note` removes the BOX. A note that merely
    // shrank the panel would still draw a bordered card inside a 240px popover, which is the
    // shape the maintainer photographed beside the design.
    const panel = ruleBody('.manager-empty.is-note');
    assert.match(panel, /border:\s*0/, 'the dashed edge is released, not merely thinned');
    assert.match(panel, /padding:\s*var\(--fab-space-chip\)/, 'proto:2262`s 7px, nearest step 6');
    assert.match(panel, /text-align:\s*left/, 'a note reads from the left, not centred');

    // The tile is released the way `is-inline` releases it rather than resized, so a caller
    // that does pass an icon gets a bare glyph and never a third tile size.
    const glyph = ruleBody('.manager-empty.is-note > div > i');
    assert.match(glyph, /width:\s*auto/, 'the tile width is released');
    assert.match(glyph, /background:\s*none/, 'and its fill with it');
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

  /**
   * THE TWO SMALL-TEXT VARIANTS INK AT THE MUTED TONE, WHICH IS THE ONE FIGURE OF THE
   * REFERENCE'S THEY DO NOT TAKE (issue 1514).
   *
   * `proto:2262` inks the note line `var(--subtle)` and `proto:2545` inks the filtered
   * sentence `var(--disabled)`, and both shipped that way. SIX of the seven palettes declare
   * `muted` and `subtle` as ALPHAS over the surface rather than as opaque values, and all
   * seven declare `disabled` as one, so on the
   * default `fabricate` theme those composite to 3.69:1 and 2.66:1 on `--fab-surface` at 10px
   * and 11.5px — small text, under the 4.5:1 floor `spec.md` states. `--fab-text-muted` reads
   * 5.42:1 on `--fab-surface` and 5.00:1 on `--fab-surface-soft`, and clears the floor in all
   * seven palettes with `ironblood-forge` worst at 5.19:1 and 4.77:1.
   *
   * Pinned on the SOURCE rather than computed: happy-dom resolves no cascade, and the whole
   * failure mode here was that ONE palette read the subtle declaration as passing —
   * `mythwright`, the only one of the seven that states `muted` and `subtle` as opaque hues,
   * measures 5.28:1 from the subtle tone. Six fail and one passes, so the reference was set
   * from the single outlier; the `filtered` variant's 2.66:1 had no outlier at all and failed
   * in all seven. The variants are what carry it, so a caller cannot get it wrong and a revert
   * cannot be silent — which is the point of pinning a figure no palette but one agrees with.
   */
  it('inks the note and filtered variants at the MUTED tone, not the reference`s subtle/disabled', () => {
    for (const selector of ['.manager-empty.is-note h3', '.manager-empty.is-note p']) {
      assert.match(
        ruleBody(selector),
        /color:\s*var\(--fab-text-muted\)/,
        `${selector} inks at the muted tone: at 10px the subtle tone measures 3.69:1 on the ` +
          'default theme, under the small-text floor'
      );
    }
    for (const selector of ['.manager-empty.is-filtered', '.manager-empty.is-filtered p']) {
      assert.match(
        ruleBody(selector),
        /color:\s*var\(--fab-text-muted\)/,
        `${selector} inks at the muted tone: the disabled tone measures 2.66:1 on the default ` +
          'theme, the worst reading in this family and the reference`s own value'
      );
    }
    assert.ok(
      !/--fab-text-disabled/.test(emptyStateSource.split('<style>')[1] ?? ''),
      'and the disabled tone is gone from this component entirely, rather than left on one ' +
        'of the two rules the filtered variant declares'
    );
  });
});
