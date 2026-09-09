/**
 * Issue 651 — the salvage GM surface in `ComponentEditView`.
 *
 * The reorder-permission toggle card, and the two traps that make a control here
 * silently useless (F4):
 *
 *  1. `salvageSignature()` is the allowlist driving `isDirty()`. A field it does not
 *     see never marks the editor dirty, so SAVE NEVER ENABLES and the GM's toggle is
 *     discarded on exit — with persistence working perfectly the whole time.
 *  2. `cloneSalvage(null)` spreads `{}`, so without a default the switch renders OFF
 *     against a default-on spec.
 *
 * Plus D3's non-severable condition: ordinals + a read-only difficulty badge on the
 * progressive salvage result list, so the card governs something the GM can see.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_EDIT_VIEW_COMPILED_MODULES,
  COMPONENT_EDIT_VIEW_RAW_MODULES,
} from '../helpers/componentEditViewModules.js';

function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-edit-salvage-',
  rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
  // SPREAD rather than passed by name (issue 1040). `mounted-harness-primitive-allowlist`
  // resolves a shared list only through a `compiledModules: [ … ]` region, so the bare
  // identifier made this harness read as compiling NOTHING and every primitive it needs
  // passed vacuously.
  compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

// ToggleCard mounted directly, to constrain the two props that exist ONLY for issue 658's
// retrofit. Neither call site passes them today, so without this they would be unverified
// forward-compatibility seams — present, but not proven to emit anything.
const cardHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-toggle-card-',
  rawModules: [],
  compiledModules: [
    // `ToggleCard` composes the shared switch (issue 1040), so this second harness needs it
    // too — omitting it HANGS this suite as `# cancelled` rather than failing it.
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ToggleCard.svelte',
  ],
  componentPath: 'src/ui/svelte/components/ToggleCard.svelte',
});

const COMPONENT_OPTIONS = [
  { id: 'cmp-scrap', name: 'Scrap Metal', img: 'icons/svg/item-bag.svg', difficulty: 4 },
  { id: 'cmp-dust', name: 'Dust', img: 'icons/svg/item-bag.svg', difficulty: 9 },
  // A component that has never been given a difficulty.
  { id: 'cmp-unset', name: 'Unset', img: 'icons/svg/item-bag.svg' },
];

const RESULT_GROUPS = [
  {
    id: 'grp-1',
    name: 'Scraps',
    results: [
      { id: 'res-1', componentId: 'cmp-scrap', quantity: 1 },
      { id: 'res-2', componentId: 'cmp-dust', quantity: 1 },
    ],
  },
];

function props(overrides = {}) {
  const { component, ...rest } = overrides;
  return {
    component: {
      id: 'comp-1',
      name: 'Dragon Scale',
      img: 'icons/svg/item-bag.svg',
      salvage: { enabled: true, resultGroups: RESULT_GROUPS },
      ...component,
    },
    componentOptions: COMPONENT_OPTIONS,
    showSalvage: true,
    salvageResolutionMode: 'progressive',
    ...rest,
  };
}

const card = (target) => target.querySelector('[data-recipe-section="salvage-allow-player-result-reorder"]');
const toggle = (target) => card(target).querySelector('[data-recipe-field="salvageAllowPlayerResultReorder"]');
// The Save button lives in the PARENT's header, gated on the dirty state this view
// emits. `onDirtyChange(true)` is therefore literally what enables Save, and
// `onDraftChange`'s summary carries the `updates` payload the parent persists.
function trackDirty(overrides = {}) {
  const dirtyEvents = [];
  const drafts = [];
  return {
    dirtyEvents,
    drafts,
    props: props({
      onDirtyChange: (dirty) => dirtyEvents.push(dirty),
      onDraftChange: (summary) => drafts.push(summary),
      ...overrides,
    }),
  };
}

describe('ToggleCard — the issue-658 retrofit seams (D9)', () => {
  before(() => cardHarness.setup());
  after(() => cardHarness.teardown());

  const mountCard = (overrides = {}) =>
    cardHarness.mount({ title: 'Enabled', sub: 'Craftable by players', on: true, ...overrides });

  it('toggleTitle emits a tooltip on the SWITCH, not on the card', async () => {
    // The Overview Enabled card's conditional tooltip is the only explanation a GM gets
    // for a validation-disabled switch. Named `toggleTitle` because `title` is already
    // the card heading — a collision the retrofit would otherwise hit.
    const target = await mountCard({ toggleTitle: 'Resolve the issues on the Validation tab.', disabled: true });
    const button = target.querySelector('button.manager-status-toggle');
    assert.equal(button.getAttribute('title'), 'Resolve the issues on the Validation tab.');
    assert.equal(button.disabled, true);
    assert.equal(
      target.querySelector('.manager-recipe-status-card').getAttribute('title'),
      null,
      'the tooltip lands on the control, not the card'
    );
    cardHarness.remount();
  });

  it('an empty toggleTitle emits NO title attribute', async () => {
    const target = await mountCard();
    assert.equal(target.querySelector('button.manager-status-toggle').hasAttribute('title'), false);
    cardHarness.remount();
  });

  it('subAttr emits the sub-line hook the Locked card needs', async () => {
    // Mirrors `data-recipe-locked-state` on the Overview Locked card.
    const target = await mountCard({ subAttr: 'data-recipe-locked-state' });
    assert.ok(
      target.querySelector('.manager-recipe-status-sub[data-recipe-locked-state]'),
      'the hook lands on the sub-line'
    );
    cardHarness.remount();
  });

  it('an unset subAttr adds no stray attribute', async () => {
    const target = await mountCard();
    const sub = target.querySelector('.manager-recipe-status-sub');
    assert.deepEqual(
      [...sub.attributes].map((a) => a.name).sort(),
      ['class'],
      'the sub-line carries only its class'
    );
    cardHarness.remount();
  });

  /*
   * THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE STATUS CARD'S RENDERED ROOT (issue 1509).
   *
   * Every other guard on this family reads SOURCE TEXT: the area-scope gate reads the component's
   * `` class={`…`} `` template, the sheet census reads the selectors, the fixture clauses read
   * strings in `tests/`. All of them are satisfied by a component that WRITES
   * `fabricate-toggle-card` in that template and stops rendering it on its root element -- at
   * which point every one of the ten re-rooted rules in `styles/fabricate.css` matches nothing
   * and the card draws as an unstyled div in every host, the manager included.
   *
   * THIS suite rather than one of the other seven callers', because this is the one that mounts
   * `ToggleCard` DIRECTLY, so the reading is of the primitive's own output and not of a caller's.
   */
  it('writes `fabricate-toggle-card` first on its root div, ahead of its own card class', async () => {
    const target = await mountCard({ variant: 'is-enabled' });
    const card_ = target.querySelector('.manager-recipe-status-card');
    assert.ok(Boolean(card_), 'the primitive must render its root at all');
    assert.equal(card_.tagName.toLowerCase(), 'div');
    assert.equal(
      card_.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-toggle-card manager-recipe-status-card is-enabled is-on',
      'the root must carry the primitive`s own namespace class FIRST -- every re-rooted rule in ' +
        '`styles/fabricate.css` names it as the leading compound -- then the card`s own class, ' +
        'then the caller`s variant, then the on/off state'
    );
    cardHarness.remount();
  });

  it('writes it on the ROOT div and not on the copy column inside it', async () => {
    // THE MUTATION CONTROL'S TARGET, stated as an assertion so the control has something to flip.
    // Moving the `fabricate-toggle-card` literal off the root template and into the copy column's
    // class leaves it in the markup, so it stays in the area-scope gate's `written` set and
    // `rootless`, `gated` and the emission clause all stay green. Only a reading of WHICH element
    // carries it can see that move -- and it is the difference between a root that is an ancestor
    // of the glyph, the copy and both lines and one that is a sibling of the glyph.
    const target = await mountCard();
    const copy = target.querySelector('.manager-recipe-status-copy');
    assert.ok(Boolean(copy), 'the copy column must render, or this control has no subject');
    assert.ok(
      !copy.classList.contains('fabricate-toggle-card'),
      'the copy column carries the family root, which belongs on the card`s own root div: every ' +
        'rule in the sheet roots at it as an ancestor of this column, so a root here matches ' +
        'nothing the column contains'
    );
    assert.ok(
      Boolean(copy.closest('.fabricate-toggle-card')),
      'and the column must still sit UNDER the root, which is the relationship the sheet encodes'
    );
    cardHarness.remount();
  });

  it('the switch it COMPOSES keeps its own root and takes none of this family`s', async () => {
    // The card owns the glyph, the copy and the state class; `StatusToggle` owns the track, the
    // knob and the reading. Both roots are on the page and neither is on the other's element,
    // which is the rendered half of the standing invariant
    // `searchable-popover-area-scope.test.js` asserts over the sheet: no selector may combine
    // this family with `manager-status-toggle*`, because each root is an APPLICATION root by name
    // to the other primitive's entry.
    const target = await mountCard();
    const button = target.querySelector('button.manager-status-toggle');
    assert.ok(Boolean(button), 'the composed switch must render');
    assert.ok(
      button.classList.contains('fabricate-toggle'),
      'the switch keeps `StatusToggle`s own namespace root'
    );
    assert.ok(
      !button.classList.contains('fabricate-toggle-card'),
      'and it must not gain this family`s: a rule reaching the switch from the card`s root is ' +
        'gated on the Toggle entry and has no re-rooting form that satisfies both'
    );
    assert.ok(
      Boolean(button.closest('.fabricate-toggle-card')),
      'while still sitting under the card, which is what makes the two families NESTED rather ' +
        'than co-rooted'
    );
    cardHarness.remount();
  });

  it('the switch carries aria-pressed and no role=switch', async () => {
    const on = await mountCard({ on: true });
    assert.equal(on.querySelector('button.manager-status-toggle').getAttribute('aria-pressed'), 'true');
    cardHarness.remount();
    const off = await mountCard({ on: false });
    const button = off.querySelector('button.manager-status-toggle');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(button.getAttribute('role'), null, 'the repo uses no role=switch anywhere');
    cardHarness.remount();
  });
});

