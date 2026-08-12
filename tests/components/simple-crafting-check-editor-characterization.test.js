/**
 * CHARACTERIZATION suite for `SimpleCraftingCheckEditor`'s dynamic-DC macro drop zone
 * (issue 1036, criterion 14).
 *
 * It is landed BEFORE the editor is converted onto the shared `ItemDropZone` primitive and
 * must pass UNCHANGED afterwards. A characterization test written after the change proves
 * nothing: it can only describe what the new code already does.
 *
 * Everything asserted here is therefore a CONTRACT rather than an implementation detail —
 * the `data-check-macro-dropzone` and `data-unlink-macro` hooks (both pinned elsewhere:
 * `manager-mounted.test.js` queries the first, and the View Lab checks case navigates the
 * section), the emitted `onChange` payloads, and the three macro-name resolution states.
 * The zone's internal markup is deliberately NOT asserted, because replacing it with the
 * primitive is the whole point of the conversion.
 *
 * ONE deliberate exception, called out so a reader does not mistake it for an oversight:
 * the shipped editor already routes its drop through `resolveDropData`, so a COMPENDIUM
 * macro payload (`{ pack, id }`, no `uuid`) is accepted today. `ItemDropZone`'s own guard
 * is currently STRICTER than that — it reads `data.uuid` directly — so the conversion is
 * only behaviour-neutral once that guard widens to `resolveDropUuid`. The compendium case
 * below is the assertion that catches an unwidened conversion, and it is the common case
 * for a module-shipped macro rather than an edge one.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-simple-check-characterization-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/utils/craftingCheckExpression.js',
    // Added by the conversion, and ONLY the dependency manifest: no assertion below moved.
    // The harness closure validator throws for an undeclared static import rather than
    // hanging, so this list has to name what the tree imports.
    'src/utils/macroReference.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    // The formula field's quick-add chips are DERIVED from the active world rather than
    // hard-coded (issue 1096), so the tree now imports the derivation and its preset
    // bundles. Manifest only: no assertion below moved.
    'src/config/modifierExpressionSuggestions.js',
    'src/config/gatheringCharacterModifierPresets.js',
    // The shared copy helpers. `CheckDifficultyCard` interpolates the activity's record
    // noun into its two DC-source sentences through `interpolate` (issue 1096). Manifest
    // only: no assertion below moved.
    'src/ui/svelte/apps/manager/checks/checksCopy.js',
    // The deterministic roll-expression reducer. The formula card reads the `avg` of the
    // authored formula from it (issue 1096). Manifest only.
    'src/utils/rollExpressionAverage.js',
    // A trigger's own summary and the common-trigger presets (issue 1096), both pure and
    // both imported by `CheckTriggers.svelte`. Manifest only.
    'src/ui/svelte/apps/manager/checks/checkTriggerSummary.js',
    'src/ui/svelte/apps/manager/checks/checkTriggerPresets.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    // The shared numeric stepper the DC, tier-DC and trigger fields are built on
    // (issue 1050). Omitting it HANGS this suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Stepper.svelte',
    // The shared icon fact row, which joined this tree when issue 1096 gave the simple
    // check its Outcomes section (the two-outcome pass/fail statement). ONLY the dependency
    // manifest changed for it: no assertion below was added, edited, weakened, skipped or
    // deleted — this suite's whole value is that it did not move while the tree around it
    // did. `tests/components/mounted-harness-primitive-allowlist.test.js` is what turned
    // the omission into a failure here rather than a hung suite.
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    // The shared button primitive: the recipe-tier list and the trigger list are both
    // extended by its `dashed` role now (issue 1096). Manifest only.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDcMacroCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    // The shared status card: a trigger's break-tools effect is its own bordered card now
    // (issue 1096). Manifest only.
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
});

/** A dynamic-DC check value, which is the only mode that renders the macro zone. */
function dynamicValue(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'dynamic',
    tiers: [],
    macroUuid: null,
    diceCrits: [],
    ...overrides,
  };
}

/**
 * Dispatch a real `drop` carrying a Foundry drag payload. The `dragDrop` action reads it
 * through `getDragEventData`, so this exercises the whole shipped path rather than calling
 * the handler directly.
 */
function dropPayload(node, payload) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => JSON.stringify(payload) },
  });
  node.dispatchEvent(event);
}

