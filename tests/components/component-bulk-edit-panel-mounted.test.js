/**
 * The component browser's BULK EDIT panel (issue 772).
 *
 * The panel is where a destructive multi-component write becomes legible BEFORE it
 * happens, so what is tested here is the staging semantics, not the pixels: the tri-state
 * tag cycle, the Apply enablement rule (including the removal-only draft that an earlier
 * design would have left inert), the conditional overwrite warning, the staged-axis chip
 * that arms and disarms an axis without touching the selection, and the two section
 * visibility gates across a system progressive on EACH axis in turn plus the none case.
 *
 * The panel does NOT own the draft — the manager root does, because the panel is unmounted
 * the moment the selection empties. So these tests drive it the way the root does: hand it
 * a draft, take the NEW draft back through `onDraftChange`, and re-render with it.
 *
 * That round-trip is the point. Every helper in `componentBulkEditModel.js` is IMMUTABLE,
 * so a panel that called `cycleBulkTag(draft, tag)` without reassigning would compile, run,
 * and silently do nothing — the control would simply look dead. Asserting on the rendered
 * chip state after the round-trip is what catches that.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createComponentBulkDraft } from '../../src/utils/componentBulkEditModel.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const panel = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-bulk-panel-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // `BulkDeleteCard`'s shared focus/announce ordering rule (issue 1157).
    'src/ui/svelte/util/announceAfterFocus.js',
    'src/utils/componentCategories.js',
    // The pure selection + staging model. Omitting it throws loudly in this shared
    // harness — the hand-rolled suites are the ones that hang instead.
    'src/utils/componentBulkEditModel.js',
    // Its shared leaf (issue 1010): the four selection helpers now live here and
    // `componentBulkEditModel.js` re-exports them under their original names, so this is a
    // STATIC import of that module and belongs in every closure that names it.
    'src/utils/bulkSelectionModel.js',
    // The add-new essence offer projection (issue 1036). A STATIC import of the mounted
    // tree, so the harness closure validator throws without it.
    'src/utils/essenceValidation.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    // The shared bulk-edit chrome (issue 1010). The panel now renders its header, hero,
    // section headings, staged select and Apply through these three, so they are STATIC
    // imports of the component under test and belong in its closure.
    // THE manager's labelled push-button (issue 1118). `BulkEditPanelShell` renders its
    // Apply through the primitive, so it is a STATIC import of this tree; omitting it HANGS
    // this suite as `# cancelled` rather than failing it.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    // The set delete's arm/confirm control (issue 1129) and the shared card that now renders
    // it (issue 1132). Both are STATIC imports of the component under test; omitting either
    // HANGS this suite as `# cancelled` rather than failing it.
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
    'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
    'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte'
});

const ESSENCES = [
  { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
  { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' }
];

/**
 * Mount the panel the way the manager root drives it: the caller owns the draft, and every
 * `onDraftChange` REPLACES it and re-renders. Returns the live draft accessor so a test can
 * assert on what was actually staged as well as on what is rendered.
 */
async function mountPanel(props = {}) {
  const state = { draft: props.draft || createComponentBulkDraft(), applies: 0, clears: 0 };
  const root = await panel.mount({
    count: 3,
    categoryOptions: [{ name: 'Metal', count: 2 }, { name: 'general', count: 1 }],
    tags: ['metal', 'rune'],
    essenceDefinitions: ESSENCES,
    showEssences: true,
    selectedCards: [],
    ...props,
    draft: state.draft,
    onDraftChange: async (next) => {
      state.draft = next;
      await panel.setProps({ draft: next });
    },
    onApply: () => { state.applies += 1; },
    onClearSelection: () => { state.clears += 1; }
  });
  return { root, state };
}

function tagChip(root, tag) {
  return root.querySelector(`[data-bulk-tag="${tag}"]`);
}

function tagState(root, tag) {
  return tagChip(root, tag).getAttribute('data-bulk-tag-state');
}

function applyButton(root) {
  return root.querySelector('[data-component-bulk-apply]');
}

