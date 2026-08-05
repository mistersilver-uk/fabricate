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
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
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
 * Three essences, and every number the statement reports is a different one:
 *
 * - SELECTION SIZE 3, of which 2 are deletable (`earth` is carried by a component);
 * - CARRYING COMPONENTS across the deletable pair: `comp-a` and `comp-b`, and `comp-b`
 *   carries both — so the UNION is 2 where the SUM would be 3;
 * - REWRITTEN RECIPES across the deletable pair: `r1` and `r2`, and `r2` is required by
 *   both — so the UNION is 2 where the SUM would be 3.
 *
 * The blocked member's own carriers are excluded entirely: they are not touched.
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
    componentUsageItems: [{ id: 'comp-b' }],
    componentUsageCount: 1,
    recipeUsageIds: ['r2'],
    recipeUsageCount: 1,
  }),
  makeEssenceRow({
    id: 'earth',
    name: 'Earth',
    deleteBlocked: true,
    componentUsageItems: [{ id: 'comp-z' }],
    componentUsageCount: 1,
    recipeUsageIds: ['r9'],
    recipeUsageCount: 1,
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

const impactRow = (root, name) =>
  root.querySelector(`[data-essence-bulk-impact-row="${name}"]`).textContent.trim();

const deleteButton = (root) =>
  root.querySelector('[data-essence-bulk-delete-card] .manager-button.is-danger');

before(async () => {
  await harness.setup();
});

after(() => harness.teardown());

describe('1036/17 EssenceBulkEditPanel — the delete impact statement', () => {
  it('reports three numbers that are three different questions', async () => {
    const root = await harness.mount(props(SELECTION));

    assert.match(impactRow(root, 'essences'), /^2\b/, '2 of the 3 selected are deletable');
    assert.match(
      impactRow(root, 'components'),
      /^2\b/,
      'comp-a and comp-b — a SUM of the per-essence counts would say 3'
    );
    assert.match(
      impactRow(root, 'recipes'),
      /^2\b/,
      'r1 and r2 — a SUM would say 3 before an operation that rewrites 2'
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
      /Delete 2 essences/,
      'and the idle button already names the count it will act on'
    );
    harness.remount();
  });

  it('RECOMPUTES when the selection changes', async () => {
    const root = await harness.mount(props(SELECTION));
    assert.match(impactRow(root, 'recipes'), /^2\b/);

    // Drop `fire`: `water` alone names only r2, and only comp-b carries it.
    await harness.setProps(props([SELECTION[1], SELECTION[2]]));
    assert.match(impactRow(root, 'essences'), /^1\b/);
    assert.match(impactRow(root, 'components'), /^1\b/);
    assert.match(
      impactRow(root, 'recipes'),
      /^1\b/,
      'a latched statement would still be reporting the previous selection'
    );
    harness.remount();
  });

  it('EXCLUDES the blocked member and NAMES it', async () => {
    const root = await harness.mount(props(SELECTION));
    const blocked = root.querySelector('[data-essence-bulk-blocked]');
    assert.ok(blocked, 'a blocked member is called out, not silently dropped');
    assert.match(blocked.textContent, /Earth/, 'by name, so the GM knows which one');
    assert.equal(blocked.dataset.essenceBulkBlocked, '1');

    // Negative control: with nothing blocked there is no notice at all, so the assertion
    // above is not satisfied by a strip that is always present.
    await harness.setProps(props([SELECTION[0], SELECTION[1]]));
    assert.ok(
      !root.querySelector('[data-essence-bulk-blocked]'),
      'and nothing blocked says nothing'
    );
    harness.remount();
  });

  it('is INERT when every selection member is blocked', async () => {
    const root = await harness.mount(props([SELECTION[2]]));
    assert.equal(
      deleteButton(root).disabled,
      true,
      'an action that would do nothing must not look like one that will do something'
    );
    assert.match(impactRow(root, 'essences'), /^0\b/);
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
    await harness.setProps(props(SELECTION, { deleteArmed: true, onDelete: (ids) => deleted.push(ids) }));
    assert.match(
      deleteButton(root).textContent,
      /Confirm/,
      'the armed state is stated in WORDS, so it survives greyscale'
    );

    deleteButton(root).click();
    flushSync();
    assert.deepEqual(
      deleted,
      [['fire', 'water']],
      'the second click deletes exactly the unblocked members'
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
      /2 essence definitions/,
      'the consequence sentence is on the control, not only in the panel body'
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
});
