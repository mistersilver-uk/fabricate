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

describe('ComponentEditView — salvage reorder permission (issue 651)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('renders the card ON when salvage is null (the cloneSalvage default)', async () => {
    // `cloneSalvage(null)` spreads `{}` → the field is absent. Without the default the
    // switch renders off against a default-on spec.
    const target = await harness.mount(props({ component: { salvage: null } }));
    assert.ok(card(target), 'the card renders for a component with no salvage config');
    assert.ok(card(target).classList.contains('is-on'), 'absent reads default-true');
    assert.equal(toggle(target).getAttribute('aria-pressed'), 'true');
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