before(async () => {
  await panel.setup();
});
after(() => {
  panel.teardown();
});
afterEach(() => {
  panel.remount();
});

describe('ComponentBulkEditPanel tag staging (issue 772)', () => {
  it('cycles a chip leave -> add -> remove -> leave and is never both', async () => {
    const { root, state } = await mountPanel();

    assert.equal(tagState(root, 'metal'), 'none', 'a fresh draft stages nothing');

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'add');
    assert.deepEqual(state.draft.tagAdd, ['metal']);
    assert.deepEqual(state.draft.tagRemove, []);

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'remove');
    assert.deepEqual(state.draft.tagAdd, [], 'a tag is never simultaneously add and remove');
    assert.deepEqual(state.draft.tagRemove, ['metal']);

    tagChip(root, 'metal').click();
    flushSync();
    assert.equal(tagState(root, 'metal'), 'none');
    assert.deepEqual(state.draft.tagRemove, []);

    assert.equal(tagState(root, 'rune'), 'none', 'the other tags are untouched throughout');
  });

  it('renders each chip as a real focusable button', async () => {
    const { root } = await mountPanel();
    const chip = tagChip(root, 'metal');

    assert.equal(chip.tagName, 'BUTTON', 'a span could not be reached by keyboard');
    assert.equal(chip.getAttribute('type'), 'button', 'and an untyped button would submit');
    // ANCHORED, exactly as the Recipe Studio's book-chip twin is. Unanchored, the previous
    // action-first name ("Leave metal unchanged") satisfied this too, so the one property
    // the assertion exists for — that the name OPENS with the visible label — was the one
    // thing it could not see. The em-dash form is what carries a lowercase tag vocabulary
    // (`ore`, `ingot`) without opening a sentence on a lowercase word.
    assert.match(
      chip.getAttribute('aria-label'),
      /^metal — leave unchanged\.$/,
      'the name OPENS with the visible label (WCAG 2.5.3) then states the staged ACTION — '
        + 'aria-pressed cannot describe three states'
    );
  });

  // The run is ONE axis, so it is exposed as one control rather than as a stray sequence of
  // buttons, and the hint above it states all THREE stops of the cycle. Both facts are
  // shared verbatim with the Recipe Studio's book run — see its twin case. The spec forbids
  // the two studios diverging here, so the two cases assert the same two things.
  it('exposes the chip run as a named group above an honest three-state hint', async () => {
    const { root } = await mountPanel();
    const run = root.querySelector('[data-component-bulk-tags]');

    assert.equal(run.getAttribute('role'), 'group');
    assert.equal(
      run.getAttribute('aria-label'),
      'Tags',
      'the group name is the section heading a sighted GM reads, not a second string'
    );
    assert.match(
      root.textContent,
      /click to add · again to remove · again to leave unchanged/,
      'the third stop is the one that UNDOES a staged remove; naming only two of three left '
        + 'it discoverable only by clicking and watching'
    );
  });

  it('says the system defines no tags rather than rendering an empty run', async () => {
    const { root } = await mountPanel({ tags: [] });
    assert.ok(Boolean(root.querySelector('[data-component-bulk-tags-empty]')));
  });
});

