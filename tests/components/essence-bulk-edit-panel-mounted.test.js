/**
 * `EssenceBulkEditPanel` mounted, in isolation (issue 1036) — criteria 11 and 17.
 *
 * The panel is where the maintainer's binding decision lands: *"Warn the GM about the impact
 * of the delete in the bulk edit sidebar and use the Arm/Confirm delete pattern on the bulk
 * delete button."* That DEVIATES from the `AGENTS.md` carve-out reserving `confirmDialog`
 * for bulk actions, and it is what this suite pins — including the two halves a
 * confirmDialog would have made unobservable: that the impact is stated BEFORE the action is
 * armed, and that it RECOMPUTES when the selection changes.
 *
 * The fixture is chosen so the three numbers all DIFFER. A statement that derived any one of
 * them from another would pass against equal numbers and fail here.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createEssenceBulkDraft } from '../../src/utils/essenceBulkEditModel.js';
import { makeEssenceRow } from '../helpers/makeEssenceRow.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-bulk-panel-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // `BulkDeleteCard`'s shared focus/announce ordering rule (issue 1157).
    'src/ui/svelte/util/announceAfterFocus.js',
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/utils/essenceBulkEditModel.js',
    'src/utils/bulkSelectionModel.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    // The shared bulk-delete card (issue 1132). The panel renders its delete block through it,
    // so it is a STATIC import of the component under test; omitting it HANGS this suite as
    // `# cancelled` rather than failing it.
    'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/apps/manager/essences/EssenceBulkEditPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/essences/EssenceBulkEditPanel.svelte',
});

/**
 * Four essences, and every number the statement reports is a different one.
 *
 * ## Every selected essence is DELETABLE — the delete is warned, not blocked
 *
 * The maintainer's change: component usage no longer refuses a delete, so all four rows
 * delete and there is no blocked partition. The two carrier numbers are still UNIONS over
 * distinct identities, never sums, and the fixture is shaped so a union and a sum differ:
 *
 * - SELECTION SIZE 4, ALL deletable;
 * - CARRYING COMPONENTS over the whole selection: `comp-a`…`comp-d`, with `comp-b` carried by
 *   both `fire` and `water` — so the UNION is 4 where the SUM would be 5;
 * - REWRITTEN RECIPES over the whole selection: `r1`, `r2`, `r3`, with `r2` required by
 *   several — so the UNION is 3 where the SUM would be 6.
 *
 * 4, 4 and 3: the two carrier numbers are still distinct-carrier counts, and a statement
 * deriving either from a per-essence sum fails here.
 */
const SELECTION = [
  makeEssenceRow({
    id: 'fire',
    name: 'Fire',
    componentUsageItems: [{ id: 'comp-a' }, { id: 'comp-b' }],
    componentUsageCount: 2,
    recipeUsageIds: ['r1', 'r2'],
    recipeUsageCount: 2,
  }),
  makeEssenceRow({
    id: 'water',
    name: 'Water',
    componentUsageItems: [{ id: 'comp-b' }, { id: 'comp-c' }, { id: 'comp-d' }],
    componentUsageCount: 3,
    recipeUsageIds: ['r2'],
    recipeUsageCount: 1,
  }),
  makeEssenceRow({
    id: 'earth',
    name: 'Earth',
    recipeUsageIds: ['r1', 'r2', 'r3'],
    recipeUsageCount: 3,
    deleteRewritesRecipes: true,
  }),
  makeEssenceRow({
    id: 'air',
    name: 'Air',
    recipeUsageIds: ['r2'],
    recipeUsageCount: 1,
    deleteRewritesRecipes: true,
  }),
];

function props(rows, extra = {}) {
  return {
    count: rows.length,
    selectedRows: rows,
    draft: createEssenceBulkDraft(),
    ...extra,
  };
}

const impactRowEl = (root, name) => root.querySelector(`[data-essence-bulk-impact-row="${name}"]`);

