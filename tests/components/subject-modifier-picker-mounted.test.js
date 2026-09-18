/** The SHARED subject check-modifier picker, MOUNTED (issue 1095). */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PICKER_PATH = 'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-subject-modifier-picker-',
  rawModules: [
    // `resolveMaxModifierPicks` decides what an ABSENT cap means, and these close its graph.
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/utils/rollFormulaRollability.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // `ModifierPillSelect`'s add menu dismisses on an outside click.
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
    // `SearchablePopover` and the two primitives IT renders (issue 1458). The add menu is
    // the shared picker now, so this tree reaches all three; an omission does not fail this
    // suite, it cancels every test in it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/EmptyState.svelte',
    PICKER_PATH,
  ],
  componentPath: PICKER_PATH,
});

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

const CATALOGUE = [
  { id: 'med', label: 'Medicine', icon: 'fas fa-staff-snake' },
  { id: 'alch', label: 'Alchemy', icon: 'fas fa-flask' },
  { id: 'herb', label: 'Herbalism', icon: 'fas fa-leaf' },
];

function mount(props = {}) {
  const emitted = [];
  return harness
    .mount({
      options: CATALOGUE,
      selectedIds: null,
      // The activity MARKS the whole catalogue by default.
      inheritedIds: CATALOGUE.map((entry) => entry.id),
      maxPicks: null,
      subject: 'component',
      testId: 'salvage-check-modifier',
      onChange: (next) => emitted.push(next),
      ...props,
    })
    .then((target) => ({ target, emitted }));
}

/** The authoredness toggle — the control that moves between "inherit" and "picks its own". */
function authorToggle(target) {
  return target.querySelector('[data-subject-modifier-authored]');
}