describe('ComponentBulkEditPanel apply enablement (issue 772)', () => {
  it('is inert with nothing staged and live the moment any axis is staged', async () => {
    const { root, state } = await mountPanel();

    assert.equal(applyButton(root).disabled, true, 'a no-op Apply would report success and write nothing');
    assert.match(applyButton(root).textContent, /3/, 'and it names the exact blast radius');

    root.querySelector('[data-component-bulk-category]').value = 'Metal';
    root.querySelector('[data-component-bulk-category]').dispatchEvent(
      new globalThis.Event('change', { bubbles: true })
    );
    flushSync();

    assert.equal(applyButton(root).disabled, false);
    assert.equal(state.draft.category, 'Metal');

    applyButton(root).click();
    flushSync();
    assert.equal(state.applies, 1);
  });

  it('is live for a REMOVAL-ONLY draft', async () => {
    const { root } = await mountPanel();

    // Straight to `remove`: two clicks, never resting on `add`.
    tagChip(root, 'metal').click();
    flushSync();
    tagChip(root, 'metal').click();
    flushSync();

    assert.equal(tagState(root, 'metal'), 'remove');
    assert.equal(
      applyButton(root).disabled,
      false,
      'a removal-only edit is a real edit the chip run can stage on its own'
    );
  });

  it('names one component in the singular', async () => {
    const { root } = await mountPanel({ count: 1 });
    assert.match(applyButton(root).textContent, /Apply to 1 component/);
    assert.match(
      root.querySelector('[data-component-bulk-count]').textContent,
      /1 component selected/,
      'never "1 components selected"'
    );
  });

  it('clears the selection without applying anything', async () => {
    const { root, state } = await mountPanel();
    root.querySelector('[data-component-bulk-clear]').click();
    flushSync();
    assert.equal(state.clears, 1);
    assert.equal(state.applies, 0);
  });
});

describe('ComponentBulkEditPanel staged-axis indicators (issue 772)', () => {
  // Issue 1036, criteria 2 and 18. This panel's staged map is a WHOLE-MAP replacement, so
  // its grid is simultaneously the add-new offer AND the only place a staged value can be
  // edited back down. Both halves are asserted, each with its negative control.
  it('1036/18: the essence grid withholds a DISABLED essence from the offer', async () => {
    const { root } = await mountPanel({
      essenceDefinitions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false },
        { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true }
      ]
    });

    assert.ok(
      Boolean(root.querySelector('[data-component-edit-essence="earth"]')),
      'negative control: the ENABLED essence IS offered, so the grid is not simply empty'
    );
    assert.ok(
      !root.querySelector('[data-component-edit-essence="fire"]'),
      'the disabled essence is withheld from the offer'
    );
  });

  it('1036/2: a disabled essence carrying a STAGED quantity stays visible and clearable', async () => {
    const draft = createComponentBulkDraft();
    const { root, state } = await mountPanel({
      draft: { ...draft, essencesStaged: true, essences: { fire: 3 } },
      essenceDefinitions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false },
        { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true }
      ]
    });

    const staged = root.querySelector('[data-component-edit-essence="fire"]');
    assert.ok(Boolean(staged), 'a staged disabled essence is still rendered');

    staged.querySelector('[data-stepper-decrement]').click();
    flushSync();
    assert.equal(state.draft.essences.fire, 2, 'and is still editable back down');
  });

  it('1036/18: the essenceDefinitions PROP stays unfiltered — the warning count reads it', async () => {
    // The prop boundary. `countComponentsChangingEssences` compares the staged map against
    // every AUTHORED value on the selected rows, so a filtered prop would silently stop
    // counting a carrier of a disabled essence and the destructive-overwrite warning would
    // under-report exactly the rows most at risk.
    const { root } = await mountPanel({
      draft: { ...createComponentBulkDraft(), essencesStaged: true, essences: { earth: 1 } },
      essenceDefinitions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false },
        { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true }
      ],
      selectedCards: [{ id: 'a', essences: [{ id: 'fire', quantity: 3 }] }]
    });

    const warning = root.querySelector('[data-component-bulk-essence-warning]');
    assert.ok(
      Boolean(warning),
      'the carrier of the DISABLED essence is still counted in the overwrite warning'
    );
    assert.equal(warning.getAttribute('data-component-bulk-essence-warning'), '1');
  });

  it('arms the essence axis DIRECTLY, because Stepper emits nothing at the zero boundary', async () => {
    const { root, state } = await mountPanel();
    const chip = root.querySelector('[data-component-bulk-essences-staged]');

    assert.equal(chip.tagName, 'BUTTON', 'the only route to a destructive axis must be operable');
    assert.equal(chip.getAttribute('type'), 'button');
    assert.equal(chip.getAttribute('data-component-bulk-essences-staged'), 'false');
    assert.equal(applyButton(root).disabled, true);

    chip.click();
    flushSync();

    assert.equal(state.draft.essencesStaged, true, 'a fresh, all-zero draft can stage "clear everything"');
    assert.equal(
      root.querySelector('[data-component-bulk-essences-staged]').getAttribute('data-component-bulk-essences-staged'),
      'true'
    );
    assert.equal(applyButton(root).disabled, false, 'an all-zero staged map is a REAL edit');
  });

  it('leaves a bumped-then-zeroed essence axis staged, and visibly so', async () => {
    const { root, state } = await mountPanel();

    const fireStepper = root.querySelector('[data-component-edit-essence="fire"]');
    fireStepper.querySelector('[data-stepper-increment]').click();
    flushSync();
    assert.equal(state.draft.essences.fire, 1);
    assert.equal(state.draft.essencesStaged, true);

    root
      .querySelector('[data-component-edit-essence="fire"] [data-stepper-decrement]')
      .click();
    flushSync();

    assert.equal(state.draft.essences.fire, 0, 'back to zero');
    assert.equal(
      state.draft.essencesStaged,
      true,
      'and STILL staged — this is the wipe the prototype rendered as pixel-identical to untouched'
    );
    assert.equal(
      root.querySelector('[data-component-bulk-essences-staged]').getAttribute('data-component-bulk-essences-staged'),
      'true',
      'the panel says so'
    );
  });

  it('disarms an axis from the same chip without touching the selection', async () => {
    const { root, state } = await mountPanel();

    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();
    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();

    assert.equal(state.draft.essencesStaged, false, 'the axis is back to leave-unchanged');
    assert.equal(state.clears, 0, 'and the selection was never cleared');
    assert.equal(applyButton(root).disabled, true);
  });

  it('seeds a zero DC when the progressive axis is armed, so it is never a silent clear', async () => {
    const { root, state } = await mountPanel({ showProgressiveDifficulty: true });

    root.querySelector('[data-component-bulk-difficulty-staged]').click();
    flushSync();

    assert.equal(state.draft.difficultyStaged, true);
    assert.equal(state.draft.difficulty, 0, '0 CLEARS the value on every selected component');
    assert.equal(root.querySelector('[data-component-bulk-difficulty]').value, '0', 'and the panel shows it');

    root.querySelector('[data-component-bulk-difficulty]').value = '14';
    root.querySelector('[data-component-bulk-difficulty]').dispatchEvent(
      new globalThis.Event('input', { bubbles: true })
    );
    flushSync();
    assert.equal(state.draft.difficulty, 14);
  });
});

