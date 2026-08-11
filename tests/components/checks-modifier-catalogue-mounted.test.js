/**
 * The modifier SELECTION card and the Validation tab's per-activity wiring, MOUNTED
 * (issues 1095, 1117).
 *
 * Two things shipped unpinned and are pinned here:
 *
 *  1. THE READ-ONLY LIBRARY ROWS. Issue 1117 removed the entry editor from this card on
 *     EVERY activity, crafting included: the library has one authoring surface (System
 *     settings › Modifiers) and this screen selects over it. What is pinned is that no
 *     activity renders an editor, that every activity renders the identity/expression/bounds
 *     read-out, and that each carries the deep link to the surface that does author it. The
 *     per-row bounds FAULT note stays — it is the only place a GM is told, on the screen that
 *     applies the entry, that it now contributes nothing.
 *  2. THE `modifierContext` WIRING. `ChecksView` builds one context per activity and hands it
 *     to that activity's readiness section. The three rules are proven as RULES in
 *     `checks-readiness.test.js`, but the seam that delivers them was not: setting any of the
 *     three to `null`, or pointing salvage and gathering at `'crafting'`, survived the suite —
 *     and the second one is invisible from a screenshot too, because the three activities
 *     usually select the same entries.
 *
 * The wiring assertions are built so the activities DISAGREE: crafting selects a well-formed
 * entry and salvage/gathering each select a broken one. An activity reading another's
 * selection therefore reports the wrong answer rather than the same one.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  CHECKS_TREE_COMPILED_MODULES,
  CHECKS_TREE_RAW_MODULES,
} from '../helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-checks-modifier-catalogue-',
  rawModules: [
    ...CHECKS_TREE_RAW_MODULES,
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/utils/macroReference.js',
  ],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/apps/manager/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/checks/CheckFormulaFields.svelte',
    'src/ui/svelte/apps/manager/checks/CheckRecipeTiers.svelte',
    'src/ui/svelte/apps/manager/checks/CheckTriggers.svelte',
    'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/ProgressiveCraftingCheckEditor.svelte',
    'src/ui/svelte/apps/manager/checks/CheckAwardMode.svelte',
    'src/ui/svelte/apps/manager/checks/CheckModeCallout.svelte',
    'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/checks/ChecksView.svelte',
});

const SIMPLE_CHECK = { rollFormula: '1d20', dc: 15, thresholdMode: 'meet', dcMode: 'static' };

/**
 * A catalogue with one well-formed entry and one of each blocking bounds fault.
 *
 * `inverted` is `min > max`; `huge` is finite but not expressible as a dice-grammar
 * `Constant`, which is a DIFFERENT repair and therefore a different issue.
 */
const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@abilities.med.mod', min: -1, max: 5 },
  { id: 'inverted', label: 'Inverted', expression: '@abilities.alch.mod', min: 5, max: -1 },
  { id: 'huge', label: 'Huge', expression: '@abilities.her.mod', min: 1e21 },
];

// The four activities became rail ROUTES and the five sections became the strip
// (issue 1096), so `activity` is a prop and the catalogue card lives on the Modifiers
// section. Every mount here is about the catalogue, so the default lands on it.
async function mountChecks(props = {}) {
  const target = await harness.mount({
    activity: 'crafting',
    resolutionMode: 'simple',
    craftingCheckSimple: SIMPLE_CHECK,
    salvageCheckSimple: SIMPLE_CHECK,
    gatheringResolutionMode: 'd100',
    features: { salvage: true, gathering: true },
    activation: {},
    modifiers: CATALOGUE,
    craftingDefaultModifierPolicy: 'addAll',
    craftingDefaultModifierIds: ['med'],
    salvageDefaultModifierPolicy: 'addAll',
    salvageDefaultModifierIds: ['inverted'],
    gatheringDefaultModifierPolicy: 'addAll',
    gatheringDefaultModifierIds: ['huge'],
    ...props,
  });
  if (target.querySelector('#checks-section-modifiers')) await openSection(target, 'modifiers');
  return target;
}

/** Click one of the five section-strip buttons and let the panel render. */
async function openSection(target, section) {
  const button = target.querySelector(`#checks-section-${section}`);
  assert.ok(button, `the section strip should offer "${section}"`);
  button.click();
  await new Promise((done) => setTimeout(done, 0));
  return target;
}

