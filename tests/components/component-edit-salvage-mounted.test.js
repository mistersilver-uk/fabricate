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
    // The salvage mode pill's label source (issue 676) — it already carries 'Routed by
    // check' for the persisted 'routed' token. Import-free leaf.
    'src/ui/svelte/apps/manager/resolutionModeOptions.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    // The identity strip's drop target + its portaled overflow menu (issue 676).
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
  ],
  // ToggleCard is rendered by the salvage block; a component the tree renders but the
  // harness does not list HANGS the suite (# cancelled) rather than failing it. The
  // component under test must be listed here too — the harness imports `componentPath`
  // from the temp tree but only compiles what `compiledModules` names.
  compiledModules: [
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    // The salvage result quantity + the progressive DC are the shared Stepper (issue
    // 676). Import-free leaf, so it needs no `rawModules` entry — but omit it HERE and
    // the suite HANGS (# cancelled) rather than failing.
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
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
