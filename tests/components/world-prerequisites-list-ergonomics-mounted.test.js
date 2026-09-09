import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import {
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { assertNoElement } from '../helpers/svelte-dom.js';
import {
  assertSelectHasResolvedName,
  chooseSelectOption,
  closeSelectPanel,
  selectOptionLabels,
  selectOptionValues,
} from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * World > Rules & Resources > Character prerequisites, mounted on its own.
 *
 * The prerequisite half of the settings-list ergonomics contract (issue 768). It used to be
 * asserted through a `SystemEditView` mount in `system-edit-list-ergonomics-mounted`, because
 * that page rendered this list beside the modifier library and the coin ladder. Issue 1278
 * moved the ladder out to `world-currency-list-ergonomics-mounted`; issue 1311 moves these two
 * out the same way, so this suite and `world-modifiers-list-ergonomics-mounted` replace that
 * file rather than mounting three components from one.
 *
 * The subject is the PAGE (`WorldPrerequisitesTab`), not the card it wraps, because the two
 * things the move changed are the page's: the polite reorder region it now owns — a page
 * cannot announce into a sibling route — and the cross-copy, which it can only hand upward
 * now that the destination is a different route.
 */
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-prerequisites-ergonomics-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/systems/characterPrerequisites.js',
  ],
  compiledModules: [
    // THE APP'S ONE SELECT AND ITS WHOLE COMPILED CLOSURE (issue 1510), spread rather than copied.
    // This tree renders `components/Select.svelte` now, and a `.svelte` the tree renders but the
    // harness omits HANGS the suite (`# cancelled`) rather than failing it.
    ...SELECT_COMPILED_MODULES,
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled) rather
    // than failing it, so every one is named.
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/apps/manager/system/CharacterPrerequisitesCard.svelte',
    'src/ui/svelte/apps/manager/world/WorldPrerequisitesTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/world/WorldPrerequisitesTab.svelte',
});

function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function clickEvent() {
  return new globalThis.window.Event('click', { bubbles: true });
}

const PREREQUISITES = Object.freeze([
  {
    id: 'pre-trained',
    name: 'Trained',
    icon: 'fa-solid fa-graduation-cap',
    path: 'skills.cra.rank',
    op: 'gte',
    value: 2,
  },
  {
    id: 'pre-open',
    name: 'Copy target',
    icon: 'fa-solid fa-user-shield',
    path: '',
    op: 'gte',
    value: null,
  },
]);

// happy-dom does not implement scrollIntoView; stub it after the harness builds the window so
// the router-requested open's "reveal the target" half is observable.
let scrollCalls = [];
before(async () => {
  await harness.setup();
  globalThis.window.Element.prototype.scrollIntoView = function scrollIntoView() {
    scrollCalls.push(this);
  };
});
after(() => harness.teardown());
afterEach(() => {
  scrollCalls = [];
  return harness.remount();
});