const impactRow = (root, name) => impactRowEl(root, name).textContent.trim();

const deleteButton = (root) =>
  root.querySelector('[data-essence-bulk-delete-card] .manager-button.is-danger');

before(async () => {
  await harness.setup();
});

after(() => harness.teardown());

describe('1036/17 EssenceBulkEditPanel — the delete impact statement', () => {
  it('reports three numbers that are three different questions', async () => {
    const root = await harness.mount(props(SELECTION));

    assert.match(impactRow(root, 'essences'), /^4\b/, 'all 4 selected are deletable');
    assert.match(
      impactRow(root, 'components'),
      /^4\b/,
      'comp-a…comp-d over the whole selection — a SUM of the per-essence counts would say 5'
    );
    assert.match(
      impactRow(root, 'recipes'),
      /^3\b/,
      'r1, r2 and r3 — a SUM would say 6 before an operation that rewrites 3'
    );
    harness.remount();
  });

  it('counts carrying components over the WHOLE selection as a distinct-carrier union', async () => {
    // A component carrying two selected essences counts ONCE, because the cascade strips it
    // in one pass. Over `[fire, water]` that is comp-a…comp-d with comp-b shared: four, not
    // the five a per-essence sum would report.
    const root = await harness.mount(props([SELECTION[0], SELECTION[1]]));
    assert.match(impactRow(root, 'essences'), /^2\b/, 'both are deletable');
    assert.match(
      impactRow(root, 'components'),
      /^4\b/,
      'comp-a…comp-d, comp-b unioned once — a SUM would say 5'
    );

    // Negative control: a selection carried by nothing reports NO carriers, so the union
    // above cannot be satisfied by a number that is simply always non-zero.
    //
    // Asserted as the row's ABSENCE, not as a rendered "0" (issue 1132). The shared card omits
    // a consequence row whose count is zero, so the row this control used to read is gone —
    // and because the old helper dereferenced `.textContent`, the control would have THROWN
    // rather than failed, whose cheapest repair is deleting it. Absence is exactly as strong a
    // negative control as a rendered nought, and it gates the new gating behaviour too.
    await harness.setProps(props([SELECTION[2], SELECTION[3]]));
    assert.ok(
      !impactRowEl(root, 'components'),
      'a zero-carrier selection states nothing about carriers, rather than stating a nought'
    );
    assert.match(
      impactRow(root, 'essences'),
      /^2\b/,
      'while the SUBJECT row still renders — a card that states nothing has lost the pairing the arm depends on'
    );
    harness.remount();
  });

  it('states the impact BEFORE the action is armed', async () => {
    const root = await harness.mount(props(SELECTION));
    assert.ok(
      root.querySelector('[data-essence-bulk-impact]'),
      'the statement is present with the button still idle'
    );
    assert.match(
      deleteButton(root).textContent,
      /Delete 4 essences/,
      'and the idle button already names the count it will act on'
    );
    harness.remount();
  });

  it('RECOMPUTES when the selection changes', async () => {
    const root = await harness.mount(props(SELECTION));
    assert.match(impactRow(root, 'recipes'), /^3\b/);

    // Drop `fire` and `earth`: `water` is carried by comp-b/c/d, and `air` names only r2.
    // All three numbers move.
    await harness.setProps(props([SELECTION[1], SELECTION[3]]));
    assert.match(impactRow(root, 'essences'), /^2\b/);
    assert.match(impactRow(root, 'components'), /^3\b/);
    assert.match(
      impactRow(root, 'recipes'),
      /^1\b/,
      'a latched statement would still be reporting the previous selection'
    );
    harness.remount();
  });

  it('has NO blocked callout — every selected essence is deletable', async () => {
    // The delete is warned, not blocked: a carried essence deletes like any other, so the
    // panel never renders a skipped-members callout.
    const carried = await harness.mount(props(SELECTION));
    assert.ok(
      !carried.querySelector('[data-essence-bulk-blocked]'),
      'no member is skipped, so nothing is called out'
    );
    assert.match(
      impactRow(carried, 'essences'),
      /^4\b/,
      'all four delete, including the carried pair'
    );
    harness.remount();
  });

  it('stays ENABLED for a single carried essence, with its carriers stated as impact', async () => {
    const root = await harness.mount(props([SELECTION[0]]));
    assert.equal(
      deleteButton(root).disabled,
      false,
      'a carried essence is deletable, so the button is live'
    );
    assert.match(impactRow(root, 'essences'), /^1\b/);
    assert.match(impactRow(root, 'components'), /^2\b/, 'comp-a and comp-b, stated as impact');
    harness.remount();
  });
});

