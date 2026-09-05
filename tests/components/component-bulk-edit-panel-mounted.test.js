/**
 * The system Component Rules list's BULK EDIT panel (issue 772; rebuilt to the reference and the
 * world panel's anatomy for issue 1371 r16-list under maintainer rulings M23 and M24).
 *
 * The panel is where a destructive multi-component write becomes legible BEFORE it happens, so
 * what is tested here is the staging semantics and the anatomy the maintainer ruled on, not the
 * pixels: the three inline insets (category, tags, essence values) and what each row does when it
 * is clicked; the `n/N` count a row states; the search well and pager on each; the foot that names
 * the staged axes; the remove leg in the dock that states its consequence and refuses per record;
 * and the essence axis's whole-map semantics made visible as `—` until staged.
 *
 * The panel does NOT own the draft — the manager root does, because the panel is unmounted the
 * moment the selection empties. So these tests drive it the way the root does: hand it a draft,
 * take the NEW draft back through `onDraftChange`, and re-render with it. Every helper in
 * `componentBulkEditModel.js` is IMMUTABLE, so a panel that called a helper without reassigning
 * would compile, run, and silently do nothing; asserting on the rendered state after the round-trip
 * is what catches that. Every control's assertion below ACTS on the control: a control that merely
 * exists proves nothing (review r9, quality F1).
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createComponentBulkDraft } from '../../src/utils/componentBulkEditModel.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const panel = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-bulk-panel-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // The remove leg's focus/announce ordering rule (issue 1157), ported from `BulkDeleteCard`.
    'src/ui/svelte/util/announceAfterFocus.js',
    'src/utils/componentCategories.js',
    // The pure selection + staging model, and the inset pager and `n/N` counts beside it.
    'src/utils/componentBulkEditModel.js',
    // Its shared leaf (issue 1010): a STATIC import of that module.
    'src/utils/bulkSelectionModel.js',
    // The add-new essence offer projection (issue 1036).
    'src/utils/essenceValidation.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    // The shared inset's `stepper` rows lead with a `Medallion` tile (issue 1371 r16-cat, M25); an
    // omission HANGS this suite as `# cancelled` rather than failing a test.
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    // The three insets (issue 1371 r16-list) and the dock's danger control. Both are STATIC
    // imports of the component under test; omitting either HANGS this suite as `# cancelled`.
    'src/ui/svelte/apps/manager/BulkStagingInset.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/components/ComponentBulkEditPanel.svelte',
});

const ESSENCES = [
  { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
  { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' },
];

const SYSTEM = 'Mythwright Forge';

function impactOf(overrides = {}) {
  return {
    deletable: 3,
    deletableIds: ['c1', 'c2', 'c3'],
    recipesRewritten: 0,
    recipesDisabled: 0,
    ...overrides,
  };
}

/**
 * Mount the panel the way the manager root drives it: the caller owns the draft, and every
 * `onDraftChange` REPLACES it and re-renders. Returns the live draft accessor so a test can assert
 * on what was actually staged as well as on what is rendered.
 */
async function mountPanel(props = {}) {
  const state = {
    draft: props.draft || createComponentBulkDraft(),
    applies: 0,
    clears: 0,
    armed: 0,
    disarmed: 0,
    deleted: [],
  };
  const root = await panel.mount({
    count: 3,
    systemName: SYSTEM,
    categoryOptions: [{ name: 'Metal', count: 2 }, { name: 'general', count: 1 }],
    tags: ['metal', 'rune'],
    essenceDefinitions: ESSENCES,
    showEssences: true,
    selectedCards: [],
    deleteImpact: impactOf(),
    ...props,
    draft: state.draft,
    onDraftChange: async (next) => {
      state.draft = next;
      await panel.setProps({ draft: next });
    },
    onApply: () => {
      state.applies += 1;
    },
    onClearSelection: () => {
      state.clears += 1;
    },
    onArmDelete: () => {
      state.armed += 1;
    },
    onDisarmDelete: () => {
      state.disarmed += 1;
    },
    onDelete: (ids) => {
      state.deleted.push(ids);
    },
  });
  return { root, state };
}

const tagRow = (root, tag) => root.querySelector(`[data-bulk-tag="${tag}"]`);
const tagState = (root, tag) => tagRow(root, tag).getAttribute('data-bulk-tag-state');
const categoryRow = (root, name) =>
  root.querySelector(`[data-component-bulk-category-option="${name}"]`);
