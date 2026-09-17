/**
 * The bulk panels: the inspector swap, the two-press set delete and the set-apply write.
 *
 * A route module of `manager-mounted.test.js` (issue 1690). It registers its cases INSIDE
 * that file's one `describe` rather than at module scope, so the split keeps the suite
 * name, the compiled manager tree and the one process the 26,709-line file had.
 * `manager-mounted-shared.js` owns the compile and the between-test yield; the mount state
 * below is this module's own, so its locators read its own `target`.
 */

import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
// Issue 1504: a converted control is a shared `<Select>`, so choosing a value is two clicks on a
// panel PORTALED onto the manager root rather than a `change` on a native `<select>`. Every
// lookup is therefore rooted on the mount target and not on the control's own container.
import { chooseSelectOption, selectOptionValues } from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import {
  createManagerQueries,
  waitForQueuedAnnouncement,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { managerComponents, settle, settleBetweenTests } from './manager-mounted-shared.js';

let Component;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element, because the
// module remounts per case and half these cases assign `target` themselves.
const queries = createManagerQueries(() => target);
const { craftingParent, navButton } = queries;
const { mountManager } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerBulkCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  // ── Issue 772: the rail swap ────────────────────────────────────────────────────
  // This is the ONLY suite that mounts `CraftingSystemManagerRoot`, so it is the only
  // place the swap between `ComponentBrowserInspector` and `ComponentBulkEditPanel` — and
  // the root-owned draft's lifecycle around it — can be proved at all.
  async function openComponentsBrowser(calls = [], options = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, options),
        services: { openCurrentAdmin: () => {}, onDropItem: () => {}, onCopySourceUuid: () => {} },
      },
    });
    flushSync();
    navButton('Component Rules').click();
    await tick();
    flushSync();
    return target;
  }

  function tickComponentRow(id) {
    target.querySelector(`[data-component-select="${id}"]`).click();
    flushSync();
  }

  it('swaps the single-component inspector for the bulk panel at the FIRST selected row', async () => {
    await openComponentsBrowser();

    assert.ok(
      Boolean(target.querySelector('[data-component-inspector]')),
      'the rail opens on the single-component inspector'
    );
    assert.ok(!target.querySelector('[data-component-bulk-panel]'));

    tickComponentRow('c1');

    assert.ok(
      Boolean(target.querySelector('[data-component-bulk-panel]')),
      'ONE ticked row is already a bulk edit — the threshold is > 0, not > 1'
    );
    assert.ok(
      !target.querySelector('[data-component-inspector]'),
      'the panel REPLACES the inspector rather than stacking beside it'
    );
    assert.match(
      target.querySelector('[data-component-bulk-count]').textContent,
      /1 component selected/
    );
  });

  it('restores the inspector and DISCARDS the staged draft when the selection clears', async () => {
    await openComponentsBrowser();
    tickComponentRow('c1');

    target.querySelector('[data-bulk-tag="ore"]').click();
    flushSync();
    assert.equal(
      target.querySelector('[data-bulk-tag="ore"]').getAttribute('data-bulk-tag-state'),
      'add'
    );
    assert.equal(target.querySelector('[data-component-bulk-apply]').disabled, false);

    // The panel's own escape — the documented way back to unlink / delete / copy-source.
    target.querySelector('[data-component-bulk-clear]').click();
    await tick();
    flushSync();

    assert.ok(
      Boolean(target.querySelector('[data-component-inspector]')),
      'the rail returns to the single-component inspector'
    );

    tickComponentRow('c1');
    assert.equal(
      target.querySelector('[data-bulk-tag="ore"]').getAttribute('data-bulk-tag-state'),
      'none',
      'the staged draft was discarded on the count-to-zero transition, not carried forward'
    );
    assert.equal(
      target.querySelector('[data-component-bulk-apply]').disabled,
      true,
      'so a re-opened panel cannot apply a stale edit'
    );
  });

  // ── The armed set delete, end to end (issue 1129) ──────────────────────────────────
  //
  // The panel-level suite proves the CARD behaves; this proves the ROOT wires it — that the
  // impact reaches the panel, that the two clicks reach the store, and above all that the
  // armed token does not survive a change to the set it was armed for.

  // ── Row 68: the component inspector's Delete, the same repair one column over ──────
  //
  // Same shape as the recipe inspector's, and deliberately asserted the same way: this
  // column has FOUR controls, and Unlink is the one that makes the sibling check worth
  // running. Unlink breaks the item linkage and keeps the component — it destroys nothing —
  // so it is precisely the neighbour a `danger` role picked by feel would land on.
  // REWRITTEN FOR ISSUE 1371's PARITY ROUND 4 (gap-list row 123). The four-button stack this
  // case was written against — Edit, Copy source UUID, Unlink, Delete, all full-width and all
  // inline in the scroll area — is what the reference replaces with ONE pinned primary and an
  // overflow. Four commands at equal weight where the design pins one is a hierarchy change, not
  // a variant, so the case moves with it: what survives is the claim it was really making, that
  // Delete is marked destructive and its three neighbours are not.
  it('pins ONE primary and puts the other three behind the kebab, Delete alone marked destructive', async () => {
    await openComponentsBrowser();

    const inspector = target.querySelector('[data-component-inspector]');
    assert.ok(Boolean(inspector), 'the components route opens on the single-component inspector');

    const foot = inspector.querySelector('[data-component-inspector-foot]');
    assert.ok(Boolean(foot), 'the inspector pins a foot rather than scrolling its actions');
    const actions = foot.querySelectorAll('button');
    assert.equal(actions.length, 1, 'and the foot carries exactly ONE action');
    assert.equal(actions[0].textContent.trim(), 'Edit system rules');
    assert.ok(
      Boolean(foot.querySelector('[data-component-edit-system-rules]')),
      'which is the act this whole screen exists to reach'
    );

    // The other three are BEHIND the kebab and therefore absent until it is opened — which is
    // itself the assertion the old stack could not make.
    assert.ok(
      !target.querySelector('[role="menuitem"]'),
      'pre-condition: the overflow is closed, so none of its commands is on screen'
    );
    inspector.querySelector('[data-component-inspector-menu]').click();
    flushSync();

    const items = [...target.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      items.map((item) => item.textContent.trim()),
      ['Copy source UUID', 'Unlink component', 'Delete component'],
      'nothing is lost: the three commands the foot no longer carries are all here'
    );
    assert.ok(
      items[2].classList.contains('is-danger'),
      'Delete carries the danger marking — the verb removes the component from the system'
    );
    for (const item of items.slice(0, 2)) {
      assert.ok(
        !item.classList.contains('is-danger'),
        `${item.textContent.trim()} destroys no record, so the marking must not have landed on it`
      );
    }
  });

  // The remove leg sits in the shell's dock since issue 1371 r16-list (M23): the reference's
  // `Remove N components from {system}…`, not a delete card below the shell.
  function componentDeleteButton() {
    return target.querySelector('[data-component-bulk-remove] .manager-button.is-danger');
  }

  it('offers the set delete the moment the bulk panel replaces the inspector', async () => {
    await openComponentsBrowser();

    // The gap this issue closes: before it, ticking a row hid the ONLY delete affordance. The
    // single-component delete is behind the inspector's kebab since issue 1371's parity round 4
    // (gap-list row 123), so the pre-condition is asserted on the trigger that reaches it.
    assert.ok(
      Boolean(target.querySelector('[data-component-inspector-menu]')),
      'the single-component inspector offers its overflow, and Delete is in it'
    );

    tickComponentRow('c1');

    assert.ok(
      !target.querySelector('[data-component-inspector-menu]'),
      'the inspector — and the overflow carrying its Delete — is replaced'
    );
    assert.ok(componentDeleteButton(), 'but the panel now carries its own set delete');
    assert.match(
      target.querySelector('[data-component-bulk-remove-note]').textContent,
      /2 recipes will be rewritten/,
      'the impact the store computed reaches the panel'
    );
  });

  it('takes TWO clicks, and the first writes nothing', async () => {
    const calls = [];
    await openComponentsBrowser(calls);
    tickComponentRow('c1');
    tickComponentRow('c2');

    componentDeleteButton().click();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'deleteComponents'),
      false,
      'the FIRST click only arms — nothing is written'
    );
    assert.equal(componentDeleteButton().getAttribute('data-armed'), 'true');

    componentDeleteButton().click();
    await tick();
    flushSync();
    const write = calls.find((call) => call[0] === 'deleteComponents');
    assert.deepEqual(write?.[1], ['c1', 'c2'], 'the second click deletes the selection');
  });

  it('DISARMS when the selection changes underneath the armed control', async () => {
    // An arm is a statement about a SPECIFIC set. If the set moves, the impact sentence the
    // GM read before arming is no longer the impact of confirming, so the second click must
    // not still be a confirmation.
    const calls = [];
    await openComponentsBrowser(calls);
    tickComponentRow('c1');

    componentDeleteButton().click();
    flushSync();
    assert.equal(componentDeleteButton().getAttribute('data-armed'), 'true');

    tickComponentRow('c2');

    assert.equal(
      componentDeleteButton().getAttribute('data-armed'),
      'false',
      'growing the selection disarms the pending delete'
    );
    componentDeleteButton().click();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'deleteComponents'),
      false,
      'the next click re-arms rather than writing'
    );
  });

  it('clears the selection after a successful delete, returning the rail to the inspector', async () => {
    const calls = [];
    await openComponentsBrowser(calls);
    tickComponentRow('c1');

    componentDeleteButton().click();
    flushSync();
    componentDeleteButton().click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'deleteComponents'),
      'the write happened'
    );
    assert.ok(
      Boolean(target.querySelector('[data-component-inspector]')),
      'the rail returns to the single-component inspector'
    );
  });

  // The post-delete toast is the ONLY feedback that survives the panel unmounting, on the
  // same terms as the apply toast above. Both cases below install `ui.notifications` per
  // test and remove it again, matching `applyBulkEditOverRows`.
  async function deleteSelectedRows(ids, options = {}) {
    const messages = [];
    const calls = [];
    const previousUi = globalThis.ui;
    globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
    try {
      await openComponentsBrowser(calls, options);
      for (const id of ids) tickComponentRow(id);
      componentDeleteButton().click();
      flushSync();
      componentDeleteButton().click();
      await tick();
      flushSync();
      return { messages, calls };
    } finally {
      if (previousUi === undefined) delete globalThis.ui;
      else globalThis.ui = previousUi;
    }
  }

  it('reports the DISABLED recipes in the toast, the most consequential outcome', async () => {
    // Components deleted and recipes rewritten are administrative; recipes disabled is the
    // one the GM's players feel. It was the number the toast did not carry.
    const { messages } = await deleteSelectedRows(['c1', 'c2'], {
      deleteComponentsResult: { deleted: 2, recipesUpdated: 3, recipesDisabled: 1 },
    });

    assert.deepEqual(messages, [
      'Deleted 2 component(s) and rewrote 3 recipe(s), disabling 1 of them.',
    ]);
  });

  it('drops the disable clause entirely when nothing was disabled', async () => {
    const { messages } = await deleteSelectedRows(['c1'], {
      deleteComponentsResult: { deleted: 1, recipesUpdated: 2, recipesDisabled: 0 },
    });

    assert.deepEqual(messages, ['Deleted 1 component(s) and rewrote 2 recipe(s).']);
  });

  it('reports NO success and keeps the selection when the write deleted nothing', async () => {
    // The store returns its zero result — an OBJECT, and therefore truthy — on a failed
    // write, after raising its own error toast. A bare `if (!result)` guard let that through
    // as success: the selection cleared and the GM read "Deleted 0 component(s)" underneath
    // the error, with the rows still in the library.
    const { messages } = await deleteSelectedRows(['c1'], {
      deleteComponentsResult: { deleted: 0, recipesUpdated: 0, recipesDisabled: 0 },
    });

    assert.deepEqual(messages, [], 'nothing was deleted, so no COMPLETION message is toasted');
    assert.ok(
      Boolean(target.querySelector('[data-component-bulk-remove]')),
      'and the selection survives, so the GM can see what did not happen and retry'
    );
    assert.equal(
      componentDeleteButton().getAttribute('data-armed'),
      'false',
      'but the arm is spent — a still-armed button would delete on the next single click'
    );

    // …AND THE GM WHO CANNOT SEE THE TOAST IS TOLD (issue 1157, review round). Confirming
    // disabled the control, which put focus on `<body>` and emptied the card's region, so
    // this panel's refused delete was silent AND placeless — the recipe twin had shipped
    // both halves and this one had shipped neither.
    await waitForQueuedAnnouncement();
    assert.equal(
      target.querySelector('[data-component-bulk-delete-announce]').textContent.trim(),
      'Nothing was deleted. The selection is unchanged.'
    );
    // `assert.ok` over a boolean, never `assert.equal` over two nodes: on failure
    // `node:assert` serialises the actual value and walks a mounted happy-dom element's
    // circular tree until the heap dies, which surfaces as `# cancelled` with no message.
    assert.ok(
      document.activeElement === componentDeleteButton(),
      'and the keyboard is back on the control that was pressed'
    );
  });

  it('applies every staged axis in ONE set-apply write, then resets the selection and the draft', async () => {
    const calls = [];
    await openComponentsBrowser(calls);

    tickComponentRow('c1');
    tickComponentRow('c2');
    assert.match(
      target.querySelector('[data-component-bulk-count]').textContent,
      /2 components selected/
    );

    target.querySelector('[data-bulk-tag="ore"]').click();
    flushSync();
    // Straight past `add` to `remove`, so the write carries BOTH tag axes.
    target.querySelector('[data-bulk-tag="herb"]').click();
    flushSync();
    target.querySelector('[data-bulk-tag="herb"]').click();
    flushSync();
    // The category is an inline inset ROW since issue 1371 r16-list (M23), not a select.
    target.querySelector('[data-component-bulk-category-option="Reagent"]').click();
    flushSync();

    target.querySelector('[data-component-bulk-apply]').click();
    await tick();
    flushSync();

    const applyCalls = calls.filter((call) => call[0] === 'applyComponentBulkEdit');
    assert.equal(applyCalls.length, 1, 'ONE set-apply write for the whole selection');
    assert.deepEqual(applyCalls[0][1].sort(), ['c1', 'c2']);
    assert.deepEqual(applyCalls[0][2], {
      category: 'Reagent',
      addTags: ['ore'],
      removeTags: ['herb'],
    });
    assert.ok(
      !('essences' in applyCalls[0][2]) && !('difficulty' in applyCalls[0][2]),
      'an unstaged axis is NEVER sent — a present key is an instruction to write'
    );

    assert.ok(
      Boolean(target.querySelector('[data-component-inspector]')),
      'applying clears the selection, so the rail returns to the inspector'
    );
    tickComponentRow('c1');
    assert.equal(
      target.querySelector('[data-bulk-tag="ore"]').getAttribute('data-bulk-tag-state'),
      'none',
      'and the staged draft is gone with it'
    );
  });

  it('sends a staged all-zero essence map, because that is an instruction to CLEAR', async () => {
    const calls = [];
    await openComponentsBrowser(calls);
    tickComponentRow('c1');

    // The steppers cannot reach this state on a fresh draft — `Stepper` emits nothing at
    // the zero boundary — so the staged-axis chip is the only path to it.
    target.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();
    target.querySelector('[data-component-bulk-apply]').click();
    await tick();
    flushSync();

    const applyCall = calls.find((call) => call[0] === 'applyComponentBulkEdit');
    assert.ok(Boolean(applyCall), 'an all-zero staged map is a REAL edit, not a no-op');
    assert.ok('essences' in applyCall[2], 'the key must be PRESENT for the write to clear');
  });

  // Capture `ui.notifications.info`. Nothing else in this suite needs the Foundry `ui`
  // global, so it is installed per-test and removed again rather than left standing where
  // an unrelated test could come to depend on it.
  async function applyBulkEditOverRows(ids, options = {}) {
    const messages = [];
    const previousUi = globalThis.ui;
    globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
    try {
      await openComponentsBrowser([], options);
      for (const id of ids) tickComponentRow(id);
      target.querySelector('[data-bulk-tag="ore"]').click();
      flushSync();
      target.querySelector('[data-component-bulk-apply]').click();
      await tick();
      flushSync();
      return messages;
    } finally {
      if (previousUi === undefined) delete globalThis.ui;
      else globalThis.ui = previousUi;
    }
  }

  // The apply toast is the ONLY feedback that survives the panel unmounting on success —
  // applying clears the selection, so the rail is back on the single-component inspector
  // by the time the GM reads anything. Nothing asserted it before, which is how "Applied
  // bulk changes to 1 components." shipped green past a panel that gets the same
  // singular right twice.
  it('says "1 component" in the applied toast at the panel\'s own > 0 threshold', async () => {
    const messages = await applyBulkEditOverRows(['c1']);
    assert.deepEqual(messages, ['Applied bulk changes to 1 component.']);
  });

  it('and keeps the plural for a real multi-row apply', async () => {
    const messages = await applyBulkEditOverRows(['c1', 'c2']);
    assert.deepEqual(messages, ['Applied bulk changes to 2 components.']);
  });

  // The count the GM is told is the count that actually CHANGED, not the count they ticked.
  // The write primitive compares each component before and after, so ticking two and adding
  // a tag one already carries updates ONE. Naming the selection size instead would report
  // work that did not happen — and the toast is the only record of it.
  it('names the components that actually changed, not the ones selected', async () => {
    const messages = await applyBulkEditOverRows(['c1', 'c2'], {
      applyComponentBulkEditResult: { updated: 1, componentIds: ['c1'] },
    });
    assert.deepEqual(messages, ['Applied bulk changes to 1 component.']);
  });

  // A write that legitimately changed nothing is not a failure and must not read as
  // "Applied bulk changes to 0 components."
  it('says nothing needed changing when the write updated none', async () => {
    const messages = await applyBulkEditOverRows(['c1', 'c2'], {
      applyComponentBulkEditResult: { updated: 0, componentIds: [] },
    });
    assert.deepEqual(messages, ['No components needed changing.']);
  });

  // `store.applyComponentBulkEdit?.(…)` resolves to `undefined` when the action is absent.
  // The root used to test `applied === false`, so `undefined` fell through to the success
  // path: selection cleared, toast fired, nothing written. Any falsy result must abort.
  it('does not claim success when the store action is missing', async () => {
    const messages = await applyBulkEditOverRows(['c1'], {
      applyComponentBulkEditResult: null,
    });
    assert.deepEqual(messages, [], 'no toast for a write that never happened');
  });

  // A selection lives on the lifted browser state, not on the page, and the root builds the
  // Apply payload from `itemCards` rather than from the rendered rows. Both halves were
  // proved separately — the view suite pages away and asserts the COUNT survives, the model
  // suite asserts the reducer is page-independent — but nothing drove the real Apply with a
  // selection the current page cannot render. That is the composition a GM actually performs
  // on the library size this feature exists for.
  it('applies a selection that spans two pages, including the row page 2 cannot see', async () => {
    const calls = [];
    // Twelve rows over a ten-row page: `c1` sits on page 1, `pad-11` on page 2.
    const extraComponentItems = Array.from({ length: 30 }, (_, index) => ({
      id: `pad-${index + 2}`,
      name: `Padding ${index + 2}`,
      img: 'icons/commodities/metal/ore-chunk-grey.webp',
      description: 'Bulk-selection padding.',
      tags: [],
      category: 'general',
      essences: [],
    }));
    await openComponentsBrowser(calls, { extraComponentItems });

    tickComponentRow('c1');
    target.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.ok(
      !target.querySelector('[data-component-select="c1"]'),
      'pre-condition: page 2 does not render the first selection'
    );
    // Whichever row page 2 happens to open on — the point is that it is NOT `c1`, not
    // which padding row the sort produces.
    const offPageId = target
      .querySelector('[data-component-select]')
      .getAttribute('data-component-select');
    tickComponentRow(offPageId);
    target.querySelector('[data-bulk-tag="ore"]').click();
    flushSync();
    target.querySelector('[data-component-bulk-apply]').click();
    await tick();
    flushSync();

    const applyCalls = calls.filter((call) => call[0] === 'applyComponentBulkEdit');
    assert.equal(applyCalls.length, 1, 'ONE write for the whole cross-page selection');
    assert.deepEqual(
      [...applyCalls[0][1]].sort(),
      ['c1', offPageId].sort(),
      'the off-page id reaches the write, not just the count'
    );
  });

  // ── Issue 1010: the recipe bulk edit's post-apply report ─────────────────────────
  // This is the ONLY suite that mounts `CraftingSystemManagerRoot`, so it is the only place
  // the composed toast can be proved at all. It matters because it COMPOSES: the prototype
  // this panel follows swaps its books message in for its blocked message with a ternary,
  // which would let a batch that moved book membership silently swallow the report that
  // some recipes stayed off — the one outcome the GM cannot see by looking at the rows they
  // just deselected, because applying clears the selection and unmounts the panel.
  async function applyRecipeBulkEditOverRows(ids, options = {}) {
    const messages = [];
    const previousUi = globalThis.ui;
    globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
    try {
      mountManager([], options);
      craftingParent().click();
      await tick();
      flushSync();
      for (const id of ids) {
        target.querySelector(`[data-recipe-select="${id}"]`).click();
        flushSync();
      }
      // Stage one book through the picker: open it, choose the definition, press Add.
      target.querySelector('.fab-bulk-book-trigger').click();
      flushSync();
      target.querySelector('[data-popover-option="ri1"]').click();
      flushSync();
      target.querySelector('[data-recipe-bulk-book-add]').click();
      flushSync();
      target.querySelector('[data-recipe-bulk-apply]').click();
      await tick();
      flushSync();
      return messages;
    } finally {
      if (previousUi === undefined) delete globalThis.ui;
      else globalThis.ui = previousUi;
    }
  }

  it('reports book membership as EDGES, not as the number of books touched', async () => {
    const messages = await applyRecipeBulkEditOverRows(['r1', 'r2'], {
      applyRecipeBulkEditResult: {
        updated: 2,
        recipeIds: ['r1', 'r2'],
        booksUpdated: 1,
        bookAdditions: 4,
        bookRemovals: 2,
      },
    });

    assert.deepEqual(messages, [
      'Applied bulk changes to 2 recipes. Books & scrolls updated — 4 additions and 2 removals.',
    ]);
  });

  it('composes the books sentence WITH the blocked one rather than replacing it', async () => {
    const messages = await applyRecipeBulkEditOverRows(['r1', 'r2'], {
      applyRecipeBulkEditResult: {
        updated: 2,
        recipeIds: ['r1', 'r2'],
        blockedEnables: 1,
        blockedRecipeIds: ['r2'],
        bookAdditions: 1,
      },
    });

    assert.deepEqual(messages, [
      'Applied bulk changes to 2 recipes. Books & scrolls updated — 1 addition. ' +
        "1 recipe couldn't be enabled yet.",
    ]);
  });

  // `updated` counts recipes whose own FIELDS changed, so a book-only edit legitimately
  // changes none. Leading with "No recipes needed changing" ahead of "3 additions" reads as
  // a contradiction rather than as the two distinct facts it is.
  it('drops "No recipes needed changing" when the batch moved book membership', async () => {
    const messages = await applyRecipeBulkEditOverRows(['r1', 'r2'], {
      applyRecipeBulkEditResult: {
        updated: 0,
        recipeIds: [],
        booksUpdated: 1,
        bookAdditions: 3,
      },
    });

    assert.deepEqual(messages, ['Books & scrolls updated — 3 additions.']);
  });

  it('keeps "No recipes needed changing" when nothing at all moved', async () => {
    const messages = await applyRecipeBulkEditOverRows(['r1', 'r2'], {
      applyRecipeBulkEditResult: { updated: 0, recipeIds: [] },
    });

    assert.deepEqual(messages, ['No recipes needed changing.']);
  });

  it('says nothing about books when the axis moved no membership', async () => {
    const messages = await applyRecipeBulkEditOverRows(['r1'], {
      applyRecipeBulkEditResult: { updated: 1, recipeIds: ['r1'] },
    });

    assert.deepEqual(messages, ['Applied bulk changes to 1 recipe.']);
  });

  // ── Issue 1132: the recipe set delete, end to end ─────────────────────────────────
  //
  // The panel suite proves the card is WIRED and the card suite proves it BEHAVES; this is
  // the only place the ROOT's three additions can be proved at all — the second effect, the
  // failure path and the busy flag. Each of the three is invisible to every other suite.

  async function openRecipesBrowser(calls = [], options = {}) {
    mountManager(calls, options);
    craftingParent().click();
    await tick();
    flushSync();
  }

  function tickRecipeRow(id) {
    target.querySelector(`[data-recipe-select="${id}"]`).click();
    flushSync();
  }

  // ── Row 29: the recipe inspector's Delete is the DESTRUCTIVE verb (issue 1118) ─────
  //
  // It shipped role-less and got its danger-red ink and border from a BESPOKE rule that
  // restated `.manager-button.is-danger`'s two tokens by hand. Two copies of one decision is
  // the failure this conversion exists to end, so the copy went and the role arrived; the
  // rule keeps only the panel SURFACE, which `is-danger` does not declare.
  //
  // Asserted on the RENDERED node, addressed by the hook the control already carried, and
  // asserted against its two SIBLINGS in the same stacked column rather than on its own. A
  // check that only reads Delete cannot tell "Delete is danger" from "this whole column is
  // danger", and the column is exactly where a misplaced role would land: Duplicate and Edit
  // are neighbours in the same `<div>`, one tag apart in the source.
  it('paints the recipe inspector Delete as danger, and only Delete', async () => {
    await openRecipesBrowser();

    const inspector = target.querySelector('.manager-recipe-browser-inspector');
    assert.ok(Boolean(inspector), 'the recipes route opens on the single-recipe inspector');

    const remove = inspector.querySelector('[data-recipe-action="delete"]');
    assert.ok(Boolean(remove), 'the inspector renders its Delete');
    assert.ok(
      remove.classList.contains('fab-manager-button'),
      'Delete renders through the ManagerButton primitive, not a hand-written class'
    );
    assert.ok(
      remove.classList.contains('is-danger'),
      'Delete carries the danger role — the verb removes a record'
    );
    // The pass-through class survives the conversion, because the sheet keys the panel's own
    // surface and full-width geometry on it and `manager-contract.test.js` names it too.
    assert.ok(
      remove.classList.contains('manager-recipe-browser-inspector-delete'),
      'and keeps the bespoke class the panel geometry is keyed on'
    );

    for (const action of ['duplicate', 'edit']) {
      const sibling = inspector.querySelector(`[data-recipe-action="${action}"]`);
      assert.ok(Boolean(sibling), `the inspector renders its ${action} action`);
      assert.ok(
        sibling.classList.contains('fab-manager-button'),
        `${action} renders through the primitive too`
      );
      assert.ok(
        !sibling.classList.contains('is-danger'),
        `${action} destroys nothing, so the danger role must not have landed on it`
      );
    }
  });

  function recipeDeleteButton() {
    return target.querySelector('[data-recipe-bulk-delete-card] .manager-button.is-danger');
  }

  it('offers the set delete the moment the bulk panel replaces the inspector', async () => {
    // The gap this issue closes, stated as the sequence a GM performs: Delete lived ONLY on
    // the single-recipe inspector, so ticking the rows you wanted rid of hid it.
    await openRecipesBrowser();
    assert.ok(
      Boolean(target.querySelector('[data-recipe-action="delete"]')),
      'the single-recipe inspector offers Delete'
    );

    tickRecipeRow('r1');

    assert.ok(
      !target.querySelector('[data-recipe-action="delete"]'),
      'the inspector — and its Delete — is replaced'
    );
    assert.ok(recipeDeleteButton(), 'but the panel now carries its own set delete');
    assert.match(
      target.querySelector('[data-recipe-bulk-impact-row="items"]').textContent,
      /Will be removed from 2 books & scrolls/,
      'the impact the store computed reaches the panel'
    );
    assert.match(
      target.querySelector('[data-recipe-bulk-impact-row="learners"]').textContent,
      /Will be forgotten by 4 characters/
    );
  });

  it('takes TWO clicks, and the first writes nothing', async () => {
    const calls = [];
    await openRecipesBrowser(calls);
    tickRecipeRow('r1');
    tickRecipeRow('r2');

    recipeDeleteButton().click();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'deleteRecipes'),
      false,
      'the FIRST click only arms — nothing is written'
    );
    assert.equal(recipeDeleteButton().getAttribute('data-armed'), 'true');

    recipeDeleteButton().click();
    await tick();
    flushSync();
    const write = calls.find((call) => call[0] === 'deleteRecipes');
    assert.deepEqual(write?.[1], ['r1', 'r2'], 'the second click deletes the selection');
  });

  it('DISARMS when the selection changes underneath the armed control', async () => {
    // The second effect. An arm is a statement about a SPECIFIC set: once the set moves, the
    // impact sentence the GM read before arming is no longer the impact of confirming.
    //
    // WHAT THIS DOES NOT PROVE, said plainly so nobody reads more into it. It does not
    // distinguish the effect's `Set` dependency from a `count` one: keying the effect on
    // `recipeBulkSelectionCount` instead leaves this test GREEN, verified by mutation. That
    // is not a hole in the test — no reachable control produces an equal-sized new set
    // (untick-then-tick is two flushes, the browser's phantom prune assigns only when the
    // size differs, and `Select all N results` is hidden once everything is selected), so
    // there is no such case to write. The Set dependency is keyed on the reactive unit the
    // state is; see the effect's own comment.
    const calls = [];
    await openRecipesBrowser(calls);
    tickRecipeRow('r1');

    recipeDeleteButton().click();
    flushSync();
    assert.equal(recipeDeleteButton().getAttribute('data-armed'), 'true');

    tickRecipeRow('r1');
    tickRecipeRow('r2');

    assert.equal(
      recipeDeleteButton().getAttribute('data-armed'),
      'false',
      'swapping the selection disarms the pending delete'
    );
    recipeDeleteButton().click();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'deleteRecipes'),
      false,
      'the next click re-arms rather than writing'
    );
  });

  it('keeps a staged bulk-edit draft across a NON-EMPTY selection change', async () => {
    // THE REGRESSION THE SECOND EFFECT EXISTS TO AVOID. The shipped effect discards the
    // staged draft when the selection EMPTIES, deliberately — the panel is unmounted at that
    // point, so it is the only place the discard can honestly happen. Retargeting THAT
    // effect to the Set identity, rather than adding a second one, would discard a staged
    // draft on every selection change and undo issue 1010's whole staging model.
    await openRecipesBrowser();
    tickRecipeRow('r1');

    const stageDisable = () =>
      target
        .querySelector('[data-recipe-bulk-status-option="disable"] input')
        .dispatchEvent(new window.Event('change', { bubbles: true }));
    const applyEnabled = () => !target.querySelector('[data-recipe-bulk-apply]').disabled;

    stageDisable();
    flushSync();
    assert.equal(applyEnabled(), true, 'pre-condition: the draft really is staged');

    tickRecipeRow('r2');

    assert.equal(
      applyEnabled(),
      true,
      'growing the selection must not throw away what the GM staged'
    );
    assert.equal(
      recipeDeleteButton().getAttribute('data-armed'),
      'false',
      'while the arm — which IS a statement about a specific set — is still dropped'
    );
  });

  async function deleteSelectedRecipeRows(ids, options = {}) {
    const messages = [];
    const calls = [];
    const previousUi = globalThis.ui;
    globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
    try {
      await openRecipesBrowser(calls, options);
      for (const id of ids) tickRecipeRow(id);
      recipeDeleteButton().click();
      flushSync();
      recipeDeleteButton().click();
      await tick();
      flushSync();
      return { messages, calls };
    } finally {
      if (previousUi === undefined) delete globalThis.ui;
      else globalThis.ui = previousUi;
    }
  }

  it('clears the selection after a successful delete and reports every non-zero outcome', async () => {
    const { messages } = await deleteSelectedRecipeRows(['r1', 'r2'], {
      deleteRecipesResult: {
        deleted: 2,
        recipeIds: ['r1', 'r2'],
        recipeItemsAffected: 1,
        recipeItemsRewritten: 1,
        learnersAffected: 4,
      },
    });

    assert.deepEqual(messages, [
      'Deleted 2 recipe(s), removed them from 1 of your books & scrolls, and 4 character(s) forgot them.',
    ]);
    assert.ok(
      !target.querySelector('[data-recipe-bulk-delete-card]'),
      'the rail returns to the single-recipe inspector'
    );
  });

  it('drops the clauses whose outcome was zero rather than reporting a nought', async () => {
    const { messages } = await deleteSelectedRecipeRows(['r1'], {
      deleteRecipesResult: {
        deleted: 1,
        recipeIds: ['r1'],
        recipeItemsAffected: 0,
        recipeItemsRewritten: 0,
        learnersAffected: 0,
      },
    });

    assert.deepEqual(messages, ['Deleted 1 recipe(s).']);
  });

  it('names the learners alone when NO book contained them', async () => {
    const { messages } = await deleteSelectedRecipeRows(['r1', 'r2'], {
      deleteRecipesResult: {
        deleted: 2,
        recipeIds: ['r1', 'r2'],
        recipeItemsAffected: 0,
        recipeItemsRewritten: 0,
        learnersAffected: 3,
      },
    });

    assert.deepEqual(messages, ['Deleted 2 recipe(s); 3 character(s) forgot them.']);
  });

  // THE LEGACY-BASIS SHAPE, AND THE NUMBER THE TOAST MUST READ. Under the legacy basis
  // membership lives on the recipe and dies with it, so the write rewrites NO definition —
  // `recipeItemsRewritten: 0` — while the books genuinely stop containing the recipes. The
  // toast used to read the rewritten figure, so the card said "Will be removed from 1 book
  // or scroll" and the toast then dropped the clause entirely, making the operation look as
  // though it had done less than it promised (issue 1132, review round).
  it('reports the recipe items the CARD promised, not the definitions the write rewrote', async () => {
    const { messages } = await deleteSelectedRecipeRows(['r1', 'r2'], {
      deleteRecipesResult: {
        deleted: 2,
        recipeIds: ['r1', 'r2'],
        recipeItemsAffected: 1,
        recipeItemsRewritten: 0,
        learnersAffected: 0,
      },
    });

    assert.deepEqual(messages, [
      'Deleted 2 recipe(s) and removed them from 1 of your books & scrolls.',
    ]);
  });

  it('returns the card to IDLE and keeps the selection when the write is refused', async () => {
    // FAILURE IS NOT SILENT, and this path is reachable rather than theoretical: a GM whose
    // `SETTINGS_MODIFY` has been revoked passes the client-side `_assertGM` gate and is then
    // refused by the server. The store raises the error toast; the root must not announce a
    // success on top of it, must not throw the selection away, and must not leave a spinner.
    const { messages } = await deleteSelectedRecipeRows(['r1'], {
      deleteRecipesResult: {
        deleted: 0,
        recipeIds: [],
        recipeItemsAffected: 0,
        recipeItemsRewritten: 0,
        learnersAffected: 0,
      },
    });

    assert.deepEqual(messages, [], 'nothing was deleted, so nothing is announced');
    assert.ok(
      Boolean(target.querySelector('[data-recipe-bulk-delete-card]')),
      'and the selection survives, so the GM can see what did not happen and retry'
    );
    assert.equal(
      recipeDeleteButton().getAttribute('data-armed'),
      'false',
      'the arm is spent — a still-armed button would delete on the next single click'
    );
    assert.equal(
      recipeDeleteButton().getAttribute('data-busy'),
      'false',
      'and the busy face is cleared, not left as a stuck spinner over a live selection'
    );
  });

  // ── The impact is re-derived on a REPUBLISH, not only on a selection change ───────
  //
  // Everything `describeRecipeDelete` consults is invisible to the rune graph: the selected
  // system id is a `svelte/store` read, the system comes out of a plain Map and the learner
  // index is a plain `let`. So the selection was the derivation's only trigger, and the
  // concrete drift was reachable inside this very panel — select three recipes, stage "add to
  // Book X", Apply (the selection survives), and the card still stated the pre-apply book
  // count while the confirm pruned the post-apply one (issue 1132, review round).
  it('re-derives the impact when the store republishes underneath a live selection', async () => {
    const calls = [];
    const storeOptions = {
      recipeDeleteImpact: {
        deletable: 1,
        deletableIds: ['r1'],
        recipeItemsAffected: 2,
        recipeItemIds: ['ri1', 'ri2'],
        learnersAffected: 0,
        learnerIds: [],
      },
    };
    const store = createStore(calls, storeOptions);
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store, services: { openCurrentAdmin: () => {} } },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    tickRecipeRow('r1');

    const itemsRow = () => target.querySelector('[data-recipe-bulk-impact-row="items"]');
    assert.match(itemsRow().textContent, /2 books & scrolls/, 'pre-condition');

    // The world moves under the card and the store republishes, exactly as `refresh()` does.
    // The SELECTION is untouched, which is the whole point.
    storeOptions.recipeDeleteImpact = {
      deletable: 1,
      deletableIds: ['r1'],
      recipeItemsAffected: 1,
      recipeItemIds: ['ri1'],
      learnersAffected: 0,
      learnerIds: [],
    };
    store.viewState.update((state) => ({ ...state }));
    await tick();
    flushSync();

    assert.match(
      itemsRow().textContent,
      /1 book or scroll/,
      'the card states what the write would do NOW, not what it would have done when the row was ticked'
    );
  });

  // ── The refused delete is ANNOUNCED, not just toasted (issue 1132, review round) ──
  //
  // Confirming disables the control, which moves focus to `document.body` and empties the
  // card's live region. On the refused or no-op path the card is still mounted with the
  // selection intact, so an assistive-technology user was left on `<body>` beside a
  // re-enabled button with nothing said: the store's Foundry toast is not a live region this
  // module controls, and nothing distinguished "deleted" from "refused".
  it('announces the reached-nothing outcome through the card live region and re-arms nothing', async () => {
    // The zero result is returned on BOTH a concurrent no-op and a refused write (the store
    // cannot tell them apart from here), and the store's own toast for the former says
    // nothing failed — so the region must not claim a failure either (issue 1132, review
    // round 2).
    await deleteSelectedRecipeRows(['r1'], {
      deleteRecipesResult: {
        deleted: 0,
        recipeIds: [],
        recipeItemsAffected: 0,
        recipeItemsRewritten: 0,
        learnersAffected: 0,
      },
    });

    const region = target.querySelector('[data-recipe-bulk-delete-announce]');
    assert.ok(Boolean(region), 'the card is still mounted, so the region is there to speak');
    // The sentence is QUEUED BEHIND the focus restore (issue 1157): the card returns the
    // keyboard to the re-enabled control first, because a focus change cancels pending polite
    // speech, and only then writes the text.
    await waitForQueuedAnnouncement();
    assert.match(region.textContent, /Nothing was deleted\. The selection is unchanged\./);
    assert.equal(recipeDeleteButton().getAttribute('data-armed'), 'false');
  });

  it('clears the busy flag even when the action REJECTS, so the card cannot stick', async () => {
    // The store catches its own write failures, so a rejection reaching the root means the
    // failure was elsewhere — and a `finally`-less handler would leave `recipeBulkDeleting`
    // true forever, disabling the control the GM needs in order to try again.
    const { messages } = await deleteSelectedRecipeRows(['r1'], { deleteRecipesReject: true });

    assert.deepEqual(messages, []);
    assert.equal(recipeDeleteButton().getAttribute('data-busy'), 'false');
    assert.equal(recipeDeleteButton().getAttribute('data-armed'), 'false');
    assert.equal(recipeDeleteButton().disabled, false, 'and the control is live again');
  });

  // ── The root's own prop forwarding ──────────────────────────────────────────────
  // Three props are computed HERE and handed down, and the view/panel suites all supply
  // them directly — so every one of them could be mis-wired with those suites still
  // green. This test mounts the root and reads the DOM the forwarding produces:
  //  - `difficultyAxisProgressive` into the browser (the row badge), and
  //  - `showProgressiveDifficulty` into the panel (the DC section), both of which regress
  //    to the pre-issue-772 CRAFTING-only bug if re-derived from `resolutionMode`;
  //  - `selectedCards` into the panel, which must be the SELECTION and not the library:
  //    the overwrite warning counts authored essences over it, so the library would
  //    overstate the hazard on rows the GM never ticked.
  // The fixture is deliberately progressive for SALVAGE while `resolutionMode` is
  // `routedByCheck`, because that is the only shape where the two predicates disagree.
  it('forwards the three-axis DC predicate and the SELECTED cards, not the crafting mode and the library', async () => {
    await openComponentsBrowser([], {
      alchemyResolutionMode: 'routedByCheck',
      salvageResolutionMode: 'progressive',
    });

    assert.ok(
      Boolean(target.querySelector('[data-component-id="c1"] [data-component-difficulty]')),
      'the row DC badge follows the salvage axis, not the crafting resolution mode'
    );

    // c2 has NO authored essences; c1 has earth 2.
    tickComponentRow('c2');
    assert.ok(
      Boolean(target.querySelector('[data-component-bulk-difficulty]')),
      "and so does the panel's progressive DC section"
    );

    target.querySelector('[data-component-bulk-essences-staged]').click();
    flushSync();
    assert.ok(
      !target.querySelector('[data-component-bulk-essence-warning]'),
      'no selected row has an authored essence value, so there is no hazard to warn about'
    );

    tickComponentRow('c1');
    const warning = target.querySelector('[data-component-bulk-essence-warning]');
    assert.ok(Boolean(warning), 'ticking the row that DOES have one raises the warning');
    assert.equal(
      warning.getAttribute('data-component-bulk-essence-warning'),
      '1',
      'and it counts the selection'
    );
  });

  it('states the bulk delete impact before arming, deletes every member, and needs two clicks', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();

    // One ticked box is already a bulk edit, and the panel replaces the inspector.
    target.querySelector('[data-essence-select="water"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-essence-bulk-panel]'),
      'the bulk panel replaces the inspector'
    );
    assert.ok(
      !target.querySelector('[data-essence-browser-inspector]'),
      'and the single-essence inspector is gone while a selection exists'
    );

    const impactRow = (row) => target.querySelector(`[data-essence-bulk-impact-row="${row}"]`);
    const impactText = (row) => impactRow(row).textContent.trim();
    assert.ok(impactText('essences').startsWith('1'), '1 deletable essence');
    // Carried by no components, so the shared card omits the row entirely rather than stating a
    // nought (issue 1132). Asserted as ABSENCE: the old `startsWith('0')` form would now THROW
    // on a null dereference rather than fail, and a throwing control is the one whose cheapest
    // repair is deletion.
    assert.ok(!impactRow('components'), 'carried by no components, so nothing is said about them');
    assert.ok(impactText('recipes').startsWith('1'), 'and rewriting 1 recipe');
    assert.ok(
      !target.querySelector('[data-essence-bulk-blocked]'),
      'no member is ever blocked — deletion is warned, not blocked'
    );

    // Adding the COMPONENT-CARRIED essence changes all three numbers, and the recipe number
    // is a UNION rather than a sum: `earth` names r1+r2 and `water` names r2, so 2, not 3.
    target.querySelector('[data-essence-select="earth"]').click();
    await tick();
    flushSync();
    assert.ok(impactText('essences').startsWith('2'), 'the carried member is deletable too');
    assert.ok(impactText('recipes').startsWith('2'), 'r1 and r2, unioned rather than summed');
    // And the row RETURNS the moment the count is non-zero, which is what stops the absence
    // assertion above passing for a row that was simply removed.
    assert.ok(
      impactText('components').startsWith('1'),
      'and its CARRIER is reported as impact, unioned over the whole selection'
    );
    assert.match(
      impactText('components'),
      /selected essences/,
      'and the line says WHICH set it counts, since it counts the whole selection'
    );
    assert.ok(
      !target.querySelector('[data-essence-bulk-blocked]'),
      'still nothing is blocked — the carried essence deletes like any other'
    );

    const deleteButton = target.querySelector(
      '[data-essence-bulk-delete-card] .manager-button.is-danger'
    );
    assert.ok(deleteButton, 'the bulk delete is a real button, armed rather than dialogged');
    deleteButton.click();
    await tick();
    flushSync();
    assert.equal(
      calls.some((call) => call[0] === 'deleteEssences'),
      false,
      'the FIRST click only arms — nothing is written'
    );
    target.querySelector('[data-essence-bulk-delete-card] .manager-button.is-danger').click();
    await tick();
    await tick();
    flushSync();
    const deleteCall = calls.find((call) => call[0] === 'deleteEssences');
    assert.ok(deleteCall, 'the SECOND click performs the delete');
    assert.deepEqual(
      [...deleteCall[1]].sort(),
      ['earth', 'water'],
      'and it deletes EVERY selected member, carried or not'
    );
  });

  // ── The essence root's two no-write exits (issue 1132, review round) ──────────────
  //
  // Both guards were CORRECTED for the essence path by this change and both shipped with
  // ZERO coverage: the component twin is gated by its own zero-result case and the recipe
  // twin by a zero result and a rejection, while `deleteEssencesResult` was exposed by the
  // store double and supplied by nothing in the suite. Reverting
  // `Number(result?.deleted) || 0; if (deleted === 0)` to `if (!result)`, and moving
  // `essenceBulkDeleteArmed = false` out of the `finally` and back into the `try`, were both
  // green mutations. A fix the suite cannot see is not closed.
  async function deleteSelectedEssenceRows(ids, options = {}) {
    const messages = [];
    const calls = [];
    const previousUi = globalThis.ui;
    globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
    try {
      target = document.createElement('div');
      document.body.appendChild(target);
      mounted = mount(Component, {
        target,
        props: { store: createStore(calls, options), services: { openCurrentAdmin: () => {} } },
      });
      flushSync();
      navButton('Essence Rules').click();
      await tick();
      flushSync();
      for (const id of ids) {
        target.querySelector(`[data-essence-select="${id}"]`).click();
        await tick();
        flushSync();
      }
      const button = () =>
        target.querySelector('[data-essence-bulk-delete-card] .manager-button.is-danger');
      button().click();
      await tick();
      flushSync();
      button().click();
      await tick();
      await tick();
      flushSync();
      return { messages, calls, button };
    } finally {
      if (previousUi === undefined) delete globalThis.ui;
      else globalThis.ui = previousUi;
    }
  }

  // Issue 1144 — the essence toast did not carry `recipesDisabled` at all before this fix.
  // Mirrors 'reports the DISABLED recipes in the toast, the most consequential outcome' and
  // 'drops the disable clause entirely when nothing was disabled' from the component suite.
  it('reports the DISABLED recipes in the essence toast, the most consequential outcome', async () => {
    const { messages } = await deleteSelectedEssenceRows(['water'], {
      deleteEssencesResult: { deleted: 1, recipesUpdated: 3, recipesDisabled: 1 },
    });

    assert.deepEqual(messages, [
      'Deleted 1 essence(s) and rewrote 3 recipe(s), disabling 1 of them.',
    ]);
  });

  it('drops the disable clause entirely from the essence toast when nothing was disabled', async () => {
    const { messages } = await deleteSelectedEssenceRows(['water'], {
      deleteEssencesResult: { deleted: 1, recipesUpdated: 2, recipesDisabled: 0 },
    });

    assert.deepEqual(messages, ['Deleted 1 essence(s) and rewrote 2 recipe(s).']);
  });

  it('reports NO essence success and keeps the selection when the write deleted nothing', async () => {
    // The store returns its zero result — an OBJECT, and therefore truthy — on a failed
    // write, after raising its own error toast. A bare `if (!result)` guard lets that through
    // as success: the selection clears and the GM reads "Deleted 0 essence(s)" underneath the
    // error, with the rows still in the library.
    const { messages, button } = await deleteSelectedEssenceRows(['water'], {
      deleteEssencesResult: { deleted: 0, blocked: [], recipesUpdated: 0 },
    });

    assert.deepEqual(messages, [], 'nothing was deleted, so no COMPLETION message is toasted');
    assert.ok(
      Boolean(target.querySelector('[data-essence-bulk-delete-card]')),
      'and the selection survives, so the GM can see what did not happen and retry'
    );
    assert.equal(
      button().getAttribute('data-armed'),
      'false',
      'but the arm is spent — a still-armed button would delete on the next single click'
    );

    // The twin of the component assertion (issue 1157, review round): the card survives this
    // path, so it is the one surface that can say the delete reached nothing.
    await waitForQueuedAnnouncement();
    assert.equal(
      target.querySelector('[data-essence-bulk-delete-announce]').textContent.trim(),
      'Nothing was deleted. The selection is unchanged.'
    );
    assert.ok(
      document.activeElement === button(),
      'and the keyboard is back on the control that was pressed'
    );
  });

  it('clears the essence arm even when the action REJECTS, so the card cannot stick', async () => {
    // The disarm has to live in the `finally`: in the `try`, after the await, a rejection
    // skips it and leaves an ARMED button that deletes on the next single click.
    const { messages, button } = await deleteSelectedEssenceRows(['water'], {
      deleteEssencesReject: true,
    });

    assert.deepEqual(messages, []);
    assert.equal(button().getAttribute('data-armed'), 'false');
    assert.equal(button().getAttribute('data-busy'), 'false');
    assert.equal(button().disabled, false, 'and the control is live again');
  });

  it('applies a staged essence bulk edit with falsy-but-real axes', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: { store: createStore(calls), services: { openCurrentAdmin: () => {} } },
    });
    flushSync();

    navButton('Essence Rules').click();
    await tick();
    flushSync();
    target.querySelector('[data-essence-select="water"]').click();
    await tick();
    flushSync();

    // Apply is inert until something is staged.
    assert.equal(target.querySelector('[data-essence-bulk-apply]').disabled, true);

    // Clear colour and Disable are BOTH falsy-but-real staged edits. A truthiness-gated
    // projection would emit neither.
    target.querySelector('[data-essence-bulk-colour] [data-manager-color-none]').click();
    target.querySelector('[data-essence-bulk-status-option="disable"] input').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('[data-essence-bulk-apply]').disabled, false);

    target.querySelector('[data-essence-bulk-apply]').click();
    await tick();
    await tick();
    flushSync();
    const applyCall = calls.find((call) => call[0] === 'applyEssenceBulkEdit');
    assert.ok(applyCall, 'Apply reaches the set-apply store action');
    assert.deepEqual(applyCall[1], ['water']);
    assert.ok(Object.hasOwn(applyCall[2], 'colorToken'), 'Clear colour is a PRESENT key');
    assert.equal(applyCall[2].colorToken, null);
    assert.equal(applyCall[2].enabled, false, 'and Disable is a present false');
    assert.equal(Object.hasOwn(applyCall[2], 'icon'), false, 'an unstaged axis is never sent');
  });

  // ── Issue 1157: emptying a bulk selection ─────────────────────────────────────────
  //
  // Every action that empties a bulk selection unmounts the panel it was performed from, and
  // with it the control that was pressed. Focus fell to `document.body` and nothing was said,
  // on all three studios, for Clear as well as for delete.
  //
  // This is the ONLY suite that mounts `CraftingSystemManagerRoot`, so it is the only place
  // the manager-level live region and the focus hop can be proved at all: both belong to the
  // root precisely because every panel-level suite's component is gone by the time they act.
  //
  // ONE TABLE, NOT THREE COPIED BLOCKS. The defect was identical on the three studios, so a
  // per-studio suite would be three chances to fix two of them — and three near-identical
  // blocks are what the SonarCloud duplication gate fails on besides.
  describe('emptying a bulk selection announces it and re-homes the keyboard', () => {
    //
    // `stage` is per-studio because the AXES are: the two studios with a category select
    // stage through it, and the Essence Studio, which has none, stages its status radio.
    // Everything else here is one hook name per studio.
    const BULK_STUDIOS = [
      {
        name: 'Essence',
        route: () => navButton('Essence Rules'),
        rows: ['water', 'earth'],
        rowAttr: 'data-essence-select',
        toolbar: 'data-essence-toolbar',
        pageBox: 'data-essence-select-all-page',
        toolbarClear: 'data-essence-clear-selection',
        panelClear: 'data-essence-bulk-clear',
        panel: 'data-essence-bulk-panel',
        deleteCard: 'data-essence-bulk-delete-card',
        apply: 'data-essence-bulk-apply',
        stage: () =>
          target.querySelector('[data-essence-bulk-status-option="disable"] input').click(),
        applyResultOption: 'applyEssenceBulkEditResult',
        applied: 'Updated 2 essences.',
        appliedNone: 'No essences needed changing.',
      },
      {
        name: 'Component',
        route: () => navButton('Component Rules'),
        rows: ['c1', 'c2'],
        rowAttr: 'data-component-select',
        toolbar: 'data-component-toolbar',
        pageBox: 'data-component-select-all-page',
        toolbarClear: 'data-component-clear-selection',
        panelClear: 'data-component-bulk-clear',
        panel: 'data-component-bulk-panel',
        // The remove leg's hook and a category ROW (issue 1371 r16-list, M23): the component
        // studio's category is an inline inset, so its stage is a click rather than a select.
        deleteCard: 'data-component-bulk-remove',
        apply: 'data-component-bulk-apply',
        stage: () => {
          const row = target.querySelector('[data-component-bulk-category-option]');
          assert.ok(Boolean(row), 'the category inset offers no row, so nothing can be staged through it');
          row.click();
        },
        applyResultOption: 'applyComponentBulkEditResult',
        applied: 'Applied bulk changes to 2 components.',
        appliedNone: 'No components needed changing.',
      },
      {
        name: 'Recipe',
        route: () => craftingParent(),
        rows: ['r1', 'r2'],
        rowAttr: 'data-recipe-select',
        toolbar: 'data-recipe-toolbar',
        pageBox: 'data-recipe-select-all-page',
        toolbarClear: 'data-recipe-clear-selection',
        panelClear: 'data-recipe-bulk-clear',
        panel: 'data-recipe-bulk-panel',
        deleteCard: 'data-recipe-bulk-delete-card',
        apply: 'data-recipe-bulk-apply',
        stage: () => stageFirstCategory('data-recipe-bulk-category'),
        applyResultOption: 'applyRecipeBulkEditResult',
        applied: 'Applied bulk changes to 2 recipes.',
        appliedNone: 'No recipes needed changing.',
      },
    ];

    /** Stage the first real option of a bulk category select, so Apply becomes live. */
    function stageFirstCategory(attribute) {
      // ISSUE 1504: the axis is a shared `<Select>`, so the offered values are rows in a
      // PORTALED panel rather than `<option>`s inside the control. The sentinel's row is the
      // one with the declared `__unchanged__` handle, so "the first real category" is the first
      // row that is not it — which is what this used to mean by "the first option with a value".
      const values = selectOptionValues(target, `[${attribute}]`).filter(
        (value) => value !== '__unchanged__'
      );
      assert.ok(
        values.length > 0,
        `[${attribute}] offers nothing but "leave unchanged", so nothing can be staged through it`
      );
      chooseSelectOption(target, `[${attribute}]`, values[0]);
    }

    const REGION = '[data-manager-bulk-selection-announce]';

    /**
     * What holds focus, as a SHORT STRING.
     *
     * Never the node: `node:assert` serialises the actual value to build its diff, and
     * walking a mounted happy-dom element's circular tree kills the heap — a failing
     * assertion surfaces as a `# cancelled` suite with no message.
     *
     * `detached` is reported apart from `document.body` because the two engines disagree
     * about which one a removed focused node produces, and BOTH are the failure this block
     * exists to catch.
     */
    function focusHolder(studio) {
      const active = document.activeElement;
      if (!active || active === document.body) return 'document.body';
      if (active.isConnected === false) return 'detached';
      if (active.hasAttribute?.(studio.toolbar)) return 'studio toolbar';
      if (active.hasAttribute?.(studio.pageBox)) return 'page-selection box';
      if (active.classList?.contains?.('manager-nav-button')) return 'nav rail';
      return 'somewhere else';
    }

    function regionNode() {
      return target.querySelector(REGION);
    }

    function announcement() {
      const region = regionNode();
      return region ? region.textContent.trim() : null;
    }

    // The focus hop is deferred a microtask past Svelte's own flush — the same ordering
    // `RecipeBulkEditPanel.focusAfterRerender` relies on — so an assertion made synchronously
    // after the click would read the pre-hop `document.activeElement` and pass or fail for
    // the wrong reason.
    async function settle() {
      await tick();
      flushSync();
      await Promise.resolve();
      await Promise.resolve();
    }

    /**
     * `settle()`, plus the wait for the sentence that is QUEUED BEHIND THE FOCUS UTTERANCE.
     *
     * A `polite` region is queued speech and a focus change cancels queued speech, so the
     * announcement is deliberately written after the hop rather than before it — see
     * `src/ui/svelte/util/announceAfterFocus.js`, which owns that order for the root and for
     * `BulkDeleteCard` alike. The delay is IMPORTED rather than restated here: a local copy of
     * the number would silently start asserting the un-delayed state the moment it changed.
     */
    async function settleAnnouncement() {
      await settle();
      await waitForQueuedAnnouncement();
      await settle();
    }

    async function openStudio(studio, calls = [], options = {}) {
      mountManager(calls, options);
      studio.route().click();
      await settle();
    }

    async function selectRows(studio) {
      for (const id of studio.rows) {
        target.querySelector(`[${studio.rowAttr}="${id}"]`).click();
        await settle();
      }
      assert.ok(
        Boolean(target.querySelector(`[${studio.panel}]`)),
        `pre-condition: ${studio.name} Studio shows its bulk panel over the selection`
      );
    }

    /** Press the studio's Apply, capturing the completion toast. */
    async function applySelection(studio) {
      const messages = [];
      const previousUi = globalThis.ui;
      globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
      try {
        const apply = target.querySelector(`[${studio.apply}]`);
        assert.equal(apply.disabled, false, 'pre-condition: something is staged, so Apply is live');
        apply.click();
        await settle();
        await settle();
        return messages;
      } finally {
        if (previousUi === undefined) delete globalThis.ui;
        else globalThis.ui = previousUi;
      }
    }

    /** Arm and confirm the studio's set delete, capturing the completion toast. */
    async function deleteSelection(studio) {
      const messages = [];
      const previousUi = globalThis.ui;
      globalThis.ui = { notifications: { info: (message) => messages.push(message) } };
      try {
        const button = () =>
          target.querySelector(`[${studio.deleteCard}] .manager-button.is-danger`);
        button().click();
        await settle();
        button().click();
        await settle();
        await settle();
        return messages;
      } finally {
        if (previousUi === undefined) delete globalThis.ui;
        else globalThis.ui = previousUi;
      }
    }

    it('renders ONE live region for the whole manager, and renders it EMPTY', async () => {
      mountManager();

      const regions = target.querySelectorAll(REGION);
      assert.equal(regions.length, 1, 'exactly one manager-level region');
      assert.equal(regions[0].getAttribute('aria-live'), 'polite');
      assert.equal(regions[0].getAttribute('aria-atomic'), 'true');
      // A region inserted into the DOM together with its text is not announced by most
      // screen readers, so it has to exist first and be empty until something is said.
      assert.equal(announcement(), '', 'and it says nothing until an action does');
    });

    for (const studio of BULK_STUDIOS) {
      it(`${studio.name} Studio: the toolbar Clear announces and lands on the studio toolbar`, async () => {
        await openStudio(studio);
        await selectRows(studio);

        assert.notEqual(
          focusHolder(studio),
          'studio toolbar',
          'anti-vacuity: focus is not already on the target this test claims it moves to'
        );

        target.querySelector(`[${studio.toolbarClear}]`).click();
        await settle();

        // ── THE ORDER, WHICH IS NOT THE OBVIOUS ONE (review round) ──────────────────
        // The keyboard moves FIRST and the region is still EMPTY when it lands. A `polite`
        // announcement is queued speech and NVDA and JAWS both cancel queued speech on a
        // focus change, so writing the sentence first — which is what the first cut did —
        // is an announcement the GM may never hear: the original silence, hidden behind a
        // focus hop that works. No engine in this repo runs a screen reader, so the
        // utterance is not observable here; the ORDER is, and this is it.
        assert.equal(focusHolder(studio), 'studio toolbar');
        assert.equal(announcement(), '', 'nothing is queued in front of the focus utterance');

        await settleAnnouncement();
        assert.equal(announcement(), 'Selection cleared.');
        assert.ok(
          !target.querySelector(`[${studio.panel}]`),
          'and the panel really did unmount, which is what dropped the focus in the first place'
        );
      });

      // ── THE TARGET IS INERT, AND THAT IS THE POINT (review round) ─────────────────
      // The hop first went to the toolbar's page-selection box — a real
      // `<input type="checkbox">` whose `onchange` selects every rendered row. A GM who
      // clicked Clear with the mouse and then pressed the space bar to scroll would have
      // silently re-selected the whole page, with no visible focus ring, because the box's
      // only ring is `:focus-visible` and Chrome does not match it for programmatic focus
      // after a pointer interaction.
      //
      // The space bar is asserted as what it IS on a focused control: a click. On the
      // `<section>` it is nothing; on the checkbox it was the whole page back.
      it(`${studio.name} Studio: the hop target cannot be operated by the space bar`, async () => {
        await openStudio(studio);
        await selectRows(studio);
        target.querySelector(`[${studio.toolbarClear}]`).click();
        await settleAnnouncement();
        assert.equal(focusHolder(studio), 'studio toolbar');

        const landed = document.activeElement;
        assert.equal(landed.tagName, 'SECTION', 'a landmark, not a control');
        assert.equal(landed.getAttribute('tabindex'), '-1', 'focusable, but never a tab stop');
        assert.ok(
          Boolean(landed.getAttribute('aria-label')),
          'and it is NAMED, which is what the GM hears instead of a control they might operate'
        );

        landed.click();
        await settle();
        assert.ok(
          !target.querySelector(`[${studio.panel}]`),
          'pressing space where the GM was left does NOT re-select the page'
        );
      });

      it(`${studio.name} Studio: the panel header Clear does exactly the same`, async () => {
        // The panel header's `Clear selection` and the toolbar's `Clear` are ONE action by
        // two routes. Fixing one and not the other is what leaves a third pattern behind.
        await openStudio(studio);
        await selectRows(studio);

        target.querySelector(`[${studio.panelClear}]`).click();
        await settleAnnouncement();

        assert.equal(announcement(), 'Selection cleared.');
        assert.equal(focusHolder(studio), 'studio toolbar');
      });

      // ── APPLY (review round) ─────────────────────────────────────────────────────
      // Apply is the third action that empties the selection, and it shipped in the first
      // cut with no coverage at all on any studio — while two of the three apply message
      // expressions were being rewritten. It is asserted here on the same terms as the
      // delete: the sentence the GM reads and the sentence the GM hears are the SAME one,
      // so a studio that re-words its toast cannot leave the screen-reader user on a stale
      // copy of the old one.
      it(`${studio.name} Studio: a successful Apply announces its completion sentence`, async () => {
        await openStudio(studio);
        await selectRows(studio);
        studio.stage();
        await settle();

        const messages = await applySelection(studio);

        assert.deepEqual(messages, [studio.applied], 'the apply really did complete and report');
        await settleAnnouncement();
        assert.equal(announcement(), messages[0]);
        assert.equal(focusHolder(studio), 'studio toolbar');
        assert.ok(
          !target.querySelector(`[${studio.panel}]`),
          'the panel that held Apply is gone, which is what dropped the focus'
        );
      });

      // A write that legitimately changed nothing — every selected row already matched the
      // staged values — is not a failure, and "Updated 0 essences." was reachable and being
      // SPOKEN as the sole outcome of a successful action. Each studio states the zero case
      // in its own words.
      it(`${studio.name} Studio: an Apply that changed nothing says so, rather than reporting 0`, async () => {
        await openStudio(studio, [], { [studio.applyResultOption]: { updated: 0 } });
        await selectRows(studio);
        studio.stage();
        await settle();

        const messages = await applySelection(studio);

        assert.deepEqual(messages, [studio.appliedNone]);
        await settleAnnouncement();
        assert.equal(announcement(), studio.appliedNone);
        assert.equal(focusHolder(studio), 'studio toolbar');
      });

      it(`${studio.name} Studio: a successful set delete announces the completion sentence`, async () => {
        await openStudio(studio);
        await selectRows(studio);

        const messages = await deleteSelection(studio);

        assert.equal(messages.length, 1, 'the delete really did complete and report');
        await settleAnnouncement();
        // The two audiences are told the SAME thing, asserted as an identity rather than as
        // three hardcoded sentences: a studio that re-words its toast cannot leave the
        // screen-reader user on a stale copy of the old one.
        assert.equal(announcement(), messages[0]);
        assert.match(
          announcement(),
          /^Deleted /,
          'and it is the completion sentence, not "Selection cleared."'
        );
        assert.equal(focusHolder(studio), 'studio toolbar');
        assert.ok(
          !target.querySelector(`[${studio.deleteCard}]`),
          'the card that used to own the only region is gone, which is the whole problem'
        );
      });

      it(`${studio.name} Studio: an identical second announcement REPLACES the region's node`, async () => {
        // Re-inserting identical text announces nothing the second time, and clearing a
        // selection twice running is an ordinary gesture. The child node is keyed on the
        // announcement object so each one is a genuine insertion rather than a rewrite —
        // asserted as node IDENTITY, because the text is identical by construction.
        await openStudio(studio);
        await selectRows(studio);
        target.querySelector(`[${studio.toolbarClear}]`).click();
        await settleAnnouncement();
        const first = regionNode().firstElementChild;
        assert.ok(Boolean(first), 'the announcement renders its own child node');

        await selectRows(studio);
        target.querySelector(`[${studio.toolbarClear}]`).click();
        await settleAnnouncement();
        const second = regionNode().firstElementChild;

        assert.equal(announcement(), 'Selection cleared.', 'the same sentence, twice');
        assert.ok(
          Boolean(second) && second !== first,
          'and a NEW node carries it, so the region is inserted into rather than rewritten'
        );
      });

      it(`${studio.name} Studio: focus the GM moved themselves is left alone`, async () => {
        // The folded-in half of the issue. A GM who tabs away while an awaited write is in
        // flight must not be yanked back by its result. The nav rail is used as the place
        // they went because every studio has one and it is real product markup.
        await openStudio(studio);
        await selectRows(studio);

        const elsewhere = target.querySelector('.manager-nav-button');
        elsewhere.focus();
        assert.equal(focusHolder(studio), 'nav rail', 'pre-condition: the GM is elsewhere');

        await deleteSelection(studio);
        await settleAnnouncement();

        assert.match(announcement(), /^Deleted /, 'the outcome is still announced');
        assert.equal(
          focusHolder(studio),
          'nav rail',
          'but the keyboard is left where the GM put it'
        );
      });
    }
  });
}
