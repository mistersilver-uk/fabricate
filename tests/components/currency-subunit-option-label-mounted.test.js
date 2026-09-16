import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { assertSelectHasResolvedName, openSelectPanel } from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// The sub-unit builder <select> renders each eligible unit as its label plus a
// parenthetical abbreviation. Regression guard for issue 788: a unit whose
// abbreviation is unauthored (normalized to '' by issue 763's normalizer, merged
// as issue 789) must render its LABEL ONLY — never the raw generated unit id, and
// never an empty " ()" parenthetical. The label-building lives inline in the
// SystemEditView template, so this is asserted through a real mount.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-currency-subunit-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js'
  ],
  compiledModules: [
    // THE APP'S ONE SELECT AND ITS WHOLE COMPILED CLOSURE (issue 1510), spread rather than copied.
    // This tree renders `components/Select.svelte` now, and a `.svelte` the tree renders but the
    // harness omits HANGS the suite (`# cancelled`) rather than failing it.
    ...SELECT_COMPILED_MODULES,
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    // The shared no-state primitive (issue 785). Same rule, same consequence.
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/Field.svelte',
    // THE manager's labelled push-button (issue 1118). The currency card header and each expanded unit render it.
    // Omitting a rendered `.svelte` HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte'
});

// Let Svelte's scheduler flush DOM updates triggered by an event handler.
function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

const GOLD_ID = 'gold-unit-id';
const COPPER_ID = 'K9grZcOMgO9Xbm41';

// Two contains-less units: gold carries an authored abbreviation, copper's is
// unauthored (empty). Each is an eligible sub-unit of the other (disjoint
// reachable sets), so expanding one reveals the other in the sub-unit builder.
const CURRENCY_UNITS = Object.freeze([
  { id: GOLD_ID, label: 'Gold', abbreviation: 'gp', actorPath: '', contains: [] },
  { id: COPPER_ID, label: 'Copper', abbreviation: '', actorPath: '', contains: [] }
]);

function expandUnit(root, unitId) {
  const row = root.querySelector(`[data-world-currency-unit="${unitId}"]`);
  assert.ok(row, `currency row for ${unitId} exists`);
  // Target the Edit control by its accessible name: the summary row also carries
  // the Move up/down reorder chevrons (issue 768), so "first icon button" is no
  // longer the editor.
  const editButton = row.querySelector(
    '.manager-character-modifier-summary [aria-label="Edit currency unit"]'
  );
  assert.ok(editButton, `edit button for ${unitId} exists`);
  editButton.dispatchEvent(new globalThis.window.Event('click', { bubbles: true }));
}

/**
 * The rows the expanded unit's sub-unit builder OFFERS, read from its open panel (issue 1510).
 *
 * The control is the shared `<Select>` now, so there are no `<option>` elements to read and the
 * rows are not descendants of the trigger at all: `SearchablePopover` PORTALS the panel to the
 * nearest application root, which in a mounted suite is the harness's own mount target. The
 * trigger is still scoped per unit, because two expanded units would each render one.
 *
 * The builder's control carries no `data-*` hook of its own — it is captioned by the primitive's
 * own labelled form and addressed structurally, exactly as it was before the conversion.
 *
 * @param {HTMLElement} root The harness mount target, which is the portal host.
 * @param {string} unitId The expanded currency unit.
 * @returns {Array<{value: string, text: string}>} The offered rows, in rendered order.
 */
function subUnitOptionTexts(root, unitId) {
  const trigger = `[data-world-currency-unit="${unitId}"] .manager-currency-subunit-builder .fabricate-select-trigger`;
  assert.ok(root.querySelector(trigger), `sub-unit builder control for ${unitId} exists`);
  // THE NAME, pinned against its pre-conversion value. The wrapper this control sat in was a
  // `<Field as="label">` whose containment named it "Add sub-unit"; the primitive's own labelled
  // form now renders that caption and points the trigger at it, so the announced name is the
  // same string reached a different way.
  assert.equal(assertSelectHasResolvedName(root, trigger), 'Add sub-unit');
  const panel = openSelectPanel(root, trigger);
  return [...panel.querySelectorAll('[role="option"]')].map((row) => ({
    value: row.getAttribute('data-popover-option') ?? '',
    text: row.textContent.replaceAll(/\s+/gu, ' ').trim()
  }));
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('currency sub-unit option label (mounted)', () => {
  it('renders an unauthored-abbreviation unit as its label only — no parenthetical, no id (issue 788)', async () => {
    const root = await harness.mount({ currencyUnits: CURRENCY_UNITS });

    // Expand gold; its sub-unit builder offers copper, whose abbreviation is empty.
    expandUnit(root, GOLD_ID);
    await flushRender();

    const options = subUnitOptionTexts(root, GOLD_ID);
    const copper = options.find((option) => option.value === COPPER_ID);
    assert.ok(copper, 'copper is an eligible sub-unit of gold');
    assert.equal(copper.text, 'Copper', 'label only, no empty parenthetical');
    assert.ok(!copper.text.includes('('), 'no opening parenthesis');
    assert.ok(!copper.text.includes(')'), 'no closing parenthesis');
    assert.ok(!copper.text.includes(COPPER_ID), 'the raw generated unit id never leaks');
  });

  it('still renders an authored abbreviation as "Label (abbr)"', async () => {
    const root = await harness.mount({ currencyUnits: CURRENCY_UNITS });

    // Expand copper; its sub-unit builder offers gold, whose abbreviation is authored.
    expandUnit(root, COPPER_ID);
    await flushRender();

    const options = subUnitOptionTexts(root, COPPER_ID);
    const gold = options.find((option) => option.value === GOLD_ID);
    assert.ok(gold, 'gold is an eligible sub-unit of copper');
    assert.equal(gold.text, 'Gold (gp)', 'authored abbreviation renders unchanged');
  });
});