describe('ComponentEditView — salvage reorder permission (issue 651)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('renders the card ON when allowPlayerResultReorder is absent (the cloneSalvage default)', async () => {
    // `cloneSalvage` spreads the source → an absent field stays absent. Without the
    // default the switch renders off against a default-on spec.
    //
    // UPDATED for issue 676: this used to mount `salvage: null`, but `null` now
    // normalizes to salvage DISABLED (decision 6), and the reorder card is part of the
    // chrome Ruling A collapses when salvage is off — so the card no longer exists on
    // that fixture and `card(target).classList` threw on undefined. The fixture now
    // carries an ENABLED salvage with the reorder key absent, which is what this test
    // was always actually about.
    const target = await harness.mount(
      props({ component: { salvage: { enabled: true, resultGroups: RESULT_GROUPS } } })
    );
    assert.ok(card(target), 'the card renders for an enabled salvage config');
    assert.ok(card(target).classList.contains('is-on'), 'absent reads default-true');
    assert.equal(toggle(target).getAttribute('aria-pressed'), 'true');
    harness.remount();
  });

  it('Ruling A: salvage: null collapses the reorder chrome but keeps the group editor', async () => {
    // `salvage: null` normalizes to disabled (decision 6), so the reorder card — which
    // only has meaning once salvage RUNS — collapses. The result-group editor must NOT,
    // because it owns `data-add-salvage-group`, the ONLY add-group control in the
    // codebase. Hide that and enabling salvage becomes impossible forever.
    const target = await harness.mount(props({ component: { salvage: null } }));
    assert.equal(card(target), null, 'the reorder chrome collapses when salvage is off');
    assert.ok(
      target.querySelector('[data-add-salvage-group]'),
      'the add-group control stays reachable while salvage is off'
    );
    harness.remount();
  });

  it('renders the card OFF for an authored false', async () => {
    // Only a `false` fixture can fail — a `true` fixture reads green through a dropped
    // default, because the default re-supplies true.
    const target = await harness.mount(
      props({ component: { salvage: { enabled: true, allowPlayerResultReorder: false, resultGroups: RESULT_GROUPS } } })
    );
    assert.ok(card(target).classList.contains('is-off'));
    assert.equal(toggle(target).getAttribute('aria-pressed'), 'false');
    harness.remount();
  });

  it('F4: toggling the card makes the editor dirty (which is what enables Save)', async () => {
    // THE F4 MUTATION: drop `allowPlayerResultReorder` from `salvageSignatureOf`'s
    // allowlist. Persistence still works and the switch still flips — but nothing is
    // ever dirty, Save never enables, and the GM's toggle is silently discarded.
    const { dirtyEvents, props: mountProps } = trackDirty();
    const target = await harness.mount(mountProps);
    assert.ok(!dirtyEvents.includes(true), 'not dirty before any edit');

    toggle(target).click();
    await flushRender();

    assert.equal(toggle(target).getAttribute('aria-pressed'), 'false', 'the switch flipped');
    assert.equal(dirtyEvents.at(-1), true, 'toggling marks the editor dirty');
    harness.remount();
  });

  it('F4: toggling BACK to the persisted value returns the editor to clean', async () => {
    // The signature is a real comparison against the persisted salvage, not a
    // one-way "something happened" latch.
    const { dirtyEvents, props: mountProps } = trackDirty();
    const target = await harness.mount(mountProps);

    toggle(target).click();
    await flushRender();
    assert.equal(dirtyEvents.at(-1), true);

    toggle(target).click();
    await flushRender();
    assert.equal(dirtyEvents.at(-1), false, 'back to the persisted value is not an edit');
    harness.remount();
  });

  it('F4: the staged updates.salvage carries the field', async () => {
    const { drafts, props: mountProps } = trackDirty();
    const target = await harness.mount(mountProps);

    toggle(target).click();
    await flushRender();

    const updates = drafts.at(-1).updates;
    assert.equal(
      updates.salvage.allowPlayerResultReorder,
      false,
      'the toggled value reaches the payload the parent persists'
    );
    assert.deepEqual(
      updates.salvage.resultGroups,
      RESULT_GROUPS,
      'the unedited salvage fields survive'
    );
    assert.equal(updates.salvage.enabled, true, 'and so do the non-authored ones');
    harness.remount();
  });

  it('the card is progressive-only', async () => {
    for (const mode of ['simple', 'routed']) {
      const target = await harness.mount(props({ salvageResolutionMode: mode }));
      assert.equal(card(target), null, `no card in ${mode} salvage`);
      harness.remount();
    }
  });

  // ── D9: the card must stay a byte-faithful extraction ────────────────────

  it('D9: the card reproduces the Overview status-card element tree', async () => {
    // Issue 658 retrofits the Overview Enabled/Locked cards onto this component, and that
    // is only a no-op DOM diff while the structure matches. If this drifts, the retrofit
    // stops being a no-op and this becomes a third source of truth rather than the second
    // being retired.
    const target = await harness.mount(props());
    const node = card(target);
    assert.ok(node.classList.contains('manager-recipe-status-card'));
    assert.ok(node.querySelector('.manager-recipe-status-icon[aria-hidden="true"]'));
    assert.ok(node.querySelector('.manager-recipe-status-copy > .manager-recipe-status-title'));
    assert.ok(node.querySelector('.manager-recipe-status-copy > .manager-recipe-status-sub'));
    const button = node.querySelector('button.manager-status-toggle');
    assert.ok(button, 'the switch is a plain button');
    assert.equal(button.getAttribute('role'), null, 'aria-pressed is the house pattern, not role=switch');
    assert.ok(
      button.querySelector('.manager-status-toggle-track[aria-hidden="true"] > .manager-status-toggle-knob'),
      'track + knob, both aria-hidden'
    );
  });

  it('D9: an unset toggleTitle emits NO title attribute, not an empty one', async () => {
    // The Overview Enabled card's tooltip is conditional (`... : undefined`), and it is
    // the only explanation a GM gets for why that switch is disabled when validation
    // blocks enabling. `toggleTitle` exists so the retrofit can carry it; the falsy
    // branch must reproduce the `undefined` branch exactly, since an empty string would
    // render a present-but-blank tooltip.
    const target = await harness.mount(props());
    assert.equal(toggle(target).hasAttribute('title'), false);
  });

  // ── D3's condition: ordinals + read-only difficulty badge ────────────────

  it('D3: progressive salvage result rows render ordinals', async () => {
    // Without these the card governs a list whose order the GM cannot see. The badge is
    // `SortableList`'s since issue 1512 — it is the same 22px mono badge on every ordered row in
    // the product now — so it is read by the list's own class rather than by this surface's
    // retired `data-salvage-result-ordinal` hook.
    const target = await harness.mount(props());
    const ordinals = [...target.querySelectorAll('.fabricate-sortable-list-ordinal')];
    assert.deepEqual(
      ordinals.map((node) => node.textContent.trim()),
      ['1', '2'],
      'stages are numbered in authored order'
    );
    harness.remount();
  });

  // ── ISSUE 1512: THE STAGE LIST IS THE SHARED ORDERED ROW ─────────────────────────
  //
  // The salvage stage list had NO coverage of its reorder at all: the chevrons it drew were
  // asserted to exist by the frame gates and by nothing that pressed them, and it had no keyboard
  // path whose focus or announcement anything read. It is `SortableList`'s list now, so the
  // interaction is the primitive's — and this is the one converted site inside a `<form>`, which
  // is a fact about THIS surface rather than about the primitive and is asserted here.

  it('1512: reorders a stage from the rocker, and from the grip with the arrow keys', async () => {
    const target = await harness.mount(props());
    const rows = [...target.querySelectorAll('[data-salvage-result]')];
    assert.equal(rows.length, 2, 'two stages, so a move has somewhere to go');

    rows[1].querySelector('[data-sortable-move="up"]').click();
    flushSync();
    let stages = [...target.querySelectorAll('[data-salvage-result]')].map((row) =>
      row.getAttribute('data-salvage-result')
    );
    assert.deepEqual(stages, ['res-2', 'res-1'], 'the rocker moves the stage it belongs to');

    const grip = target.querySelector('[data-sortable-grip="res-1"]');
    grip.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    flushSync();
    stages = [...target.querySelectorAll('[data-salvage-result]')].map((row) =>
      row.getAttribute('data-salvage-result')
    );
    assert.deepEqual(stages, ['res-1', 'res-2'], 'and the arrow keys move it back');
    harness.remount();
  });

  it('1512: every control the list draws is a `type="button"`, inside the editor`s form', async () => {
    // THE FACT THAT IS THIS SURFACE'S RATHER THAN THE PRIMITIVE'S. The component editor renders a
    // real `<form>`, so a control without an explicit type is a SUBMIT button: a keyboard move
    // would submit the draft rather than reorder a stage.
    const target = await harness.mount(props());
    const form = target.querySelector('form');
    assert.ok(Boolean(form), 'the editor renders a real form, which is what makes this sharp');

    const row = target.querySelector('[data-salvage-result="res-1"]');
    assert.ok(Boolean(row.closest('form')), 'and the stage list is inside it');
    const controls = [
      row.querySelector('[data-sortable-grip]'),
      row.querySelector('[data-sortable-move="up"]'),
      row.querySelector('[data-sortable-move="down"]'),
      row.querySelector('[data-remove-salvage-result]'),
    ];
    assert.ok(controls.every(Boolean), 'the row draws a grip, both chevrons and a remove');
    for (const control of controls) {
      assert.equal(
        control.getAttribute('type'),
        'button',
        `${control.getAttribute('aria-label')} must not submit the draft`
      );
    }
    harness.remount();
  });

  it('1512: the adder is the list`s own footer, and follows the message at zero stages', async () => {
    const populated = await harness.mount(props());
    assert.ok(
      Boolean(populated.querySelector('[data-add-salvage-result]').closest('.fabricate-sortable-list')),
      'with stages, the adder is the list`s last child rather than a sibling of the list'
    );
    harness.remount();

    const empty = await harness.mount(props({ component: { salvage: { enabled: true, resultGroups: [] } } }));
    const emptyAdd = empty.querySelector('[data-add-salvage-result]');
    assert.ok(Boolean(emptyAdd), 'and it is still reachable with no stages at all');
    assert.ok(
      !emptyAdd.closest('.fabricate-sortable-list'),
      'following the empty message, because there is no list to be a footer of'
    );
    harness.remount();
  });

  it('D3: progressive salvage result rows render a read-only difficulty badge', async () => {
    const target = await harness.mount(props());
    const badges = [...target.querySelectorAll('[data-salvage-result-difficulty]')];
    assert.deepEqual(
      badges.map((node) => node.getAttribute('data-salvage-result-difficulty')),
      ['4', '9'],
      "each row shows its result component's difficulty"
    );
    assert.match(badges[0].textContent, /4/);
    // Read-only: the badge is not a control. `component.difficulty` belongs to the
    // RESULT component, whose own editor owns its save lifecycle.
    assert.equal(badges[0].tagName, 'SPAN');
    harness.remount();
  });

  it('D3: a result component with no difficulty reads "No difficulty", not 0', async () => {
    const target = await harness.mount(
      props({
        component: {
          salvage: {
            enabled: true,
            resultGroups: [{ id: 'grp-1', name: 'S', results: [{ id: 'res-1', componentId: 'cmp-unset', quantity: 1 }] }],
          },
        },
      })
    );
    const badge = target.querySelector('[data-salvage-result-difficulty]');
    assert.equal(badge.getAttribute('data-salvage-result-difficulty'), '');
    // This asserted /DC\s+—/ — the component's FALLBACK literal, which nothing ever
    // rendered: `lang/en.json` resolves `SalvageEditor.DifficultyUnset` to "No
    // difficulty", so production always said that and only a test with no i18n loaded
    // ever saw "DC —". The test's own NAME recorded the real intent all along. Issue 676
    // aligned the fallback to the lang value, and the recipe stage row now reads the
    // same. The POINT of the test is unchanged and is asserted explicitly below: an
    // unset difficulty must never render as a DC of 0, which is a real, meaningful, and
    // completely wrong value.
    assert.match(badge.textContent, /No difficulty/);
    assert.doesNotMatch(badge.textContent, /\b0\b/, 'an unset difficulty is never DC 0');
    harness.remount();
  });

  it('progressive salvage has NO quantity stepper — the engine forces quantity 1', async () => {
    // This test was the exact REVERSE until issue 676, and the reversal is the record of
    // a real fix rather than a change of mind. It used to say: do not delete this control,
    // because salvage — unlike recipes — genuinely honoured the authored quantity, so
    // hiding it would conceal a live field a GM could no longer see or edit. It ended
    // "if salvage should become quantity-less, the ENGINE must change first".
    //
    // The engine changed first. `CraftingEngine._resolveSalvageResultGroups` now forces
    // `quantity: 1` on every awarded progressive entry, exactly as
    // `ResolutionModeService._resolveProgressive` always has for recipes — because
    // progressive is an ordered list of INDIVIDUAL results whose award loop charges one
    // difficulty and awards one entry. `tests/salvage-engine.test.js` pins both halves
    // (the resolver AND the item actually created), so this control is now genuinely dead
    // UI in progressive mode rather than a window onto working behaviour.
    const target = await harness.mount(props());
    assert.equal(
      target.querySelector('[data-salvage-result-quantity]'),
      null,
      'a progressive yield is one item; repetition is authored by listing the component twice'
    );
    harness.remount();
  });

  // ── THE READ-ONLY COMPLICATION STRIP (issue 1286) ───────────────────────────────────
  //
  // A progressive salvage row produces the component it names, so what the GM has said goes
  // WRONG when that component is produced belongs on the row. It is read-only and links out,
  // taking the difficulty badge's doctrine wholesale: the complications belong to the
  // referenced component, whose own editor owns their save lifecycle.

  const COMPLICATION = Object.freeze({
    id: 'cx-1',
    name: 'The spring lets go',
    severity: 'severe',
    visibility: 'gmOnly',
    activities: { salvage: true },
    when: { stageMissed: true },
    effectRoll: { enabled: true, expr: '2d6' },
  });

  // A yield carrying complications, one of which is enabled for salvage and one only for
  // crafting. Both halves matter: the strip must show the first and withhold the second.
  const COMPLICATED_OPTIONS = [
    {
      id: 'cmp-scrap',
      name: 'Scrap Metal',
      img: 'icons/svg/item-bag.svg',
      difficulty: 4,
      complications: [
        COMPLICATION,
        {
          id: 'cx-2',
          name: 'Metal fatigue',
          severity: 'minor',
          visibility: 'visible',
          activities: { crafting: true },
          when: { stagePartial: true },
        },
      ],
    },
    { id: 'cmp-dust', name: 'Dust', img: 'icons/svg/item-bag.svg', difficulty: 9 },
  ];

  function complicatedProps(overrides = {}) {
    return props({
      componentOptions: COMPLICATED_OPTIONS,
      component: {
        salvage: {
          enabled: true,
          resultGroups: [
            {
              id: 'grp-1',
              name: 'S',
              results: [
                { id: 'res-1', componentId: 'cmp-scrap', quantity: 1 },
                { id: 'res-2', componentId: 'cmp-dust', quantity: 1 },
              ],
            },
          ],
        },
      },
      ...overrides,
    });
  }

  const strips = (target) => [...target.querySelectorAll('[data-salvage-stage-complications]')];

  it('1286: a stage whose yield authors salvage complications grows a strip; one that does not, does not', async () => {
    const target = await harness.mount(complicatedProps());
    const list = target.querySelector('.fabricate-sortable-list');
    const found = strips(target);
    assert.equal(found.length, 1, 'only the yield that authors one gets a strip');
    assert.equal(
      found[0].getAttribute('data-salvage-stage-complications'),
      'cmp-scrap',
      'and it is bound to the component that owns the complications'
    );

    // THE PLACEMENT RULING (issue 1286): the band is INSIDE the stage row, so the two draw
    // as ONE card the way the Recipe Studio's do. It used to be the list's next sibling —
    // the Component Studio prototype's detached treatment — and the maintainer superseded
    // that.
    //
    // RE-EXPRESSED AGAINST THE PRIMITIVE (issue 1512). The shape that ruling needed is what
    // `SortableList` draws for EVERY row: the row is a column, its LINE carries the padding and
    // its BODY is the line's sibling. So the three scoped `:has()` rules this file used to carry
    // are gone, the band is what the list renders as this row's body, and the assertions below
    // read the list's structure rather than the hand-rolled one.
    const row = target.querySelector('[data-salvage-result="res-1"]');
    // `assert.ok` on the identity, never `assert.equal(node, node)`: on failure
    // `node:assert` serialises a mounted element's circular tree to build its diff and the
    // heap dies, which surfaces as a `# cancelled` suite with no message at all.
    assert.ok(found[0].closest('.fabricate-sortable-list-row') === row, 'the band is in the row');
    assert.ok(
      row.classList.contains('manager-salvage-stage-row'),
      "and the row still carries this surface's own class, through `rowClass`"
    );
    assert.ok(
      [...list.children].every((child) => child.matches('li')),
      'and the list itself holds nothing but list items, so no band is a stage of its own'
    );
    const line = row.querySelector('.fabricate-sortable-list-line');
    assert.ok(line, 'the row wraps its own controls in the list`s line');
    assert.ok(
      line.querySelector('[data-salvage-result-edit]') &&
        line.querySelector('[data-salvage-result-difficulty]'),
      "the row's picker cluster and its trailing controls are the LINE's children"
    );
    assert.ok(
      found[0].parentElement.matches('.fabricate-sortable-list-body'),
      'and the band is the list`s BODY, the line`s sibling rather than its child — which is what ' +
        'lets its `border-top` be the card`s divider'
    );
    assert.ok(
      found[0].parentElement.parentElement === row,
      'and that body is the row`s own child'
    );
    // Not a stage: it annotates the one above it, and announcing it as a stage would have a
    // screen reader count one more stage than the award loop ever spends down.
    assert.equal(found[0].getAttribute('role'), 'presentation');
    harness.remount();
  });

  it('1286: a stage row with no complications draws one, and only its body is empty', async () => {
    // ONE MARKUP TREE (issue 1512). The hand-rolled row grew its column shape only under a
    // `:has()`, so a band-less row had to be proved unchanged. The list draws the SAME structure
    // for every row — line, then body — so what is left to prove is that the band-less row's body
    // holds nothing, which is the honest form of the same claim.
    const target = await harness.mount(complicatedProps());
    const plain = target.querySelector('[data-salvage-result="res-2"]');
    assert.ok(plain, 'the yield that authors no complication still renders its stage');
    assert.equal(
      plain.querySelectorAll('[data-salvage-stage-complications]').length,
      0,
      'and draws no band'
    );
    assert.ok(
      plain.querySelector('.fabricate-sortable-list-line'),
      'the line wraps its controls exactly as the banded row does'
    );
    const body = plain.querySelector('.fabricate-sortable-list-body');
    assert.ok(body, 'and it renders the same body element, because there is one markup tree');
    assert.equal(body.children.length, 0, 'which is empty, so nothing is drawn under the line');
    harness.remount();
  });

  it('1286: the strip shows only the complications enabled for SALVAGE', async () => {
    const target = await harness.mount(complicatedProps());
    const rows = [...strips(target)[0].querySelectorAll('[data-salvage-stage-complication]')];
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-salvage-stage-complication')),
      ['cx-1'],
      'a complication authored for crafting alone says nothing about a salvage stage, and ' +
        'listing it would tell the GM this yield carries a consequence it does not'
    );
    assert.match(
      rows[0].textContent,
      /The spring lets go/,
      'the row names the complication'
    );
    // The GM body is the generated TRIGGER SENTENCE — the fact a player must never be shown,
    // and the fact a GM most needs on a read-only strip.
    assert.match(
      rows[0].textContent,
      /When the award is missed/,
      'and states when it fires'
    );
    assert.match(rows[0].textContent, /rolls 2d6/, 'and what it does');
    harness.remount();
  });

  it('1286: the strip is fed the UNREDACTED authored list, so a gmOnly complication still shows', async () => {
    // The trap this pins: feeding the strip `forecastComplications` — which filters to
    // `visibility: "visible"` — reads as a working surface right up until a GM authors a
    // complication with the DEFAULT visibility, which is `gmOnly`. Then the GM's own screen
    // shows nothing, and every fixture that happened to use `visible` still passed.
    const target = await harness.mount(complicatedProps());
    const row = strips(target)[0].querySelector('[data-salvage-stage-complication="cx-1"]');
    assert.ok(row, 'the gmOnly complication renders on the GM strip');
    assert.ok(
      !row.querySelector('.manager-chip'),
      'and carries no Player pill, because it is not shown to the player'
    );
    harness.remount();
  });

  it('1286: a complication the player is told about carries the Player pill', async () => {
    const target = await harness.mount(
      complicatedProps({
        componentOptions: [
          {
            ...COMPLICATED_OPTIONS[0],
            complications: [{ ...COMPLICATION, visibility: 'visible' }],
          },
          COMPLICATED_OPTIONS[1],
        ],
      })
    );
    const row = strips(target)[0].querySelector('[data-salvage-stage-complication="cx-1"]');
    assert.match(row.textContent, /Player/, 'the pill states the disclosure on a GM screen');
    harness.remount();
  });

  it('1286: the strip is READ-ONLY and deep-links to the component that owns it', async () => {
    const opened = [];
    const target = await harness.mount(
      complicatedProps({
        onOpenComponent: (id) => {
          opened.push(id);
        },
      })
    );
    const strip = strips(target)[0];
    assert.ok(
      !strip.querySelector('input, select, textarea'),
      'nothing here edits the referenced component — that would be a cross-aggregate write ' +
        'from an editor whose Save button belongs to a different component'
    );
    const edit = strip.querySelector('[data-salvage-stage-complications-edit]');
    assert.ok(edit, 'the deep-link is the only route to changing any of this');
    // Distinguishable from the ROW's own Edit link, which targets the same component for its
    // DC: two buttons on one stage with the same accessible name would be unusable.
    assert.match(edit.getAttribute('aria-label'), /complications/i);
    assert.match(edit.getAttribute('aria-label'), /Scrap Metal/);
    edit.click();
    assert.deepEqual(opened, ['cmp-scrap']);
    harness.remount();
  });

  it('1286: the strip COUNTS and names its owning component, and is progressive-only', async () => {
    const target = await harness.mount(complicatedProps());
    // The COUNT leads, on the prototype's own rule
    // (`list.length + ' complication' + s + ' on ' + component.name`). On a band the GM has
    // not opened, the number is the half of that sentence worth reading — the component is
    // already named by the row above and by this band's own Edit control — and a title that
    // dropped it made every band look alike however much was hiding in it.
    assert.match(
      strips(target)[0].textContent,
      /1 complication on Scrap Metal/,
      'the band states how much it is hiding, and whose it is'
    );
    harness.remount();

    for (const mode of ['simple', 'routed']) {
      const other = await harness.mount(complicatedProps({ salvageResolutionMode: mode }));
      assert.equal(
        strips(other).length,
        0,
        `no strip in ${mode} salvage — a complication has no stage to fire from there`
      );
      harness.remount();
    }
  });

  it('1286: the strip disables its deep-link while the editor is saving', async () => {
    const target = await harness.mount(complicatedProps({ saving: true }));
    assert.equal(
      strips(target)[0].querySelector('[data-salvage-stage-complications-edit]').disabled,
      true,
      "navigating away mid-save is the same hazard the row's own Edit link guards against"
    );
    harness.remount();
  });

  it('simple salvage KEEPS its quantity stepper — the count is real there', async () => {
    // The other half of the ruling, and the reason the change above is a mode-scoped
    // deletion rather than a global one: simple/routed award the whole authored group, so
    // `quantity` is honoured end-to-end and must stay editable.
    const target = await harness.mount(props({ salvageResolutionMode: 'simple' }));
    assert.ok(
      target.querySelector('[data-salvage-result-quantity]'),
      'simple salvage rows expose the quantity the award path honours'
    );
    harness.remount();
  });

  it('a yield row picks its component through the searchable popover, showing image AND name', async () => {
    // The native <select> could show a component's name but never its art, so the GM
    // picked yields from a text list on a surface where every other component is shown
    // with its image. The trigger wraps BOTH facts as one target.
    const target = await harness.mount(props());
    const field = target.querySelector('[data-salvage-result-component]');
    assert.ok(field, 'the row still exposes its component field');
    assert.equal(field.querySelector('select'), null, 'the native select is gone');
    const trigger = field.querySelector('button.manager-salvage-component-trigger');
    assert.ok(trigger, 'the field is a popover trigger');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.ok(trigger.querySelector('img'), 'the trigger carries the component image');
    assert.match(trigger.textContent, /Scrap Metal/, 'the trigger carries the component name');
    harness.remount();
  });

  it('a yield component with no art falls back to a glyph, never a broken <img>', async () => {
    // A raw <img src=""> renders a broken-image box. SearchablePopover only emits the
    // <img> when `triggerImg` is truthy, so the fallback has to be an ICON — the option
    // list is built with `icon` set for exactly the art-less components.
    const target = await harness.mount(
      props({
        componentOptions: COMPONENT_OPTIONS.map((option) => ({ ...option, img: '' }))
      })
    );
    const trigger = target.querySelector('button.manager-salvage-component-trigger');
    assert.equal(trigger.querySelector('img'), null, 'no <img> is emitted without a src');
    assert.ok(trigger.querySelector('i.fa-cube'), 'the art-less component reads as a glyph');
    harness.remount();
  });

  it('D3: ordinals and badges are progressive-only', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'simple' }));
    assert.equal(target.querySelector('[data-salvage-result-ordinal]'), null);
    assert.equal(target.querySelector('[data-salvage-result-difficulty]'), null);
    harness.remount();
  });

  // ── issue 764: the Simple-mode single-success-group cap ───────────────────

  it('Simple mode HIDES Add group at the one-success-group cap and shows the required hint', async () => {
    // RESULT_GROUPS carries one success group, so Simple mode is at its cap: the only
    // add-group affordance is gone and the required hint explains why. The invariant is
    // the normalizer clamp; this is UX only.
    const target = await harness.mount(props({ salvageResolutionMode: 'simple' }));
    assert.equal(
      target.querySelector('[data-add-salvage-group]'),
      null,
      'no Add group control at the Simple one-success-group cap'
    );
    const hint = target.querySelector('[data-salvage-simple-hint]');
    assert.ok(hint, 'the required visible hint is present (not a tooltip)');
    assert.match(hint.textContent, /single result group/i);
    harness.remount();
  });

  it('Simple mode with NO success group still exposes Add group so the GM can author one', async () => {
    const target = await harness.mount(
      props({
        salvageResolutionMode: 'simple',
        component: { salvage: { enabled: false, resultGroups: [] } },
      })
    );
    assert.ok(
      target.querySelector('[data-add-salvage-group]'),
      'the GM can still add the first success group in Simple mode'
    );
    assert.ok(target.querySelector('[data-salvage-simple-hint]'), 'and the hint is shown');
    harness.remount();
  });

  // ── The three salvage adds are `dashed`, and the sweep found them painted neutral ──────
  //
  // Audit rows 22-24 (issue 1118). Each of the three sits at the FOOT of the list it appends
  // to — a result at the foot of a group, a group at the foot of the group list — which is
  // the whole meaning of the `dashed` role: a dashed outline reads as an empty slot waiting
  // to be filled, and a solid button does not. They shipped as bare `manager-button`s, so the
  // salvage editor showed solid secondary buttons where the recipe studio's identical verbs
  // show dashed ones.
  //
  // `fullWidth` is the delta's per-row ruling for these three specifically, and it is a
  // statement about the CONTAINER rather than the verb: each is the last child of a
  // full-width list. `dashed` deliberately no longer implies it — six of the sweep's ten
  // dashed sites are in wrapping flex rows where a pinned `width: 100%` stacked a four-up row
  // into four rows.
  //
  // Bound to the controls' own hooks, and the negative half names what must NOT have the
  // role: `[data-salvage-manage-presets]` is a neutral link in the same editor, and it is the
  // control a "does is-dashed appear in this card" assertion would have accepted.
  it('paints the salvage adds as full-width dashed appends, and nothing else in the editor', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'routed' }));
    const adds = Array.from(
      target.querySelectorAll('[data-add-salvage-result], [data-add-salvage-group]')
    );
    assert.ok(adds.length >= 2, `the routed editor renders its add controls, found ${adds.length}`);
    for (const add of adds) {
      const named = add.hasAttribute('data-add-salvage-group')
        ? 'data-add-salvage-group'
        : 'data-add-salvage-result';
      assert.ok(
        add.classList.contains('fab-manager-button'),
        `${named} renders through the ManagerButton primitive, got ${add.className}`
      );
      assert.ok(
        add.classList.contains('is-dashed'),
        `${named} takes the dashed append role, got ${add.className}`
      );
      assert.ok(
        add.classList.contains('is-full-width'),
        `${named} spans its full-width list row, got ${add.className}`
      );
    }
    for (const other of target.querySelectorAll(
      'button:not([data-add-salvage-result]):not([data-add-salvage-group])'
    )) {
      assert.ok(
        !other.classList.contains('is-dashed'),
        `only the append verbs are dashed, not ${other.getAttribute('data-salvage-manage-presets') === '' ? 'the Manage presets link' : other.className}`
      );
    }
    harness.remount();
  });

  it('Routed mode keeps the multi-group Add group control and no Simple hint', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'routed' }));
    assert.ok(
      target.querySelector('[data-add-salvage-group]'),
      'Routed still exposes Add group'
    );
    assert.equal(
      target.querySelector('[data-salvage-simple-hint]'),
      null,
      'the Simple hint is Simple-only'
    );
    harness.remount();
  });

  it('Simple cap counts SUCCESS groups — a legacy reserved failure row is preserved, not blanked', async () => {
    // One success group + one reserved `role: 'failure'` group: the cap counts success
    // groups (1 → capped) but the failure row's stored data must survive and render.
    const target = await harness.mount(
      props({
        salvageResolutionMode: 'simple',
        component: {
          salvage: {
            enabled: true,
            resultGroups: [
              { id: 'grp-win', name: 'Scraps', results: [{ id: 'r1', componentId: 'cmp-scrap', quantity: 1 }] },
              { id: 'grp-fail', name: 'Nothing', role: 'failure', results: [{ id: 'r2', componentId: 'cmp-dust', quantity: 1 }] },
            ],
          },
        },
      })
    );
    assert.equal(
      target.querySelector('[data-add-salvage-group]'),
      null,
      'capped at one success group even with a legacy failure group present'
    );
    const groups = target.querySelectorAll('[data-salvage-group]');
    assert.equal(groups.length, 2, 'both the success and the reserved failure rows render (data not blanked)');
    harness.remount();
  });
});

