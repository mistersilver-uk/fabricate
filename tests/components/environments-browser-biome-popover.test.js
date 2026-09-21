import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// EnvironmentsBrowserView's Settings tab renders the biome vocabulary panel, which
// mounts IconPicker + (conditionally) ManagerColorPopover side by side, plus every
// retained Gathering and World content views EnvironmentsBrowserView statically imports. A `.svelte`
// or `.js` the mounted tree renders but this allowlist omits does NOT fail the
// suite — it HANGS (reported as `# cancelled`).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-env-biome-popover-',
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/gatheringImageDefaults.js',
    ...FOUNDRY_BRIDGE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/pickerOptionModel.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/disclosurePhrase.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/foundryIconCatalogue.json',
    'src/ui/svelte/util/dropUtils.js',
    // The browse view-state the environments browser and its two gathering children
    // read (issue 1438).
    'src/ui/model/managerBrowserViewState.js',
    // The shared colour-token constant + its localized labels (issue 1036). Both colour
    // components import it, and both are compiled below.
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/dragDrop.js',
    // `ActionMenu`'s own import-free leaves (issue 1515).
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/actionMenuLayout.js',
  ],
  compiledModules: [
    // Issue 1504: the shared `<Select>`'s whole compiled closure.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    // THE shared overflow action menu (issue 1477). All three browsers in this tree render one
    // per row since issue 1515, and it renders `IconButton` above as its trigger.
    'src/ui/svelte/components/ActionMenu.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    // The parties pane's refusal banner is the shared notice as of issue 1515.
    'src/ui/svelte/components/Notice.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/PartyNameField.svelte',
    'src/ui/svelte/apps/manager/RealmOverridePicker.svelte',
    // The three card components the parties rebuild added (issue 1182).
    'src/ui/svelte/apps/manager/PartyMemberRow.svelte',
    'src/ui/svelte/apps/manager/PartyAddMemberPanel.svelte',
    'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte',
    'src/ui/svelte/apps/manager/PartyExpandedBody.svelte',
    'src/ui/svelte/apps/manager/GatheringPartiesTab.svelte',
    'src/ui/svelte/apps/manager/RealmEnvironmentsEditor.svelte',
    'src/ui/svelte/apps/manager/GatheringRealmsTab.svelte',
    'src/ui/svelte/apps/manager/MapRegionLinkPicker.svelte',
    'src/ui/svelte/apps/manager/GatheringMapLinksTab.svelte',
    'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte',
});

const gatheringConfig = {
  systems: {
    alchemy: {
      vocabularies: {
        biomes: {
          values: [
            {
              id: 'forest',
              label: 'Moon Forest',
              icon: 'fas fa-tree',
              colorToken: 'sage',
              customColor: '',
            },
          ],
        },
      },
    },
  },
};

function biomeTrigger(target) {
  return target.querySelector(
    '[data-gathering-vocabulary-panel="biomes"] [data-gathering-vocabulary-value="forest"] .manager-biome-combined-trigger'
  );
}

function colorPopover(target) {
  return target.querySelector('[data-manager-color-picker-popover]');
}

async function mountSettingsTab() {
  return harness.mount({
    activeGatheringTab: 'settings',
    selectedSystemId: 'alchemy',
    selectedSystemName: 'Alchemy',
    gatheringConfig,
  });
}

// Stubs the trigger's rect (the popover-positioning math reads it) and marks the
// mounted root as the manager shell so `resolveOverlayHost` — which `anchoredPopover`
// calls on the view's behalf since issue 1500 converted this seventh hand-written copy
// — walks up to a host. WITHOUT this the portal no-ops and the popover never leaves the
// trigger's own DOM subtree, which would silently defeat the regression this suite
// exists to catch, since the real bug only exists once the popover is portaled away
// from the trigger.
// happy-dom gives every element a zero rect and the string branch KEEPS it: minLeft becomes 16
// and maxRight −16, a zero-width band that `computeIconPickerPopoverLayout` answers `null` for
// (`iconPickerPopover.js:77-78`), and the action then CLEARS the style, so the panel renders
// with `style=""` and a positioning regression is invisible. These numbers are a manager
// column inset 60px from the left of a 1280px window: they are arbitrary, but they must
// be non-degenerate for the arithmetic below to have an answer.
function stageManagerShell(target, triggerLeft = 140) {
  target.classList.add('fabricate-manager');
  const managerMain = target.querySelector('.manager-main');
  managerMain.getBoundingClientRect = () => ({
    left: 60,
    top: 40,
    right: 1220,
    bottom: 760,
    width: 1160,
    height: 720,
  });
  const trigger = biomeTrigger(target);
  trigger.getBoundingClientRect = () => ({
    left: triggerLeft,
    top: 100,
    right: triggerLeft + 30,
    bottom: 130,
    width: 30,
    height: 30,
  });
  return trigger;
}