describe('ComponentBulkEditPanel overwrite legibility (issue 772)', () => {
  const authored = [
    { id: 'a', essences: [{ id: 'fire', quantity: 3 }] },
    { id: 'b', essences: [] }
  ];

  it('states the permanent overwrite hint whether or not the axis is staged', async () => {
    const { root } = await mountPanel();
    assert.match(root.textContent, /overwrites the essence values on every selected component/);
  });

  it('warns only when the staged map would in fact change an AUTHORED value', async () => {
    const { root, state } = await mountPanel({ selectedCards: authored });

    // Staged but matching the authored value: nothing is destroyed, so no hazard strip.
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-input]').value = '3';
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-input]').dispatchEvent(
      new globalThis.Event('input', { bubbles: true })
    );
    flushSync();
    assert.equal(state.draft.essences.fire, 3);
    assert.ok(
      !root.querySelector('[data-component-bulk-essence-warning]'),
      'a no-change overwrite is not a hazard'
    );

    // An INCREASE destroys the authored 3 as surely as a clear would.
    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-increment]').click();
    flushSync();

    const warning = root.querySelector('[data-component-bulk-essence-warning]');
    assert.ok(Boolean(warning), 'overwriting a hand-tuned value is exactly what the warning is for');
    assert.match(warning.textContent, /1 of the selected components/, 'and it names the count');
  });

  it('shows no warning while the axis is unstaged, however different the values', async () => {
    const { root } = await mountPanel({ selectedCards: authored });

    root.querySelector('[data-component-edit-essence="fire"] [data-stepper-increment]').click();
    flushSync();
    root.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();

    assert.ok(
      !root.querySelector('[data-component-bulk-essence-warning]'),
      'an unstaged axis is never sent, so it can destroy nothing'
    );
  });
});

