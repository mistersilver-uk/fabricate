/**
 * The recipe browser's BULK EDIT panel (issue 1010).
 *
 * What is tested here is the staging semantics, not the pixels: the book picker and its
 * accumulating staged list, the Apply enablement rule (including the removal-only draft an
 * earlier design would have left inert), the three distinct instructions of the check-tier
 * axis, the five unavailability messages that render IN PLACE OF that control, and the
 * conditional blocked-enable warning.
 *
 * The panel does NOT own the draft — the manager root does, because the panel is unmounted
 * the moment the selection empties. So these tests drive it the way the root does: hand it
 * a draft, take the NEW draft back through `onDraftChange`, and re-render with it.
 *
 * That round-trip is the point. Every helper in `recipeBulkEditModel.js` is IMMUTABLE, so a
 * panel that called `setBulkRecipeBookOp(draft, id, op)` without reassigning would compile,
 * run, and silently do nothing — the control would simply look dead. Asserting on the
 * rendered staged list after the round-trip is what catches that.
 *
 * The ONE piece of state the panel does own is which book the pick card is composing, which
 * is view state and not an instruction; the accumulating `bookAdd` / `bookRemove` lists
 * still belong to the caller, so staging several books in turn is tested end to end here.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES
} from '../helpers/svelte-component-harness.js';
import { createRecipeBulkDraft } from '../../src/utils/recipeBulkEditModel.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const panel = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-bulk-panel-',
  rawModules: [
    // The book axis is a `SearchablePopover`, so its portal / dismiss actions and popover
    // layout util come with it. A missing entry here HANGS the suite (`# cancelled`)
    // rather than failing it, which is why the list is hoisted and shared.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
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
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // The shared bulk-edit chrome: this panel renders its header, hero, section headings,
    // staged selects and Apply through these three, exactly as the Component Studio's does.
    'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
    'src/ui/svelte/apps/manager/BulkEditSection.svelte',
    'src/ui/svelte/apps/manager/BulkEditSelect.svelte',
    // The shared set-delete card and the armed control inside it (issue 1132). Both are
    // STATIC imports of the panel, so the closure validator throws on an omission.
    'src/ui/svelte/apps/manager/BulkDeleteCard.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
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
 * showing `book-alchemy` in place of `Alchemist Primer` on every option row.
 *
 * `resolvedImg` / `derivedType` / `linkMissing` / `recipes` / `learnedByCount` are the
 * projection's other fields, carried here so the fixture stays a faithful sample rather
 * than a second hand-built shape.
 *
 * EVERY `recipeIds` IS EMPTY, and that is load-bearing rather than lazy. It is the shape a
 * LEGACY-BASIS system projects — one whose `membershipResolvesByRecipeIds` marker is unset,
 * so membership resolves through the `recipe.recipeItemId` scalar and a book's own array
 * says nothing. The membership counts below are handed in separately, exactly as the
 * manager root derives them from the projected ROWS, so a panel that read `book.recipeIds`
 * would report "holds none selected" for every one of these books.
 */
const BOOKS = [
  {
    id: 'book-alchemy',
    originItemUuid: 'Item.alchemy',
    resolvedName: 'Alchemist Primer',
    resolvedImg: 'icons/svg/item-bag.svg',
    derivedType: 'Book',
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
    derivedType: 'Scroll',
    recipeIds: [],
    linkMissing: false,
    recipes: [],
    learnedByCount: 0
  }
];

/**
 * The basis-aware membership the manager root derives from the SELECTED projected rows'
 * `recipeItemIds`: over a selection of three, the Primer holds two of them and the Manual
 * holds none. Both books' own `recipeIds` are empty above, so these numbers are reachable
 * only through the map.
 */
const MEMBERSHIP = new Map([['book-alchemy', 2]]);

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
    bookMembership: MEMBERSHIP,
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

const applyButton = (root) => root.querySelector('[data-recipe-bulk-apply]');
const tierSelect = (root) => root.querySelector('[data-recipe-bulk-check-tier]');