/*
 * Issue 772, acceptance 15 — the editor's essences section after the extraction.
 *
 * Until this block existed the editor's essence card had NO seam anywhere: none of
 * `data-component-edit-essence`, `data-component-essence-active`, the retired quantity
 * class or the Increment/Decrement/Quantity aria labels appeared in a single file under
 * `tests/`, and no step in `scripts/foundry-test-run.mjs` drove them. So extracting the
 * card into `EssenceQuantityCard` and replacing its raw `<input type="number">` +
 * `manager-icon-button` −/+ with the shared `Stepper` broke nothing AND proved nothing,
 * while changing the keyboard, clamp and commit behaviour of the control underneath.
 *
 * This lands the seam rather than the coverage gap: the card still READS a persisted
 * quantity, still INCREMENTS, still DECREMENTS and still CLEARS, and each of those still
 * reaches the draft the parent saves.
 *
 * It lives in this suite because this suite already mounts `ComponentEditView` and already
 * carries the compiled-module entry the extraction forces; a fourth `ComponentEditView`
 * harness would be a fourth copy of the same 40-line setup.
 */
describe('ComponentEditView — the extracted essence quantity card (issue 772)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  const ESSENCES = [
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
    { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', quantity: 0 },
  ];

  const ESSENCE_OVERRIDES = { showEssences: true, essenceOptions: ESSENCES };
  const essenceProps = (overrides = {}) => props({ ...ESSENCE_OVERRIDES, ...overrides });

  const cardFor = (target, id) => target.querySelector(`[data-component-edit-essence="${id}"]`);
  const stepperInput = (essenceCard) => essenceCard.querySelector('[data-stepper-input]');

  it('reads each persisted quantity and tints the untouched card', async () => {
    const target = await harness.mount(essenceProps());

    const fire = cardFor(target, 'fire');
    const earth = cardFor(target, 'earth');
    assert.ok(fire && earth, 'one card per system essence');

    // The value is READ from the component, not defaulted. A card that renders 0 for a
    // persisted 2 would save a silent clear on the next unrelated edit.
    assert.equal(stepperInput(fire).value, '2');
    assert.equal(stepperInput(earth).value, '0');

    // The contributed/untouched tint and its hook survive the extraction.
    assert.equal(fire.getAttribute('data-component-essence-active'), 'true');
    assert.equal(fire.classList.contains('is-active'), true);
    assert.equal(earth.getAttribute('data-component-essence-active'), 'false');
    assert.equal(earth.classList.contains('is-inactive'), true);

    // The identity half is still identity-FIRST, with the essence's own icon.
    assert.equal(fire.querySelector('.manager-component-essence-name').textContent, 'Fire');
    // issue 1371 r18-colour (M29): the tile is the shared glyph-chip `Medallion`, so the glyph sits
    // inside it rather than inside the card's retired own span.
    assert.ok(fire.querySelector('[data-medallion="glyph"] i.fa-fire'));

    harness.remount();
  });

  it('increments, decrements and clears through the shared stepper, and the draft follows', async () => {
    const { drafts, props: mountProps } = trackDirty(ESSENCE_OVERRIDES);
    const target = await harness.mount(mountProps);

    const earth = cardFor(target, 'earth');
    earth.querySelector('[data-stepper-increment]').click();
    await flushRender();
    assert.equal(stepperInput(cardFor(target, 'earth')).value, '1');
    assert.equal(
      drafts.at(-1).updates.essences.earth,
      1,
      'an increment reaches the essences map the parent saves'
    );
    assert.equal(cardFor(target, 'earth').classList.contains('is-active'), true);

    const fire = cardFor(target, 'fire');
    fire.querySelector('[data-stepper-decrement]').click();
    await flushRender();
    assert.equal(stepperInput(cardFor(target, 'fire')).value, '1');
    assert.equal(drafts.at(-1).updates.essences.fire, 1);

    // Clearing to zero DROPS the key rather than persisting a zero, which is what
    // `buildUpdates` has always done — and the card recedes again.
    cardFor(target, 'fire').querySelector('[data-stepper-decrement]').click();
    await flushRender();
    assert.equal(stepperInput(cardFor(target, 'fire')).value, '0');
    assert.equal(
      Object.hasOwn(drafts.at(-1).updates.essences, 'fire'),
      false,
      'a cleared essence leaves the map, it is not stored as 0'
    );
    assert.equal(cardFor(target, 'fire').classList.contains('is-inactive'), true);

    harness.remount();
  });

  it('clamps at zero and accepts a typed quantity', async () => {
    const { drafts, props: mountProps } = trackDirty(ESSENCE_OVERRIDES);
    const target = await harness.mount(mountProps);

    // `Stepper` disables − at its `min`, so a zero card cannot be driven negative. This is
    // the behaviour the raw `<input type="number">` did NOT have: `min="0"` is advisory on
    // a typed entry and the old −/+ buttons clamped in the view's own handler instead.
    assert.equal(cardFor(target, 'earth').querySelector('[data-stepper-decrement]').disabled, true);

    const input = stepperInput(cardFor(target, 'earth'));
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushRender();
    assert.equal(drafts.at(-1).updates.essences.earth, 4, 'a typed quantity commits');
    assert.equal(drafts.at(-1).essenceCount, 2, 'and both essences now count as contributed');

    harness.remount();
  });

  // Issue 1036, criteria 2 and 18. The editor's grid is both the add-new offer and the
  // editing surface for what is already carried, and `buildComponentEditorUpdates` rebuilds
  // `updates.essences` SOLELY from these rows — so the offer narrows and the DRAFT does not.
  const MIXED_ESSENCES = [
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false, quantity: 0 },
    { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 0 },
  ];

  it('1036/18: a DISABLED essence this component does not carry is withheld from the grid', async () => {
    const target = await harness.mount(
      props({ showEssences: true, essenceOptions: MIXED_ESSENCES })
    );

    assert.ok(
      Boolean(cardFor(target, 'earth')),
      'negative control: the ENABLED essence IS offered, so the grid is not simply empty'
    );
    assert.ok(!cardFor(target, 'fire'), 'the disabled, uncarried essence is withheld');
    harness.remount();
  });

  it('1036/2: a DISABLED essence this component already carries stays editable and clearable', async () => {
    const { drafts, props: mountProps } = trackDirty({
      showEssences: true,
      essenceOptions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false, quantity: 3 },
        { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 0 },
      ],
    });
    const target = await harness.mount(mountProps);

    const fire = cardFor(target, 'fire');
    assert.ok(Boolean(fire), 'the carried disabled essence is still rendered');
    assert.equal(stepperInput(fire).value, '3', 'with its authored quantity intact');

    // Clearable: the surface that authored the value must be able to remove it.
    const input = stepperInput(fire);
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushRender();
    assert.equal(
      drafts.at(-1).updates.essences.fire,
      undefined,
      'a cleared quantity leaves the map, exactly as it would for an enabled essence'
    );
    harness.remount();
  });

  it('1036/18: the essenceOptions PROP is not filtered — the SAVE payload keeps the disabled quantity', async () => {
    const { drafts, props: mountProps } = trackDirty({
      showEssences: true,
      essenceOptions: [
        { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: false, quantity: 3 },
        { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 0 },
      ],
    });
    const target = await harness.mount(mountProps);

    // Edit an UNRELATED essence. The save payload is rebuilt from the whole draft, so if the
    // offer filter had narrowed the draft rather than the render, this ordinary edit would
    // silently delete the disabled essence's authored 3.
    cardFor(target, 'earth').querySelector('[data-stepper-increment]').click();
    await flushRender();

    assert.equal(drafts.at(-1).updates.essences.earth, 1);
    assert.equal(
      drafts.at(-1).updates.essences.fire,
      3,
      'the disabled essence keeps its authored quantity through an unrelated save'
    );
    harness.remount();
  });

  it('disables every card while the editor is saving', async () => {
    const target = await harness.mount(essenceProps({ saving: true }));
    for (const id of ['fire', 'earth']) {
      const essenceCard = cardFor(target, id);
      assert.equal(stepperInput(essenceCard).disabled, true);
      assert.equal(essenceCard.querySelector('[data-stepper-increment]').disabled, true);
    }
    harness.remount();
  });
});