const essenceRow = (root, id) => root.querySelector(`[data-component-edit-essence="${id}"]`);
const essenceInput = (root, id) => essenceRow(root, id).querySelector('[data-stepper-input]');
const applyButton = (root) => root.querySelector('[data-component-bulk-apply]');
const removeButton = (root) =>
  root.querySelector(':scope [data-component-bulk-remove] [data-arm-token="delete-components"]');
const removeNote = (root) => root.querySelector('[data-component-bulk-remove-note]');
const announce = (root) => root.querySelector('[data-component-bulk-delete-announce]');
const inset = (root, id) => root.querySelector(`[data-bulk-inset="${id}"]`);
const rangeOf = (root, id) =>
  root.querySelector(`[data-bulk-inset-range="${id}"]`).textContent.trim();

function click(node) {
  node.click();
  flushSync();
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  flushSync();
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

describe('ComponentBulkEditPanel anatomy (issue 1371 r16-list, M23)', () => {
  it('draws the reference’s head, hero and three inline insets, and none of the shipped departures', async () => {
    const { root } = await mountPanel();

    assert.equal(
      root.querySelector('[data-component-bulk-clear]').textContent.trim(),
      'Clear',
      'the head action is the reference’s `Clear` (`proto:1107`), not `Clear selection`'
    );
    assert.match(root.querySelector('[data-component-bulk-count]').textContent, /3 components selected/);
    assert.match(
      root.querySelector('.fab-bulk-edit-hero-hint').textContent,
      /Staged changes are written to Mythwright Forge only\./,
      'the hero names the system the write lands in (`proto:5559`)'
    );
    assert.ok(
      Boolean(root.querySelector('[data-component-bulk-per-component-note]')),
      'the standing note says what cannot be bulk-edited (`proto:1110`)'
    );
    for (const id of ['category', 'tags', 'essences']) {
      const card = inset(root, id);
      assert.ok(Boolean(card), `${id} is drawn as an INLINE inset`);
      assert.ok(Boolean(card.querySelector(`[data-bulk-inset-search="${id}"]`)), `${id} carries a search well`);
      assert.ok(Boolean(card.querySelector(`[data-bulk-inset-range="${id}"]`)), `${id} carries a pager`);
    }
    assert.ok(!root.querySelector('[data-component-bulk-category]'), 'the `Leave unchanged` select is gone');
    assert.ok(!root.querySelector('[data-component-bulk-delete-card]'), 'the delete CARD is gone');
    assert.ok(!root.querySelector('.manager-component-bulk-essence-grid'), 'and so is the essence card grid');
  });

  it('puts the remove leg INSIDE the shell’s dock, under the primary (`proto:1269`-`1272`)', async () => {
    const { root } = await mountPanel();
    const dock = root.querySelector(':scope [data-component-bulk-panel] .fab-bulk-edit-dock');
    assert.ok(Boolean(dock), 'the shell renders its dock');
    const leg = dock.querySelector('[data-component-bulk-remove]');
    assert.ok(Boolean(leg), 'the remove leg is a child of the dock, not a sibling card below the shell');
    assert.ok(
      dock.querySelector('[data-component-bulk-apply]').compareDocumentPosition(leg) &
        globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
      'and it follows the primary'
    );
  });

  it('names the foot idle until something is staged, and names the staged axes after', async () => {
    const { root, state } = await mountPanel();
    assert.equal(applyButton(root).textContent.trim(), 'Stage a change to apply to 3 components');
    assert.equal(applyButton(root).disabled, true, 'a no-op Apply would report success and write nothing');

    click(categoryRow(root, 'Metal'));
    assert.equal(applyButton(root).textContent.trim(), 'Apply category to 3 components');
    assert.equal(applyButton(root).disabled, false);

    click(tagRow(root, 'metal'));
    assert.equal(applyButton(root).textContent.trim(), 'Apply category + tags to 3 components');

    click(root.querySelector('[data-component-bulk-essences-staged]'));
    assert.equal(
      applyButton(root).textContent.trim(),
      'Edit 3 components',
      'three axes no longer fit a rail, so the reference says `Edit N components` (`proto:5551`)'
    );

    click(applyButton(root));
    assert.equal(state.applies, 1);
  });

  it('says everything in the singular for one component', async () => {
    const { root } = await mountPanel({ count: 1, deleteImpact: impactOf({ deletable: 1, deletableIds: ['c1'] }) });
    assert.equal(applyButton(root).textContent.trim(), 'Stage a change to apply to 1 component');
    assert.match(root.querySelector('[data-component-bulk-count]').textContent, /1 component selected/);
    assert.equal(removeButton(root).querySelector('span').textContent.trim(), 'Remove 1 component from Mythwright Forge…');
  });

  it('clears the selection without applying anything', async () => {
    const { root, state } = await mountPanel();
    click(root.querySelector('[data-component-bulk-clear]'));
    assert.equal(state.clears, 1);
    assert.equal(state.applies, 0);
  });
});

describe('ComponentBulkEditPanel category inset (issue 1371 r16-list)', () => {
  it('stages a category on click as a RADIO, un-stages it on a second click, and clears from the head', async () => {
    const { root, state } = await mountPanel();
    const hint = () => root.querySelector(':scope .fab-bulk-edit-label-row .fab-bulk-edit-hint').textContent.trim();
    assert.equal(hint(), 'Unchanged');
    assert.equal(categoryRow(root, 'Metal').getAttribute('data-component-bulk-option-state'), 'off');

    click(categoryRow(root, 'Metal'));
    assert.equal(state.draft.category, 'Metal');
    assert.equal(categoryRow(root, 'Metal').getAttribute('data-component-bulk-option-state'), 'on');
    assert.equal(categoryRow(root, 'Metal').getAttribute('aria-pressed'), 'true');
    assert.equal(hint(), 'Metal', 'the head states the staged value (`proto:5562`)');
    assert.match(
      root.querySelector('[data-component-bulk-category-note]').textContent,
      /Written as a Mythwright Forge value on all 3\. Their world classification is untouched\./
    );

    click(categoryRow(root, 'general'));
    assert.equal(state.draft.category, 'general', 'one category is written — picking another replaces it');
    assert.equal(categoryRow(root, 'Metal').getAttribute('data-component-bulk-option-state'), 'off');

    click(categoryRow(root, 'general'));
    assert.equal(state.draft.category, '', 'clicking the chosen row leaves the category unchanged (`proto:5575`)');
    assert.match(root.querySelector('[data-component-bulk-category-note]').textContent, /Pick one to set it here/);

    click(categoryRow(root, 'Metal'));
    click(root.querySelector('[data-component-bulk-clear-category]'));
    assert.equal(state.draft.category, '', 'the head’s Clear un-stages the axis');
    assert.ok(!root.querySelector('[data-component-bulk-clear-category]'), 'and Clear is gone with it');
  });

  it('states `n/N` — how many of the SELECTED already carry the row’s category — and sorts by label', async () => {
    const { root } = await mountPanel({
      selectedCards: [
        { id: 'a', category: 'Metal' },
        { id: 'b', category: 'Metal' },
        { id: 'c', category: 'general' },
      ],
    });
    assert.equal(categoryRow(root, 'Metal').querySelector('.fab-bulk-inset-meta').textContent.trim(), '2/3');
    assert.equal(categoryRow(root, 'general').querySelector('.fab-bulk-inset-meta').textContent.trim(), '1/3');
    assert.deepEqual(
      [...inset(root, 'category').querySelectorAll('[data-component-bulk-category-option]')].map((row) =>
        row.getAttribute('data-component-bulk-category-option')
      ),
      ['general', 'Metal'],
      'General sorts before Metal (`proto:5510`)'
    );
  });

  it('offers NO `Inherit from world` row, because the bulk write has no verb for it', async () => {
    const { root } = await mountPanel();
    assert.doesNotMatch(inset(root, 'category').textContent, /inherit/i);
  });
});

describe('ComponentBulkEditPanel tag inset (issue 1371 r16-list)', () => {
  it('cycles a row leave -> add -> remove -> leave and is never both', async () => {
    const { root, state } = await mountPanel();
    assert.equal(tagState(root, 'metal'), 'none', 'a fresh draft stages nothing');

    click(tagRow(root, 'metal'));
    assert.equal(tagState(root, 'metal'), 'add');
    assert.deepEqual(state.draft.tagAdd, ['metal']);
    assert.ok(tagRow(root, 'metal').classList.contains('is-staged'));

    click(tagRow(root, 'metal'));
    assert.equal(tagState(root, 'metal'), 'remove');
    assert.deepEqual(state.draft.tagAdd, [], 'a tag is never simultaneously add and remove');
    assert.deepEqual(state.draft.tagRemove, ['metal']);
    assert.ok(tagRow(root, 'metal').classList.contains('is-removing'), 'a removal is painted in the danger family');

    click(tagRow(root, 'metal'));
    assert.equal(tagState(root, 'metal'), 'none');
    assert.deepEqual(state.draft.tagRemove, []);
    assert.equal(tagState(root, 'rune'), 'none', 'the other tags are untouched throughout');
  });

  it('paints the staged run above the inset, cycles from a chip too, and clears from the head', async () => {
    const { root, state } = await mountPanel();
    assert.ok(!root.querySelector('[data-component-bulk-tags]'), 'no run while nothing is staged');

    click(tagRow(root, 'metal'));
    click(tagRow(root, 'rune'));
    click(tagRow(root, 'rune'));
    const run = root.querySelector('[data-component-bulk-tags]');
    assert.ok(Boolean(run), 'the run appears (`proto:1146`)');
    assert.equal(run.getAttribute('role'), 'group');
    assert.equal(run.querySelector('[data-component-bulk-tag-chip="metal"]').getAttribute('data-component-bulk-tag-chip-state'), 'add');
    assert.equal(run.querySelector('[data-component-bulk-tag-chip="rune"]').getAttribute('data-component-bulk-tag-chip-state'), 'remove');
    assert.ok(
      [...root.querySelectorAll('.fab-bulk-edit-hint')].some((node) => node.textContent.trim() === '+1 −1'),
      'the head counts both directions (`proto:5579`)'
    );

    click(run.querySelector('[data-component-bulk-tag-chip="metal"]'));
    assert.equal(tagState(root, 'metal'), 'remove', 'a chip cycles the tag onward');

    click(root.querySelector('[data-component-bulk-clear-tags]'));
    assert.deepEqual([state.draft.tagAdd, state.draft.tagRemove], [[], []]);
    assert.ok(!root.querySelector('[data-component-bulk-tags]'), 'and the run is gone');
  });

  it('is live for a REMOVAL-ONLY draft', async () => {
    const { root } = await mountPanel();
    click(tagRow(root, 'metal'));
    click(tagRow(root, 'metal'));
    assert.equal(tagState(root, 'metal'), 'remove');
    assert.equal(applyButton(root).disabled, false, 'a removal-only edit is a real edit');
    assert.equal(applyButton(root).textContent.trim(), 'Apply tags to 3 components');
  });

  it('renders each row as a real focusable button whose name OPENS with the visible label', async () => {
    const { root } = await mountPanel();
    const row = tagRow(root, 'metal');
    assert.equal(row.tagName, 'BUTTON');
    assert.equal(row.getAttribute('type'), 'button');
    assert.equal(row.getAttribute('data-keyboard-focus'), 'true', 'a formless button must declare itself to Foundry');
    assert.match(row.getAttribute('aria-label'), /^metal — leave unchanged\.$/);
  });

  it('states `n/N` for how many of the SELECTED already carry the tag', async () => {
    const { root } = await mountPanel({
      selectedCards: [{ id: 'a', tags: ['metal'] }, { id: 'b', tags: ['metal', 'rune'] }, { id: 'c', tags: [] }],
    });
    assert.equal(tagRow(root, 'metal').querySelector('.fab-bulk-inset-meta').textContent.trim(), '2/3');
    assert.equal(tagRow(root, 'rune').querySelector('.fab-bulk-inset-meta').textContent.trim(), '1/3');
  });

  it('says which system defines no tags rather than drawing an empty inset', async () => {
    const { root } = await mountPanel({ tags: [] });
    const empty = root.querySelector('[data-component-bulk-tags-empty]');
    assert.ok(Boolean(empty));
    assert.equal(empty.textContent.trim(), 'Mythwright Forge defines no component tags.');
    assert.ok(!inset(root, 'tags'), 'no inset over nothing');
  });

  it('states the TRUE half of the tag story under the inset, and never the unconsumed merge', async () => {
    // `ui-integration/spec.md` `### GM World Component Screens` requirement 1: no surface may
    // assert that world tags merge into a system while the union does not consume that merge.
    const { root } = await mountPanel();
    const note = root.querySelector('[data-component-bulk-tags-note]');
    assert.equal(
      note.textContent.trim(),
      "World tags are shown on each record; this system's own list is what these rows change."
    );
    assert.doesNotMatch(root.textContent, /merge/i);
  });
});

describe('ComponentBulkEditPanel search and pager (issue 1371 r16-list; every inset since r17-b)', () => {
  const SEVEN = ['ash', 'bone', 'coal', 'dust', 'ember', 'flux', 'grit'];

  /**
   * The three insets, each as what differs between them (quality N1): the prop that gives it
   * seven rows, the hook its rows carry, how a row is staged and where the draft records it.
   * Each inset binds the shared `BulkStagingInset` through its OWN view (`insetView()` in the
   * panel), and until this table only the tags inset's binding was ever pressed.
   */
  const AXES = [
    {
      id: 'category',
      props: { categoryOptions: SEVEN.map((name) => ({ name, count: 0 })) },
      rowAttr: 'data-component-bulk-category-option',
      stage: (root) => click(categoryRow(root, 'ash')),
      staged: (draft) => draft.category,
      stagedValue: 'ash',
    },
    {
      id: 'tags',
      props: { tags: SEVEN },
      rowAttr: 'data-bulk-tag',
      stage: (root) => click(tagRow(root, 'ash')),
      staged: (draft) => draft.tagAdd,
      stagedValue: ['ash'],
    },
    {
      id: 'essences',
      props: { essenceDefinitions: SEVEN.map((id) => ({ id, name: id, icon: 'fas fa-fire' })) },
      rowAttr: 'data-component-edit-essence',
      stage: (root) => click(essenceRow(root, 'ash').querySelector('[data-stepper-increment]')),
      staged: (draft) => draft.essences.ash,
      stagedValue: 1,
    },
  ];
  const rowsOf = (root, axis) =>
    [...inset(root, axis.id).querySelectorAll(`[${axis.rowAttr}]`)].map((r) => r.getAttribute(axis.rowAttr));
  const pageLabel = (root, id) => inset(root, id).querySelector(':scope .fab-bulk-inset-page-label').textContent;

  for (const axis of AXES) {
    it(`${axis.id}: windows five rows, pages forward and back through its own binding, and states the range (\`proto:1155\`)`, async () => {
      const { root } = await mountPanel(axis.props);
      assert.deepEqual(rowsOf(root, axis), ['ash', 'bone', 'coal', 'dust', 'ember']);
      assert.equal(rangeOf(root, axis.id), 'Showing 1-5 of 7');
      assert.match(pageLabel(root, axis.id), /Page 1 of 2/);
      assert.equal(root.querySelector(`[data-bulk-inset-prev="${axis.id}"]`).disabled, true);

      click(root.querySelector(`[data-bulk-inset-next="${axis.id}"]`));
      assert.deepEqual(rowsOf(root, axis), ['flux', 'grit'], 'NEXT moves the window');
      assert.equal(rangeOf(root, axis.id), 'Showing 6-7 of 7');
      assert.equal(root.querySelector(`[data-bulk-inset-next="${axis.id}"]`).disabled, true);
      assert.match(pageLabel(root, axis.id), /Page 2 of 2/);

      click(root.querySelector(`[data-bulk-inset-prev="${axis.id}"]`));
      assert.deepEqual(rowsOf(root, axis), ['ash', 'bone', 'coal', 'dust', 'ember'], 'and PREV moves it back');
      assert.equal(rangeOf(root, axis.id), 'Showing 1-5 of 7');
    });

    it(`${axis.id}: searches inside the inset through its own binding without touching what is staged, and says when nothing matches`, async () => {
      const { root, state } = await mountPanel(axis.props);
      axis.stage(root);
      assert.deepEqual(axis.staged(state.draft), axis.stagedValue, 'NON-VACUITY: staged first');

      type(root.querySelector(`[data-bulk-inset-search="${axis.id}"]`), 'em');
      assert.deepEqual(rowsOf(root, axis), ['ember']);
      assert.equal(rangeOf(root, axis.id), 'Showing 1-1 of 1');
      assert.deepEqual(axis.staged(state.draft), axis.stagedValue, 'a search is the inset’s VIEW, not its instruction');

      type(root.querySelector(`[data-bulk-inset-search="${axis.id}"]`), 'zzz');
      const empty = root.querySelector(`[data-bulk-inset-empty="${axis.id}"]`);
      assert.ok(Boolean(empty));
      assert.match(empty.textContent, /matches that search\./);
      assert.equal(rangeOf(root, axis.id), 'Showing 0-0 of 0');

      type(root.querySelector(`[data-bulk-inset-search="${axis.id}"]`), '');
      assert.deepEqual(rowsOf(root, axis), ['ash', 'bone', 'coal', 'dust', 'ember'], 'clearing the well restores page one');
    });
  }
});

describe('ComponentBulkEditPanel essence inset (issue 1371 r16-list, M24)', () => {
  it('draws one row per essence with the glyph, the `n/N` count and a stepper, sorted by name', async () => {
    const { root } = await mountPanel({
      selectedCards: [{ id: 'a', essences: [{ id: 'fire', quantity: 2 }] }, { id: 'b', essences: [] }, { id: 'c', essences: [] }],
    });
    assert.deepEqual(
      [...root.querySelectorAll(':scope [data-component-bulk-essences] [data-component-edit-essence]')].map((r) =>
        r.getAttribute('data-component-edit-essence')
      ),
      ['earth', 'fire'],
      'sorted as the reference sorts (`proto:5520`)'
    );
    const fire = essenceRow(root, 'fire');
    // The tile is the shared inset's `Medallion variant="glyph-chip"` since the essence rows moved
    // onto `BulkStagingInset`'s `stepper` kind (issue 1371 r16-cat, M25).
    assert.ok(Boolean(fire.querySelector(':scope [data-medallion="glyph"] i.fa-fire')), 'the glyph medallion');
    assert.equal(fire.querySelector('.fab-bulk-inset-meta').textContent.trim(), '1/3');
    assert.ok(Boolean(fire.querySelector('[data-stepper-decrement]')) && Boolean(fire.querySelector('[data-stepper-increment]')), 'the `− +` pair');
  });

  it('reads `—` on every row while the axis is UNSTAGED, and every row’s number once it is', async () => {
    // The write REPLACES the whole map when the axis is staged, so a row that read `—` beside a
    // staged neighbour would be saying "unchanged" about a value the write strips to 0.
    const { root, state } = await mountPanel();
    assert.equal(essenceInput(root, 'fire').value, '', 'unstaged: nothing is written, so no number');
    assert.equal(essenceInput(root, 'fire').getAttribute('placeholder'), '—');
    assert.equal(essenceInput(root, 'earth').value, '');

    click(essenceRow(root, 'fire').querySelector('[data-stepper-increment]'));
    assert.equal(state.draft.essences.fire, 1);
    assert.equal(state.draft.essencesStaged, true, 'stepping an unstaged row up STAGES the axis');
    assert.equal(essenceInput(root, 'fire').value, '1');
    assert.equal(essenceInput(root, 'earth').value, '0', 'the neighbour now says what the write will do to it');
    assert.equal(essenceRow(root, 'fire').getAttribute('data-component-essence-active'), 'true');
    assert.equal(essenceRow(root, 'earth').getAttribute('data-component-essence-active'), 'false');
    assert.match(
      [...root.querySelectorAll('.fab-bulk-edit-hint')].map((n) => n.textContent.trim()).join('|'),
      /1 set/,
      'the head counts the values set'
    );
    assert.equal(applyButton(root).textContent.trim(), 'Apply essences to 3 components');
  });

  it('arms the essence axis DIRECTLY from the chip, because Stepper emits nothing at the zero boundary', async () => {
    const { root, state } = await mountPanel();
    const chip = root.querySelector('[data-component-bulk-essences-staged]');
    assert.equal(chip.tagName, 'BUTTON');
    assert.equal(chip.getAttribute('data-component-bulk-essences-staged'), 'false');
    assert.equal(applyButton(root).disabled, true);

    click(chip);
    assert.equal(state.draft.essencesStaged, true, 'a fresh, all-zero draft can stage "clear everything"');
    assert.equal(essenceInput(root, 'fire').value, '0', 'and every row now reads the 0 it will be written');
    assert.equal(applyButton(root).disabled, false, 'an all-zero staged map is a REAL edit');

    click(root.querySelector('[data-component-bulk-essences-staged]'));
    assert.equal(state.draft.essencesStaged, false, 'the same chip disarms');
    assert.equal(essenceInput(root, 'fire').value, '', 'and the rows read `—` again');
    assert.equal(state.clears, 0, 'without touching the selection');
  });

  it('leaves a bumped-then-zeroed axis staged, and visibly so', async () => {
    const { root, state } = await mountPanel();
    click(essenceRow(root, 'fire').querySelector('[data-stepper-increment]'));
    click(essenceRow(root, 'fire').querySelector('[data-stepper-decrement]'));
    assert.equal(state.draft.essences.fire, 0, 'back to zero');
    assert.equal(state.draft.essencesStaged, true, 'and STILL staged — this is the wipe');
    assert.equal(root.querySelector('[data-component-bulk-essences-staged]').getAttribute('data-component-bulk-essences-staged'), 'true');
  });

  it('1036/18: withholds a DISABLED essence from the offer unless it carries a staged quantity', async () => {
    const definitions = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false },
      { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true },
    ];
    const { root } = await mountPanel({ essenceDefinitions: definitions });
    assert.ok(Boolean(essenceRow(root, 'earth')), 'negative control: the ENABLED essence IS offered');
    assert.ok(!essenceRow(root, 'fire'), 'the disabled essence is withheld');

    panel.remount();
    const staged = await mountPanel({
      draft: { ...createComponentBulkDraft(), essencesStaged: true, essences: { fire: 3 } },
      essenceDefinitions: definitions,
    });
    assert.ok(Boolean(essenceRow(staged.root, 'fire')), 'a staged disabled essence is still rendered');
    click(essenceRow(staged.root, 'fire').querySelector('[data-stepper-decrement]'));
    assert.equal(staged.state.draft.essences.fire, 2, 'and is still editable back down');
  });

  it('states the permanent overwrite hint and warns only when an AUTHORED value would change', async () => {
    const authored = [{ id: 'a', essences: [{ id: 'fire', quantity: 3 }] }, { id: 'b', essences: [] }];
    const { root, state } = await mountPanel({ selectedCards: authored });
    assert.match(root.textContent, /overwrites the essence values on every selected component/);

    type(essenceInput(root, 'fire'), '3');
    assert.equal(state.draft.essences.fire, 3);
    assert.ok(!root.querySelector('[data-component-bulk-essence-warning]'), 'a no-change overwrite is not a hazard');

    click(essenceRow(root, 'fire').querySelector('[data-stepper-increment]'));
    const warning = root.querySelector('[data-component-bulk-essence-warning]');
    assert.ok(Boolean(warning), 'overwriting a hand-tuned value is exactly what the warning is for');
    assert.match(warning.textContent, /1 of the selected components/);
  });

  it('hides the whole essence group when the system does not enable essences', async () => {
    const { root } = await mountPanel({ showEssences: false });
    assert.ok(!inset(root, 'essences'));
    assert.ok(!root.querySelector('[data-component-bulk-essences-staged]'));
  });
});

