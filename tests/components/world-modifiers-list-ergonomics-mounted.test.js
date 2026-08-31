import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { assertNoElement } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * World > Rules & Resources > Modifiers, mounted on its own.
 *
 * This is the modifier half of the settings-list ergonomics contract (issue 768) plus the
 * whole issue 1096 editor round. Both used to be asserted through a `SystemEditView` mount in
 * `system-edit-list-ergonomics-mounted`, because that page rendered the modifier list, the
 * character-prerequisite list and the coin ladder together. Issue 1278 took the ladder out to
 * `world-currency-list-ergonomics-mounted`; issue 1311 takes these two out the same way, so
 * this suite and its `world-prerequisites-list-ergonomics-mounted` sibling replace that file
 * rather than mounting three components from one.
 *
 * Two things did NOT come across, and their absence is asserted here rather than left implied:
 *
 * - The whole-section collapse. `WorldModifiersTab` is a route, not one card among siblings,
 *   so there is nothing for a collapse to make room for and the control is gone from the
 *   product. The guard below is the currency page's, restated for this list.
 * - The end-to-end cross-copy. The page hands the RAW entry up and stops; the destination add,
 *   the navigation and the copy announcement are the manager root's, because the destination
 *   is a sibling route. What is asserted here is the handoff. The round trip belongs to
 *   `manager-mounted`.
 */
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-modifiers-ergonomics-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/components/stepperLabels.js',
    // The expression suggestion chips' derivation (issue 1096) and the per-Foundry-system
    // preset bundle it reads.
    'src/config/modifierExpressionSuggestions.js',
    'src/config/gatheringCharacterModifierPresets.js',
    // The unified modifier library's bounds pair and roll classification (issue 1117), and
    // the closure the resolver drags behind it.
    'src/systems/characterLibraries.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/salvageCheckUsability.js',
    'src/systems/toolCheckBonus.js',
    'src/utils/checkModifierPicks.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/rollExpressionAverage.js',
    // `RollDataExpressionInput` reads the shared `@`-sigil helpers from the copy module.
    'src/systems/characterModifierPrerequisiteCopy.js',
    'src/systems/characterPrerequisites.js',
  ],
  compiledModules: [
    // A `.svelte` the tree renders but the harness omits HANGS the suite (# cancelled) rather
    // than failing it, so every one is named.
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/world/WorldModifiersTab.svelte',
});

function flushRender() {
  return new Promise((resolveTick) => setTimeout(resolveTick, 0));
}

function clickEvent() {
  return new globalThis.window.Event('click', { bubbles: true });
}

function inputEvent() {
  return new globalThis.window.Event('input', { bubbles: true });
}

