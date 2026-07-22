import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

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
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/systems/characterPrerequisites.js',
    // SystemEditView imports the pure copy-mapping helpers (issue 768); omitting it
    // HANGS this mount (reported as `# cancelled`).
    'src/systems/characterModifierPrerequisiteCopy.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/system/SystemEditorTabs.svelte',
    'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
    'src/ui/svelte/apps/manager/SystemOverviewView.svelte',
    'src/ui/svelte/apps/manager/SystemEditView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/SystemEditView.svelte'
});

// Let Svelte's scheduler flush DOM updates triggered by an event handler.
function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

const GOLD_ID = 'gold-unit-id';
const COPPER_ID = 'K9grZcOMgO9Xbm41';

function makeSystem() {
  return {
    id: 'system-under-test',
    name: 'Mythwright',
    description: '',
    features: {},
    requirements: { currency: { enabled: true } }
  };
}

// Two contains-less units: gold carries an authored abbreviation, copper's is
// unauthored (empty). Each is an eligible sub-unit of the other (disjoint
// reachable sets), so expanding one reveals the other in the sub-unit builder.
const CURRENCY_UNITS = Object.freeze([
  { id: GOLD_ID, label: 'Gold', abbreviation: 'gp', actorPath: '', contains: [] },
  { id: COPPER_ID, label: 'Copper', abbreviation: '', actorPath: '', contains: [] }
]);

function expandUnit(root, unitId) {
  const row = root.querySelector(`[data-system-currency-unit="${unitId}"]`);
  assert.ok(row, `currency row for ${unitId} exists`);
  const editButton = row.querySelector('.manager-character-modifier-summary .manager-icon-button');
  assert.ok(editButton, `edit button for ${unitId} exists`);
  editButton.dispatchEvent(new globalThis.window.Event('click', { bubbles: true }));
}

function subUnitOptionTexts(root, unitId) {
  const select = root.querySelector(
    `[data-system-currency-unit="${unitId}"] .manager-currency-subunit-builder select`
  );
  assert.ok(select, `sub-unit builder select for ${unitId} exists`);
  return [...select.querySelectorAll('option')].map((option) => ({
    value: option.value,
    text: option.textContent
  }));
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('currency sub-unit option label (mounted)', () => {
  it('renders an unauthored-abbreviation unit as its label only — no parenthetical, no id (issue 788)', async () => {
    const root = await harness.mount({ selectedSystem: makeSystem(), currencyUnits: CURRENCY_UNITS });

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
    const root = await harness.mount({ selectedSystem: makeSystem(), currencyUnits: CURRENCY_UNITS });

    // Expand copper; its sub-unit builder offers gold, whose abbreviation is authored.
    expandUnit(root, COPPER_ID);
    await flushRender();

    const options = subUnitOptionTexts(root, COPPER_ID);
    const gold = options.find((option) => option.value === GOLD_ID);
    assert.ok(gold, 'gold is an eligible sub-unit of copper');
    assert.equal(gold.text, 'Gold (gp)', 'authored abbreviation renders unchanged');
  });
});