describe('1036/copy EssenceBulkEditPanel — the impact statement agrees at count 1', () => {
  // The shipped defect (View Lab frame `manager-essences-bulk-delete-armed`): every number
  // in the impact statement read a bare plural noun against `{count}` — "1 essence
  // definitions", "1 components carry", "1 recipes" — because the panel had no `…One` sibling
  // for these keys, unlike its own `Heading`/`Apply`/`Delete` labels a few lines above, which
  // already do. This fixture is a SINGLE carried essence, so all three numbers are exactly 1
  // at once and one mount proves every string.
  const ONE_OF_EACH = [
    makeEssenceRow({
      id: 'fire',
      name: 'Fire',
      componentUsageItems: [{ id: 'comp-a' }],
      componentUsageCount: 1,
      recipeUsageIds: ['r1'],
      recipeUsageCount: 1,
    }),
  ];

  it('states every number in the singular, not a bare plural noun after "1"', async () => {
    const root = await harness.mount(props(ONE_OF_EACH));

    assert.equal(
      impactRow(root, 'essences'),
      '1 essence definition will be deleted.',
      'not "1 essence definitions"'
    );
    assert.equal(
      impactRow(root, 'components'),
      '1 component carries one or more of the selected essences.',
      'not "1 components carry"'
    );
    assert.equal(impactRow(root, 'recipes'), '1 recipe will be rewritten.', 'not "1 recipes"');

    assert.match(
      deleteButton(root).getAttribute('aria-label'),
      /^Delete 1 essence definition$/,
      'the idle button\'s consequence sentence, not "1 essence definitions"'
    );
    harness.remount();
  });

  it('still uses the plural form when a number is not 1', async () => {
    // Negative control: the fixture already exercised by the earlier suite (4, 4, 3) must
    // still read as the ordinary plural, so the fix above is a real branch, not a rename.
    const root = await harness.mount(props(SELECTION));

    assert.equal(impactRow(root, 'essences'), '4 essence definitions will be deleted.');
    assert.equal(
      impactRow(root, 'components'),
      '4 components carry one or more of the selected essences.'
    );
    assert.equal(impactRow(root, 'recipes'), '3 recipes will be rewritten.');
    // WCAG 2.5.3 Label in Name (issue 1132): the idle name is now the visible label verbatim.
    // It shipped as "Delete 4 essence definitions" beside a button reading "Delete 4 essences",
    // so a speech-input user could not activate the idle face of a destructive control. The
    // word "definitions" moved into the impact row above, where the count already lives.
    assert.equal(deleteButton(root).getAttribute('aria-label'), 'Delete 4 essences');
    assert.equal(
      deleteButton(root).querySelector('span').textContent.trim(),
      'Delete 4 essences',
      'and the two faces are the same string, so the relation cannot drift'
    );
    harness.remount();
  });

  it('the armed confirm sentence reads correctly when both counts are 1', async () => {
    // `DeleteConfirmAria` carries TWO independent counts (essences and recipes) with no
    // established two-axis "…One" convention anywhere in the repo (checked: no sibling key
    // pluralizes two numbers in one sentence). It uses the same "(s)" idiom the essence
    // namespace already uses nearby (`Essence.DisabledInvalidatesRecipes`) rather than
    // inventing a four-way key matrix.
    const root = await harness.mount(props(ONE_OF_EACH, { deleteArmed: true }));
    assert.equal(
      deleteButton(root).getAttribute('aria-label'),
      'Confirm delete — 1 essence definition(s) will be deleted and 1 recipe(s) rewritten'
    );
    harness.remount();
  });

  it('the armed confirm sentence still carries both counts when neither is 1', async () => {
    const root = await harness.mount(props(SELECTION, { deleteArmed: true }));
    assert.equal(
      deleteButton(root).getAttribute('aria-label'),
      'Confirm delete — 4 essence definition(s) will be deleted and 3 recipe(s) rewritten'
    );
    harness.remount();
  });

  it('the ARMED name opens with the armed visible label (WCAG 2.5.3)', async () => {
    // It shipped as "Confirm deleting 4 essence definition(s)…", which does not CONTAIN
    // "Confirm delete", so the armed half of a destructive two-step control was unactivatable
    // by voice — the one state where being unable to speak the name is most consequential.
    const root = await harness.mount(props(SELECTION, { deleteArmed: true }));
    const button = deleteButton(root);
    const visible = button.querySelector('span').textContent.trim();

    assert.equal(visible, 'Confirm delete');
    assert.ok(
      button.getAttribute('aria-label').startsWith(visible),
      `"${button.getAttribute('aria-label')}" must open with "${visible}"`
    );
    harness.remount();
  });
});

