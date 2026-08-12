/**
 * The modifier SELECTION card and the Validation tab's per-activity wiring, MOUNTED
 * (issues 1095, 1117, 1096).
 *
 * ISSUE 1096's PARITY ROUND rebuilt this surface against the design prototype, and what it
 * changed is mostly INVISIBLE to a frame, which is why so much of it is pinned here: the
 * eligibility pill became the real control (a checkbox went away, and the accessible name, the
 * pressed state and the description all moved onto the pill), the deep link moved into the card
 * head, the library note moved to the foot, `How they combine` became its own card, and the
 * `bySubject` eligibility vocabulary collapsed onto `playerPicks`'s.
 *
 * Two further things shipped unpinned and are pinned here:
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
    'src/ui/svelte/apps/manager/checks/CheckDcMacroCard.svelte',
    'src/ui/svelte/apps/manager/checks/CheckDifficultyCard.svelte',
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

  // THREE WORDS, one per KIND of rule (issue 1096). It was four: `bySubject` owned `Picked per
  // subject` / `Not picked by default`. The prototype gives both DEFERRING rules the same pair,
  // and that is forced rather than preferred — its `By recipe` description, which this card now
  // ships verbatim, reads "from the modifiers you mark SELECTABLE", so a row saying anything
  // else makes the sentence beside it untrue about the control it names.
  it('gives the not-selected state one word per KIND of rule, and the two deferring rules share', async () => {
    const seen = new Map();
    for (const [policy, on, off] of [
      ['addAll', /^Applied$/, /^Not applied$/],
      ['highest', /^Considered$/, /^Not considered$/],
      ['playerPicks', /^Selectable$/, /^Not selectable$/],
      ['bySubject', /^Selectable$/, /^Not selectable$/],
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
      seen.set(policy, notSelected);
    }
    assert.equal(
      new Set(seen.values()).size,
      3,
      'three OFF words over four rules — reused ONLY by the two that defer the selection'
    );
    assert.equal(
      seen.get('bySubject'),
      seen.get('playerPicks'),
      'the two deferring rules say the same thing because the rule card beside them does'
    );
    harness.remount();
  });

  // THE PILL IS THE CONTROL (issue 1096). It was presentational, sat beside a
  // `SelectionCheckbox`, and was hidden from assistive technology because the checkbox already
  // carried the state word. The prototype draws one control per row, so the checkbox is gone and
  // the pill is a real toggle button — which means the accessible name, the pressed state and
  // the description all have to move onto it, and none of that is visible in a frame.
  it('makes the pill the real control: a toggle button, named, pressed and described', async () => {
    const target = await mountChecks();
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    const pill = card.querySelector('[data-crafting-modifier-eligibility="med"]');
    assert.equal(pill.tagName, 'BUTTON', 'a control a keyboard can reach and activate');
    assert.equal(pill.getAttribute('type'), 'button', 'never a submit inside a form-adjacent card');
    assert.equal(pill.getAttribute('aria-pressed'), 'true', 'the selected entry reads as pressed');
    assert.match(
      pill.getAttribute('aria-label'),
      /Medicine — Applied/,
      'the pill carries the row’s accessible name, state word included — nothing else can now'
    );
    assert.ok(
      Boolean(target.querySelector(`#${pill.getAttribute('aria-describedby')}`)),
      'its description resolves to the active rule’s sentence, so "Applied" means something ' +
        'to a reader who never sees the rule grid'
    );
    assert.equal(
      card.querySelector('[data-crafting-modifier-eligibility="huge"]').getAttribute('aria-pressed'),
      'false',
      'and an unselected entry reads as unpressed rather than merely differently coloured'
    );

    // NO NESTED CONTROL, in either direction. An interactive control inside an interactive one
    // lands DOM the browser did not build as authored, and the retired checkbox is exactly what
    // a partial conversion would leave behind.
    assert.ok(!pill.querySelector('button, input, a'), 'nothing interactive nests inside the pill');
    assert.ok(
      !card.querySelector('input[type="checkbox"]'),
      'the checkbox is gone — two controls for one decision is what this replaces'
    );
    harness.remount();
  });

  it('toggles the eligible set from the pill, both ways', async () => {
    const patches = [];
    const target = await mountChecks({
      onUpdateCraftingCheckModifiers: (patch) => patches.push(patch),
    });
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    card.querySelector('[data-crafting-modifier-eligibility="huge"]').click();
    card.querySelector('[data-crafting-modifier-eligibility="med"]').click();
    assert.deepEqual(
      patches,
      [{ defaultModifierIds: ['med', 'huge'] }, { defaultModifierIds: [] }],
      'clicking an unselected entry adds it and clicking a selected one removes it — the ' +
        'pill IS the write, not a label beside one'
    );
    harness.remount();
  });

  // THE SHAPE OF THE SCREEN, which no per-element assertion can state. Each clause below is
  // something that shipped in the wrong PLACE rather than missing: the deep link sat at the foot
  // of the rows in the slot every other list here fills with its add-a-row control, the library
  // note opened the card instead of closing it, and `How they combine` was an uppercase
  // micro-label inside the catalogue card rather than a card of its own.
  it('puts the deep link in the card HEAD and the library note at the FOOT', async () => {
    const target = await mountChecks();
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    const link = card.querySelector('[data-crafting-modifier-edit-link]');
    assert.ok(
      Boolean(link.closest('.manager-checks-card-head')),
      'the one action this card has sits beside its title, not under its rows'
    );
    const rows = card.querySelector('[data-crafting-modifier-rows]');
    assert.ok(!rows.contains(link), 'and is not a member of the list it cannot extend');

    const note = card.querySelector('[data-crafting-modifier-library-note]');
    assert.ok(Boolean(note), 'the library note still states where the entries are authored');
    assert.equal(
      rows.lastElementChild,
      note,
      'and CLOSES the card: it qualifies the rows, so it is read after them, not before'
    );
    harness.remount();
  });

  it('gives `How they combine` its own studio card, with a title and a description', async () => {
    const target = await mountChecks();
    const policyCard = target.querySelector('[data-crafting-modifier-policy-card]');
    assert.ok(Boolean(policyCard), 'the combination rule is a card, not a kicker inside one');
    assert.ok(
      policyCard.classList.contains('manager-checks-card'),
      'and it wears the studio card contract, which is what strips the inspector inset'
    );
    assert.equal(
      policyCard.querySelector('.manager-checks-card-title').textContent.trim(),
      'How they combine',
      'a sentence-case title, not an uppercase micro-label'
    );
    assert.ok(
      Boolean(policyCard.querySelector('.manager-checks-card-description')),
      'with the description every other studio card head carries'
    );
    const catalogue = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    assert.ok(
      !catalogue.contains(policyCard),
      'two sibling cards — a card nested in a card is not what the stack gutter separates'
    );
    // The pick cap belongs to the rules it bounds, so it travels with them.
    assert.ok(
      !catalogue.querySelector('[data-crafting-modifier-max-picks]'),
      'and the cap is not left behind in the library card'
    );
    harness.remount();
  });

  it('keeps the pick cap with the rules it bounds, under a selecting rule only', async () => {
    const target = await mountChecks({ craftingDefaultModifierPolicy: 'playerPicks' });
    const cap = target.querySelector('[data-crafting-modifier-max-picks]');
    assert.ok(
      Boolean(cap?.closest('[data-crafting-modifier-policy-card]')),
      'the cap bounds the two deferring rules, so it sits in the card that chooses them'
    );
    harness.remount();
    const nonSelecting = await mountChecks({ craftingDefaultModifierPolicy: 'addAll' });
    assert.ok(
      !nonSelecting.querySelector('[data-crafting-modifier-max-picks]'),
      'and is absent under a rule where nobody selects — a cap on no selection is a control ' +
        'with no effect'
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
      issuesIn(target, 'gathering').includes('modifiersInertNoModifierSupport'),
      'the fixed d100 roll takes no modifiers, so a gathering selection applies to nothing — ' +
        'this section is the ONE owned path for saying so'
    );
    // NOT the mode-rolls-nothing sentence. The d100 rolled against each drop's chance IS
    // this mode's check; only the seam to add modifiers to it is missing. Naming the wrong
    // cause here told the GM to switch to a mode that rolls — and gathering's two such
    // modes are exactly the ones rendered disabled.
    assert.ok(
      !issuesIn(target, 'gathering').includes('modifiersInertNoCheck'),
      'gathering d100 must not claim its mode rolls no check'
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