describe('the check-modifier catalogue card (mounted)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  // ISSUE 1117 — NO ACTIVITY AUTHORS AN ENTRY, and the assertion runs over all three so
  // "crafting is special" cannot come back on one of them. The editor's absence is asserted
  // by its own hooks, not by the presence of the read-only row: a card rendering BOTH would
  // pass a read-only-row-only check.
  for (const activity of ['crafting', 'salvage', 'gathering']) {
    it(`renders the library READ-ONLY on ${activity}, with no entry editor at all`, async () => {
      const target = await mountChecks({ activity });
      const card = target.querySelector(`[data-crafting-modifier-catalogue="${activity}"]`);
      assert.ok(Boolean(card), `${activity} renders the modifier card`);

      const rows = card.querySelectorAll('[data-crafting-modifier-readonly="label"]');
      assert.equal(rows.length, CATALOGUE.length, 'every entry is read out');
      assert.equal(rows[0].textContent.trim(), 'Medicine');
      assert.equal(
        card.querySelector('[data-crafting-modifier-readonly="expression"]').textContent.trim(),
        '@abilities.med.mod'
      );

      for (const editorHook of [
        '[data-crafting-modifier-field="label"]',
        '[data-crafting-modifier-field="expression"]',
        '[data-crafting-modifier-field="min"]',
        '[data-crafting-modifier-field="max"]',
        '[data-crafting-modifier-bounds]',
        '[data-crafting-modifier-remove]',
        '[data-crafting-modifier-add]',
      ]) {
        assert.ok(
          !card.querySelector(editorHook),
          `${activity}: ${editorHook} is authoring, and this screen no longer authors`
        );
      }

      assert.ok(
        Boolean(card.querySelector('[data-crafting-modifier-edit-link]')),
        `${activity}: the deep link to the one authoring surface is what replaces the editor`
      );
      harness.remount();
    });
  }

  it('says at the ROW which entries are blocked, and names the right fault for each', async () => {
    const target = await mountChecks();
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    assert.ok(
      !card.querySelector('[data-crafting-modifier-bounds-invalid="med"]'),
      'a well-formed entry gets no note'
    );
    const inverted = card.querySelector('[data-crafting-modifier-bounds-invalid="inverted"]');
    assert.ok(inverted, 'an inverted pair is called out where the GM authored it');
    assert.equal(inverted.dataset.craftingModifierBoundsCause, 'inverted');
    assert.match(inverted.textContent.trim(), /minimum is above its maximum/i);

    const huge = card.querySelector('[data-crafting-modifier-bounds-invalid="huge"]');
    assert.ok(huge, 'so is a bound the dice grammar cannot express');
    assert.equal(
      huge.dataset.craftingModifierBoundsCause,
      'unsafe',
      'a DIFFERENT cause: "too large to appear in a roll" is not "min above max", and the ' +
        'two repairs are different'
    );
    harness.remount();
  });

  // ONE empty state, on every activity (issue 1117). It branched while crafting owned the
  // entries — "Add one" was true there and false on the other two, directly above a button
  // offering the crafting tab instead. Nothing on this screen adds one now, so the sentence
  // is the same everywhere and it names the surface that does.
  it('gives every activity the same empty state, naming the one authoring surface', async () => {
    for (const activity of ['crafting', 'salvage', 'gathering']) {
      harness.remount();
      const target = await mountChecks({ activity, modifiers: [] });
      const empty = target.querySelector(
        `[data-crafting-modifier-catalogue="${activity}"] [data-crafting-modifier-empty]`
      );
      assert.equal(empty.dataset.craftingModifierEmpty, 'linked');
      assert.match(empty.textContent, /System settings/, `${activity}: it names where to go`);
      assert.ok(
        !/Add one/.test(empty.textContent),
        `${activity}: no screen here adds one, so "Add one" would be an instruction it ` +
          'cannot carry out'
      );
    }
    harness.remount();
  });

  it('puts the eligibility sentence ABOVE the rows it governs', async () => {
    const target = await mountChecks();
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    const intro = card.querySelector('[data-crafting-modifier-defaults]');
    const rows = card.querySelector('[data-crafting-modifier-rows]');
    assert.ok(intro, 'the active rule states what switching an entry on MEANS');
    assert.equal(
      intro.compareDocumentPosition(rows) & 4,
      4,
      'the sentence precedes the rows: below the rule grid it landed far under the controls ' +
        'it explains and read as a footnote about the pick cap'
    );
    harness.remount();
  });

  it('gives the not-selected state one word per RULE, not one word for four', async () => {
    const seen = new Set();
    for (const [policy, on, off] of [
      ['addAll', /Applied/, /Not applied/],
      ['highest', /Considered/, /Not considered/],
      ['playerPicks', /Selectable/, /Not selectable/],
      ['bySubject', /Picked per subject/, /Not picked/],
    ]) {
      harness.remount();
      const target = await mountChecks({ craftingDefaultModifierPolicy: policy });
      const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
      const selected = card
        .querySelector('[data-crafting-modifier-eligibility="med"]')
        .textContent.trim();
      const notSelected = card
        .querySelector('[data-crafting-modifier-eligibility="huge"]')
        .textContent.trim();
      assert.match(selected, on, `${policy}: the ON word`);
      assert.match(notSelected, off, `${policy}: the OFF word answers the ON one`);
      seen.add(notSelected);
    }
    assert.equal(seen.size, 4, 'four rules, four OFF words — none reused');
    harness.remount();
  });

  it('hides the eligibility pill from assistive tech, because the checkbox already says it', async () => {
    const target = await mountChecks();
    const row = target.querySelector(
      '[data-crafting-modifier-catalogue="crafting"] [data-crafting-modifier-eligibility="med"]'
    );
    const input = row.querySelector('[data-crafting-modifier-eligibility-input="med"]');
    assert.match(
      input.getAttribute('aria-label'),
      /Medicine — Applied/,
      'the CHECKBOX carries the accessible name, state word included'
    );
    const pill = row.querySelector('[data-status-pill]');
    assert.ok(Boolean(pill), 'the pill still renders for sighted users');
    assert.equal(
      pill.closest('[aria-hidden="true"]') === null,
      false,
      'and is hidden from a reader, which would otherwise hear "Applied" twice'
    );
    assert.ok(
      Boolean(target.querySelector(`#${input.getAttribute('aria-describedby')}`)),
      'its description resolves to the active rule’s eligibility sentence, so "Applied" ' +
        'means something to a reader who never sees the rule grid'
    );
    harness.remount();
  });
});

