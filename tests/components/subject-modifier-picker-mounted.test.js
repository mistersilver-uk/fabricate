/**
 * The SHARED subject check-modifier picker, MOUNTED (issue 1095).
 *
 * `SubjectModifierPicker` is the one authoring surface for `Component.salvage.checkModifierIds`
 * and `GatheringTask.checkModifierIds`, and it shipped with NO behavioural coverage at all:
 * replacing its whole render gate with `{#if false}` — the component draws nothing on either
 * host — left the entire suite green, as did collapsing the three-state contract its own
 * docblock calls the thing "a copy would fail silently" on.
 *
 * THE THREE STATES ARE THE SUBJECT. An ABSENT pick inherits the activity's default set; an
 * AUTHORED EMPTY array is a real pick of zero and adds nothing to the roll; an authored
 * non-empty array is the pick. Those are three DIFFERENT rolls, and the toggle is the only
 * place a GM can move between the first two — so `onChange(checked ? [] : null)` degrading to
 * `onChange([])` (toggling off no longer restores inheritance) or to `onChange(null)` (turning
 * it on authors nothing) are both silent losses of a persisted distinction.
 */
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
    'src/systems/checkModifierResolver.js',
    'src/systems/salvageCheckUsability.js',
    'src/utils/checkModifierPicks.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    'src/ui/svelte/util/foundryBridge.js',
    // `ModifierPillSelect`'s add menu dismisses on an outside click.
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/ModifierPillSelect.svelte',
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
      inheritedIds: [],
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
    // JOINED BY `formatList`, never by hand. The separator, the conjunction and the Oxford
    // comma are all LANGUAGE rules, and `items.join(', ')` gets them wrong in English before
    // it gets them wrong anywhere else: the recipe surface renders "Medicine and Herbalism"
    // for this same set, so a hand-joined list here made one rule read two ways across three
    // subjects. The oracle is `Intl.ListFormat` because that is what `formatList` degrades to
    // with no Foundry i18n present, and in every English locale it differs from the naive
    // comma join — which is what makes this assertion fail on the mutation.
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

  // THE CAP IS ASKED OF THE RESOLVER, not read verbatim. A stored `0`, `-2` or `"three"` all
  // mean UNLIMITED in the engine, and a picker that trusted them would refuse picks the roll
  // would have honoured — and would print a cap sentence naming a bound that does not exist.
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

  // ONE OF THE TWO, NEVER BOTH — the same rule the catalogue card's eligibility pill follows, and
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
  //
  // The cap copy is the one string on this surface with an interpolation placeholder, so it is
  // the one whose fallback cannot simply be the authored English: returning `copy.cap` verbatim
  // renders a literal `{count}` and the suite was green on that. The build that reads the
  // fallback is a real one — an unlocalized world, where `localize` finds no `game.i18n` and
  // hands the key straight back — so `game` is unset here to put the component on exactly that
  // path. (The harness's `i18n.format` stub returns a `key:{…}` marker rather than interpolating,
  // so leaving it installed would assert against harness noise instead of the component.)
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

  // The picker is shared by two hosts editing two different records, and "this record" is the
  // internal name for the abstraction they share — a noun neither screen shows.
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
