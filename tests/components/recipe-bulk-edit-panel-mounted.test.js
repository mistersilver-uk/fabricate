/**
 * The recipe browser's BULK EDIT panel (issue 1010).
 *
 * What is tested here is the staging semantics, not the pixels: the tri-state book cycle,
 * the Apply enablement rule (including the removal-only draft an earlier design would have
 * left inert), the three distinct instructions of the check-tier axis, the five
 * unavailability messages that render IN PLACE OF that control, and the conditional
 * blocked-enable warning.
 *
 * The panel does NOT own the draft — the manager root does, because the panel is unmounted
 * the moment the selection empties. So these tests drive it the way the root does: hand it
 * a draft, take the NEW draft back through `onDraftChange`, and re-render with it.
 *
 * That round-trip is the point. Every helper in `recipeBulkEditModel.js` is IMMUTABLE, so a
 * panel that called `cycleBulkRecipeBook(draft, id)` without reassigning would compile,
 * run, and silently do nothing — the control would simply look dead. Asserting on the
 * rendered chip state after the round-trip is what catches that.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createRecipeBulkDraft } from '../../src/utils/recipeBulkEditModel.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const panel = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-bulk-panel-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/recipeCategories.js',
    // The pure staging model and its shared selection leaf. Both are STATIC imports of the
    // component under test, and the shared harness's closure validator throws loudly on an
    // omission — the hand-rolled suites are the ones that hang instead.
    'src/utils/recipeBulkEditModel.js',
    'src/utils/bulkSelectionModel.js'
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // The shared bulk-edit chrome: this panel renders its header, hero, section headings,
    // staged selects and Apply through these three, exactly as the Component Studio's does.
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipes/RecipeBulkEditPanel.svelte'
});

/**
 * The books in the shape the PROJECTION actually emits.
 *
 * `books` is `selectedSystem.recipeItemDefinitions`, which is
 * `_projectRecipeItemDefinitionSync` in the phase-1 publish and
 * `_enrichRecipeItemLibrary`'s spread of it in the phase-2 publish. NEITHER emits a bare
 * `name`: the display string is `resolvedName`, because a recipe item's name is resolved
 * from its linked world item and only falls back to the stored one. The panel renders
 * against either publish, so a fixture that hand-builds `{id, name}` builds a shape no
 * publish produces — and that is precisely what let a `book?.name || book?.id` label ship
 * showing `book-alchemy` in place of `Alchemist Primer` on every chip.
 *
 * `resolvedImg` / `derivedType` / `linkMissing` / `recipes` / `learnedByCount` are the
 * projection's other fields, carried here so the fixture stays a faithful sample rather
 * than a second hand-built shape.
 */
const BOOKS = [
  {
    id: 'book-alchemy',
    originItemUuid: 'Item.alchemy',
    resolvedName: 'Alchemist Primer',
    resolvedImg: 'icons/svg/item-bag.svg',
    derivedType: 'book',
    recipeIds: [],
    linkMissing: false,
    recipes: [],
    learnedByCount: 0
  },
  {
    id: 'book-forge',
    originItemUuid: 'Item.forge',
    resolvedName: 'Forge Manual',
    resolvedImg: 'icons/svg/item-bag.svg',
    derivedType: 'book',
    recipeIds: [],
    linkMissing: false,
    recipes: [],
    learnedByCount: 0
  }
];

// The second tier is deliberately UNNAMED: `resolveRecipeCheckTierOptions` returns tiers
// raw, so the "Unnamed tier (DC n)" fallback is this panel's to render.
const TIERS = [
  { id: 'tier-easy', name: 'Easy', dc: 8 },
  { id: 'tier-unnamed', name: '', dc: 18 }
];

const OPEN_AXIS = { available: true, reason: null };

/**
 * Mount the panel the way the manager root drives it: the caller owns the draft, and every
 * `onDraftChange` REPLACES it and re-renders. Returns the live draft accessor so a test can
 * assert on what was actually staged as well as on what is rendered.
 */
