/**
 * The module sheet and every component style against the published `ActionMenu` (issue 2652): the
 * 20 selectors that name its two roots, the trigger side's `fabricate-action-menu` and the menu's
 * `fabricate-action-menu-panel`, the 14 of them a published menu matches with nothing above its
 * root, the classes its file spells on them, and the focus marks: the trigger's module ring, the
 * item's 1px accent ring drawn inside its edge on its raised fill, and the empty menu's module ring.
 * The danger item's ink is pinned in every palette.
 * Limit: the census shares `published-component-manifest.test.js`'s sheet-reach limits.
 * Limit: a companion passing an item's private `tone` still draws `is-<tone>`, and the five
 * `is-<kind>` glyph rules of the recipe editor's kind menu then reach its item.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineAccentRingContrast } from './helpers/accentRingContrast.js';
import {
  dataHooksOf,
  entryNamed,
  placementFaults,
  shippedCensus,
  spelledStrings,
  syntheticCensus,
} from './helpers/publishedComponentCensus.js';
import { SHIPPED, byName, declarationsOf, moduleRing } from './helpers/publishedComponentGate.js';
import { collectStyleCorpus, rulesIn } from './helpers/styleBlockScan.js';
import {
  declaredToken,
  propertiesOf,
  shortfalls,
  themePalettes,
} from './helpers/themePaletteContrast.js';

const COMPONENT = 'src/ui/svelte/components/ActionMenu.svelte';
const SHEET = 'styles/fabricate-manager-tool-editor-environments.css';
const KIND_SHEET = 'styles/fabricate-manager-recipe-editor.css';

/** The trigger side's root, which no published key classes and no Fabricate rule redraws under an ancestor. */
const MENU = Object.freeze({
  root: 'fabricate-action-menu',
  writable: new Set(),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set(),
});

/**
 * The menu's root, portaled into the overlay host: the class drawn beside it on every menu, and the
 * classes no published key draws, `menuClass`'s kind-menu class and the headed panel's two.
 */
const PANEL = Object.freeze({
  root: 'fabricate-action-menu-panel',
  writable: new Set(['manager-action-menu-panel']),
  ancestors: new Set(),
  drawsChildren: true,
  undrawn: new Set([
    'manager-recipe-or-menu',
    'manager-action-menu-heading',
    'manager-action-menu-list',
  ]),
});

const ITEM = '.fabricate-action-menu-panel button.manager-action-menu-item';

/** The eight rules that draw the panel and its items, every one in its sheet. */
const PANEL_FAMILY = Object.freeze([
  '.fabricate-action-menu-panel.manager-action-menu-panel',
  ITEM,
  `${ITEM} > i`,
  `${ITEM} > span`,
  `${ITEM}:hover:not(:disabled)`,
  `${ITEM}:focus-visible`,
  `${ITEM}:disabled`,
  `${ITEM}.is-danger`,
]);

/** The kind menu's glyph tints, which reach a published item only through its private `tone`. */
const TONE_RULES = Object.freeze(
  ['component', 'tag', 'currency', 'essence', 'knowledge'].map(
    (tone) => `${KIND_SHEET}: ${ITEM}.is-${tone} > i`
  )
);

const writtenOf = (census) =>
  census.map(({ written }) => written.replaceAll(/\s+/g, ' ')).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);
const census = (shape) => shippedCensus(shape, 'ActionMenu');
const inSheet = (selectors) => selectors.map((selector) => `${SHEET}: ${selector}`);
/** Whether a declaration draws or strips a ring. */
const ringProperty = ([property]) =>
  property === 'all' || property === 'box-shadow' || property.startsWith('outline');

