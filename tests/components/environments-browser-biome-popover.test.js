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
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/util/dropUtils.js',
    // The browse view-state the environments browser and its two gathering children
    // read (issue 1438).
    'src/utils/managerBrowserViewState.js',
    // The shared colour-token constant + its localized labels (issue 1036). Both colour
    // components import it, and both are compiled below.
    'src/ui/svelte/util/managerColorTokens.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/ui/svelte/actions/dragDrop.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Field.svelte',
    // The manager's ONE labelled push-button (issue 1118). This tree renders it from
    // EnvironmentsBrowserView and from the two gathering browsers it embeds; omitting it
    // reds `mounted-harness-primitive-allowlist.test.js` and HANGS this suite.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/components/ManagerColorPicker.svelte',
    'src/ui/svelte/components/ManagerColorPopover.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
    'src/ui/svelte/apps/manager/GatheringEconomyView.svelte',
    'src/ui/svelte/apps/manager/ResolutionModeCard.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/components/SearchablePopover.svelte',
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
// mounted root as the manager shell so `resolveOverlayHost` — which `anchoredPopover`
// calls on the view's behalf since issue 1500 converted this seventh hand-written copy
// — walks up to a host. WITHOUT this the portal no-ops and the popover never leaves the
// trigger's own DOM subtree, which would silently defeat the regression this suite
// exists to catch, since the real bug only exists once the popover is portaled away
// from the trigger.
//
// THE `.manager-main` RECT IS THE SECOND STUB, and it is what makes the panel take a
// position at all rather than merely a parent. `bounds` here is the SELECTOR STRING
// `MANAGER_MAIN_SELECTOR`, which the action resolves with `anchor.closest('.manager-main')`
// (`anchoredPopover.js:185-190`) — not with `ancestorScrollerBounds`, whose skip-the-zero-
// sized-candidate walk belongs to the callers that pass a resolver (`overlayBounds.js:65-72`).
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

// Opening the popover also runs the effect that applies `anchoredPopover`, which portals
// the panel and registers `window` resize / capture-`scroll` listeners (unrelated to the
// dismissal bug this suite covers). That effect pass is scheduled a tick after the state
// change, so a single synchronous `flushSync()` is not enough to settle it.
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
    // `defineProperty` and not `window.innerWidth = 1280`: happy-dom declares both as
    // accessors with no setter, so a plain assignment is silently dropped in sloppy mode
    // and they stay `undefined`. The positioning pass falls back to the window box when
    // the host reports no size, so without a real viewport the layout has no answer and
    // the panel is left unpositioned — see `stageManagerShell` for the other half.
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
    // `assert.ok(a === b)` and not `assert.equal(a, b)`: on failure node:assert serialises both
    // operands to build its diff, and a happy-dom element's own enumerable state reaches its
    // parents, its children and its owner document — so the failure allocates until the heap
    // dies and the suite reports `# cancelled` with no message. The boolean fails in words.
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

  // THE POSITIONING HALF (issue 1500). Every case above is about DISMISSAL, and each of them is
  // satisfied by a popover that opens, portals and is then laid out nowhere at all: the conversion
  // deleted a hand-written measure/clamp/place block from this view and handed the job to
  // `anchoredPopover` + `bounds: MANAGER_MAIN_SELECTOR`, and a conversion that portals correctly
  // while measuring against the wrong box is exactly the regression a dismissal assertion cannot
  // see.
  //
  // The string is not a golden value copied out of a run. It is the arithmetic of the deleted
  // block over the two stubs, and every term is checkable by hand against
  // `computeIconPickerPopoverLayout`:
  //
  //   bounds  `.manager-main` at left 60 / right 1220, inset 16 → minLeft 76, maxRight 1204
  //   width   `minWidth: maxWidth: 220` from the view's own `layoutOptions` → 220
  //   left    horizontalAlign 'left' → the trigger's own 140, inside [76, 1204 − 220]
  //   height  preferred 380, and the space below the trigger (800 − 130 − 6 − 16 = 648) exceeds it
  //   top     the trigger's bottom 130 plus the 6px gap → 136, so the placement is 'bottom'
  //
  // A width option dropped, a flip to `top`, or a layout that stopped being applied at all
  // therefore reds here with the offending term visible in the diff, rather than passing as "the
  // popover opened". The CLAMP is not one of the terms this case can see — at a trigger 140px
  // from the left of a 1160px column, the column's boundary and the window's agree on the answer
  // — which is what the case below it exists for.
  it('positions the portaled panel where the deleted block would have', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'popover opens on right-click');

    assert.equal(
      opened.getAttribute('style'),
      'left: 140px; right: auto; width: 220px; max-height: 380px; top: 136px; bottom: auto;'
    );
  });

  // THE CLAMP, on the one geometry that can see it. The case above measures a panel with room on
  // both sides, where `bounds: MANAGER_MAIN_SELECTOR` and the action's default window margin
  // return the same number — so deleting the `bounds` option entirely leaves it green, and the
  // boundary the conversion had to carry over from the deleted block would be unguarded.
  //
  // A trigger 1020px in has 260px of window to its right and only 200px of COLUMN, so the two
  // boundaries now disagree and the panel is placed by whichever one the action was given:
  //
  //   with `bounds`      maxRight 1204 → maxLeft 1204 − 220 = 984, and 1020 clamps back to 984
  //   without it         maxRight 1264 → maxLeft 1044, and 1020 is left where it asked to be
  //
  // 984 is therefore a value only the column can produce. The manager column is the box the biome
  // panel must not overhang — it scrolls, and a panel laid out past its right edge is the defect
  // `MANAGER_MAIN_SELECTOR` names.
  it('clamps the panel to the manager column and not to the window', async () => {
    const target = await mountSettingsTab();
    const trigger = stageManagerShell(target, 1020);

    await openBiomePopover(trigger);
    const opened = colorPopover(target);
    assert.ok(opened, 'popover opens on right-click');

    assert.equal(
      opened.getAttribute('style'),
      'left: 984px; right: auto; width: 220px; max-height: 380px; top: 136px; bottom: auto;'
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