describe('ComponentBulkEditPanel section visibility (issue 772)', () => {
  it('hides the essences section when the system does not enable essences', async () => {
    const { root } = await mountPanel({ showEssences: false });
    assert.ok(!root.querySelector('[data-component-bulk-essences]'));
    assert.ok(!root.querySelector('[data-component-bulk-essences-staged]'));
  });

  // The caller supplies ONE predicate that is already the OR of crafting, salvage and
  // gathering resolution modes, so the panel's contract is simply that it obeys it — which
  // is what makes a salvage-only-progressive system show the section at all.
  for (const shown of [true, false]) {
    it(`${shown ? 'shows' : 'hides'} the progressive DC section when the axis predicate is ${shown}`, async () => {
      const { root } = await mountPanel({ showProgressiveDifficulty: shown });
      assert.equal(
        Boolean(root.querySelector('[data-component-bulk-difficulty]')),
        shown,
        'the bulk panel, the editor control and the row badge read ONE predicate'
      );
    });
  }
});

// ── The armed set delete (issue 1129) ────────────────────────────────────────────────
//
// The panel does NOT compute the impact — it is handed one, because "how many recipes will be
// disabled" depends on the whole selection against real recipe bodies (see
// `adminStore.describeComponentDelete`). So these tests feed an impact literal and pin what
// the GM is SHOWN and what the two clicks DO. The arithmetic itself is pinned in
// `tests/component-delete-impact.test.js`.

function deleteCard(root) {
  return root.querySelector('[data-component-bulk-delete-card]');
}

function deleteButton(root) {
  return deleteCard(root).querySelector('.manager-button.is-danger');
}

function impactRow(root, row) {
  return deleteCard(root).querySelector(`[data-component-bulk-impact-row="${row}"]`);
}

function impactText(root, row) {
  return impactRow(root, row).textContent.trim();
}

function impactOf(overrides = {}) {
  return {
    deletable: 3,
    deletableIds: ['c1', 'c2', 'c3'],
    recipesRewritten: 2,
    recipesDisabled: 1,
    ...overrides
  };
}

/** Mount with the delete wiring the root supplies, recording what the confirm hands back. */
async function mountWithDelete(props = {}) {
  const calls = { armed: 0, disarmed: 0, deleted: [] };
  const mounted = await mountPanel({
    deleteImpact: impactOf(),
    ...props,
    onArmDelete: () => { calls.armed += 1; },
    onDisarmDelete: () => { calls.disarmed += 1; },
    onDelete: (ids) => { calls.deleted.push(ids); }
  });
  return { ...mounted, calls };
}