describe('the module sheet and every component style against the published ActionMenu', () => {
  it('reaches a published menu through 14 of the 20 selectors that name its two roots', () => {
    const [menu, panel] = [census(MENU), census(PANEL)];
    assert.equal(menu.length, 1, 'the census of every selector naming the trigger side root');
    assert.equal(panel.length, 19, 'the census of every selector naming the menu root');
    assert.deepEqual(writtenOf(reachingOf(menu)), [
      `${SHEET}: .fabricate-action-menu.fabricate-action-menu`,
    ]);
    assert.deepEqual(
      writtenOf(reachingOf(panel)),
      [...inSheet(PANEL_FAMILY), ...TONE_RULES].sort(byName)
    );
    const entry = entryNamed('ActionMenu');
    assert.deepEqual(
      [Object.keys(entry.props), entry.root, entry.rest],
      [['items', 'ariaLabel', 'align', 'onSelect'], 'fabricate', false],
      'a published heading, menuClass, triggerClass, class, rest or wider root reopens the census'
    );
  });

  it('draws a published menu alike under any ancestor, and only the item focus rule draws a ring beside the menu’s elevation shadow', () => {
    for (const shape of [MENU, PANEL]) {
      const reaching = reachingOf(census(shape));
      assert.deepEqual(placementFaults(reaching, shape, []), [], shape.root);
      assert.deepEqual(dataHooksOf(reaching), [], `${shape.root}: no reaching rule reads a hook`);
    }
    const rings = [...reachingOf(census(MENU)), ...reachingOf(census(PANEL))].flatMap(
      ({ written, rule }) =>
        declarationsOf(rule)
          .filter((declaration) => ringProperty(declaration))
          .map(([property]) => `${written} declares ${property}`)
    );
    assert.deepEqual(rings, [
      `${SHEET}: ${PANEL_FAMILY[0]} declares box-shadow`,
      `${SHEET}: ${ITEM}:focus-visible declares outline`,
      `${SHEET}: ${ITEM}:focus-visible declares outline-offset`,
    ]);
  });

  it('holds the classes its file spells beside each root to the census', () => {
    const tokens = new Set(
      [...spelledStrings(COMPONENT, SHIPPED)].flatMap((spelled) => spelled.split(/\s+/))
    );
    for (const name of [MENU.root, 'is-danger']) {
      assert.ok(tokens.has(name), `${COMPONENT} spells ${name}`);
    }
  });
});

describe('the action menu census, synthetic', () => {
  const reachingIn = (shape, css) => writtenOf(reachingOf(syntheticCensus(shape, css)));

  for (const [shape, selector] of [
    [PANEL, '.fabricate-action-menu-panel.manager-recipe-or-menu button.manager-action-menu-item'],
    [PANEL, '.fabricate-action-menu-panel .manager-action-menu-heading'],
    [PANEL, '.fabricate-action-menu-panel .manager-action-menu-list'],
  ]) {
    it(`admits ${selector}, which a published menu cannot take`, () => {
      assert.deepEqual(reachingIn(shape, `${selector} { gap: 0 }`), []);
    });
  }

  for (const [shape, selector] of [
    [PANEL, '.fabricate-action-menu-panel button:hover'],
    [MENU, '.fabricate-action-menu button'],
    [PANEL, '.fabricate-action-menu-panel[data-x]'],
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published menu`, () => {
      assert.deepEqual(reachingIn(shape, `${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the keyboard ring on the published ActionMenu’s trigger, which is the module ring', () => {
  defineAccentRingContrast('.fabricate button:focus-visible', { moduleRings: [] });
});

describe('the focus marks in the published ActionMenu’s menu', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);
  const themes = themePalettes(rules);

  it('draws the item’s ring by its one focus rule, 1px of accent inside its edge on the raised fill', () => {
    const focus = rules.filter((rule) => rule.selector === `${ITEM}:focus-visible`);
    assert.equal(focus.length, 1, 'one rule marks the focused item');
    assert.deepEqual(Object.fromEntries(propertiesOf(focus[0])), {
      background: 'var(--fab-surface-raised)',
      outline: '1px solid var(--fab-accent)',
      'outline-offset': '-1px',
    });
    assert.equal(
      propertiesOf(rules.find((rule) => rule.selector === PANEL_FAMILY[0])).get('background'),
      'var(--fab-bg-0)',
      'the menu’s ground, which the translucent raised fill is read over'
    );
  });

  it('clears 3:1 for the item’s ring on its raised fill over the menu’s ground, and on that ground, in every palette', () => {
    assert.deepEqual(
      shortfalls(themes, '--fab-accent', ['--fab-surface-raised', '--fab-bg-0'], 3),
      []
    );
    assert.deepEqual(shortfalls(themes, '--fab-accent', ['--fab-bg-0'], 3), []);
  });

  it('draws the empty menu’s ring as the module ring on `[tabindex]`, 2px wide and 2px clear', () => {
    const ring = moduleRing();
    assert.ok(ring.attributes.includes('tabindex'), '.fabricate [tabindex]:focus-visible');
    assert.deepEqual(
      [ring.outline, ring.offset],
      ['2px solid var(--fab-accent)', '2px'],
      'the module ring'
    );
  });
});

describe('the danger item’s ink in the published ActionMenu', () => {
  const rules = rulesIn(collectStyleCorpus()['styles/fabricate.css']);
  const themes = themePalettes(rules);
  const ink = declaredToken(rules, `${ITEM}.is-danger`, 'color');

  it('is the danger family’s text token', () => {
    assert.equal(ink, '--fab-danger-text');
  });

  it('clears 4.5:1 on the menu’s ground in every palette', () => {
    assert.deepEqual(shortfalls(themes, ink, ['--fab-bg-0']), []);
  });

  it('clears 4.5:1 on a hovered or focused item in every palette', () => {
    assert.deepEqual(shortfalls(themes, ink, ['--fab-surface-raised', '--fab-bg-0']), []);
  });
});