async function mountPanel(props = {}) {
  const state = { draft: props.draft || createRecipeBulkDraft(), applies: 0, clears: 0 };
  const root = await panel.mount({
    count: 3,
    categoryOptions: ['general', 'Ammunition'],
    checkTierAxis: OPEN_AXIS,
    checkTierOptions: TIERS,
    books: BOOKS,
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

const bookChip = (root, id) => root.querySelector(`[data-bulk-book="${id}"]`);
const bookState = (root, id) => bookChip(root, id).getAttribute('data-bulk-book-state');
const applyButton = (root) => root.querySelector('[data-recipe-bulk-apply]');
const tierSelect = (root) => root.querySelector('[data-recipe-bulk-check-tier]');

// The segmented axes render REAL radios, so a segment is chosen by firing `change` on the
// radio inside it rather than by clicking a styled label.
function chooseSegment(root, axis, value) {
  root
    .querySelector(`[data-recipe-bulk-${axis}-option="${value}"] input`)
    .dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  flushSync();
}

function chooseOption(select, value) {
  select.value = value;
  select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
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

describe('RecipeBulkEditPanel recipe-book staging (issue 1010)', () => {
  it('cycles a chip leave -> add -> remove -> leave and is never both', async () => {
    const { root, state } = await mountPanel();

    assert.equal(bookState(root, 'book-alchemy'), 'none', 'a fresh draft stages nothing');

    bookChip(root, 'book-alchemy').click();
    flushSync();
    assert.equal(bookState(root, 'book-alchemy'), 'add');
    assert.deepEqual(state.draft.bookAdd, ['book-alchemy']);
    assert.deepEqual(state.draft.bookRemove, []);

    bookChip(root, 'book-alchemy').click();
    flushSync();
    assert.equal(bookState(root, 'book-alchemy'), 'remove');
    assert.deepEqual(state.draft.bookAdd, [], 'a book is never simultaneously add and remove');
    assert.deepEqual(state.draft.bookRemove, ['book-alchemy']);

    bookChip(root, 'book-alchemy').click();
    flushSync();
    assert.equal(bookState(root, 'book-alchemy'), 'none');
    assert.deepEqual(state.draft.bookRemove, []);

    assert.equal(bookState(root, 'book-forge'), 'none', 'the other books are untouched throughout');
  });

  it('renders each chip as a real focusable button whose name opens with the book', async () => {
    const { root } = await mountPanel();
    const chip = bookChip(root, 'book-alchemy');

    assert.equal(chip.tagName, 'BUTTON', 'a span could not be reached by keyboard');
    assert.equal(chip.getAttribute('type'), 'button', 'and an untyped button would submit');
    assert.equal(
      chip.textContent,
      'Alchemist Primer',
      'the chip children carry no internal whitespace'
    );
    assert.match(
      chip.getAttribute('aria-label'),
      /^Alchemist Primer — leave unchanged\.$/,
      'the name OPENS with the visible label (WCAG 2.5.3) then states the staged ACTION — '
        + 'aria-pressed cannot describe three states'
    );
  });

  // `bookActionLabel` reads `bookLabel`, so a broken label chain breaks the VISIBLE text
  // and the ACCESSIBLE NAME together — and the accessible name is where it is least
  // likely to be noticed. Both are asserted against the projected `resolvedName`, and the
  // id is asserted absent so a fixture that happens to also carry a `name` cannot mask a
  // regression back to `book?.id`.
  it('labels every chip from the projection resolvedName, never the raw definition id', async () => {
    const { root } = await mountPanel();

    for (const [id, name] of [['book-alchemy', 'Alchemist Primer'], ['book-forge', 'Forge Manual']]) {
      const chip = bookChip(root, id);
      assert.equal(chip.textContent, name, `${id} renders its resolved name, not its id`);
      assert.ok(
        chip.getAttribute('aria-label').startsWith(name),
        `${id}: the accessible name opens with the same resolved name`
      );
      assert.ok(
        !chip.getAttribute('aria-label').includes(id),
        `${id}: a raw definition id must never reach a GM-visible string`
      );
    }
    assert.ok(
      !root.querySelector('[data-recipe-bulk-books]').textContent.includes('book-'),
      'no chip in the run falls through to an id'
    );
  });

  // A book whose projection somehow carries no resolved name still gets SOMETHING: an
  // empty chip is unclickable in practice and unnameable for speech input, so the id is
  // the last resort rather than the first.
  it('falls back to the id only when no resolvable name exists at all', async () => {
    const { root } = await mountPanel({ books: [{ id: 'sm-book' }] });
    assert.equal(bookChip(root, 'sm-book').textContent, 'sm-book');
  });

  // The run is ONE axis, so it is exposed as one control rather than as a stray sequence of
  // buttons, and the hint above it states all THREE stops of the cycle. Both facts are
  // shared verbatim with the Component Studio's tag run — see its twin case.
  it('exposes the chip run as a named group above an honest three-state hint', async () => {
    const { root } = await mountPanel();
    const run = root.querySelector('[data-recipe-bulk-books]');

    assert.equal(run.getAttribute('role'), 'group');
    assert.equal(
      run.getAttribute('aria-label'),
      'Recipe books',
      'the group name is the section heading a sighted GM reads, not a second string'
    );
    assert.match(
      root.textContent,
      /click to add · again to remove · again to leave unchanged/,
      'the third stop is the one that UNDOES a staged remove; naming only two of three left '
        + 'it discoverable only by clicking and watching'
    );
  });

  it('says the system defines no recipe books rather than rendering an empty run', async () => {
    const { root } = await mountPanel({ books: [] });
    assert.ok(Boolean(root.querySelector('[data-recipe-bulk-books-empty]')));
    assert.ok(!root.querySelector('[data-recipe-bulk-books]'), 'and renders no chip row at all');
  });
});

describe('RecipeBulkEditPanel apply enablement (issue 1010)', () => {
  it('is inert with nothing staged and live the moment any axis is staged', async () => {
    const { root, state } = await mountPanel();

    assert.equal(
      applyButton(root).disabled,
      true,
      'a no-op Apply would report success and write nothing'
    );
    assert.match(applyButton(root).textContent, /Apply to 3 recipes/, 'and names the blast radius');

    chooseSegment(root, 'status', 'disable');

    assert.equal(state.draft.status, 'disable');
    assert.equal(applyButton(root).disabled, false, 'Disable is a real edit, not a falsy one');

    applyButton(root).click();
    flushSync();
    assert.equal(state.applies, 1);
  });

  it('is live for a REMOVAL-ONLY book draft', async () => {
    const { root } = await mountPanel();

    // Straight to `remove`: two clicks, never resting on `add`.
    bookChip(root, 'book-forge').click();
    flushSync();
    bookChip(root, 'book-forge').click();
    flushSync();

    assert.equal(bookState(root, 'book-forge'), 'remove');
    assert.equal(
      applyButton(root).disabled,
      false,
      'a removal-only edit is a real edit the chip run can stage on its own'
    );
  });

  it('names one recipe in the singular', async () => {
    const { root } = await mountPanel({ count: 1 });
    assert.match(applyButton(root).textContent, /Apply to 1 recipe/);
    assert.match(
      root.querySelector('[data-recipe-bulk-count]').textContent,
      /1 recipe selected/,
      'never "1 recipes selected"'
    );
  });

  it('clears the selection without applying anything', async () => {
    const { root, state } = await mountPanel();
    root.querySelector('[data-recipe-bulk-clear]').click();
    flushSync();
    assert.equal(state.clears, 1);
    assert.equal(state.applies, 0);
  });
});

describe('RecipeBulkEditPanel blocked-enable forecast (issue 1010)', () => {
  it('warns ONLY under a staged Enable, and names both numbers', async () => {
    const { root } = await mountPanel({ blockedCount: 2 });

    assert.ok(
      !root.querySelector('[data-recipe-bulk-blocked-warning]'),
      'an unstaged status transitions nothing, so nothing can be refused'
    );

    // A staged DISABLE with a non-zero count is the case that proves the `enable` term is
    // load-bearing rather than redundant: nothing is being switched ON, so no hazard.
    chooseSegment(root, 'status', 'disable');
    assert.ok(
      !root.querySelector('[data-recipe-bulk-blocked-warning]'),
      'Disable can refuse nothing — the activation gate fires only on a transition to on'
    );

    chooseSegment(root, 'status', 'enable');
    const warning = root.querySelector('[data-recipe-bulk-blocked-warning]');
    assert.ok(Boolean(warning), 'a staged Enable over blocked rows is exactly the hazard');
    assert.match(
      warning.textContent,
      /At least 2 of 3 selected recipes can't be enabled yet and will stay off\./,
      'both the blocked count and the selection size, and "At least" — it is a lower bound'
    );
  });

  it('stays silent when the count is zero, however the status is staged', async () => {
    const { root } = await mountPanel({ blockedCount: 0 });
    chooseSegment(root, 'status', 'enable');
    assert.ok(!root.querySelector('[data-recipe-bulk-blocked-warning]'));
  });

  it('uses the singular twin rather than "At least 1 of 1"', async () => {
    const { root } = await mountPanel({ count: 1, blockedCount: 1 });
    chooseSegment(root, 'status', 'enable');
    const warning = root.querySelector('[data-recipe-bulk-blocked-warning]');
    assert.match(warning.textContent.trim(), /^The selected recipe can't be enabled yet/);
    assert.ok(!/1 of 1/.test(warning.textContent), 'the plural string is unreachable at one');
  });
});

describe('RecipeBulkEditPanel check-tier axis (issue 1010)', () => {
  it('round-trips the three distinct instructions without collapsing two of them', async () => {
    const { root, state } = await mountPanel();

    assert.equal(tierSelect(root).value, '', 'a fresh draft leaves the axis unstaged');
    assert.equal(state.draft.checkTierStaged, false);

    chooseOption(tierSelect(root), '__default__');
    assert.equal(state.draft.checkTierStaged, true, 'Default DC is a REAL instruction');
    assert.equal(state.draft.checkTierId, null);
    assert.equal(tierSelect(root).value, '__default__', 'and the control shows it');
    assert.equal(applyButton(root).disabled, false);

    chooseOption(tierSelect(root), 'tier-easy');
    assert.equal(state.draft.checkTierId, 'tier-easy');
    assert.equal(tierSelect(root).value, 'tier-easy');

    chooseOption(tierSelect(root), '');
    assert.equal(state.draft.checkTierStaged, false, 'back to leave-alone, not to Default DC');
    assert.equal(applyButton(root).disabled, true);
  });

  it('renders a tier as {name} (DC {dc}), falling back to Unnamed tier', async () => {
    const { root } = await mountPanel();
    const labels = [...tierSelect(root).querySelectorAll('option')].map((o) => o.textContent);
    assert.deepEqual(labels, [
      'Leave unchanged',
      'Default DC',
      'Easy (DC 8)',
      'Unnamed tier (DC 18)'
    ]);
  });

  // One case per `describeRecipeCheckTierAxis` reason. The panel STATES which case it is
  // rather than hiding the axis, and it must never render a picker beside that statement.
  for (const [reason, fragment] of [
    ['progressive', /difficulty lives on each result component/],
    ['dynamic', /resolves its DC dynamically at craft time/],
    ['fixed', /comes from its minimum success tier/],
    ['unrecognisedMode', /doesn't recognise this system's resolution mode/],
    ['noTiers', /authors no tiers, so every recipe uses its default DC/]
  ]) {
    it(`states the ${reason} case in place of the control`, async () => {
      const { root } = await mountPanel({
        checkTierAxis: { available: false, reason },
        checkTierOptions: []
      });

      const callout = root.querySelector('[data-recipe-bulk-check-tier-unavailable]');
      assert.ok(Boolean(callout), 'a hidden axis reads as a missing feature');
      assert.equal(callout.getAttribute('data-recipe-bulk-check-tier-unavailable'), reason);
      assert.match(callout.textContent, fragment, 'each reason has its OWN message');
      assert.ok(!tierSelect(root), 'and no picker sits beside the statement');
      assert.ok(
        !/The DC these recipes roll against/.test(root.textContent),
        'the sub-hint lives INSIDE the available branch — outside it, it would contradict '
          + 'the Callout one line below'
      );
    });
  }

  it('states the sub-hint when the axis IS available', async () => {
    const { root } = await mountPanel();
    assert.match(root.textContent, /The DC these recipes roll against — not the check's outcome tiers\./);
    assert.ok(!root.querySelector('[data-recipe-bulk-check-tier-unavailable]'));
  });
});

describe('RecipeBulkEditPanel in-flight apply (issue 1010)', () => {
  it('goes inert rather than double-writing', async () => {
    const { root } = await mountPanel({
      applying: true,
      draft: { ...createRecipeBulkDraft(), status: 'enable' }
    });

    assert.equal(root.querySelector('[data-recipe-bulk-category]').disabled, true);
    assert.equal(tierSelect(root).disabled, true);
    assert.equal(bookChip(root, 'book-alchemy').disabled, true);
    for (const axis of ['status', 'lock']) {
      const radios = [...root.querySelectorAll(`[data-recipe-bulk-${axis}-option] input`)];
      assert.equal(radios.length, 3, `the ${axis} axis renders its three segments`);
      assert.ok(
        radios.every((radio) => radio.disabled),
        `a dimmed-but-live ${axis} segment would still stage an edit mid-apply`
      );
    }
    assert.equal(
      applyButton(root).disabled,
      true,
      'and Apply is inert even though the draft has changes'
    );
  });
});