// ── The book axis ────────────────────────────────────────────────────────────────
const bookTrigger = (root) => root.querySelector('.fab-bulk-book-trigger');
const pickCard = (root) => root.querySelector('[data-recipe-bulk-book-pick]');
const addButton = (root) => root.querySelector('[data-recipe-bulk-book-add]');
const removeButton = (root) => root.querySelector('[data-recipe-bulk-book-remove]');
const stagedList = (root) => root.querySelector('[data-recipe-bulk-books-staged]');
const stagedRow = (root, id) => root.querySelector(`[data-bulk-book="${id}"]`);
const stagedState = (root, id) => stagedRow(root, id)?.getAttribute('data-bulk-book-state');
const stagedIds = (root) =>
  [...root.querySelectorAll('[data-bulk-book]')].map((row) => row.getAttribute('data-bulk-book'));

/**
 * Activate a control the way a KEYBOARD user does: focus it, then press it.
 *
 * A bare `.click()` moves no focus, so every gesture below would start from
 * `document.body` and the focus assertions could not tell "the panel re-homed focus"
 * from "focus was never anywhere to lose".
 */
function press(node) {
  node.focus();
  node.click();
  flushSync();
}

/** Open the picker popover and click one book's option row by id. */
function pickBook(root, bookId) {
  press(bookTrigger(root));
  press(root.querySelector(`[data-popover-option="${bookId}"]`));
}

/** Pick a book and press one of its two actions — the whole gesture, as a GM performs it. */
function stageBook(root, bookId, op) {
  pickBook(root, bookId);
  press(op === 'add' ? addButton(root) : removeButton(root));
}

/**
 * Drain the microtask queue so a `queueMicrotask`-deferred focus hop has run.
 *
 * The panel re-homes focus the way `SearchablePopover.close()` does — after Svelte's own
 * flush, which is itself a microtask — so an assertion made synchronously after the press
 * would read the pre-hop `document.activeElement` and pass or fail for the wrong reason.
 */
