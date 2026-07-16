/**
 * Issue 676 — wiring `component.salvage.enabled` to a GM control, and the invariant
 * that makes the control safe.
 *
 * `salvage.enabled` was persisted, normalized, and a live runtime gate (`CraftingEngine`
 * refuses salvage when false; `InventoryListingBuilder` skips the component) long before
 * any GM control wrote it — so a component auto-disabled by a resolution-mode change was
 * permanently unsalvageable from the UI. This suite pins the fix and the four traps that
 * make the fix silently useless.
 *
 * Acceptance criteria covered: AC4, AC8, AC9, AC10(a)+(b), AC12, AC13.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

function flushRender() {
  return new Promise((done) => setTimeout(done, 0));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-salvage-enable-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/componentEditor.js',
    'src/utils/componentCategories.js',
    'src/ui/svelte/apps/manager/component/salvageDcPresets.js',
    // The salvage mode pill's label source (issue 676) — it already carries 'Routed by
    // check' for the persisted 'routed' token. Import-free leaf.
    'src/ui/svelte/apps/manager/resolutionModeOptions.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    // The identity strip's drop target + its portaled overflow menu.
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/util/iconPickerPopover.js',
  ],
  // A `.svelte` the tree RENDERS but this list omits does not fail — it HANGS, and is
  // reported as `# cancelled`, never `# fail`.
  compiledModules: [
    'src/ui/svelte/apps/manager/ToggleCard.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
    'src/ui/svelte/apps/manager/ComponentEditView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ComponentEditView.svelte',
});

const RESULT_GROUPS = [
  { id: 'grp-1', name: 'Scraps', results: [{ id: 'res-1', componentId: 'cmp-scrap', quantity: 1 }] },
];

const TIERS = [
  { id: 't1', name: 'Standard', dc: 12 },
  { id: 't2', name: 'Hard', dc: 17 },
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
    componentOptions: [{ id: 'cmp-scrap', name: 'Scrap Metal', img: 'icons/svg/item-bag.svg' }],
    showSalvage: true,
    salvageResolutionMode: 'simple',
    salvageCheckEnabled: true,
    salvageCheckTiers: TIERS,
    salvageCheckDcMode: 'static',
    salvageCheckDc: 15,
    ...rest,
  };
}

const enableCard = (target) => target.querySelector('[data-recipe-section="salvage-enabled"]');
const enableToggle = (target) => target.querySelector('[data-recipe-field="salvageEnabled"]');
const addGroup = (target) => target.querySelector('[data-add-salvage-group]');
const removeGroup = (target) => target.querySelector('[data-remove-salvage-group]');

function track(overrides = {}) {
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

describe('ComponentEditView — salvage enablement (issue 676)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  // ── AC9: enablement ships ACCURATE ───────────────────────────────────────

  it('AC9: an enabled-ABSENT component with authored results renders the toggle OFF', async () => {
    // THE MUTATION THIS EXISTS TO CATCH: `cloneSalvage` defaulting `enabled` to TRUE —
    // a highly plausible copy-paste of the adjacent
    // `allowPlayerResultReorder: source.allowPlayerResultReorder !== false`.
    //
    // Every PRE-EXISTING fixture reads green through that mutation, because they use
    // `enabled: true` or `salvage: null`. Only an enabled-ABSENT fixture fails.
    const { dirtyEvents, props: mountProps } = track({
      component: { salvage: { resultGroups: RESULT_GROUPS } },
    });
    const target = await harness.mount(mountProps);

    assert.ok(enableCard(target).classList.contains('is-off'), 'absent reads disabled');
    assert.equal(enableToggle(target).getAttribute('aria-pressed'), 'false');
    // ...and rendering it must NOT re-save. Decision 6 is "no migration" — a component
    // that merely gets LOOKED AT must not be flipped and written back.
    assert.ok(!dirtyEvents.includes(true), 'merely rendering never marks the editor dirty');
    harness.remount();
  });

  it('AC9: an explicit enabled:false renders the toggle OFF and stays clean', async () => {
    const { dirtyEvents, props: mountProps } = track({
      component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } },
    });
    const target = await harness.mount(mountProps);
    assert.ok(enableCard(target).classList.contains('is-off'));
    assert.ok(!dirtyEvents.includes(true));
    harness.remount();
  });

  // ── AC4: round-trip, and the 651 shape ───────────────────────────────────

  it('AC4: toggling salvage enablement makes the editor dirty (which is what enables Save)', async () => {
    // The 651 shape: `salvageSignatureOf` is an ALLOWLIST. Drop `enabled` from it and
    // persistence still works and the switch still flips — but nothing is ever dirty,
    // Save never enables, and the GM's toggle is silently discarded on exit.
    const { dirtyEvents, props: mountProps } = track({
      component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } },
    });
    const target = await harness.mount(mountProps);
    assert.ok(!dirtyEvents.includes(true), 'not dirty before any edit');

    enableToggle(target).click();
    await flushRender();

    assert.equal(enableToggle(target).getAttribute('aria-pressed'), 'true', 'the switch flipped');
    assert.equal(dirtyEvents.at(-1), true, 'toggling marks the editor dirty');
    harness.remount();
  });

  it('AC4: off→on→off returns the editor to CLEAN (the undefined-baseline trap)', async () => {
    // `isDirty()` compares against `cloneSalvage(component.salvage)`. With `enabled` in
    // the signature but NOT defaulted in cloneSalvage, an absent key leaves an
    // `undefined` baseline — so `false` never re-equals it and the editor sticks dirty
    // forever, nagging the exit guard over a no-op edit.
    const { dirtyEvents, props: mountProps } = track({
      component: { salvage: { resultGroups: RESULT_GROUPS } },
    });
    const target = await harness.mount(mountProps);

    enableToggle(target).click();
    await flushRender();
    assert.equal(dirtyEvents.at(-1), true);

    enableToggle(target).click();
    await flushRender();
    assert.equal(dirtyEvents.at(-1), false, 'back to the persisted value is not an edit');
    harness.remount();
  });

  it('AC13: updates.salvage stays a FULL spread — a partial patch would wipe resultGroups', async () => {
    // `CraftingSystemManager.updateItem` does `{...existing, ...updates}`, so
    // `updates.salvage` REPLACES the whole salvage sub-object. A panel emitting
    // `{enabled: true}` would silently wipe the authored result groups.
    const { drafts, props: mountProps } = track({
      component: {
        salvage: { enabled: false, resultGroups: RESULT_GROUPS, ingredientQuantity: 3, toolIds: ['tool-a'] },
      },
    });
    const target = await harness.mount(mountProps);

    enableToggle(target).click();
    await flushRender();

    const { salvage } = drafts.at(-1).updates;
    assert.equal(salvage.enabled, true, 'the toggled value reaches the payload');
    assert.deepEqual(salvage.resultGroups, RESULT_GROUPS, 'result groups survive');
    assert.equal(salvage.ingredientQuantity, 3, 'unedited fields survive');
    assert.deepEqual(salvage.toolIds, ['tool-a'], 'and so do the non-authored ones');
    harness.remount();
  });

  // ── AC4 / AC12: Ruling A — what collapses, and what must not ─────────────

  it('AC4 + AC12: with salvage OFF the chrome collapses but the group editor stays usable', async () => {
    const target = await harness.mount(
      props({
        component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } },
        salvageResolutionMode: 'routed',
      })
    );
    // Chrome — meaningful only once salvage RUNS.
    assert.equal(target.querySelector('[data-salvage-routing]'), null, 'routing collapses');
    assert.equal(target.querySelector('[data-salvage-dc-override]'), null, 'the DC control collapses');
    // ...but the result-group editor does NOT.
    assert.ok(target.querySelector('[data-salvage-result-groups]'), 'the group editor stays');
    assert.ok(addGroup(target), 'the add-group control stays reachable');
    harness.remount();
  });

  it('AC4: with salvage ON the chrome renders', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'routed' }));
    assert.ok(target.querySelector('[data-salvage-routing]'), 'routing renders');
    assert.ok(target.querySelector('[data-salvage-dc-override]'), 'the DC control renders');
    harness.remount();
  });

  it('AC12: THE DEADLOCK — a zero-group component can be taken to one group and then enabled', async () => {
    // The circle that killed decision 8's first draft: enabled defaults false → the
    // body collapses when off → the add-group control (its ONLY instance in the
    // codebase) is hidden → resultGroups can never reach 1 → the toggle is disabled
    // forever. Salvage would be unenablable for EVERY new component.
    const target = await harness.mount(props({ component: { salvage: null } }));

    assert.equal(enableToggle(target).disabled, true, 'disabled at zero groups');
    assert.ok(addGroup(target), 'but the add-group control is reachable while off');

    addGroup(target).click();
    await flushRender();

    assert.equal(enableToggle(target).disabled, false, 'one group enables the toggle');
    enableToggle(target).click();
    await flushRender();
    assert.equal(enableToggle(target).getAttribute('aria-pressed'), 'true', 'and salvage enables');
    harness.remount();
  });

  // ── AC10: Requirement 5 is enforced — test the requirement, not the control

  it('AC10(a): the toggle is disabled at zero groups, with a VISIBLE sub-line hint', async () => {
    const target = await harness.mount(props({ component: { salvage: null } }));
    assert.equal(enableToggle(target).disabled, true);

    // The hint must be VISIBLE TEXT on the sub line — not `toggleTitle`, which lands a
    // native `title` on a DISABLED <button>. Disabled controls fire no mouse events, so
    // that tooltip never appears in any browser — and no mounted test would notice,
    // because the attribute IS present in the DOM. Assert the rendered text.
    const hint = enableCard(target).querySelector('[data-salvage-enabled-hint]');
    assert.ok(hint, 'the hint renders on the sub line');
    assert.match(hint.textContent, /Add at least one result group/);
    assert.equal(
      enableToggle(target).getAttribute('title'),
      null,
      'the explanation is NOT routed through a title on a disabled button'
    );
    harness.remount();
  });

  it('AC10(a): the toggle enables at one result group', async () => {
    const target = await harness.mount(
      props({ component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } } })
    );
    assert.equal(enableToggle(target).disabled, false);
    harness.remount();
  });

  it('AC10(b): deleting the LAST group drives the draft to enabled:false and saves it', async () => {
    // THE MUTATION: drop the removal-path coupling in `removeSalvageGroup`. That path
    // used to be unfloored, and `buildUpdates()` full-spreads — so
    // enable-at-one-group → delete-that-group → Save persisted
    // `{enabled: true, resultGroups: []}`, violating Component Requirement 5 through
    // the sanctioned flow's exact reverse, and THEN disabling the control that would
    // undo it. Stuck ON: this change's founding defect, inverted.
    const { drafts, props: mountProps } = track({
      component: { salvage: { enabled: true, resultGroups: RESULT_GROUPS } },
    });
    const target = await harness.mount(mountProps);

    removeGroup(target).click();
    await flushRender();

    const { salvage } = drafts.at(-1).updates;
    assert.deepEqual(salvage.resultGroups, [], 'the last group is gone');
    assert.equal(salvage.enabled, false, 'and the draft auto-disabled with it');
    assert.equal(enableToggle(target).getAttribute('aria-pressed'), 'false');
    harness.remount();
  });

  it('AC10(b): deleting a NON-last group leaves enablement alone', async () => {
    const twoGroups = [...RESULT_GROUPS, { id: 'grp-2', name: 'Dust', results: [] }];
    const { drafts, props: mountProps } = track({
      component: { salvage: { enabled: true, resultGroups: twoGroups } },
    });
    const target = await harness.mount(mountProps);

    removeGroup(target).click();
    await flushRender();

    const { salvage } = drafts.at(-1).updates;
    assert.equal(salvage.resultGroups.length, 1);
    assert.equal(salvage.enabled, true, 'still one group left, so salvage stays enabled');
    harness.remount();
  });

  it('the off-body copy BRANCHES on zero-groups vs has-groups', async () => {
    // "Enable it above to define what it yields" is only TRUE once groups exist. At zero
    // it points at a toggle that is (correctly) disabled — actively misleading.
    const zero = await harness.mount(props({ component: { salvage: null } }));
    assert.match(
      zero.querySelector('[data-salvage-disabled-notice]').textContent,
      /nothing to enable yet/i
    );
    harness.remount();

    const authored = await harness.mount(
      props({ component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } } })
    );
    assert.match(
      authored.querySelector('[data-salvage-disabled-notice]').textContent,
      /Enable it above/i
    );
    harness.remount();
  });

  it('no disabled-body notice renders when salvage is on', async () => {
    const target = await harness.mount(props());
    assert.equal(target.querySelector('[data-salvage-disabled-notice]'), null);
    harness.remount();
  });

  // ── AC8: an off-tier dcOverride round-trips untouched ────────────────────

  it('AC8(a): mounting an off-tier dcOverride selects Custom… and never marks dirty', async () => {
    // The mutation this catches: an `$effect` that "helpfully" snaps dcOverride to the
    // nearest authored tier. That would silently rewrite the GM's DC — and because the
    // editor would then be dirty, the exit guard would nag about an edit nobody made.
    const { dirtyEvents, props: mountProps } = track({
      component: { salvage: { enabled: true, resultGroups: RESULT_GROUPS, dcOverride: 14 } },
    });
    const target = await harness.mount(mountProps);

    const preset = target.querySelector('[data-salvage-dc-preset]');
    assert.equal(preset.value, 'custom', 'an override matching no tier selects Custom…');
    assert.equal(
      target.querySelector('[data-salvage-dc-custom]').value,
      '14',
      'and displays the persisted value verbatim — never snapped to 12 or 17'
    );
    assert.ok(!dirtyEvents.includes(true), 'rendering it is not an edit');
    harness.remount();
  });

  it('AC8(b): after an UNRELATED edit and save, dcOverride is still 14', async () => {
    const { drafts, props: mountProps } = track({
      component: { salvage: { enabled: true, resultGroups: RESULT_GROUPS, dcOverride: 14 } },
    });
    const target = await harness.mount(mountProps);

    // An edit somewhere else entirely: rename the result group.
    const groupName = target.querySelector('[data-salvage-group-name]');
    groupName.value = 'Renamed';
    groupName.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flushRender();

    assert.equal(drafts.at(-1).updates.salvage.dcOverride, 14, 'the off-tier DC rode through untouched');
    harness.remount();
  });

  it('a persisted dcOverride matching a tier selects that tier, not Custom…', async () => {
    const target = await harness.mount(
      props({ component: { salvage: { enabled: true, resultGroups: RESULT_GROUPS, dcOverride: 17 } } })
    );
    assert.equal(target.querySelector('[data-salvage-dc-preset]').value, 'dc:17');
    assert.equal(target.querySelector('[data-salvage-dc-custom]'), null, 'no custom input for a tier match');
    harness.remount();
  });

  it('a null dcOverride selects the system default', async () => {
    const target = await harness.mount(props());
    assert.equal(target.querySelector('[data-salvage-dc-preset]').value, 'system');
    harness.remount();
  });

  it('selecting Custom… from the SYSTEM DEFAULT reveals an authorable input', async () => {
    // THE REGRESSION THIS EXISTS TO CATCH. `dcOverride: null` is the state EVERY
    // component starts in — nothing seeds it. Custom… and System default BOTH persist
    // `null`, so deriving the input's visibility purely from the persisted value made
    // Custom… dead on arrival: pick it -> stages null -> selection derives back to
    // `system` -> the input never renders -> an arbitrary DC is unauthorable.
    //
    // `main` ships a plain number input accepting any DC today, so this would have been
    // a REGRESSION of a shipped capability, and it contradicts this change's own
    // canonical requirement ("a Custom… option exposing an arbitrary integer"). The
    // zero-authored-tiers case — the COMMON one — is where it bites hardest: two
    // options, one inert.
    //
    // Every other DC test here starts from `dcOverride: 14`, so none of them ever
    // SELECTS Custom… and none of them could see this.
    const { dirtyEvents, props: mountProps } = track();
    const target = await harness.mount(mountProps);

    const preset = target.querySelector('[data-salvage-dc-preset]');
    assert.equal(preset.value, 'system', 'every component starts at the system default');
    assert.equal(target.querySelector('[data-salvage-dc-custom]'), null, 'no custom input yet');

    preset.value = 'custom';
    preset.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
    await flushRender();

    const custom = target.querySelector('[data-salvage-dc-custom]');
    assert.ok(custom, 'Custom… reveals its input');
    assert.equal(custom.value, '', 'and it opens empty rather than inventing a DC');
    // Choosing Custom… persists nothing until a number is typed, so it is not an edit.
    assert.ok(!dirtyEvents.includes(true), 'merely choosing Custom… does not dirty the editor');
    harness.remount();
  });

  it('typing into the revealed Custom… input stages an arbitrary DC', async () => {
    const { drafts, props: mountProps } = track();
    const target = await harness.mount(mountProps);

    const preset = target.querySelector('[data-salvage-dc-preset]');
    preset.value = 'custom';
    preset.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
    await flushRender();

    // 14 is deliberately OFF-tier (the tiers are 12 and 17) — an arbitrary integer.
    const custom = target.querySelector('[data-salvage-dc-custom]');
    custom.value = '14';
    custom.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flushRender();

    assert.equal(drafts.at(-1).updates.salvage.dcOverride, 14, 'the arbitrary DC reaches the payload');
    assert.equal(
      target.querySelector('[data-salvage-dc-preset]').value,
      'custom',
      'and the control stays on Custom…'
    );
    harness.remount();
  });

  it('Custom… stays open while its input is cleared, and hands back on picking a tier', async () => {
    const target = await harness.mount(props());
    const preset = target.querySelector('[data-salvage-dc-preset]');
    const change = () =>
      preset.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));

    preset.value = 'custom';
    change();
    await flushRender();
    const custom = target.querySelector('[data-salvage-dc-custom]');
    custom.value = '';
    custom.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    await flushRender();
    assert.ok(
      target.querySelector('[data-salvage-dc-custom]'),
      'clearing the input must not yank the control back to the system default mid-edit'
    );

    // Picking a real option hands control back to the persisted value.
    preset.value = 'dc:12';
    change();
    await flushRender();
    assert.equal(target.querySelector('[data-salvage-dc-custom]'), null, 'the custom input closes');
    assert.equal(target.querySelector('[data-salvage-dc-preset]').value, 'dc:12');
    harness.remount();
  });

  it('the Custom… choice does not leak across components', async () => {
    // It is transient UI state, not draft data, so it resets with the drafts on
    // re-seed. Without that reset a second component would open showing a
    // system-default DC as custom.
    const target = await harness.mount(props());
    const preset = target.querySelector('[data-salvage-dc-preset]');
    preset.value = 'custom';
    preset.dispatchEvent(new target.ownerDocument.defaultView.Event('change', { bubbles: true }));
    await flushRender();
    assert.ok(target.querySelector('[data-salvage-dc-custom]'));
    harness.remount();

    const next = await harness.mount(props({ component: { id: 'comp-2', name: 'Other' } }));
    assert.equal(next.querySelector('[data-salvage-dc-preset]').value, 'system');
    assert.equal(next.querySelector('[data-salvage-dc-custom]'), null);
    harness.remount();
  });

  it('"Manage presets" is reachable in the zero-tier case (why decision 7 kept it)', async () => {
    const calls = [];
    const target = await harness.mount(
      props({ salvageCheckTiers: [], onManageCheckPresets: () => calls.push(true) })
    );
    const options = [...target.querySelectorAll('[data-salvage-dc-preset] option')].map((o) => o.value);
    assert.deepEqual(options, ['system', 'custom'], 'no presets to offer');

    target.querySelector('[data-salvage-manage-presets]').click();
    assert.deepEqual(calls, [true], 'the deep link fires');
    harness.remount();
  });

  it('AC5: the persisted `routed` token is DISPLAYED as "Routed by check", never raw', async () => {
    // `ui-integration` -> Component Studio req 4, added by this change: "The persisted
    // `routed` token is displayed as 'Routed by check'." Nothing displayed it — there
    // was no mode pill in either state — so the panel silently changed shape (routing
    // rows, ordinals, the DC control appearing/vanishing) driven by a SYSTEM-level
    // setting the GM cannot see from this route.
    const target = await harness.mount(props({ salvageResolutionMode: 'routed' }));
    const pill = target.querySelector('[data-salvage-mode]');
    assert.ok(pill, 'the salvage card names its mode');
    assert.equal(pill.dataset.salvageMode, 'routed', 'the PERSISTED token is unchanged');
    assert.match(pill.textContent, /Routed by check/, 'and is displayed as "Routed by check"');
    assert.ok(
      !/\brouted\b/.test(pill.textContent),
      'the raw token is never shown to the GM'
    );
    harness.remount();
  });

  it('AC5: each mode names itself', async () => {
    for (const [mode, label] of [
      ['simple', /Simple/],
      ['progressive', /Progressive/],
    ]) {
      const target = await harness.mount(props({ salvageResolutionMode: mode }));
      assert.match(target.querySelector('[data-salvage-mode]').textContent, label);
      harness.remount();
    }
  });

  it('the mode pill is CHROME — it collapses with the rest when salvage is off', async () => {
    // Ruling A lists the mode pill as chrome. The group editor never depends on it.
    const off = await harness.mount(
      props({ component: { salvage: { enabled: false, resultGroups: RESULT_GROUPS } }, salvageResolutionMode: 'routed' })
    );
    assert.equal(off.querySelector('[data-salvage-mode]'), null, 'no mode pill while salvage is off');
    assert.ok(off.querySelector('[data-add-salvage-group]'), 'but the group editor stays');
    harness.remount();
  });

  it('AC5: the DC control is absent when the system salvage check is off', async () => {
    // The presentation is DERIVED from the two axes: mode × check-enablement.
    const target = await harness.mount(props({ salvageCheckEnabled: false }));
    assert.equal(target.querySelector('[data-salvage-dc-override]'), null);
    // ...but the yield groups still render.
    assert.ok(target.querySelector('[data-salvage-result-groups]'));
    harness.remount();
  });

  it('AC5: progressive salvage shows no DC control (it spends a roll, it does not compare one)', async () => {
    const target = await harness.mount(props({ salvageResolutionMode: 'progressive' }));
    assert.equal(target.querySelector('[data-salvage-dc-override]'), null);
    assert.ok(
      target.querySelector('[data-recipe-section="salvage-allow-player-result-reorder"]'),
      'the progressive reorder card renders instead'
    );
    harness.remount();
  });
});