const MODIFIERS = Object.freeze([
  {
    id: 'mod-herbalism',
    label: 'Herbalism',
    icon: 'fa-solid fa-leaf',
    expression: '@skills.nature.value',
  },
  { id: 'mod-lore', label: 'Lore', icon: 'fa-solid fa-book', expression: '@skills.lore.value' },
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

describe('world modifiers list ergonomics (mounted, issue 768)', () => {
  it('renders a compact summary row (label + the inline expression, verbatim) that is collapsed by default', async () => {
    const root = await harness.mount({ library: MODIFIERS });

    const row = root.querySelector('[data-world-modifier="mod-herbalism"]');
    assert.ok(row, 'modifier row exists');

    // Collapsed by default: a summary toggle, no editor body.
    const summary = row.querySelector('[data-toggle-modifier]');
    assert.ok(summary, 'the row renders an accordion summary toggle');
    assert.equal(summary.getAttribute('aria-expanded'), 'false', 'starts collapsed');
    assert.ok(!row.querySelector('.manager-modifier-body'), 'no editor body when collapsed');

    // The label and the inline expression render on the summary, VERBATIM. The row used to
    // strip the leading @, which agreed with an editor that drew the sigil as its own cap; the
    // field is a plain input now (maintainer ruling, issue 1096) and the GM types the @
    // themselves, so a list that hid it would show a value nobody wrote.
    assert.ok(
      row.querySelector('.manager-modifier-label').textContent.includes('Herbalism'),
      'label shows'
    );
    const expression = row.querySelector('[data-modifier-expression]');
    assert.ok(expression, 'the expression renders inline on the summary');
    assert.ok(
      expression.textContent.includes('@skills.nature.value'),
      'the stored expression reads back exactly, sigil included'
    );
  });

  it('expands to the IconPicker editor on the summary toggle', async () => {
    const root = await harness.mount({ library: MODIFIERS });

    const row = root.querySelector('[data-world-modifier="mod-herbalism"]');
    const summary = row.querySelector('[data-toggle-modifier]');
    summary.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(summary.getAttribute('aria-expanded'), 'true', 'summary toggles open');
    assert.ok(row.querySelector('.manager-modifier-body'), 'the editor body opens');
    const trigger = row.querySelector('.essence-icon-picker-trigger');
    assert.ok(trigger, 'the modifier editor renders an IconPicker trigger, not a bare text input');
    // The expression field is `RollDataExpressionInput` with `sigil={false}` (maintainer
    // ruling, issue 1096): a PLAIN input over the stored value. The `@` cap was written when an
    // expression was always a roll-data path, and dice retired that premise — a cap that
    // prepends `@` to whatever is typed turns `1d4` into `@1d4`, and the adaptive cap that
    // shipped restructures the field as the GM types. Both halves are asserted, because
    // "shows the value" and "draws no cap" are different claims and dropping either would
    // leave half the ruling unguarded.
    const expressionInput = row.querySelector('[data-world-modifier-field="expression"]');
    assert.ok(expressionInput, 'the editor exposes the expression field');
    assert.equal(
      expressionInput.value,
      '@skills.nature.value',
      'the input holds the stored expression byte for byte, sigil included'
    );
    assert.ok(
      !row.querySelector('.manager-prerequisite-at'),
      'and nothing supplies the @ for the GM any more — the placeholder and hint teach it'
    );
  });

  it('carries NO whole-section collapse, because collapsing a whole route only blanks it', async () => {
    // On the Settings tab the chevron yielded space to the sibling cards below it — the
    // prerequisite list and the coin ladder. As a route there is nothing to make room for, so
    // the same control would hide the page and leave a bare header row. This is the assertion
    // that replaced `system-edit-list-ergonomics`' "collapses a whole section on its header
    // toggle": the behaviour is gone from the product, not merely moved.
    const root = await harness.mount({ library: MODIFIERS });

    assertNoElement(
      root,
      '[data-section-collapse="modifiers"]',
      'the collapse chevron does not belong on a route that has no siblings'
    );
    assert.ok(
      root.querySelector('#manager-section-body-modifiers'),
      'and the body it used to hide renders unconditionally'
    );
  });

  it('hands the RAW modifier up on Copy to prerequisites, and completes nothing itself', async () => {
    // The whole point of the split. Across two sibling routes a copy is a NAVIGATION, which a
    // page component cannot perform, so this page's entire contribution is the handoff: no
    // destination write, no route change, no announcement. The round trip — mapping, add,
    // navigate, open — is the manager root's and is asserted there.
    const copied = [];
    const root = await harness.mount({
      library: MODIFIERS,
      onCopyToPrerequisite: (entry) => {
        copied.push(entry);
      },
    });

    const copyButton = root.querySelector('[data-copy-to-prerequisite="mod-herbalism"]');
    assert.ok(copyButton, 'the modifier row has a Copy to prerequisites button');
    copyButton.dispatchEvent(clickEvent());
    await flushRender();

    assert.equal(copied.length, 1, 'the callback fired once');
    assert.equal(copied[0].id, 'mod-herbalism', 'with the entry the GM clicked');
    assert.equal(copied[0].label, 'Herbalism', 'unmapped and unmodified — the RAW entry');
    assert.equal(copied[0].expression, '@skills.nature.value');
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
      library: MODIFIERS,
      requestOpenId: 'mod-lore',
      requestOpenNonce: 1,
    });
    await flushRender();

    const row = root.querySelector('[data-world-modifier="mod-lore"]');
    assert.ok(row.querySelector('[data-world-modifier-editor="mod-lore"]'), 'the row opens');
    assert.ok(scrollCalls.includes(row), 'and is scrolled into view — a copy lands below the fold');
    assert.ok(
      row.contains(globalThis.window.document.activeElement),
      'focus moves into the newly-opened editor'
    );

    // The GM closes it, then the same id is requested again.
    row.querySelector('[data-toggle-modifier]').dispatchEvent(clickEvent());
    await flushRender();
    assertNoElement(row, '[data-world-modifier-editor="mod-lore"]', 'the editor closes');

    await harness.setProps({ requestOpenId: 'mod-lore', requestOpenNonce: 2 });
    await flushRender();
    assert.ok(
      root
        .querySelector('[data-world-modifier="mod-lore"]')
        .querySelector('[data-world-modifier-editor="mod-lore"]'),
      'a bumped nonce re-opens the SAME id'
    );
  });

  it('reorders a modifier via the Move up/down chevrons (op fires with indices, disabled at the ends)', async () => {
    const calls = [];
    const root = await harness.mount({
      library: MODIFIERS,
      onReorder: async (fromIndex, toIndex) => {
        calls.push([fromIndex, toIndex]);
      },
    });

    // First row: Move up disabled, Move down enabled.
    const firstUp = root.querySelector('[data-move-modifier-up="mod-herbalism"]');
    const firstDown = root.querySelector('[data-move-modifier-down="mod-herbalism"]');
    assert.ok(firstUp && firstDown, 'the first modifier row has both chevrons');
    assert.equal(firstUp.disabled, true, 'Move up is disabled on the first row');
    assert.equal(firstDown.disabled, false, 'Move down is enabled on the first row');

    // Last row: Move down disabled.
    const lastDown = root.querySelector('[data-move-modifier-down="mod-lore"]');
    assert.equal(lastDown.disabled, true, 'Move down is disabled on the last row');

    firstDown.dispatchEvent(clickEvent());
    await flushRender();
    assert.deepEqual(calls, [[0, 1]], 'Move down fires the reorder op with (index, index+1)');

    // The move announces its new position through the page's OWN polite region. It used to be
    // the Settings tab's, shared with two other lists; each route owns one now.
    const announcement = root.querySelector('[data-list-reorder-announcement]');
    assert.ok(announcement, 'the page renders a polite live region');
    assert.ok(announcement.textContent.includes('Herbalism'), 'a reorder is announced by name');
    assert.match(
      announcement.textContent,
      /2/,
      'and states the new position, which is the fact the reflow hides from a non-sighted GM'
    );
  });

  it('renders the library with no crafting system in hand and no feature flag', async () => {
    // ISSUE 1117 INVERTED THE OLD TEST and issue 1311 finished the job. The list used to be
    // gathering-scoped and vanish with the feature; the library now carries every CHECK
    // modifier too, so gating the only authoring surface on an unrelated flag would make a
    // crafting or salvage check modifier unauthorable. As a World route the page takes no
    // system and no flag AT ALL, which is the strongest form of that guarantee.
    const root = await harness.mount({ library: MODIFIERS });

    assert.ok(root.querySelector('[data-world-modifiers-page]'), 'the page root renders');
    assert.ok(root.querySelector('[data-world-modifiers]'), 'the modifiers card renders');
    assert.ok(root.querySelector('[data-world-modifier="mod-herbalism"]'), 'and its rows');
    assert.ok(
      root.querySelectorAll('[data-copy-to-prerequisite]').length === MODIFIERS.length,
      'every row offers the cross-copy, on every world'
    );
  });

  it('renders an empty state instead of a bare card when no modifiers are authored yet', async () => {
    const root = await harness.mount({ library: [] });

    assert.ok(root.querySelector('[data-world-modifiers]'), 'the card is still the page');
    assertNoElement(root, '[data-world-modifier]', 'no rows render for an empty library');
    assert.ok(root.querySelector('.manager-empty'), 'the shared no-state primitive fills it');
  });

  // The bounds pair and the roll-shaped-expression warning are the two fields the library
  // absorbed from the retired Checks-tab editor (issue 1117). Neither has any other home, so a
  // mount is the only place they can be pinned.
  it('authors the min/max bounds and warns about a roll-shaped expression', async () => {
    const root = await harness.mount({
      library: [
        {
          id: 'mod-flat',
          label: 'Flat',
          icon: 'fa-solid fa-a',
          expression: '@skills.nature.value',
          min: -1,
          max: 5,
        },
        { id: 'mod-roll', label: 'Rolled', icon: 'fa-solid fa-b', expression: '1d6' },
      ],
    });

    const flat = root.querySelector('[data-world-modifier="mod-flat"]');
    flat.querySelector('[data-toggle-modifier]').dispatchEvent(clickEvent());
    await flushRender();
    const min = flat.querySelector('[data-world-modifier-field="min"]');
    const max = flat.querySelector('[data-world-modifier-field="max"]');
    assert.ok(min && max, 'both bounds are authorable');
    assert.equal(min.value, '-1', 'a stored bound renders as its value, not as a blank');
    assert.equal(max.value, '5');
    assert.ok(
      !flat.querySelector('[data-world-modifier-roll-note="mod-flat"]'),
      'a flat expression raises no roll warning'
    );

    const rolled = root.querySelector('[data-world-modifier="mod-roll"]');
    rolled.querySelector('[data-toggle-modifier]').dispatchEvent(clickEvent());
    await flushRender();
    assert.ok(
      Boolean(rolled.querySelector('[data-world-modifier-roll-note="mod-roll"]')),
      'a roll-shaped expression says so where it is authored, not only in Validation'
    );
  });

  // An inverted or unrollable pair makes the entry contribute nothing, and the row says so
  // while COLLAPSED — a fault only visible inside an open editor is a fault a GM scanning the
  // list cannot see.
  it('flags a blocking bounds fault on the collapsed row, naming the cause', async () => {
    const root = await harness.mount({
      library: [
        {
          id: 'mod-inv',
          label: 'Inverted',
          icon: 'fa-solid fa-a',
          expression: '@a',
          min: 5,
          max: -1,
        },
        { id: 'mod-huge', label: 'Huge', icon: 'fa-solid fa-b', expression: '@b', min: 1e21 },
        { id: 'mod-ok', label: 'Fine', icon: 'fa-solid fa-c', expression: '@c' },
      ],
    });

    const inverted = root.querySelector('[data-world-modifier-bounds-invalid="mod-inv"]');
    assert.ok(inverted, 'an inverted pair is called out where the GM authored it');
    assert.equal(inverted.getAttribute('data-world-modifier-bounds-cause'), 'inverted');
    assert.match(inverted.textContent.trim(), /minimum is above its maximum/i);

    const huge = root.querySelector('[data-world-modifier-bounds-invalid="mod-huge"]');
    assert.ok(huge, 'so is a bound the dice grammar cannot express');
    assert.equal(
      huge.getAttribute('data-world-modifier-bounds-cause'),
      'unsafe',
      'a DIFFERENT cause: "too large to appear in a roll" is not "min above max"'
    );
    assertNoElement(
      root,
      '[data-world-modifier-bounds-invalid="mod-ok"]',
      'a well-formed entry gets no note'
    );
  });
});