async function settleFocus() {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * What holds focus, as a SHORT STRING.
 *
 * Never the node: `node:assert` serialises the actual value to build its diff, and walking
 * a mounted happy-dom element's circular tree kills the heap — a two-second assertion
 * failure surfaces as a `# cancelled` suite with no message.
 *
 * `detached` is reported separately from the control's name because the failure this whole
 * block exists to catch has BOTH shapes: focus falling to `document.body`, and focus left
 * stranded on a node the re-render has already removed from the document.
 */
function focusHolder() {
  const active = document.activeElement;
  if (!active || active === document.body) return 'document.body';
  const name = controlName(active);
  return active.isConnected === false ? `detached ${name}` : name;
}

function controlName(node) {
  const unstage = node.getAttribute?.('data-recipe-bulk-book-unstage');
  if (unstage) return `unstage ${unstage}`;
  for (const [attribute, name] of [
    ['data-recipe-bulk-book-add', 'add'],
    ['data-recipe-bulk-book-remove', 'remove'],
    ['data-recipe-bulk-book-clear-pick', 'clear pick']
  ]) {
    if (node.hasAttribute?.(attribute)) return name;
  }
  if (node.classList?.contains?.('fab-bulk-book-trigger')) return 'trigger';
  return `<${String(node.tagName ?? 'unknown').toLowerCase()}>`;
}

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

describe('RecipeBulkEditPanel book picker (issue 1010)', () => {
  it('offers the whole AUTHORED vocabulary, not the books the selection is already in', async () => {
    const { root } = await mountPanel();
    bookTrigger(root).click();
    flushSync();

    assert.deepEqual(
      [...root.querySelectorAll('[data-popover-option]')].map((option) =>
        option.getAttribute('data-popover-option')
      ),
      ['book-alchemy', 'book-forge'],
      'a vocabulary built from books the selected recipes are already in would drop the '
        + 'Forge Manual, which holds none of them — and it is the commonest Add target there is'
    );
  });

  // The prototype's results list stays EMPTY until the GM types, which on a four-book system
  // is a bare search box that shows nothing at all.
  it('lists every book with an empty query rather than waiting to be typed at', async () => {
    const { root } = await mountPanel();
    bookTrigger(root).click();
    flushSync();

    const search = root.querySelector('.manager-travel-popover-search input');
    assert.equal(search.value, '', 'precondition: nothing has been typed');
    assert.equal(root.querySelectorAll('[data-popover-option]').length, 2);
  });

  // THE BASIS-AWARE COUNT. Every fixture book carries an EMPTY `recipeIds` — the shape a
  // legacy-basis system projects — so these numbers exist only in the membership map the
  // root derives from the projected ROWS. A panel that counted from `book.recipeIds` would
  // render "holds none of the 3 selected" here and, below, disable Remove.
  it('states each book membership from the basis-aware map, never from book.recipeIds', async () => {
    const { root } = await mountPanel();
    bookTrigger(root).click();
    flushSync();

    const metaOf = (id) =>
      root.querySelector(`[data-popover-option="${id}"] .manager-travel-option-meta`).textContent;

    assert.equal(metaOf('book-alchemy'), 'Recipe book · holds 2 of 3 selected');
    assert.equal(metaOf('book-forge'), 'Scroll · holds none of the 3 selected');
    assert.ok(
      BOOKS.every((book) => book.recipeIds.length === 0),
      'the fixture really is legacy-basis: no definition knows its own membership'
    );
  });

  it('names both extremes as whole sentences rather than "holds 0 of 3"', async () => {
    const { root } = await mountPanel({
      count: 3,
      bookMembership: new Map([['book-alchemy', 3]])
    });
    bookTrigger(root).click();
    flushSync();

    assert.match(
      root.querySelector('[data-popover-option="book-alchemy"]').textContent,
      /holds all 3 selected/
    );
    assert.match(
      root.querySelector('[data-popover-option="book-forge"]').textContent,
      /holds none of the 3 selected/
    );
  });

  it('labels every option from the projection resolvedName, never the raw definition id', async () => {
    const { root } = await mountPanel();
    bookTrigger(root).click();
    flushSync();

    for (const [id, name] of [['book-alchemy', 'Alchemist Primer'], ['book-forge', 'Forge Manual']]) {
      const option = root.querySelector(`[data-popover-option="${id}"]`);
      assert.equal(
        option.querySelector('.manager-travel-option-name').textContent,
        name,
        `${id} renders its resolved name, not its id`
      );
      assert.ok(
        !option.textContent.includes(id),
        `${id}: a raw definition id must never reach a GM-visible string`
      );
    }
  });

  // A book whose projection somehow carries no resolved name still gets SOMETHING: an
  // unnamed option is unreadable and unnameable for speech input, so the id is the last
  // resort rather than the first.
  it('falls back to the id only when no resolvable name exists at all', async () => {
    const { root } = await mountPanel({ books: [{ id: 'sm-book' }] });
    bookTrigger(root).click();
    flushSync();
    assert.equal(
      root.querySelector('[data-popover-option="sm-book"] .manager-travel-option-name').textContent,
      'sm-book'
    );
  });

  it('says the system defines no books rather than rendering an empty picker', async () => {
    const { root } = await mountPanel({ books: [] });
    assert.ok(Boolean(root.querySelector('[data-recipe-bulk-books-empty]')));
    assert.ok(!bookTrigger(root), 'and renders no trigger at all');
  });
});

describe('RecipeBulkEditPanel book pick card (issue 1010)', () => {
  it('replaces the trigger with a card naming the book and its membership', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');

    const card = pickCard(root);
    assert.ok(Boolean(card), 'picking a book opens the composer');
    assert.equal(card.getAttribute('data-recipe-bulk-book-pick'), 'book-alchemy');
    assert.match(card.textContent, /Alchemist Primer/);
    assert.match(card.textContent, /Recipe book · holds 2 of 3 selected/);
    assert.ok(!bookTrigger(root), 'the search and the composer are two steps of one gesture');
  });

  // THE CORRECTED LABELS. The prototype names the whole SELECTION on both buttons while
  // deriving their disabled state from the missing/present counts, so `Add 3` can sit
  // enabled over a book only one recipe is missing.
  it('labels Add and Remove with the count each will actually affect', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');

    assert.match(addButton(root).textContent, /Add 1/, '3 selected, 2 already held — 1 to add');
    assert.match(removeButton(root).textContent, /Remove 2/);
    assert.ok(
      !/Add 3|Remove 3/.test(pickCard(root).textContent),
      'never the selection size, which is not the number either button writes'
    );
  });

  it('disables the action whose count is zero, and only that one', async () => {
    const { root } = await mountPanel();

    pickBook(root, 'book-forge');
    assert.equal(addButton(root).disabled, false, 'the Manual holds none of the three');
    assert.equal(removeButton(root).disabled, true, 'so there is nothing to remove');
    assert.equal(
      removeButton(root).textContent.trim(),
      'Remove',
      'and the count is dropped rather than rendered as "Remove 0"'
    );
  });

  // The failure this whole membership prop exists to prevent, stated as its own case: on a
  // legacy-basis system a count read from `definition.recipeIds` is 0 for every book, which
  // disables Remove and makes the axis one-way.
  it('leaves Remove LIVE for a legacy-basis book whose own recipeIds is empty', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');

    assert.equal(
      removeButton(root).disabled,
      false,
      'counting from the definition would report "holds none" and kill this control'
    );
  });

  it('names both actions accessibly, opening with the visible label', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');

    assert.equal(addButton(root).tagName, 'BUTTON', 'a span could not be reached by keyboard');
    assert.equal(addButton(root).getAttribute('type'), 'button');
    assert.equal(
      addButton(root).getAttribute('aria-label'),
      'Add 1 — add Alchemist Primer to every selected recipe that is missing it.',
      'WCAG 2.5.3: the name opens with the label a speech-input user can read'
    );
    assert.equal(
      removeButton(root).getAttribute('aria-label'),
      'Remove 2 — remove Alchemist Primer from every selected recipe that has it.'
    );
    assert.ok(
      !addButton(root).hasAttribute('aria-pressed'),
      'these are one-shot actions; the staged list is what reports and undoes the result'
    );
  });

  it('explains a disabled action rather than leaving it unnamed', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-forge');
    assert.equal(
      removeButton(root).getAttribute('aria-label'),
      'Remove — no selected recipe has Forge Manual.'
    );
  });

  it('returns to the trigger when the pick is cleared, staging nothing', async () => {
    const { root, state } = await mountPanel();
    pickBook(root, 'book-alchemy');

    root.querySelector('[data-recipe-bulk-book-clear-pick]').click();
    flushSync();

    assert.ok(!pickCard(root));
    assert.ok(Boolean(bookTrigger(root)));
    assert.deepEqual(state.draft.bookAdd, [], 'picking is not staging');
    assert.deepEqual(state.draft.bookRemove, []);
  });
});