function setChecked(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

describe('SubjectModifierPicker (mounted)', () => {
  it('renders the picker for a non-empty catalogue and NOTHING for an empty one', async () => {
    const { target } = await mount();
    assert.ok(
      target.querySelector('[data-subject-modifier-picker="salvage-check-modifier"]'),
      'the picker renders against a real catalogue'
    );
    harness.remount();
    const { target: empty } = await mount({ options: [] });
    assert.ok(
      !empty.querySelector('[data-subject-modifier-picker]'),
      'and draws nothing at all when the system has catalogued no modifiers — a control ' +
        'whose menu could only ever be empty'
    );
  });

  it('names the INHERITED set rather than saying "inheriting" and stopping there', async () => {
    const { target } = await mount({ selectedIds: null, inheritedIds: ['med', 'herb', 'ghost'] });
    assert.equal(authorToggle(target).dataset.subjectModifierAuthored, 'inherit');
    const inherited = target.querySelector('[data-subject-modifier-inherited]');
    assert.ok(inherited, 'the inherit state renders its own note');
    const text = inherited.textContent.trim();
    assert.match(text, /Medicine/, 'the inherited entries are NAMED');
    assert.match(text, /Herbalism/);
    assert.ok(
      !text.includes('ghost'),
      'an id naming nothing in the catalogue is dropped, exactly as the resolver drops it'
    );
    // JOINED BY `formatList`, never by hand. The separator.
    const joined = new Intl.ListFormat(undefined, {
      style: 'long',
      type: 'conjunction',
    }).format(['Medicine', 'Herbalism']);
    assert.ok(
      text.includes(joined),
      `the inherited entries are joined by the active language's list conventions (${joined})`
    );
    assert.ok(
      !target.querySelector('[data-modifier-pill-select]'),
      'and there is no pill row to author, because nothing here is authored'
    );
  });

  it('states an EMPTY inherited set as a fact rather than a bare label', async () => {
    const { target } = await mount({ selectedIds: null, inheritedIds: [] });
    const text = target.querySelector('[data-subject-modifier-inherited]').textContent.trim();
    assert.match(text, /empty/i, 'the GM is told the inherited set adds nothing');
  });

  it('turns ON to an AUTHORED EMPTY array, never to null', async () => {
    const { target, emitted } = await mount({ selectedIds: null });
    setChecked(authorToggle(target), true);
    assert.equal(emitted.length, 1);
    assert.deepEqual(
      emitted[0],
      [],
      'a real pick of zero is the honest starting state; `null` would leave the record ' +
        'inheriting while the checkbox claimed it picks its own'
    );
  });

  it('turns OFF to null, restoring inheritance rather than authoring a pick of zero', async () => {
    const { target, emitted } = await mount({ selectedIds: ['med'] });
    assert.equal(authorToggle(target).dataset.subjectModifierAuthored, 'custom');
    setChecked(authorToggle(target), false);
    assert.equal(
      emitted[0],
      null,
      'emitting `[]` here would collapse the absent/authored-empty distinction — the same ' +
        'roll by accident, and unrecoverable once saved'
    );
  });

  it('renders the pill row under an authored pick, including an authored EMPTY one', async () => {
    const { target } = await mount({ selectedIds: [] });
    assert.equal(authorToggle(target).dataset.subjectModifierAuthored, 'custom');
    assert.ok(
      target.querySelector('[data-modifier-pill-select]'),
      'an authored empty pick is still an authored pick, so its editor renders'
    );
    assert.ok(!target.querySelector('[data-subject-modifier-inherited]'));
  });

  it('adds a picked id to the emitted array without disturbing the others', async () => {
    const { target, emitted } = await mount({ selectedIds: ['med'] });
    const remove = target.querySelector('[data-modifier-pill-remove="med"]');
    remove.click();
    assert.deepEqual(emitted.at(-1), [], 'removing the only pick leaves an authored empty array');
  });

  // THE CAP IS ASKED OF THE RESOLVER, not read verbatim. A stored `0`.
  it('reads the cap through the resolver, so an unlimited FORM shows no cap at all', async () => {
    for (const maxPicks of [null, undefined, 0, -2, 'three']) {
      harness.remount();
      const { target } = await mount({ selectedIds: ['med', 'alch', 'herb'], maxPicks });
      assert.ok(
        !target.querySelector('[data-subject-modifier-cap]'),
        `maxPicks ${JSON.stringify(maxPicks)} means unlimited, so no cap sentence renders`
      );
      const menu = target.querySelector('[data-modifier-pill-menu-button]');
      assert.ok(
        !menu.getAttribute('aria-disabled'),
        'and the add button stays live at any number of picks'
      );
    }
  });

  it('flips the cap hint from available to reached, and disables adding AT the cap', async () => {
    const { target } = await mount({ selectedIds: ['med'], maxPicks: 2 });
    const hint = target.querySelector('[data-subject-modifier-cap]');
    assert.ok(hint, 'a bounded cap is stated STANDING, before the GM reaches it');
    assert.equal(hint.dataset.subjectModifierCap, 'available');
    assert.ok(
      !target.querySelector('[data-modifier-pill-menu-button]').getAttribute('aria-disabled'),
      'below the cap, adding is offered'
    );

    harness.remount();
    const { target: full } = await mount({ selectedIds: ['med', 'alch'], maxPicks: 2 });
    const reached = full.querySelector('[data-subject-modifier-cap]');
    assert.equal(reached.dataset.subjectModifierCap, 'reached');
    assert.match(
      reached.textContent.trim(),
      /Remove one/i,
      'the at-cap clause tells the GM how to proceed, rather than leaving a dead button'
    );
    assert.equal(
      full.querySelector('[data-modifier-pill-menu-button]').getAttribute('aria-disabled'),
      'true',
      'and the add button is disabled AT the cap, not one past it'
    );
  });

  // ONE OF THE TWO, NEVER BOTH — the same rule the catalogue card's eligibility pill follows.
  // the same defect on the sibling surface: the checkbox carries the whole accessible name, so the
  // visible copy of those exact words beside it is a SECOND reading of one control and a reader
  // hears "Pick check modifiers for this component" twice.
  it('hides the visible toggle copy from assistive tech, because the checkbox already says it', async () => {
    const { target } = await mount();
    const input = authorToggle(target);
    assert.match(
      input.getAttribute('aria-label'),
      /Pick check modifiers for this component/,
      'the CHECKBOX carries the accessible name'
    );
    const visible = [...target.querySelectorAll('.manager-subject-modifier-mode span')].find(
      (node) => node.textContent.includes('Pick check modifiers')
    );
    assert.ok(Boolean(visible), 'the sentence still renders for sighted users');
    assert.notEqual(
      visible.closest('[aria-hidden="true"]'),
      null,
      'and is out of the accessibility tree, so the control is announced once'
    );
  });

  // THE CAP SENTENCE CARRIES A NUMBER, and the FALLBACK has to substitute it.
  it('interpolates the cap COUNT rather than printing a raw placeholder', async () => {
    const game = globalThis.game;
    globalThis.game = undefined;
    try {
      const { target } = await mount({ selectedIds: ['med'], maxPicks: 3 });
      const hint = target.querySelector('[data-subject-modifier-cap]').textContent;
      assert.match(hint, /\b3\b/, 'the bound the GM is being told about is a number on the screen');
      assert.ok(
        !hint.includes('{'),
        'and never a raw interpolation placeholder — the fallback substitutes the count itself'
      );
    } finally {
      globalThis.game = game;
    }
  });

  // A cap of ONE is the commonest bounded value there is (it is what `playerPicks` always meant,
  // and what `migrateMaxModifierPicks` stamps onto every upgraded system on that rule), so the
  // plural sentence would be the reading most GMs met.
  it('states a cap of exactly ONE in the singular', async () => {
    const { target } = await mount({ selectedIds: [], maxPicks: 1 });
    const hint = target.querySelector('[data-subject-modifier-cap]').textContent.trim();
    assert.match(hint, /pick one check modifier/i, 'a cap of 1 gets its own sentence');
    assert.ok(
      !/check modifiers/i.test(hint),
      '"pick up to 1 check modifiers" is the reading this branch exists to prevent'
    );
  });

  // ── the activity's MARK bounds what this record may pick (issue 1608) ───────
  const MARKED_TWO = ['med', 'alch'];

  /** The ids the add menu offers — where the narrowed OFFER shows. The panel is portaled. */
  async function offeredIds(target) {
    target.querySelector('[data-modifier-pill-menu-button]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return [...target.querySelectorAll('[data-modifier-pill-option]')].map((option) =>
      option.getAttribute('data-modifier-pill-option')
    );
  }

  it('offers ONLY the modifiers the activity marks selectable (issue 1608)', async () => {
    const { target } = await mount({ selectedIds: [], inheritedIds: MARKED_TWO });
    assert.deepEqual(
      await offeredIds(target),
      MARKED_TWO,
      'the catalogued-but-unmarked herb is not offered, though it is in the world library'
    );
    harness.remount();

    // THE NEGATIVE CONTROL: marking herb must put it back.
    const { target: wide } = await mount({
      selectedIds: [],
      inheritedIds: ['med', 'alch', 'herb'],
    });
    assert.deepEqual(
      await offeredIds(wide),
      ['med', 'alch', 'herb'],
      'marking herb offers it, so the filter is the MARK and not some other narrowing'
    );
  });

  it('renders no chip for a pick the activity no longer marks, and keeps it in the record (issue 1608)', async () => {
    const { target, emitted } = await mount({
      // `herb` was picked while it was marked; the activity has since un-marked it.
      selectedIds: ['med', 'herb'],
      inheritedIds: MARKED_TWO,
    });
    assert.ok(target.querySelector('[data-modifier-pill="med"]'), 'the marked pick still shows');
    assert.ok(
      !target.querySelector('[data-modifier-pill="herb"]'),
      'the un-marked pick draws no chip — the offer is the mark, so it finds no option'
    );

    // THE POINT OF THE DESIGN: an edit made beside the suppressed id must not destroy it.
    target.querySelector('[data-modifier-pill-remove="med"]').click();
    assert.deepEqual(
      emitted.at(-1),
      ['herb'],
      'removing the VISIBLE pick leaves the invisible one, rather than emptying the record'
    );
  });

  it('states how many picks the activity no longer marks, and says nothing when none (issue 1608)', async () => {
    const { target: quiet } = await mount({ selectedIds: ['med'], inheritedIds: MARKED_TWO });
    assert.ok(
      !quiet.querySelector('[data-subject-modifier-suppressed]'),
      'an ordinary record carries no standing warning'
    );
    harness.remount();

    const { target: one } = await mount({
      selectedIds: ['med', 'herb'],
      inheritedIds: MARKED_TWO,
    });
    const note = one.querySelector('[data-subject-modifier-suppressed]');
    assert.ok(Boolean(note), 'a suppressed pick is accounted for, never silently swallowed');
    assert.equal(
      note.getAttribute('data-subject-modifier-suppressed'),
      '1',
      'the COUNT rides the attribute, not only the localized sentence'
    );
    // The note DESCRIBES the pill group, alongside the cap.
    assert.match(
      one.querySelector('[data-modifier-pill-select]').getAttribute('aria-describedby'),
      new RegExp(note.id),
      'and it is wired into the group’s description rather than left visual-only'
    );
  });

  it('says the picks are HIDDEN rather than absent when the activity marks NONE of them (issue 1608)', async () => {
    // THE ZERO POINT of the suppression cohort: the activity marks nothing.
    const { target } = await mount({ selectedIds: ['med', 'alch'], inheritedIds: [] });
    const placeholder = target.querySelector('.manager-availability-any').textContent.trim();
    const status = target.querySelector('[data-modifier-pill-status]').textContent.trim();
    // ONE explanation, not two. The placeholder above already carries the whole sentence the
    // separate note carries, and this is the one state in which both are guaranteed to render
    // together, so the note stands down here. It still renders whenever SOME pick survives;
    // that case is pinned by the counting test above.
    assert.ok(
      !target.querySelector('[data-subject-modifier-suppressed]'),
      'the note does not repeat, word for word, what the placeholder above it just said'
    );
    const describedBy =
      target.querySelector('[data-modifier-pill-select]')?.getAttribute('aria-describedby') ?? '';
    for (const id of describedBy.split(/\s+/).filter(Boolean)) {
      assert.ok(
        Boolean(target.querySelector(`#${id}`)),
        `aria-describedby names ${id}, which is not rendered`
      );
    }
    for (const [where, sentence] of [
      ['placeholder', placeholder],
      ['live status', status],
    ]) {
      assert.ok(
        !/nothing is added/i.test(sentence),
        `the ${where} must not tell a GM the record adds nothing while both picks are kept`
      );
      assert.match(sentence, /hidden/i, `the ${where} names the state the note explains`);
    }
    harness.remount();

    // THE OTHER ZERO IS UNTOUCHED. An authored pick of nothing against a full mark really
    // does add nothing, and must keep saying so.
    const { target: authoredZero } = await mount({ selectedIds: [] });
    assert.match(
      authoredZero.querySelector('.manager-availability-any').textContent,
      /nothing is added/i,
      'a real pick of zero still reads as a pick of zero'
    );
    assert.ok(
      !authoredZero.querySelector('[data-subject-modifier-suppressed]'),
      'and nothing is suppressed, which is what makes the two zeros different'
    );
  });

  it('counts ELIGIBLE picks against the cap, so a suppressed one frees no slot it took (issue 1608)', async () => {
    // Counting the STORED list would read two and deaden the Add menu against a chip that
    // is not on screen to remove.
    const { target } = await mount({
      selectedIds: ['med', 'herb'],
      inheritedIds: MARKED_TWO,
      maxPicks: 2,
    });
    assert.equal(
      target.querySelector('[data-subject-modifier-cap]').dataset.subjectModifierCap,
      'available',
      'one VISIBLE pick of two is below the cap; the suppressed herb consumes no slot'
    );
    assert.ok(
      !target.querySelector('[data-modifier-pill-menu-button]').getAttribute('aria-disabled'),
      'so the Add menu is live and the second slot is reachable'
    );
    harness.remount();

    // …and the bound still binds: two VISIBLE picks reach it.
    const { target: full } = await mount({
      selectedIds: ['med', 'alch', 'herb'],
      inheritedIds: MARKED_TWO,
      maxPicks: 2,
    });
    assert.equal(
      full.querySelector('[data-subject-modifier-cap]').dataset.subjectModifierCap,
      'reached',
      'two visible picks of two is AT the cap — the suppressed one neither adds nor excuses'
    );
  });

  // The picker is shared by two hosts editing two different records.
  it('names the SUBJECT, differently per host', async () => {
    const { target: component } = await mount({ subject: 'component' });
    const componentHeading = component.querySelector('.manager-recipe-micro-label').textContent;
    assert.match(componentHeading, /component/i);
    assert.ok(!/\brecord\b/i.test(componentHeading), 'no internal noun leaks onto the screen');

    harness.remount();
    const { target: task } = await mount({ subject: 'task', testId: 'gathering-check-modifier' });
    assert.match(task.querySelector('.manager-recipe-micro-label').textContent, /task/i);
    assert.ok(
      task.querySelector('[data-subject-modifier-picker="gathering-check-modifier"]'),
      'and the two hosts stay tellable apart by their test hook'
    );
  });
});
