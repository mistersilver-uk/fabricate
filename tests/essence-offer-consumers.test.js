/**
 * Issue 1036, criterion 18 — the add-new essence offer, as a CLOSED set of consumers.
 *
 * The behaviour of each consumer is proven where it renders: `recipe-edit-mounted`,
 * `component-edit-salvage-mounted`, `component-bulk-edit-panel-mounted` and
 * `component-editor-root-mounted` each drive their own control and each carry a negative
 * control that an enabled essence IS offered.
 *
 * What CANNOT be proven there is that the set is complete. A seventh add-essence control
 * added later would simply not be covered, and nothing would say so — which is exactly the
 * shape of failure this file exists to prevent. So this suite treats the consumer list as
 * the hand-maintained mirror it is and asserts, from the source tree:
 *
 * 1. every enumerated consumer still imports and applies the projection;
 * 2. no `src/ui` file filters the `essenceOptions` / `essenceDefinitions` PROP itself,
 *    which is the destructive shape the projection exists to avoid;
 * 3. every file that renders an essence add-affordance is on the enumerated list.
 *
 * It also unit-tests `visibleEssenceOptions`, the offer-plus-retained projection the three
 * quantity/picker surfaces share.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { selectableEssenceOptions, visibleEssenceOptions } from '../src/utils/essenceValidation.js';

const repoRoot = resolve(import.meta.dirname, '..');
const uiRoot = join(repoRoot, 'src/ui');

/**
 * The enumerated consumers, each with the projection it applies.
 *
 * `selectableEssenceOptions` for a control that only ever ADDS; `visibleEssenceOptions` for
 * a surface that is simultaneously the offer and the editing surface for what is already
 * authored, which must keep an already-carried disabled essence reachable.
 */
const CONSUMERS = Object.freeze([
  ['src/ui/svelte/apps/manager/ComponentEditView.svelte', 'visibleEssenceOptions'],
  ['src/ui/svelte/apps/ComponentEditorRoot.svelte', 'visibleEssenceOptions'],
  [
    'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte',
    'visibleEssenceOptions',
  ],
  ['src/ui/svelte/apps/manager/recipe/RecipeIngredientOption.svelte', 'visibleEssenceOptions'],
  [
    'src/ui/svelte/apps/manager/recipe/RecipeIngredientGroupCard.svelte',
    'selectableEssenceOptions',
  ],
  ['src/ui/svelte/apps/manager/recipe/RecipeIngredientSetCard.svelte', 'selectableEssenceOptions'],
]);

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function uiSourceFiles() {
  return readdirSync(uiRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(svelte|js)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((absolute) => absolute.slice(repoRoot.length + 1).replaceAll('\\', '/'));
}

test('1036/18: every enumerated consumer imports AND applies its projection', () => {
  for (const [path, projection] of CONSUMERS) {
    const source = read(path);
    assert.match(
      source,
      new RegExp(`import\\s*\\{\\s*${projection}\\s*\\}\\s*from\\s*'[^']*essenceValidation\\.js'`),
      `${path} imports ${projection}`
    );
    assert.match(source, new RegExp(`${projection}\\(`), `${path} calls ${projection}`);
  }
});

test('1036/18: no consumer filters the essence PROP itself', () => {
  // The destructive shape, and the reason the projection exists at all. Filtering the prop
  // drops a disabled essence's authored quantity through `buildComponentEditorUpdates`,
  // wipes it across a whole selection through the bulk panel's whole-map replacement, and
  // renders authored recipe options unresolved.
  const destructive =
    /(essenceOptions|essenceDefinitions)\s*(\|\|\s*\[\])?\s*\)?\s*\.filter\s*\(/;
  for (const path of uiSourceFiles()) {
    assert.ok(
      !destructive.test(read(path)),
      `${path} filters the essence prop directly; route the OFFER through essenceValidation.js instead`
    );
  }
});

test('1036/18: the consumer list is CLOSED — no unlisted file renders an essence add', () => {
  // The mirror guard. Every add-affordance in the manager carries a `data-recipe-add`
  // essence token or drives an essence quantity card, so a new one is findable from source
  // even before it has a test. Without this, a seventh consumer would silently ship
  // unfiltered and every per-consumer test below would still be green.
  const ADD_MARKERS = [
    /data-recipe-add="alternative-essence"/,
    /triggerAddMarker="essence-requirement"/,
    /<EssenceQuantityCard/,
    /class="essence-card"/,
  ];
  const listed = new Set(CONSUMERS.map(([path]) => path));

  const rendering = uiSourceFiles().filter((path) => {
    const source = read(path);
    return ADD_MARKERS.some((marker) => marker.test(source));
  });

  assert.ok(rendering.length > 0, 'the markers still match something — a vacuous scan proves nothing');
  assert.deepEqual(
    rendering.filter((path) => !listed.has(path)),
    [],
    'an essence add-affordance exists in a file the offer projection does not cover'
  );
});

// ---------------------------------------------------------------------------
// visibleEssenceOptions — the offer, plus whatever the caller says is in play
// ---------------------------------------------------------------------------

const OPTIONS = Object.freeze([
  Object.freeze({ id: 'air', name: 'Air', enabled: false, quantity: 0 }),
  Object.freeze({ id: 'earth', name: 'Earth', enabled: true, quantity: 0 }),
  Object.freeze({ id: 'fire', name: 'Fire', enabled: false, quantity: 3 }),
  Object.freeze({ id: 'water', name: 'Water' }),
]);

test('1036/2: visibleEssenceOptions keeps the offer plus anything already in play', () => {
  assert.deepEqual(
    visibleEssenceOptions(OPTIONS, (option) => option.quantity > 0).map((option) => option.id),
    ['earth', 'fire', 'water'],
    'the disabled-but-carried essence survives; the disabled-and-uncarried one does not'
  );
});

test('1036/2 negative control: with no retained predicate it IS the plain offer', () => {
  assert.deepEqual(
    visibleEssenceOptions(OPTIONS).map((option) => option.id),
    selectableEssenceOptions(OPTIONS).map((option) => option.id),
    'so a passing retained-arm test cannot be measuring a filter that filters nothing'
  );
});

test('1036/2: input ORDER is preserved, because it is the system vocabulary order', () => {
  const reversed = [...OPTIONS].reverse();
  assert.deepEqual(
    visibleEssenceOptions(reversed, () => false).map((option) => option.id),
    ['water', 'earth'],
    'the projection never re-sorts; the two essence grids read the same order as the library'
  );
});

test('1036: visibleEssenceOptions is total over junk and never mutates its input', () => {
  assert.deepEqual(visibleEssenceOptions(null), []);
  assert.deepEqual(visibleEssenceOptions('fire'), []);
  assert.notEqual(visibleEssenceOptions(OPTIONS), OPTIONS);
  assert.equal(OPTIONS.length, 4, 'the unfiltered list is untouched');
});

test('1036: a retained predicate that throws nothing but returns junk is treated as NOT retained', () => {
  // `=== true`, not truthiness: a predicate returning a truthy object would otherwise
  // retain every row and the offer would silently stop filtering.
  assert.deepEqual(
    visibleEssenceOptions(OPTIONS, () => 'yes').map((option) => option.id),
    ['earth', 'water']
  );
});