// Opening the popover also runs the effect that applies `anchoredPopover`.
async function openBiomePopover(trigger) {
  trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  flushSync();
  await tick();
  flushSync();
}

describe('EnvironmentsBrowserView biome colour popover dismissal (issue 921)', () => {
  before(async () => {
    await harness.setup();
    // happy-dom's Window is flattened onto `globalThis` by setupDOM() (see
    // tests/helpers/svelte-dom.js), and `globalThis` itself has no
    // `addEventListener`. The popover-positioning effect (unrelated to the
    // dismissal mechanism under test here) registers `window` resize/scroll
    // listeners whenever the popover opens; stub them so that pre-existing,
    // out-of-scope effect does not crash this suite.
    window.addEventListener ??= () => {};
    window.removeEventListener ??= () => {};
    // `defineProperty` and not `window.innerWidth = 1280`.
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it("right-clicking the open popover's own trigger closes it instead of reopening it", async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'first right-click opens the popover');
    // `assert.ok(a === b)` and not `assert.equal(a, b)`.
    assert.ok(
      opened.parentElement === target,
      'the popover is portaled out of the trigger row into the manager shell'
    );

    // A real right-click fires `mousedown` (which runs the capture-phase
    // outside-click listeners), THEN `contextmenu`, on the same target — see
    // src/ui/svelte/actions/dismissOnOutsideClick.js. Before the fix, the mousedown
    // dismissed the popover (the trigger was treated as "outside" it) and the
    // subsequent contextmenu then reopened it in the same gesture.
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    await tick();
    flushSync();

    assert.ok(
      !colorPopover(target),
      'a second right-click on the trigger closes the popover instead of reopening it'
    );
  });

  it('still dismisses the popover on a genuine outside click', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    assert.ok(colorPopover(target), 'popover opens on right-click');

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    flushSync();

    assert.ok(!colorPopover(target), 'an outside mousedown still dismisses the popover');
  });

  it('still dismisses the popover on Escape while open', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    assert.ok(colorPopover(target), 'popover opens on right-click');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    assert.ok(!colorPopover(target), 'Escape still dismisses the popover');
  });

  // THE POSITIONING HALF (issue 1500). Every case above is about DISMISSAL.
  //   bounds  `.manager-main` at left 60 / right 1220, inset 16 → minLeft 76, maxRight 1204
  //   width   `minWidth: maxWidth: 220` from the view's own `layoutOptions` → 220
  //   left    horizontalAlign 'left' → the trigger's own 140, inside [76, 1204 − 220]
  //   height  preferred 380, and the space below the trigger (800 − 130 − 6 − 16 = 648) exceeds it
  //   top     the trigger's bottom 130 plus the 6px gap → 136, so the placement is 'bottom'
  it('positions the portaled panel where the deleted block would have', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'popover opens on right-click');

    assert.equal(
      opened.getAttribute('style'),
      'left: 140px; right: auto; width: 220px; min-width: 220px; max-width: 220px; ' +
        'max-height: 380px; top: 136px; bottom: auto;'
    );
  });

  // THE CLAMP, on the one geometry that can see it. The case above measures a panel with room on
  // both sides, where `bounds: MANAGER_MAIN_SELECTOR` and the action's default window margin
  // return the same number — so deleting the `bounds` option entirely leaves it green, and the
  // boundary the conversion had to carry over from the deleted block would be unguarded.
  it('clamps the panel to the manager column and not to the window', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target, 1020);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'popover opens on right-click');

    assert.equal(
      opened.getAttribute('style'),
      'left: 984px; right: auto; width: 220px; min-width: 220px; max-width: 220px; ' +
        'max-height: 380px; top: 136px; bottom: auto;'
    );
  });

  it('a click inside the popover does not dismiss it', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    const popover = colorPopover(target);
    assert.ok(popover, 'popover opens on right-click');

    popover.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    flushSync();

    assert.ok(colorPopover(target), 'a mousedown inside the popover leaves it open');
  });
});