// ── Issue 1096, maintainer round ──────────────────────────────────────────────────────────
// Three reported defects in this card, all of them only visible on screen until now.
describe('modifier editor treatment and layout (mounted, issue 1096)', () => {
  const BOUNDED = Object.freeze([
    {
      id: 'mod-flat',
      label: 'Flat',
      icon: 'fa-solid fa-a',
      expression: '@abilities.wis.mod',
      min: -1,
      max: 5,
    },
  ]);

  async function openEditor(props = {}) {
    const root = await harness.mount({ library: BOUNDED, ...props });
    const row = root.querySelector('[data-world-modifier="mod-flat"]');
    row.querySelector('[data-toggle-modifier]').dispatchEvent(clickEvent());
    await flushRender();
    return { root, row };
  }

  // DEFECT 1. `Delete modifier` and `Done` shipped a BARE `manager-button`: the destructive
  // verb was painted as a neutral one, while the identical verb in the Tool Studio is danger.
  // The roles now come from the shared primitive, so the class is emitted from ONE place
  // instead of remembered at each call site.
  it('gives Delete the danger role and Done the ghost role, through the shared primitive', async () => {
    const { row } = await openEditor();

    const del = row.querySelector('[data-world-modifier-delete="mod-flat"]');
    const done = row.querySelector('[data-world-modifier-done="mod-flat"]');
    assert.ok(del && done, 'the open editor renders both verbs');

    assert.ok(del.classList.contains('is-danger'), 'deleting a modifier is a DESTRUCTIVE action');
    assert.ok(!done.classList.contains('is-danger'), 'and Done is not');
    assert.ok(
      done.classList.contains('is-ghost'),
      'Done is the quiet verb, as Back is in the Tool Studio'
    );

    // Both go through `ManagerButton`, which is what stops the pair drifting apart again: the
    // primitive's own class is present on each.
    for (const [name, button] of [
      ['Delete modifier', del],
      ['Done', done],
    ]) {
      assert.ok(
        button.classList.contains('manager-button') &&
          button.classList.contains('fab-manager-button'),
        `${name} renders through the shared primitive, not a hand-written class string`
      );
      assert.equal(button.getAttribute('type'), 'button', `${name} never submits`);
    }
  });

  it('routes the card’s header verbs through the primitive too, keeping Add primary and Seed presets quiet', async () => {
    const root = await harness.mount({ library: BOUNDED });
    // Scoped to the Modifiers card: the prerequisites and currency cards reuse the same
    // header-actions class, and this change converted only this one.
    const actions = [
      ...root.querySelectorAll(
        ':scope [data-world-modifiers] .manager-character-modifier-card-header-actions .manager-button'
      ),
    ];

    assert.equal(actions.length, 2, 'Add modifier and Seed presets');
    assert.ok(
      actions.every((button) => button.classList.contains('fab-manager-button')),
      'both header verbs are the shared primitive'
    );
    assert.ok(actions[0].classList.contains('is-primary'), 'Add modifier stays the loud verb');
    assert.ok(
      !actions[1].classList.contains('is-primary') && !actions[1].classList.contains('is-danger'),
      'Seed presets stays deliberately neutral — this change fixes the roles that were MISSING, not the quiet ones'
    );
  });

  // DEFECT 2. Icon, label, minimum and maximum on ONE line, ahead of the expression. The ORDER
  // is the assertion, not the presence: every one of these elements existed before, just
  // stacked into three rows.
  it('puts icon, label, minimum and maximum on one line, before the expression', async () => {
    const { row } = await openEditor();

    const nameRow = row.querySelector('.manager-modifier-name-row');
    assert.ok(nameRow, 'the editor still has its top row');
    assert.ok(
      Boolean(nameRow.querySelector('.manager-modifier-icon-field')),
      'the icon is on that row'
    );
    assert.ok(
      Boolean(nameRow.querySelector('[data-world-modifier-field="label"]')),
      'so is the label'
    );
    const bounds = nameRow.querySelector('[data-world-modifier-bounds="mod-flat"]');
    assert.ok(bounds, 'and so is the bounds pair, which used to sit on its own row below');
    assert.ok(
      Boolean(bounds.querySelector('[data-world-modifier-field="min"]')) &&
        Boolean(bounds.querySelector('[data-world-modifier-field="max"]')),
      'both bounds ride that one wrapper, so they wrap together'
    );

    // The expression comes AFTER the row, in document order.
    const expression = row.querySelector('[data-world-modifier-field="expression"]');
    assert.ok(expression, 'the expression field is still rendered');
    assert.ok(
      Boolean(
        nameRow.compareDocumentPosition(expression) &
        globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      'the expression is BELOW the four short fields, not above them'
    );
    assert.ok(
      !nameRow.contains(expression),
      'and it is not squeezed onto the same line as its three neighbours'
    );

    // The bounds hint explains the BOUNDS ("empty is not zero"), so it reads directly under
    // them. Below the expression and its suggestion chips it attached itself to the one field
    // it says nothing about.
    const hint = row.querySelector('.manager-modifier-bounds-hint');
    assert.ok(hint, 'the hint is still rendered');
    assert.ok(
      Boolean(
        hint.compareDocumentPosition(expression) &
        globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      'the bounds hint sits above the expression, beside the bounds it describes'
    );
  });

  it('keeps the bounds absence-preserving and the Unbounded placeholder after the move', async () => {
    const patches = [];
    const root = await harness.mount({
      library: [{ id: 'mod-open', label: 'Open', icon: 'fa-solid fa-a', expression: '@a' }],
      onUpdate: async (id, patch) => {
        patches.push([id, patch]);
      },
    });
    const row = root.querySelector('[data-world-modifier="mod-open"]');
    row.querySelector('[data-toggle-modifier]').dispatchEvent(clickEvent());
    await flushRender();

    const min = row.querySelector('[data-world-modifier-field="min"]');
    assert.equal(min.value, '', 'an unbounded bound stays EMPTY — empty is not zero');
    assert.equal(min.getAttribute('placeholder'), 'Unbounded', 'the placeholder survives the move');

    min.value = '3';
    min.dispatchEvent(inputEvent());
    await flushRender();
    assert.deepEqual(patches, [['mod-open', { min: 3 }]], 'the stepper still patches its own key');
  });

  it('still renders the bounds fault surface when the pair is inverted', async () => {
    const root = await harness.mount({
      library: [
        {
          id: 'mod-inv',
          label: 'Inverted',
          icon: 'fa-solid fa-a',
          expression: '@a',
          min: 5,
          max: -1,
        },
      ],
    });
    const note = root.querySelector(
      '.manager-modifier-bounds-error[data-world-modifier-bounds-invalid="mod-inv"]'
    );
    assert.ok(note, 'the error surface is not a casualty of the relayout');
  });

  // DEFECT 3. Roll-data suggestion chips under the expression, which APPEND.
  it('offers roll-data suggestion chips under the expression, derived from the active world', async () => {
    const { row } = await openEditor({ foundrySystemId: 'dnd5e' });

    const chips = [...row.querySelectorAll('[data-world-modifier-suggestion]')];
    assert.ok(chips.length > 0, 'the expression carries a suggestion row');
    const terms = chips.map((chip) => chip.textContent.trim());
    assert.ok(terms.includes('@abilities.wis.mod'), 'a dnd5e world is offered dnd5e roll data');
    assert.ok(terms.includes('1d4'), 'and the system-agnostic terms beside it');

    const suggestions = row.querySelector('[data-world-modifier-suggestions="mod-flat"]');
    const expression = row.querySelector('[data-world-modifier-field="expression"]');
    assert.ok(
      Boolean(
        expression.compareDocumentPosition(suggestions) &
        globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
      'the chips sit UNDER the field they fill in'
    );
  });

  it('offers the pf2e paths in a pf2e world, so the row is not one hard-coded list', async () => {
    const { row } = await openEditor({ foundrySystemId: 'pf2e' });
    const terms = [...row.querySelectorAll('[data-world-modifier-suggestion]')].map((chip) =>
      chip.textContent.trim()
    );
    assert.ok(
      terms.includes('@actor.system.abilities.wis.mod'),
      'the pf2e wisdom path, which is a different string from the dnd5e one'
    );
    assert.ok(!terms.includes('@abilities.wis.mod'), 'and never the dnd5e one');
  });

  it('APPENDS a clicked suggestion to the expression rather than replacing it', async () => {
    const patches = [];
    const { row } = await openEditor({
      foundrySystemId: 'dnd5e',
      onUpdate: async (id, patch) => {
        patches.push([id, patch]);
      },
    });

    const die = [...row.querySelectorAll('[data-world-modifier-suggestion]')].find(
      (chip) => chip.textContent.trim() === '1d4'
    );
    assert.ok(die, 'the 1d4 chip is present');
    die.dispatchEvent(clickEvent());
    await flushRender();

    assert.deepEqual(
      patches,
      [['mod-flat', { expression: '@abilities.wis.mod + 1d4' }]],
      'the authored expression is EXTENDED — a chip that replaced it would destroy the GM’s work'
    );
  });

  // NO RE-PREPENDING (maintainer ruling, issue 1096). This is the half of the ruling no
  // rendered assertion can reach: the field used to re-add `@` to a bare roll-data path on
  // every keystroke, so a GM who typed `abilities.str.mod` got `@abilities.str.mod` stored.
  // What is typed is now what is stored, which is exactly why the placeholder and the hint
  // beside the field have to teach the sigil — and why they are asserted here too, so the
  // requirement and the thing that teaches it cannot drift apart.
  it('stores the expression exactly as typed, adding no sigil of its own', async () => {
    const patches = [];
    const { row } = await openEditor({
      foundrySystemId: 'dnd5e',
      onUpdate: async (id, patch) => {
        patches.push([id, patch]);
      },
    });

    const expression = row.querySelector('[data-world-modifier-field="expression"]');
    expression.value = 'abilities.str.mod';
    expression.dispatchEvent(inputEvent());
    await flushRender();

    assert.deepEqual(
      patches,
      [['mod-flat', { expression: 'abilities.str.mod' }]],
      'a bare path is stored bare: the control supplies nothing, so `1d4` cannot become `@1d4`'
    );
    assert.equal(
      expression.getAttribute('placeholder'),
      '@abilities.med.mod',
      'and the placeholder models an expression that would actually resolve'
    );
    const hint = row.querySelector('[data-world-modifier-expression-hint]');
    assert.ok(Boolean(hint), 'the field states the requirement it no longer meets for the GM');
    assert.match(hint.textContent, /leading @/, 'and says which character that is');
  });

  it('leaves focus and the caret at the end of the expression field after a chip', async () => {
    const { row } = await openEditor({ foundrySystemId: 'dnd5e' });
    const expression = row.querySelector('[data-world-modifier-field="expression"]');

    const chip = row.querySelector('[data-world-modifier-suggestion]');
    chip.dispatchEvent(clickEvent());
    await flushRender();

    // A BOOLEAN, never `assert.equal(activeElement, expression)`: on failure node:assert
    // serialises both mounted elements to build its diff and walks happy-dom's circular tree
    // until the heap dies, which surfaces as a hung `# cancelled` suite with no message.
    assert.ok(
      globalThis.window.document.activeElement === expression,
      'the field the chip filled in takes focus, so the next keystroke continues the expression'
    );
    assert.equal(
      expression.selectionStart,
      expression.value.length,
      'and the caret is at the end rather than wherever it happened to be'
    );
  });
});