describe('1036/11 EssenceBulkEditPanel — the armed delete', () => {
  it('takes TWO clicks, and the first writes nothing', async () => {
    const armed = [];
    const deleted = [];
    let isArmed = false;
    const root = await harness.mount(
      props(SELECTION, {
        deleteArmed: false,
        onArmDelete: (token) => {
          armed.push(token);
          isArmed = true;
        },
        onDelete: (ids) => deleted.push(ids),
      })
    );

    deleteButton(root).click();
    flushSync();
    assert.equal(armed.length, 1, 'the first click ARMS');
    assert.deepEqual(deleted, [], 'and writes nothing — this is the whole point of the pattern');

    // The owner holds the armed latch, so the armed render is a PROP change, exactly as the
    // manager root drives it.
    assert.equal(isArmed, true);
    await harness.setProps(
      props(SELECTION, { deleteArmed: true, onDelete: (ids) => deleted.push(ids) })
    );
    assert.match(
      deleteButton(root).textContent,
      /Confirm/,
      'the armed state is stated in WORDS, so it survives greyscale'
    );

    deleteButton(root).click();
    flushSync();
    assert.deepEqual(
      deleted,
      [['fire', 'water', 'earth', 'air']],
      'the second click deletes exactly the selected members, carried or not'
    );
    harness.remount();
  });

  it('is a real button rather than a dialog trigger', async () => {
    // The deviation, pinned: `AGENTS.md` reserves `confirmDialog` for bulk actions and this
    // action deliberately does not use one. A regression to a dialog would remove the impact
    // statement's whole reason to exist, because a modal cannot carry it.
    const root = await harness.mount(props(SELECTION));
    const button = deleteButton(root);
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('type'), 'button', 'and never submits a host form');
    assert.match(
      button.getAttribute('aria-label'),
      /4 essences/,
      'the consequence sentence is on the control, not only in the panel body'
    );
    harness.remount();
  });

  it('sits inside the delete card that scopes it to the inspector-action label size', async () => {
    // happy-dom cannot compute the cascade (see essence-studio-fidelity.test.js for the
    // source-level font-size pin), but it CAN prove the structural half of that fix: the
    // button the scoped `.fab-bulk-delete-card :global(.manager-button)` rule targets is
    // actually a descendant of that card, in both the idle and armed states.
    //
    // The class is the SHARED primitive's now (issue 1132), not the essence panel's. That is
    // the whole hazard the retarget exists for: the rule and the class moved together, and a
    // studio still asserting on `manager-essence-bulk-delete` would be asserting that a
    // selector matching nothing still matches the button.
    const root = await harness.mount(props(SELECTION));
    assert.ok(
      deleteButton(root).closest('.fab-bulk-delete-card'),
      'the idle delete button is inside the scoped card'
    );
    await harness.setProps(props(SELECTION, { deleteArmed: true }));
    assert.ok(
      deleteButton(root).closest('.fab-bulk-delete-card'),
      'the armed confirm button stays inside it too'
    );
    harness.remount();
  });
});

