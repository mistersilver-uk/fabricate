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
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-edit-salvage-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/componentEditor.js',
    // The component category vocabulary (issue 676), imported by ComponentEditView.
    // A deliberately import-free leaf, so this single entry suffices — but omit it
    // and the mounted suite HANGS (# cancelled) rather than failing.
    'src/utils/componentCategories.js',
    // The salvage DC control's pure option model (issue 676). Import-free leaf.
    'src/ui/svelte/apps/manager/component/salvageDcPresets.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
  ],
  // ToggleCard is rendered by the salvage block; a component the tree renders but the
  // harness does not list HANGS the suite (# cancelled) rather than failing it. The
  // component under test must be listed here too — the harness imports `componentPath`
  // from the temp tree but only compiles what `compiledModules` names.
  compiledModules: [
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/ComponentEditView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

// ToggleCard mounted directly, to constrain the two props that exist ONLY for issue 658's
// retrofit. Neither call site passes them today, so without this they would be unverified
// forward-compatibility seams — present, but not proven to emit anything.
const cardHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-toggle-card-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/apps/manager/ToggleCard.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/ToggleCard.svelte',
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
    // Without these the card governs a list whose order the GM cannot see.
    const target = await harness.mount(props());
    const ordinals = [...target.querySelectorAll('[data-salvage-result-ordinal]')];
    assert.deepEqual(
      ordinals.map((node) => node.textContent.trim()),
      ['1', '2'],
      'stages are numbered in authored order'
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
    assert.match(badge.textContent, /No difficulty/);
    harness.remount();
  });

  it('D3: ordinals and badges are progressive-only', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'simple' }));
    assert.equal(target.querySelector('[data-salvage-result-ordinal]'), null);
    assert.equal(target.querySelector('[data-salvage-result-difficulty]'), null);
    harness.remount();
  });
});