describe('RecipeBulkEditPanel staged book list (issue 1010)', () => {
  // THE ACCUMULATION. One book on screen is a property of the CONTROL; the staged set grows.
  // The prototype computes this list and never renders it, which leaves a
  // one-book-at-a-time control with no record of what it was told about the others.
  it('accumulates across books, and the pick clears so the next one costs one gesture', async () => {
    const { root, state } = await mountPanel();

    stageBook(root, 'book-alchemy', 'add');
    assert.ok(!pickCard(root), 'the staged row is the confirmation, so the composer stands down');
    assert.ok(Boolean(bookTrigger(root)), 'and the trigger is already back for the next book');
    assert.deepEqual(state.draft.bookAdd, ['book-alchemy']);

    stageBook(root, 'book-forge', 'add');

    assert.deepEqual(
      state.draft.bookAdd,
      ['book-alchemy', 'book-forge'],
      'the second pick ADDS to the staged set rather than replacing it'
    );
    assert.deepEqual(stagedIds(root), ['book-alchemy', 'book-forge']);
  });

  // The view-lab frame asserts an `add` state and a `remove` state as SIBLINGS, which is
  // only satisfiable because the staged list holds both at once.
  it('holds a mixed add/remove draft, one row each', async () => {
    const { root, state } = await mountPanel();

    stageBook(root, 'book-alchemy', 'remove');
    stageBook(root, 'book-forge', 'add');

    assert.equal(stagedState(root, 'book-alchemy'), 'remove');
    assert.equal(stagedState(root, 'book-forge'), 'add');
    assert.deepEqual(state.draft.bookAdd, ['book-forge']);
    assert.deepEqual(state.draft.bookRemove, ['book-alchemy']);
    assert.equal(
      stagedList(root).children.length,
      2,
      'both rows are siblings of one list, which is what makes the mixed frame capturable'
    );
  });

  it('names the operation, the book and the number of recipes it will affect', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'add');

    const row = stagedRow(root, 'book-alchemy');
    assert.match(row.textContent, /Add/);
    assert.match(row.textContent, /Alchemist Primer/);
    assert.match(row.textContent, /1 recipe/, '3 selected, 2 already held');
    assert.ok(!/1 recipes/.test(row.textContent), 'never the plural at one');
  });

  // "no change" is not reachable from the pick card — the action whose count is zero is
  // disabled there — but it IS reachable, because the SELECTION moves under a draft that
  // outlives it: stage Remove while the book holds one selected recipe, then untick that
  // recipe, and the staged op now moves nothing. Apply would report a write that did
  // nothing, and this row is the only warning before it. Driven by handing the panel that
  // draft directly, which is exactly what the manager root does after such a change.
  it('says "no change" for a staged op the selection has since emptied of work', async () => {
    const { root } = await mountPanel({
      draft: { ...createRecipeBulkDraft(), bookRemove: ['book-alchemy'] },
      bookMembership: new Map()
    });

    assert.equal(stagedState(root, 'book-alchemy'), 'remove');
    assert.match(stagedRow(root, 'book-alchemy').textContent, /no change/);
    assert.ok(
      !/0 recipes/.test(stagedRow(root, 'book-alchemy').textContent),
      'a quantity where the honest statement is that there is nothing to do'
    );
  });

  it('unstages one book without disturbing the others', async () => {
    const { root, state } = await mountPanel();
    stageBook(root, 'book-alchemy', 'remove');
    stageBook(root, 'book-forge', 'add');

    const unstage = root.querySelector('[data-recipe-bulk-book-unstage="book-alchemy"]');
    assert.equal(
      unstage.getAttribute('aria-label'),
      'Alchemist Primer — leave this book unchanged.'
    );
    unstage.click();
    flushSync();

    assert.deepEqual(stagedIds(root), ['book-forge']);
    assert.deepEqual(state.draft.bookRemove, []);
    assert.deepEqual(state.draft.bookAdd, ['book-forge'], 'the other staged book is untouched');
  });

  it('re-picking a staged book reports the op already staged for it', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'remove');

    bookTrigger(root).click();
    flushSync();
    assert.match(
      root.querySelector('[data-popover-option="book-alchemy"]').textContent,
      /Remove/,
      're-picking must be a deliberate revision, not a blind overwrite'
    );
  });

  it('renders no list at all until something is staged, and reports the tally once it is', async () => {
    const { root } = await mountPanel();

    assert.ok(!stagedList(root));
    assert.match(
      root.textContent,
      /Pick one, then add it where missing or remove it where present/
    );

    stageBook(root, 'book-alchemy', 'add');
    assert.match(root.textContent, /1 change staged/);

    stageBook(root, 'book-forge', 'add');
    assert.match(root.textContent, /2 changes staged/);
  });
});

