import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

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
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/dropUtils.js',
    // The shared colour-token constant + its localized labels (issue 1036). Both colour
    // components import it, and both are compiled below.
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/dragDrop.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
    'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
    'src/ui/svelte/apps/manager/PartyNameField.svelte',
    'src/ui/svelte/apps/manager/RealmOverridePicker.svelte',
    // The three card components the parties rebuild added (issue 1182), each imported
    // by PartyExpandedBody, so each must be compiled before it.
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
// mounted root as the manager shell so `getBiomeColorPopoverHost`'s
// `.closest('.fabricate-manager')` lookup resolves. WITHOUT this the portal action
// no-ops (see src/ui/svelte/actions/portal.js) and the popover never leaves the
// trigger's own DOM subtree — which would silently defeat the regression this suite
// exists to catch, since the real bug only exists once the popover is portaled away
// from the trigger.
function stageManagerShell(target) {
  target.classList.add('fabricate-manager');
  const trigger = biomeTrigger(target);
  trigger.getBoundingClientRect = () => ({
    left: 140,
    top: 100,
    right: 170,
    bottom: 130,
    width: 30,
    height: 30,
  });
  return trigger;
}

// Opening the popover also runs the position-tracking effect, which registers
// `window` resize/scroll listeners (unrelated to the dismissal bug this suite
// covers). That effect pass is scheduled a tick after the state change, so a
// single synchronous `flushSync()` is not enough to settle it.
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
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it("right-clicking the open popover's own trigger closes it instead of reopening it", async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'first right-click opens the popover');
    assert.equal(
      opened.parentElement,
      target,
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

    assert.equal(
      colorPopover(target),
      null,
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

    assert.equal(colorPopover(target), null, 'an outside mousedown still dismisses the popover');
  });

  it('still dismisses the popover on Escape while open', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    assert.ok(colorPopover(target), 'popover opens on right-click');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    assert.equal(colorPopover(target), null, 'Escape still dismisses the popover');
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
