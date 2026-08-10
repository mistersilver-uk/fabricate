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