describe('1036/10 EssenceBulkEditPanel — the staged axes', () => {
  it('gates Apply on something being staged, including the two falsy-but-real values', async () => {
    const drafts = [];
    const root = await harness.mount(
      props(SELECTION, { onDraftChange: (next) => drafts.push(next) })
    );
    assert.equal(root.querySelector('[data-essence-bulk-apply]').disabled, true);

    // `Clear colour` stages `colorToken: null` — falsy, and REAL.
    root.querySelector('[data-essence-bulk-colour] [data-manager-color-none]').click();
    flushSync();
    const cleared = drafts.at(-1);
    assert.equal(cleared.colorTokenStaged, true);
    assert.equal(cleared.colorToken, null);

    await harness.setProps(props(SELECTION, { draft: cleared }));
    assert.equal(
      root.querySelector('[data-essence-bulk-apply]').disabled,
      false,
      'a staged null must enable Apply; a truthiness gate would leave it dead'
    );
    assert.equal(
      root.querySelector('[data-essence-bulk-colour]').dataset.essenceBulkColour,
      '__none__',
      'and the panel states WHICH of the three colour instructions is staged'
    );
    harness.remount();
  });

  it('marks nothing in the palette while the colour axis is UNSTAGED', async () => {
    // `Leave unchanged` and `Clear colour` are both "no preset is selected", and the palette
    // must not collapse them: marking the No-colour cell for an unstaged axis would paint
    // `Clear colour` as staged directly above a sub-hint reading `Leave unchanged`.
    const root = await harness.mount(props(SELECTION));
    const palette = root.querySelector('[data-essence-bulk-colour]');
    assert.equal(palette.querySelectorAll('[data-manager-color-token].is-selected').length, 0);
    assert.equal(
      palette.querySelector('[data-manager-color-none]').classList.contains('is-selected'),
      false,
      'nothing at all is marked while the axis is unstaged'
    );
    harness.remount();
  });

  it('stages a real colour token without naming it in the section sub-hint (maintainer feedback)', async () => {
    // No colour-NAME copy in the essence editor, "unnecessary overhead for all theme and
    // colour combinations" — the palette cell (`[data-manager-color-token].is-selected`)
    // already marks which token is staged, so the sub-hint states the generic fact instead
    // of resolving and repeating the token's display name.
    const drafts = [];
    const root = await harness.mount(
      props(SELECTION, { onDraftChange: (next) => drafts.push(next) })
    );
    root.querySelector('[data-essence-bulk-colour] [data-manager-color-token="rose"]').click();
    flushSync();
    const staged = drafts.at(-1);
    await harness.setProps(props(SELECTION, { draft: staged }));

    assert.equal(
      root.querySelector('[data-essence-bulk-colour]').dataset.essenceBulkColour,
      'rose',
      'the panel still states which token is staged, via the machine-readable attribute'
    );
    const subhint = root.querySelector('[data-essence-bulk-colour-state]');
    assert.ok(subhint, 'the colour section carries a sub-hint');
    assert.equal(
      subhint.textContent.includes('Rose'),
      false,
      'the visible sub-hint never names the staged colour'
    );
    assert.ok(
      root
        .querySelector('[data-essence-bulk-colour] [data-manager-color-token="rose"]')
        .classList.contains('is-selected'),
      'the palette cell itself is what marks the staged token'
    );
    harness.remount();
  });
});