/**
 * KEYBOARD FOCUS ACROSS THE DESTRUCTIVE RE-RENDERS.
 *
 * Every gesture on this axis destroys the control holding focus — the popover unmounts on
 * a choice, the pick card is replaced by the trigger on Add / Remove / clear, and an
 * unstage removes its own row. Left unhandled, each one drops focus to `document.body` and
 * a keyboard-only GM staging three books tabs back in from the top of the Foundry document
 * six extra times. The retired chip run had no such cost, so this is the one property the
 * redesign could regress while improving everything else.
 *
 * Asserted against the REAL mounted DOM's `document.activeElement`, not by reasoning about
 * the handlers: the ordering these hops depend on (Svelte's flush microtask running ahead
 * of the panel's own) is exactly what reading the code got wrong the first time.
 */
describe('RecipeBulkEditPanel keyboard focus (issue 1010)', () => {
  it('lands on the pick card action after choosing, rather than on document.body', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');
    await settleFocus();

    assert.equal(
      focusHolder(),
      'add',
      "the popover's own restore correctly declines here — its trigger went with the "
        + 'choice — so the panel has to land focus itself'
    );
  });

  it('skips the action its own count has deadened', async () => {
    const { root } = await mountPanel({ bookMembership: new Map([['book-alchemy', 3]]) });
    pickBook(root, 'book-alchemy');
    await settleFocus();

    assert.equal(addButton(root).disabled, true, 'all three selected recipes already hold it');
    assert.equal(focusHolder(), 'remove', 'focus never parks on an inert control');
  });

  it('follows a staged book to its own undo control', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'add');
    await settleFocus();

    assert.equal(
      focusHolder(),
      'unstage book-alchemy',
      'the staged row is where the gesture landed, and its unstage control is the undo'
    );
  });

  it('returns to the trigger when the pick is cleared', async () => {
    const { root } = await mountPanel();
    pickBook(root, 'book-alchemy');
    press(root.querySelector('[data-recipe-bulk-book-clear-pick]'));
    await settleFocus();

    assert.equal(focusHolder(), 'trigger');
  });

  it('steps to the next staged row when one is unstaged', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'remove');
    stageBook(root, 'book-forge', 'add');

    // Sorted by name, so the Primer is above the Manual and the Manual is what takes its
    // place. Read BEFORE the mutation, because afterwards the row and its position are gone.
    press(root.querySelector('[data-recipe-bulk-book-unstage="book-alchemy"]'));
    await settleFocus();

    assert.equal(focusHolder(), 'unstage book-forge');
  });

  it('steps to the row ABOVE when the last staged row is unstaged', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'remove');
    stageBook(root, 'book-forge', 'add');

    press(root.querySelector('[data-recipe-bulk-book-unstage="book-forge"]'));
    await settleFocus();

    assert.equal(focusHolder(), 'unstage book-alchemy', 'there is no next row to step to');
  });

  it('returns to the trigger when unstaging empties the list', async () => {
    const { root } = await mountPanel();
    stageBook(root, 'book-alchemy', 'add');

    press(root.querySelector('[data-recipe-bulk-book-unstage="book-alchemy"]'));
    await settleFocus();

    assert.ok(!stagedList(root), 'precondition: the list itself is gone');
    assert.equal(focusHolder(), 'trigger');
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

    // ONE gesture: pick the book, press Remove. Never resting on `add`.
    stageBook(root, 'book-alchemy', 'remove');

    assert.equal(stagedState(root, 'book-alchemy'), 'remove');
    assert.equal(
      applyButton(root).disabled,
      false,
      'a removal-only edit is a real edit the book axis stages on its own'
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
      /At least 2 of 3 selected recipes can't be enabled yet and will stay off/,
      'both the blocked count and the selection size, and "At least" — it is a lower bound'
    );
    // A bound with no authority behind it is a shrug. The write reports the real figure
    // (`AppliedBlocked`), so the strip says where the exact number comes from.
    assert.match(
      warning.textContent,
      /applying reports the exact number\.$/,
      'the hedge names the post-apply report as the authority, making it a promise'
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

  // "At least 3 of 3" is degenerate: the lower bound equals the maximum, so "at least"
  // states nothing and reads as a copy bug. It is reachable by the obvious route — select
  // three drafts, stage Enable. The all-blocked forecast is EXACT, so it carries neither
  // the hedge nor the authority clause the partial one needs.
  it('drops the bound entirely when every selected recipe is blocked', async () => {
    const { root } = await mountPanel({ count: 3, blockedCount: 3 });
    chooseSegment(root, 'status', 'enable');
    const warning = root.querySelector('[data-recipe-bulk-blocked-warning]');

    assert.equal(
      warning.textContent.trim(),
      'None of the 3 selected recipes can be enabled yet — they will all stay off.'
    );
    assert.ok(!/At least/.test(warning.textContent), 'a bound at its maximum is not a bound');
    assert.ok(!/3 of 3/.test(warning.textContent), 'and never the degenerate "n of n" form');
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
    ['noCheck', /rolls no crafting check, so there are no check tiers to assign/],
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
      draft: { ...createRecipeBulkDraft(), status: 'enable', bookAdd: ['book-alchemy'] }
    });

    assert.equal(root.querySelector('[data-recipe-bulk-category]').disabled, true);
    assert.equal(tierSelect(root).disabled, true);
    assert.equal(bookTrigger(root).disabled, true, 'the picker cannot be opened mid-apply');
    for (const axis of ['status', 'lock']) {
      const radios = [...root.querySelectorAll(`[data-recipe-bulk-${axis}-option] input`)];
      assert.equal(radios.length, 3, `the ${axis} axis renders its three segments`);
      assert.ok(
        radios.every((radio) => radio.disabled),
        `a dimmed-but-live ${axis} segment would still stage an edit mid-apply`
      );
    }
    assert.ok(
      root.querySelector('[data-recipe-bulk-book-unstage="book-alchemy"]').disabled,
      'and a staged book cannot be unstaged out from under an in-flight write'
    );
    assert.equal(
      applyButton(root).disabled,
      true,
      'and Apply is inert even though the draft has changes'
    );
  });
});

