/** The modifier SELECTION card and the Validation tab's per-activity wiring. */
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
    'src/ui/model/macroReference.js',
  ],
  compiledModules: [
    ...CHECKS_TREE_COMPILED_MODULES,
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
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

/** A catalogue with one well-formed entry and one of each blocking bounds fault. */
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

  // ISSUE 1117 — NO ACTIVITY AUTHORS AN ENTRY.
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

  // THREE WORDS, one per KIND of rule (issue 1096). It was four.
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

  // THE PILL IS THE CONTROL (issue 1096). It was presentational.
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

  // -- THE VARIANTS ADDED FOR THE TOOL TAB DO NOT REACH THIS SCREEN (issue 1373, round 6) ----
  it('keeps the shipped row anatomy: trailing control, inline text, no variant class', async () => {
    const target = await mountChecks();
    const card = target.querySelector('[data-crafting-modifier-catalogue="crafting"]');
    const rows = [...card.querySelectorAll('[data-crafting-modifier-row]')];
    assert.ok(rows.length > 0, 'the library renders rows at all');
    for (const row of rows) {
      const glyph = row.querySelector('.manager-modifier-readonly-glyph');
      assert.equal(
        row.firstElementChild,
        glyph,
        'the glyph TILE still opens the row: this screen has no leading control'
      );
      const label = row.querySelector('.manager-modifier-readonly-label');
      const expression = row.querySelector('.manager-modifier-readonly-expression');
      assert.equal(label.parentElement, row, 'the name is a direct cell');
      assert.equal(expression.parentElement, row, 'and so is the expression, inline beside it');
      assert.ok(
        !row.querySelector('.manager-modifier-readonly-text'),
        'no stacking wrapper is introduced into a screen that did not ask for one'
      );
      assert.equal(row.classList.contains('is-control-leading'), false);
      assert.equal(row.classList.contains('is-text-stacked'), false);
      // The eligibility control this screen owns is still the row's LAST child.
      assert.ok(
        Boolean(row.querySelector('[data-crafting-modifier-eligibility]')),
        "the eligibility control is this caller's trailing content"
      );
      assert.equal(
        row.lastElementChild.matches('[data-crafting-modifier-eligibility]') ||
          Boolean(row.lastElementChild.querySelector('[data-crafting-modifier-eligibility]')),
        true,
        'and it trails the three cells, where it has always been'
      );
    }
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

// ── The `WHAT ACTUALLY GETS ROLLED` chips NAME their modifiers ────────────────────────
describe('the formula inset names each applied modifier (issue 1097 follow-up)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('renders the catalogue entry’s LABEL in the chip, not an empty span', async () => {
    const target = await mountChecks();
    await openSection(target, 'roll');
    const chips = [...target.querySelectorAll('[data-check-formula-modifier]')];
    assert.deepEqual(
      chips.map((chip) => chip.getAttribute('data-check-formula-modifier')),
      ['med'],
      'crafting selects exactly the well-formed entry'
    );
    assert.equal(
      chips[0].textContent.trim(),
      'Medicine',
      'the chip states which modifier it is; the glyph beside it is aria-hidden, so an empty ' +
        'name leaves the chip with NO accessible name at all'
    );
    harness.remount();
  });

  it('falls back to the entry id when the library authored no label', async () => {
    // A `label` is optional in the persisted shape (`_normalizeModifierLibrary` defaults it
    // to `''`), so the mapping cannot assume one. The fallback is the catalogue card's own
    // `modifier.label || modifier.id`, which is what keeps the two readings of the same
    // entry from disagreeing on the same screen.
    const target = await mountChecks({
      modifiers: [{ id: 'unnamed', label: '', expression: '@abilities.med.mod' }],
      craftingDefaultModifierIds: ['unnamed'],
    });
    await openSection(target, 'roll');
    assert.equal(
      target.querySelector('[data-check-formula-modifier="unnamed"]').textContent.trim(),
      'unnamed'
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