describe('ComponentBulkEditPanel progressive DC (issue 772)', () => {
  it('seeds a zero DC when the axis is armed, so it is never a silent clear', async () => {
    const { root, state } = await mountPanel({ showProgressiveDifficulty: true });
    click(root.querySelector('[data-component-bulk-difficulty-staged]'));
    assert.equal(state.draft.difficultyStaged, true);
    assert.equal(state.draft.difficulty, 0);
    assert.equal(root.querySelector('[data-component-bulk-difficulty]').value, '0');
    type(root.querySelector('[data-component-bulk-difficulty]'), '14');
    assert.equal(state.draft.difficulty, 14);
    assert.equal(applyButton(root).textContent.trim(), 'Apply DC to 3 components');
  });

  for (const shown of [true, false]) {
    it(`${shown ? 'shows' : 'hides'} the section when the axis predicate is ${shown}`, async () => {
      const { root } = await mountPanel({ showProgressiveDifficulty: shown });
      assert.equal(Boolean(root.querySelector('[data-component-bulk-difficulty]')), shown);
    });
  }
});

// ── The remove leg (issue 1129's set delete, moved into the dock for issue 1371 r16-list) ────
//
// The panel does NOT compute the impact — it is handed one, because "how many recipes will be
// disabled" depends on the whole selection against real recipe bodies. These tests feed an impact
// literal and pin what the GM is SHOWN and what the two clicks DO.
describe('ComponentBulkEditPanel remove leg (issue 1371 r16-list)', () => {
  it('states the consequence BEFORE it is armed, counted, and gates each recipe sentence on its count', async () => {
    const { root } = await mountPanel({ deleteImpact: impactOf({ recipesRewritten: 2, recipesDisabled: 1 }) });
    assert.equal(removeButton(root).querySelector('span').textContent.trim(), 'Remove 3 components from Mythwright Forge…');
    assert.equal(removeButton(root).getAttribute('data-armed'), 'false');
    assert.equal(
      removeNote(root).textContent.trim(),
      'Removing them drops their rules in Mythwright Forge only. Their catalogue entries and every other system are untouched. ' +
        '2 recipes will be rewritten. 1 of those recipes is enabled today and will be disabled.'
    );
    assert.equal(removeNote(root).getAttribute('data-component-bulk-remove-note'), 'proceed');
    assert.ok(Boolean(removeButton(root).querySelector('i.fa-arrow-right-from-bracket')), 'the reference’s glyph (`proto:1271`)');
  });

  it('omits a ZERO recipe sentence rather than stating "0 recipes"', async () => {
    const { root } = await mountPanel();
    assert.equal(
      removeNote(root).textContent.trim(),
      'Removing them drops their rules in Mythwright Forge only. Their catalogue entries and every other system are untouched.'
    );
    assert.doesNotMatch(removeNote(root).textContent, /\b0 /);
  });

  it('never says the reference’s broken-ingredient sentence, which this store does not perform', async () => {
    const { root } = await mountPanel({ deleteImpact: impactOf({ recipesRewritten: 4 }) });
    assert.doesNotMatch(root.textContent, /broken ingredient/i);
    assert.match(removeNote(root).textContent, /4 recipes will be rewritten\./);
  });

  it('associates the note with the control and announces the arm and the cancellation', async () => {
    const { root } = await mountPanel({ deleteImpact: impactOf({ recipesRewritten: 2 }) });
    const described = removeButton(root).getAttribute('aria-describedby');
    assert.ok(described, 'the button names a description');
    assert.ok(Boolean(root.querySelector(`#${described}[data-component-bulk-remove-note]`)), 'and it is the note');
    assert.equal(announce(root).getAttribute('aria-live'), 'polite');
    assert.equal(announce(root).textContent.trim(), '', 'silent while idle');

    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.match(announce(root).textContent, /3 component\(s\) from Mythwright Forge/);
    assert.match(announce(root).textContent, /again/i);

    await panel.setProps({ deleteArmed: false });
    flushSync();
    assert.equal(announce(root).textContent.trim(), 'Remove cancelled. Nothing was removed.');
  });

  it('gives the ARMED control a name containing its visible label (WCAG 2.5.3)', async () => {
    const { root } = await mountPanel({ deleteArmed: true });
    const button = removeButton(root);
    const visible = button.querySelector('span').textContent.trim();
    assert.equal(visible, 'Confirm — remove 3 from Mythwright Forge');
    assert.ok(button.getAttribute('aria-label').startsWith(visible));
    assert.match(button.getAttribute('aria-label'), /drops their rules in Mythwright Forge only/);
  });

  it('takes TWO clicks, and the first writes nothing', async () => {
    const { root, state } = await mountPanel();
    click(removeButton(root));
    assert.equal(state.armed, 1, 'the first click ARMS');
    assert.deepEqual(state.deleted, [], 'and writes NOTHING');

    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.equal(removeButton(root).getAttribute('data-armed'), 'true');
    click(removeButton(root));
    assert.deepEqual(state.deleted, [['c1', 'c2', 'c3']], 'the second click removes the store’s deletable set');
  });

  it('REFUSES per record: a selection this system holds none of arms to `Cannot remove` and writes nothing', async () => {
    const { root, state } = await mountPanel({
      deleteImpact: impactOf({ deletable: 0, deletableIds: [] }),
    });
    assert.equal(removeButton(root).querySelector('span').textContent.trim(), 'Remove from Mythwright Forge…', 'uncounted where nothing can go');
    assert.equal(removeButton(root).disabled, false, 'a disabled button would leave the GM no explanation');
    assert.equal(removeNote(root).getAttribute('data-component-bulk-remove-note'), 'refused');
    assert.match(removeNote(root).textContent, /nothing to remove here/);

    await panel.setProps({ deleteArmed: true });
    flushSync();
    assert.equal(removeButton(root).querySelector('span').textContent.trim(), 'Cannot remove');
    click(removeButton(root));
    assert.deepEqual(state.deleted, [], 'the confirm writes nothing');
    assert.equal(state.disarmed, 1, 'and drops the arm instead');
  });

  it('is inert while an apply is in flight, and shows its busy face while removing', async () => {
    const { root } = await mountPanel({ applying: true });
    assert.equal(removeButton(root).disabled, true, 'a staged apply and a remove must not race');
    await panel.setProps({ applying: false, deleting: true });
    flushSync();
    assert.equal(removeButton(root).querySelector('span').textContent.trim(), 'Removing…');
  });
});
