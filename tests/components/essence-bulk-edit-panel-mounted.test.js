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
 * Four essences, and every number the statement reports is a different one.
 *
 * ## The fixture obeys the store's OWN invariant, which the first version of it did not
 *
 * `adminStore._buildEssenceCards` sets `deleteBlocked: componentUsageCount > 0` and nothing
 * else, so a row carrying a component IS blocked and a deletable row carries NONE. The
 * earlier fixture combined `deleteBlocked: false` with a non-empty `componentUsageItems`,
 * which the store cannot emit, and that shape is what made a component count taken over the
 * DELETABLE rows look non-trivial when in the running app it was always `0`.
 * `makeEssenceRow` now derives the flag, so this fixture cannot drift back.
 *
 * Consequently the two carrier numbers are counted over different sets, and the fixture
 * separates them:
 *
 * - SELECTION SIZE 4, of which 2 are deletable — `fire` and `water` are carried;
 * - CARRYING COMPONENTS over the WHOLE selection: `comp-a`…`comp-d`, with `comp-b` carrying
 *   both blocked essences — so the UNION is 4 where the SUM would be 5;
 * - REWRITTEN RECIPES over the DELETABLE pair: `r1`, `r2`, `r3`, with `r2` required by both
 *   — so the UNION is 3 where the SUM would be 4.
 *
 * 2, 4 and 3: a statement deriving any number from another passes against equal numbers and
 * fails here.
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

    assert.match(impactRow(root, 'essences'), /^2\b/, '2 of the 4 selected are deletable');
    assert.match(
      impactRow(root, 'components'),
      /^4\b/,
      'comp-a…comp-d over the whole selection — a SUM of the per-essence counts would say 5'
    );
    assert.match(
      impactRow(root, 'recipes'),
      /^3\b/,
      'r1, r2 and r3 — a SUM would say 4 before an operation that rewrites 3'
    );
    harness.remount();
  });

  it('counts carrying components over the WHOLE selection, so the line explains the skip', async () => {
    // The regression this pins: counted over the DELETABLE rows the number is zero for
    // every selection a real store can produce, because carrying a component is exactly
    // what blocks the delete. It rendered as a fixed "0 components carry them." directly
    // above a callout naming the essences those components were keeping.
    const root = await harness.mount(props([SELECTION[0], SELECTION[1]]));
    assert.match(impactRow(root, 'essences'), /^0\b/, 'nothing in this selection is deletable');
    assert.match(
      impactRow(root, 'components'),
      /^4\b/,
      'and the component line still names the four carriers that are why'
    );
    assert.ok(
      root.querySelector('[data-essence-bulk-blocked]'),
      'the callout it explains is on screen at the same time'
    );

    // Negative control: a selection carried by nothing reports nothing, so the assertion
    // above cannot be satisfied by a number that is simply always non-zero.
    await harness.setProps(props([SELECTION[2], SELECTION[3]]));
    assert.match(impactRow(root, 'components'), /^0\b/);
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
    assert.match(impactRow(root, 'recipes'), /^3\b/);

    // Drop `fire` and `earth`: `water` alone is carried by comp-b/c/d, and `air` alone
    // names only r2. All three numbers move.
    await harness.setProps(props([SELECTION[1], SELECTION[3]]));
    assert.match(impactRow(root, 'essences'), /^1\b/);
    assert.match(impactRow(root, 'components'), /^3\b/);
    assert.match(
      impactRow(root, 'recipes'),
      /^1\b/,
      'a latched statement would still be reporting the previous selection'
    );
    harness.remount();
  });

  it('EXCLUDES the blocked members and NAMES them', async () => {
    const root = await harness.mount(props(SELECTION));
    const blocked = root.querySelector('[data-essence-bulk-blocked]');
    assert.ok(blocked, 'a blocked member is called out, not silently dropped');
    assert.match(blocked.textContent, /Fire/, 'by name, so the GM knows which one');
    assert.match(blocked.textContent, /Water/);
    assert.equal(blocked.dataset.essenceBulkBlocked, '2');

    // Negative control: with nothing blocked there is no notice at all, so the assertion
    // above is not satisfied by a strip that is always present.
    await harness.setProps(props([SELECTION[2], SELECTION[3]]));
    assert.ok(
      !root.querySelector('[data-essence-bulk-blocked]'),
      'and nothing blocked says nothing'
    );
    harness.remount();
  });

  it('SUMMARISES the blocked tail rather than comma-joining a whole library', async () => {
    // `Select all matching` can select every essence in the system. Four blocked members
    // is one past the cap, which is the smallest selection that can tell a capped list
    // from an uncapped one.
    const many = ['Fire', 'Water', 'Earth', 'Aether'].map((name, index) =>
      makeEssenceRow({
        id: `blocked-${index}`,
        name,
        componentUsageItems: [{ id: `comp-${index}` }],
        componentUsageCount: 1,
      })
    );
    const root = await harness.mount(props(many));
    const blocked = root.querySelector('[data-essence-bulk-blocked]');
    assert.equal(blocked.dataset.essenceBulkBlocked, '4', 'the COUNT is still all of them');
    assert.match(blocked.textContent, /and 1 more/, 'and the tail is summarised, not dropped');
    assert.ok(
      !blocked.textContent.includes('Aether'),
      'the fourth name is behind the summary rather than in the list'
    );
    harness.remount();
  });

  it('is INERT when every selection member is blocked', async () => {
    const root = await harness.mount(props([SELECTION[0]]));
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
      [['earth', 'air']],
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