describe('1036/14 SimpleCraftingCheckEditor macro drop — characterization', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
    delete globalThis.fromUuid;
  });

  it('renders the macro drop zone in dynamic mode and not in static mode', async () => {
    const target = await harness.mount({ value: dynamicValue(), onChange: () => {} });
    assert.ok(
      Boolean(target.querySelector('[data-check-macro-dropzone]')),
      'the dynamic-DC section carries the macro drop zone'
    );

    await harness.setProps({ value: dynamicValue({ dcMode: 'static' }) });
    assert.ok(
      !target.querySelector('[data-check-macro-dropzone]'),
      'the static-DC section has no macro drop zone'
    );
    harness.remount();
  });

  it('accepts a world Macro payload and emits its uuid', async () => {
    const emitted = [];
    const target = await harness.mount({
      value: dynamicValue(),
      onChange: (next) => emitted.push(next),
    });

    dropPayload(target.querySelector('[data-check-macro-dropzone]'), {
      type: 'Macro',
      uuid: 'Macro.world-dc',
    });

    assert.equal(emitted.length, 1, 'exactly one change is emitted');
    assert.equal(emitted[0].macroUuid, 'Macro.world-dc');
    assert.equal(emitted[0].rollFormula, '1d20', 'every other authored field survives');
    harness.remount();
  });

  it('accepts a COMPENDIUM Macro payload, which carries pack+id and no uuid', async () => {
    const emitted = [];
    const target = await harness.mount({
      value: dynamicValue(),
      onChange: (next) => emitted.push(next),
    });

    dropPayload(target.querySelector('[data-check-macro-dropzone]'), {
      type: 'Macro',
      pack: 'my-module.macros',
      id: 'dc-macro',
    });

    assert.equal(emitted.length, 1, 'a module-shipped macro is the common case, not an edge');
    assert.equal(emitted[0].macroUuid, 'Compendium.my-module.macros.dc-macro');
    harness.remount();
  });

  it('rejects a payload that is not a Macro, and one with no resolvable uuid', async () => {
    const emitted = [];
    const target = await harness.mount({
      value: dynamicValue(),
      onChange: (next) => emitted.push(next),
    });
    const zone = target.querySelector('[data-check-macro-dropzone]');

    for (const payload of [
      { type: 'Item', uuid: 'Item.not-a-macro' },
      { type: 'Actor', uuid: 'Actor.hero' },
      { type: 'Macro' },
      { type: 'Macro', pack: 'my-module.macros' },
    ]) {
      dropPayload(zone, payload);
    }

    assert.equal(emitted.length, 0, 'none of the four payloads emits a change');
    harness.remount();
  });

  it('renders the resolved macro NAME when `fromUuid` resolves the document', async () => {
    globalThis.fromUuid = async (uuid) =>
      uuid === 'Macro.world-dc' ? { name: 'Scaling DC', type: 'script' } : null;

    const target = await harness.mount({
      value: dynamicValue({ macroUuid: 'Macro.world-dc' }),
      onChange: () => {},
    });
    await new Promise((done) => setTimeout(done, 0));
    await harness.setProps({ value: dynamicValue({ macroUuid: 'Macro.world-dc' }) });

    assert.match(
      target.querySelector('[data-check-macro-dropzone]').textContent,
      /Scaling DC/,
      'the linked card names the macro rather than echoing its uuid'
    );
    harness.remount();
  });

  it('renders a MISSING state when `fromUuid` resolves nothing', async () => {
    globalThis.fromUuid = async () => null;

    const target = await harness.mount({
      value: dynamicValue({ macroUuid: 'Macro.deleted' }),
      onChange: () => {},
    });
    await new Promise((done) => setTimeout(done, 0));
    await harness.setProps({ value: dynamicValue({ macroUuid: 'Macro.deleted' }) });

    const zone = target.querySelector('[data-check-macro-dropzone]');
    assert.ok(
      zone.textContent.includes('not found') || zone.querySelector('.is-missing'),
      'an unresolvable link is SHOWN as broken rather than silently rendering the uuid'
    );
    harness.remount();
  });

  it('falls back to the raw uuid when `fromUuid` is not installed at all', async () => {
    delete globalThis.fromUuid;

    const target = await harness.mount({
      value: dynamicValue({ macroUuid: 'Macro.no-bridge' }),
      onChange: () => {},
    });

    assert.match(
      target.querySelector('[data-check-macro-dropzone]').textContent,
      /Macro\.no-bridge/,
      'outside Foundry the uuid itself is the best available label'
    );
    harness.remount();
  });

  it('unlinks the macro to null through the `data-unlink-macro` control', async () => {
    globalThis.fromUuid = async () => ({ name: 'Scaling DC', type: 'script' });
    const emitted = [];
    const target = await harness.mount({
      value: dynamicValue({ macroUuid: 'Macro.world-dc' }),
      onChange: (next) => emitted.push(next),
    });

    const unlink = target.querySelector('[data-unlink-macro]');
    assert.ok(Boolean(unlink), 'a linked macro offers an unlink control');
    unlink.click();

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].macroUuid, null, 'unlink CLEARS rather than deleting the key');
    harness.remount();
  });

  it('offers no unlink control while nothing is linked', async () => {
    const target = await harness.mount({ value: dynamicValue(), onChange: () => {} });
    assert.ok(
      !target.querySelector('[data-unlink-macro]'),
      'the empty state is a drop prompt, not an unlink affordance'
    );
    harness.remount();
  });
});