/*
 * ── THE SET DELETE (issue 1132) ──────────────────────────────────────────────────
 * The card itself is `BulkDeleteCard`, and its behaviours — the zero-row gate, the subject
 * row's exemption, the description association, the live region, the busy face — are proved
 * ONCE in `bulk-delete-card-mounted.test.js`. What is proved here is this panel's WIRING to
 * it, which is the half that can silently drift per studio: the hook names, the row KEYS, the
 * three sentences the impact prop turns into, and which ids the confirm hands back.
 */
const deleteCard = (root) => root.querySelector('[data-recipe-bulk-delete-card]');
const deleteButton = (root) => deleteCard(root).querySelector('.manager-button.is-danger');
const impactRow = (root, key) => root.querySelector(`[data-recipe-bulk-impact-row="${key}"]`);

const FULL_IMPACT = {
  deletable: 3,
  deletableIds: ['r1', 'r2', 'r3'],
  recipeItemsAffected: 2,
  recipeItemIds: ['book-alchemy', 'book-forge'],
  learnersAffected: 4,
  learnerIds: ['a1', 'a2', 'a3', 'a4']
};

describe('RecipeBulkEditPanel set delete (issue 1132)', () => {
  it('renders the card under the shell, with this studio\'s hook names', async () => {
    const { root } = await mountPanel({ deleteImpact: FULL_IMPACT });

    assert.ok(Boolean(deleteCard(root)), 'the panel renders no delete card at all');
    assert.ok(
      Boolean(root.querySelector('[data-recipe-bulk-impact]')),
      'the impact list keeps the `data-recipe-bulk-*` convention every other hook in this panel uses'
    );
    assert.ok(Boolean(root.querySelector('[data-recipe-bulk-delete-announce]')));
    // The card is a SIBLING of the shell, not a child of it: a destructive action inside the
    // shell would read as a second way of applying the staged edit.
    const panelEl = root.querySelector('[data-recipe-bulk-panel]');
    assert.ok(Boolean(panelEl), 'the shell is absent, so "sibling" would be unfalsifiable');
    assert.equal(
      panelEl.contains(deleteCard(root)),
      false,
      'the delete card is INSIDE the shell, where it reads as a second Apply'
    );
  });

  it('turns the impact prop into three sentences, keyed for the suites that query them', async () => {
    const { root } = await mountPanel({ deleteImpact: FULL_IMPACT });

    assert.match(impactRow(root, 'recipes').textContent, /3 recipes will be deleted\./);
    assert.match(
      impactRow(root, 'items').textContent,
      /Will be removed from 2 books & scrolls\./
    );
    assert.match(impactRow(root, 'learners').textContent, /Will be forgotten by 4 characters/);
    // The qualifier is the load-bearing half of the learners sentence: the learn slot is
    // spent by the same act the number counts.
    assert.match(
      impactRow(root, 'learners').textContent,
      /spent learn slots are not given back/
    );
  });

  it('always states the permanence, which is a PROPERTY and has no count to gate it on', async () => {
    // It is also what stops the card degrading to a bare heading and an arm when both
    // consequence rows are zero-gated away — the state the next test reaches.
    const { root } = await mountPanel({ deleteImpact: FULL_IMPACT });
    assert.match(
      deleteCard(root).textContent,
      /Deleting is permanent\. A recipe you recreate is a new recipe\./
    );
  });

  it('omits a consequence row at zero while the subject row and the hint stay', async () => {
    const { root } = await mountPanel({
      deleteImpact: { ...FULL_IMPACT, deletable: 1, recipeItemsAffected: 0, learnersAffected: 0 }
    });

    assert.match(impactRow(root, 'recipes').textContent, /1 recipe will be deleted\./);
    assert.ok(!impactRow(root, 'items'), '"0 books & scrolls will lose them." is noise');
    assert.ok(!impactRow(root, 'learners'), 'and so is "0 characters will forget them"');
    assert.match(deleteCard(root).textContent, /Deleting is permanent/);
  });

  it('singularizes every sentence at a count of one', async () => {
    const { root } = await mountPanel({
      deleteImpact: {
        deletable: 1,
        deletableIds: ['r1'],
        recipeItemsAffected: 1,
        recipeItemIds: ['book-alchemy'],
        learnersAffected: 1,
        learnerIds: ['a1']
      }
    });

    assert.match(impactRow(root, 'recipes').textContent, /1 recipe will be deleted\./);
    assert.match(
      impactRow(root, 'items').textContent,
      /Will be removed from 1 book or scroll\./
    );
    assert.match(impactRow(root, 'learners').textContent, /Will be forgotten by 1 character/);
    assert.match(deleteButton(root).textContent, /Delete 1 recipe/);
  });

  it('hands the confirm the RESOLVED ids, not the selection', async () => {
    // A stale selected id names no recipe, `RecipeManager.deleteRecipe` throws for one, and
    // the browser prunes it only when the projection republishes — a different moment from
    // the click. `deletableIds` is the describer's answer to that, and this is the wiring
    // that makes the button act on it.
    const deleted = [];
    const { root } = await mountPanel({
      deleteImpact: { ...FULL_IMPACT, deletable: 2, deletableIds: ['r1', 'r3'] },
      onArmDelete: () => {},
      onDelete: (ids) => deleted.push([...ids])
    });

    await panel.setProps({ deleteArmed: true });
    deleteButton(root).click();
    flushSync();
    assert.deepEqual(deleted, [['r1', 'r3']]);
  });

  it('is inert when nothing resolves, and while a staged apply is in flight', async () => {
    const { root } = await mountPanel({
      deleteImpact: { ...FULL_IMPACT, deletable: 0, deletableIds: [] }
    });
    assert.equal(deleteButton(root).disabled, true, 'a fully stale selection deletes nothing');

    await panel.setProps({ deleteImpact: FULL_IMPACT, applying: true });
    assert.equal(
      deleteButton(root).disabled,
      true,
      'a staged apply and a delete must not race each other'
    );
  });

  it('renders the busy face from the caller\'s own flag, not from the arm', async () => {
    // `deleting` is the owner's in-flight flag. Passing `armed: false` alongside it is the
    // state a real browser reaches within a frame of the write starting — disabling a focused
    // button blurs it, and `ArmedDangerButton` disarms on blur — so a busy face read off the
    // arm would show "Delete 3 recipes" for the whole write. See
    // `bulk-delete-busy-focus.test.js` for that blur, measured in Chromium.
    const { root } = await mountPanel({ deleteImpact: FULL_IMPACT });
    await panel.setProps({ deleting: true, deleteArmed: false });

    assert.match(deleteButton(root).textContent, /Deleting…/);
    assert.equal(deleteButton(root).disabled, true);
  });
});