describe('world character-prerequisite list ergonomics (mounted, issue 768)', () => {
  it('renders the library with no crafting system in hand', async () => {
    // The point of the move (issue 1308 for the scope, issue 1311 for the route). The page
    // takes no system prop at all: the library is one world-wide pool, and a GM has to be able
    // to author a prerequisite before any system gates anything on it.
    const root = await harness.mount({ library: PREREQUISITES });

    assert.ok(root.querySelector('[data-world-prerequisites-page]'), 'the page root renders');
    assert.ok(root.querySelector('[data-world-character-prerequisites]'), 'the card renders');
    assert.ok(root.querySelector('[data-world-character-prerequisite="pre-trained"]'), 'and rows');
    assert.equal(
      root.querySelectorAll('[data-copy-to-modifier]').length,
      PREREQUISITES.length,
      'every row offers the cross-copy — the page always supplies the handler, on every world'
    );
  });

  it('renders a summary row that is collapsed by default and expands to the IconPicker editor', async () => {
    // The per-ROW accordion survived the move; only the whole-SECTION collapse did not. This is
    // the half of "collapse" that still has a subject, so it stays asserted.
    const root = await harness.mount({ library: PREREQUISITES });

    const row = root.querySelector('[data-world-character-prerequisite="pre-trained"]');
    const summary = row.querySelector('[data-toggle-prerequisite]');
    assert.ok(summary, 'the row renders an accordion summary toggle');
    assert.equal(summary.getAttribute('aria-expanded'), 'false', 'starts collapsed');
    assert.ok(!row.querySelector('.manager-prerequisite-body'), 'no editor body when collapsed');
    assert.ok(
      row.querySelector('[data-prerequisite-preview]').textContent.includes('skills.cra.rank'),
      'the collapsed row previews the condition, so a list can be scanned without opening rows'
    );

    summary.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(summary.getAttribute('aria-expanded'), 'true', 'summary toggles open');
    assert.ok(row.querySelector('.manager-prerequisite-body'), 'the editor body opens');
    assert.ok(
      row.querySelector('.manager-prerequisite-icon-trigger'),
      'the icon is authored through the shared IconPicker, not a bare text input'
    );
  });

  it('carries NO whole-section collapse, because collapsing a whole route only blanks it', async () => {
    // On the Settings tab the chevron yielded space to the sibling cards below it — the
    // modifier library and the coin ladder. As a route there is nothing to make room for, so
    // the same control would hide the page and leave a bare header row. This is the assertion
    // that replaced `system-edit-list-ergonomics`' "collapses a whole section on its header
    // toggle": the behaviour is gone from the product, not merely moved.
    const root = await harness.mount({ library: PREREQUISITES });

    assertNoElement(
      root,
      '[data-section-collapse="prerequisites"]',
      'the collapse chevron does not belong on a route that has no siblings'
    );
    assert.ok(
      root.querySelector('#manager-section-body-prerequisites'),
      'and the body it used to hide renders unconditionally'
    );
  });

  it('reorders a prerequisite via the Move up/down chevrons, announcing the new position', async () => {
    const calls = [];
    const root = await harness.mount({
      library: PREREQUISITES,
      onReorder: async (fromIndex, toIndex) => {
        calls.push([fromIndex, toIndex]);
      },
    });

    const firstUp = root.querySelector('[data-move-prerequisite-up="pre-trained"]');
    const firstDown = root.querySelector('[data-move-prerequisite-down="pre-trained"]');
    assert.ok(firstUp && firstDown, 'the first prerequisite row has both chevrons');
    assert.equal(firstUp.disabled, true, 'Move up disabled on the first prerequisite');
    assert.equal(firstDown.disabled, false, 'Move down enabled on the first prerequisite');

    const lastDown = root.querySelector('[data-move-prerequisite-down="pre-open"]');
    assert.equal(lastDown.disabled, true, 'Move down disabled on the last prerequisite');

    firstDown.dispatchEvent(clickEvent());
    await flushRender();
    assert.deepEqual(calls, [[0, 1]], 'the reorder op fires with (index, index+1)');

    // The announcement is the PAGE's now. It used to be the Settings tab's, shared with two
    // other lists; the card reports the move and each route announces it, because a page cannot
    // announce into a sibling route.
    const announcement = root.querySelector('[data-list-reorder-announcement]');
    assert.ok(announcement, 'the page renders a polite live region');
    assert.equal(announcement.getAttribute('aria-live'), 'polite', 'polite, not assertive');
    assert.ok(announcement.textContent.includes('Trained'), 'a reorder is announced by name');
    assert.match(
      announcement.textContent,
      /2/,
      'and states the new position, which is the fact the reflow hides from a non-sighted GM'
    );
  });

  it('announces the move only AFTER the store op resolves, never ahead of it', async () => {
    // The page awaits `onReorder` before composing the sentence. Announcing first would tell a
    // non-sighted GM a row had moved while the persisted order was still the old one.
    let releaseStore = () => {};
    const pending = new Promise((resolveStore) => {
      releaseStore = resolveStore;
    });
    const root = await harness.mount({
      library: PREREQUISITES,
      onReorder: () => pending,
    });

    root.querySelector('[data-move-prerequisite-down="pre-trained"]').dispatchEvent(clickEvent());
    await flushRender();
    const announcement = root.querySelector('[data-list-reorder-announcement]');
    assert.equal(
      announcement.textContent.trim(),
      '',
      'nothing is announced while the write is still in flight'
    );

    releaseStore();
    await flushRender();
    assert.ok(
      announcement.textContent.includes('Trained'),
      'and the sentence appears once the order is actually persisted'
    );
  });

  it('hands the RAW prerequisite up on Copy to modifiers, and completes nothing itself', async () => {
    // The whole point of the split. Across two sibling routes a copy is a NAVIGATION, which a
    // page component cannot perform, so this page's entire contribution is the handoff: no
    // destination write, no route change, no announcement. The round trip — mapping, add,
    // navigate, open — is the manager root's and is asserted there.
    const copied = [];
    const root = await harness.mount({
      library: PREREQUISITES,
      onCopyToModifier: (entry) => {
        copied.push(entry);
      },
    });

    const copyButton = root.querySelector('[data-copy-to-modifier="pre-trained"]');
    assert.ok(copyButton, 'the prerequisite row has a Copy to modifiers button');
    copyButton.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(copied.length, 1, 'the callback fired once');
    assert.equal(copied[0].id, 'pre-trained', 'with the entry the GM clicked');
    assert.equal(copied[0].name, 'Trained', 'unmapped and unmodified — the RAW entry');
    assert.equal(copied[0].path, 'skills.cra.rank');
    assertNoElement(
      root,
      '[data-list-copy-announcement]',
      'the copy announcement is the root’s: this page unmounts on the navigation that follows'
    );
  });

  it('opens and reveals the entry the router requests, and re-opens it on a nonce bump', async () => {
    // `requestOpenId` + `requestOpenNonce` is how the root finishes a cross-library copy on
    // this side of the split. The nonce is the load-bearing half: copying the SAME entry twice
    // must open it both times, and an unchanged id cannot say it was asked for again.
    const root = await harness.mount({
      library: PREREQUISITES,
      requestOpenId: 'pre-open',
      requestOpenNonce: 1,
    });
    await flushRender();

    const row = root.querySelector('[data-world-character-prerequisite="pre-open"]');
    assert.ok(row.querySelector('.manager-prerequisite-body'), 'the row opens in edit mode');
    assert.ok(scrollCalls.includes(row), 'and is scrolled into view — a copy lands below the fold');
    assert.ok(
      row.contains(globalThis.window.document.activeElement),
      'focus moves into the newly-opened editor'
    );

    // The GM closes it, then the same id is requested again.
    row.querySelector('[data-toggle-prerequisite]').dispatchEvent(clickEvent());
    await flushRender();
    assertNoElement(row, '.manager-prerequisite-body', 'the editor closes');

    await harness.setProps({ requestOpenId: 'pre-open', requestOpenNonce: 2 });
    await flushRender();
    assert.ok(
      root
        .querySelector('[data-world-character-prerequisite="pre-open"]')
        .querySelector('.manager-prerequisite-body'),
      'a bumped nonce re-opens the SAME id'
    );
  });

  it('offers the comparison operators as the app’s own list, named by the row’s own caption', async () => {
    // FIRST COVERAGE OF `[data-prerequisite-operator]` (issue 1510). The operator control had no
    // mounted assertion at all before this change — the row's path and value inputs were
    // covered and the comparison between them was not — so a conversion could have reordered the
    // operators, changed the `symbol · label` join or unnamed the control, and nothing would
    // have said so.
    const root = await harness.mount({ library: PREREQUISITES, onUpdate: () => {} });
    const row = root.querySelector('[data-world-character-prerequisite="pre-trained"]');
    row.querySelector('[data-toggle-prerequisite]').dispatchEvent(clickEvent());
    await flushRender();

    const operator =
      '[data-world-character-prerequisite="pre-trained"] [data-prerequisite-operator]';
    assert.deepEqual(selectOptionValues(root, operator), [
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'isTrue',
      'isFalse',
      'exists',
    ]);
    // THE LABELS ARE THE `<option>` TEXT, VERBATIM: a comparison operator renders as
    // `symbol · label` and a valueless one as its label alone, which is the join the template
    // performed inline before the conversion moved it into a derived option list.
    assert.deepEqual(selectOptionLabels(root, operator), [
      '= · equals',
      '≠ · not equals',
      '> · greater than',
      '≥ · at least',
      '< · less than',
      '≤ · at most',
      'is true',
      'is false',
      'exists',
    ]);
    closeSelectPanel(root, operator);

    // THE NAME IS UNCHANGED and reached a different way. The wrapper was a `<Field as="label">`
    // whose containment named the control by its `visually-hidden` caption; it is `as="div"` now
    // and the caption is POINTED at. The caption stays hidden rather than adopting the
    // primitive's visible `label=` form, because this row already carries a "Condition" heading.
    assert.equal(assertSelectHasResolvedName(root, operator), 'Operator');
    assert.ok(
      root
        .querySelector(operator)
        .closest('.manager-prerequisite-operator')
        .querySelector('span.visually-hidden'),
      'and the caption is still the hidden one, so no new copy appears on the row'
    );
    assert.ok(
      !root.querySelector(operator).closest('label'),
      'no `<label>` survives around the trigger: a caption click on one could never close the ' +
        'list it opened'
    );
  });

  it('routes an operator change through the caller’s own typed value, and hides the value field', async () => {
    const updates = [];
    const root = await harness.mount({
      library: PREREQUISITES,
      onUpdate: (id, patch) => updates.push([id, patch]),
    });
    const row = root.querySelector('[data-world-character-prerequisite="pre-trained"]');
    row.querySelector('[data-toggle-prerequisite]').dispatchEvent(clickEvent());
    await flushRender();

    const operator =
      '[data-world-character-prerequisite="pre-trained"] [data-prerequisite-operator]';
    assert.ok(
      row.querySelector('[data-prerequisite-value]'),
      'a comparison operator takes a value'
    );

    chooseSelectOption(root, operator, 'isTrue');
    await flushRender();
    assert.deepEqual(updates, [['pre-trained', { op: 'isTrue' }]]);
  });

  it('gives every row’s operator control its OWN caption to point at', async () => {
    // A single component-level caption id would name every row in the library the same way, and
    // nothing in the primitive reports that: it was given a name prop, so it does not warn, and
    // the resolved name would be correct on every row while pointing every trigger at the first.
    const root = await harness.mount({ library: PREREQUISITES, onUpdate: () => {} });
    // ONE ROW AT A TIME, which is the card's own accordion contract: opening the second closes
    // the first, so each pointer is read while its row is the open one rather than from a tree
    // holding both.
    const pointers = [];
    for (const id of ['pre-trained', 'pre-open']) {
      root
        .querySelector(`[data-world-character-prerequisite="${id}"] [data-toggle-prerequisite]`)
        .dispatchEvent(clickEvent());
      await flushRender();
      pointers.push(
        root
          .querySelector(`[data-world-character-prerequisite="${id}"] [data-prerequisite-operator]`)
          ?.getAttribute('aria-labelledby')
      );
    }
    assert.ok(pointers.every(Boolean), 'both rows point at a caption');
    assert.notEqual(pointers[0], pointers[1], 'and at DIFFERENT captions, one per row');
  });
});