describe('ComponentBulkEditPanel set delete (issue 1129)', () => {
  it('states the impact BEFORE the action is armed', async () => {
    const { root } = await mountWithDelete();

    assert.ok(deleteCard(root), 'the delete card renders with the panel');
    assert.equal(
      deleteButton(root).getAttribute('data-armed'),
      'false',
      'the control starts unarmed'
    );
    // LITERAL, whole-row equality rather than "contains a number". A row asserted with
    // `/2 recipes/` keeps passing after the sentence around the number changes meaning — and
    // this card's whole job is the sentence, not the digit.
    assert.equal(impactText(root, 'components'), '3 components will be deleted.');
    assert.equal(impactText(root, 'recipes'), '2 recipes will be rewritten.');
    assert.equal(
      impactText(root, 'disabled'),
      '1 of those recipes is enabled today and will be disabled.'
    );
  });

  it('omits a ZERO row rather than stating "0 recipes will be rewritten"', async () => {
    // The commonest selection there is: components no recipe names. Two noughts under one
    // real fact is noise, and it buries the number the button acts on.
    const { root } = await mountWithDelete({
      deleteImpact: impactOf({ recipesRewritten: 0, recipesDisabled: 0 })
    });

    assert.equal(
      impactText(root, 'components'),
      '3 components will be deleted.',
      'the components row is unconditional — the card must still state what the button does'
    );
    assert.ok(!impactRow(root, 'recipes'), 'no zero rewrite row');
    assert.ok(!impactRow(root, 'disabled'), 'no zero disable row');
    assert.ok(
      !deleteCard(root).textContent.includes('0 '),
      'and no stray zero anywhere in the card'
    );
  });

  it('keeps the rewrite row when only the DISABLE count is zero', async () => {
    // The two rows are gated independently: rewriting recipes without disabling any is the
    // ordinary outcome, and gating them together would hide it.
    const { root } = await mountWithDelete({
      deleteImpact: impactOf({ recipesRewritten: 2, recipesDisabled: 0 })
    });

    assert.equal(impactText(root, 'recipes'), '2 recipes will be rewritten.');
    assert.ok(!impactRow(root, 'disabled'), 'but nothing is disabled, so nothing says so');
  });

  it('associates the impact list with the button, and announces the arm', async () => {
    // Proximity is not association: without `aria-describedby` a screen-reader user arriving
    // at the control hears its name and nothing about the consequence, unless they happened
    // to read the list on the way past.
    const { root } = await mountWithDelete();
    const described = deleteButton(root).getAttribute('aria-describedby');

    assert.ok(described, 'the button names a description');
    const list = deleteCard(root).querySelector(`#${described}`);
    assert.ok(Boolean(list), 'and it resolves to an element inside the card');
    assert.equal(list.getAttribute('data-component-bulk-impact'), '');

    const live = deleteCard(root).querySelector('[data-component-bulk-delete-announce]');
    assert.ok(Boolean(live), 'the armed state has a live region');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.textContent.trim(), '', 'which says nothing while the control is idle');
  });

  it('announces the consequence when the owner arms it, and the CANCELLATION on disarm', async () => {
    const { root } = await mountWithDelete();
    const live = () => deleteCard(root).querySelector('[data-component-bulk-delete-announce]');

    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.match(live().textContent, /3 component\(s\)/, 'it names what confirming would do');
    assert.match(live().textContent, /again/i, 'and that a SECOND activation is the delete');

    // Escape and click-away both disarm while the button still HOLDS FOCUS and change its
    // accessible name under it — which is the whole reason this region exists. Emptying it
    // announced nothing, so the one gesture that CANCELS a destructive action was the only
    // one that said nothing at all (issue 1132, review round). The text still changes, so a
    // re-arm is still announced.
    await panel.setProps({ deleteArmed: false });
    flushSync();
    assert.equal(live().textContent.trim(), 'Delete cancelled. Nothing was deleted.');

    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.match(live().textContent, /again/i, 'and a RE-arm still announces');
  });

  it('gives the ARMED control a name containing its visible label (WCAG 2.5.3)', async () => {
    // A speech-input user says what they can read. "Confirm deleting 3 component(s)…" does
    // not contain "Confirm delete", so the armed half of a destructive two-step control could
    // not be activated by voice.
    const { root } = await mountWithDelete({ deleteArmed: true });
    const button = deleteButton(root);
    const visible = button.querySelector('span').textContent.trim();

    assert.equal(visible, 'Confirm delete');
    assert.ok(
      button.getAttribute('aria-label').startsWith(visible),
      `"${button.getAttribute('aria-label')}" must open with "${visible}"`
    );
    assert.match(button.getAttribute('aria-label'), /3 component\(s\) and 2 recipe\(s\)/);
    // It ENDS with the irreversibility, like its recipe sibling — the only one of the three
    // that stated it. This panel carries no standing hint, so the armed accessible name is
    // the only place a screen-reader user is told a component delete is permanent; essence
    // remains the one outlier, deliberately left alone (issue 1132, review round 2).
    assert.match(button.getAttribute('aria-label'), /cannot be undone/i);
  });

  it('reports three numbers that are three different questions', async () => {
    // Deleting 5 components, rewriting 2 recipes, disabling 1 of those two: no number is
    // derivable from another, and the disabled count is a SUBSET of the rewritten count.
    const { root } = await mountWithDelete({
      deleteImpact: impactOf({ deletable: 5, recipesRewritten: 2, recipesDisabled: 1 })
    });

    assert.match(impactText(root, 'components'), /5 components/);
    assert.match(impactText(root, 'recipes'), /2 recipes/);
    assert.match(impactText(root, 'disabled'), /^1 of those recipes/);
  });

  it('RECOMPUTES when the selection changes', async () => {
    const { root } = await mountWithDelete();
    assert.match(impactText(root, 'recipes'), /2 recipes will be rewritten/);

    await panel.setProps({
      deleteImpact: impactOf({ deletable: 1, deletableIds: ['c1'], recipesRewritten: 7, recipesDisabled: 0 })
    });
    flushSync();

    assert.match(impactText(root, 'components'), /1 component will be deleted/);
    assert.match(impactText(root, 'recipes'), /7 recipes will be rewritten/);
  });

  it('takes TWO clicks, and the first writes nothing', async () => {
    const { root, calls } = await mountWithDelete();

    deleteButton(root).click();
    flushSync();
    assert.equal(calls.armed, 1, 'the first click ARMS');
    assert.equal(calls.deleted.length, 0, 'the first click writes NOTHING');

    // The owner holds the armed token, so re-render with it set the way the root would.
    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.equal(deleteButton(root).getAttribute('data-armed'), 'true');

    deleteButton(root).click();
    flushSync();
    assert.deepEqual(calls.deleted, [['c1', 'c2', 'c3']], 'the second click deletes the SELECTION');
  });

  it('hands the confirm the impact ids rather than re-deriving them', async () => {
    const { root, calls } = await mountWithDelete({
      deleteImpact: impactOf({ deletable: 2, deletableIds: ['only-a', 'only-b'] }),
      deleteArmed: true
    });

    deleteButton(root).click();
    flushSync();
    assert.deepEqual(calls.deleted, [['only-a', 'only-b']]);
  });

  it('states every number in the singular, not a bare plural after "1"', async () => {
    const { root } = await mountWithDelete({
      deleteImpact: impactOf({
        deletable: 1,
        deletableIds: ['c1'],
        recipesRewritten: 1,
        recipesDisabled: 1
      })
    });

    assert.match(impactText(root, 'components'), /^1 component will be deleted\./);
    assert.match(impactText(root, 'recipes'), /^1 recipe will be rewritten\./);
    assert.ok(
      !impactText(root, 'components').includes('1 components'),
      'never "1 components"'
    );
    assert.ok(!impactText(root, 'recipes').includes('1 recipes'), 'never "1 recipes"');
    assert.match(deleteButton(root).textContent, /Delete 1 component(?!s)/);
  });

  it('is disabled when nothing is deletable, and while a delete is in flight', async () => {
    const { root } = await mountWithDelete({
      deleteImpact: impactOf({ deletable: 0, deletableIds: [], recipesRewritten: 0, recipesDisabled: 0 })
    });
    assert.equal(deleteButton(root).disabled, true, 'nothing to delete');

    await panel.setProps({ deleteImpact: impactOf(), deleting: true });
    flushSync();
    assert.equal(deleteButton(root).disabled, true, 'inert rather than double-writing');
  });

  it('is a real button rather than a dialog trigger', async () => {
    // The carve-out that lets this arm INSTEAD of raising a confirmDialog is paired with the
    // impact statement above; if the control ever became a dialog trigger the pairing would
    // be silently pointless.
    const { root } = await mountWithDelete();
    const button = deleteButton(root);

    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('data-arm-token'), 'delete-components');
    assert.ok(button.getAttribute('aria-label'), 'it carries the consequence sentence');
  });

  it('sits BELOW the panel shell, not inside its Apply card', async () => {
    // A destructive action inside the shell would read as a second way of applying the
    // staged edit.
    const { root } = await mountWithDelete();
    const shell = root.querySelector('[data-component-bulk-panel]');

    assert.ok(shell, 'the shell renders');
    assert.ok(!shell.contains(deleteCard(root)), 'the delete card is a sibling of the shell');
  });
});