describe('the Validation tab reads each activity’s OWN modifier context', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  /** The issue ids listed inside one subsystem's validation section. */
  function issuesIn(target, subsystem) {
    return [
      ...target.querySelectorAll(
        `[data-checks-validation-section="${subsystem}"] [data-issue]`
      ),
    ].map((node) => node.dataset.issue);
  }

  it('reports each activity’s own broken entry, in its own section', async () => {
    const target = await mountChecks({ activity: 'validation' });
    assert.ok(
      Boolean(target.querySelector('[data-checks-validation-section="crafting"]')),
      'the crafting section renders'
    );
    // The POSITIVE half for crafting. A section whose context is missing entirely reports no
    // modifier issue either — indistinguishable from a healthy one by issues alone — so the
    // green tick is what says the rules were actually evaluated here.
    const craftingTick = target.querySelector(
      '[data-checks-validation-section="crafting"] [data-check="modifierBoundsValid"]'
    );
    assert.ok(craftingTick, 'crafting’s modifier rules were evaluated at all');
    assert.equal(craftingTick.dataset.satisfied, 'true');
    assert.ok(
      !issuesIn(target, 'crafting').includes('modifierBoundsInverted'),
      'crafting selects only the well-formed entry, so it reports no bounds fault — the ' +
        'catalogue is SHARED, and reporting an entry this activity never applies would be ' +
        'a warning about somebody else’s configuration'
    );
    assert.ok(
      issuesIn(target, 'salvage').includes('modifierBoundsInverted'),
      'salvage selects the inverted entry, so IT reports the fault — a salvage section ' +
        'built from the crafting context would silently report nothing'
    );
    assert.ok(
      issuesIn(target, 'gathering').includes('modifierBoundsUnsafe'),
      'and gathering selects the inexpressible one'
    );
    harness.remount();
  });

  it('reports the gathering d100 selection as reaching no roll at all', async () => {
    const target = await mountChecks({ activity: 'validation' });
    assert.ok(
      issuesIn(target, 'gathering').includes('modifiersInertNoCheck'),
      'the fixed d100 roll has no formula, so a gathering selection applies to nothing — ' +
        'this section is the ONE owned path for saying so'
    );
    assert.ok(
      !issuesIn(target, 'crafting').includes('modifiersInertNoCheck'),
      'while crafting, which does roll a formula, says nothing of the kind'
    );
    harness.remount();
  });

  it('says nothing about modifiers when an activity selects none', async () => {
    const target = await mountChecks({
      activity: 'validation',
      salvageDefaultModifierIds: [],
      gatheringDefaultModifierIds: [],
    });
    for (const subsystem of ['salvage', 'gathering']) {
      assert.deepEqual(
        issuesIn(target, subsystem).filter((id) => id.startsWith('modifier')),
        [],
        `${subsystem}: warning that nothing does anything, when nothing was authored, is noise`
      );
    }
    harness.remount();
  });
});
