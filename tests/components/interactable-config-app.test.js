/**
 * String-shape coverage for the rich GM Interactable config panel app + root,
 * mirroring the `interactable-browser-app.test.js` convention (the Svelte
 * components are not compiled in the Node test runner, so we assert their source
 * shape). The non-trivial view logic is covered separately by
 * interactable-config-view.test.js + interactable-config-actions.test.js.
 *
 * Covers: ApplicationV2 + SvelteApplicationMixin per-ref instance semantics, the
 * services bag routing every write through the active-GM behaviour-update edge
 * (no client-side mutation), the action seams (test-as-player, jump, relink,
 * recreate, remove, restock, enable/lock, delete), and the factory registration.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitInteractableBehaviorWrite } from '../../src/canvas/interactableSocketBridge.js';
import { planSetEnabled, planSetLocked } from '../../src/canvas/regions/interactableConfigActions.js';
import {
  SMOKE_SOURCE,
  assertLocatorsEmitted,
  emittingHalfOf,
  prefixedTokensIn,
} from '../helpers/interactablesSmokeLocators.js';
import {
  CONFIG_PANEL_CONTRACT,
  assertWindowContract,
} from '../helpers/interactablesWindowContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractableConfigApp.svelte.js'),
  'utf8'
);
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/InteractableConfigRoot.svelte'),
  'utf8'
);

/**
 * The primitives this panel adopted (issue 1520), read so the clauses below can assert the
 * WHOLE chain rather than one end of it.
 *
 * A source-shape suite that only checked what this root PASSES would pass just as happily if
 * the primitive stopped honouring it, and one that only checked the primitive would say
 * nothing about this window. Each retargeted clause therefore reads both: the prop this root
 * writes, and the attribute, class or paint the primitive turns it into.
 */
const noticeSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/components/Notice.svelte'),
  'utf8'
);
const statusToggleSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/components/StatusToggle.svelte'),
  'utf8'
);
const selectSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/components/Select.svelte'),
  'utf8'
);
const popoverLayoutSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/util/iconPickerPopover.js'),
  'utf8'
);
const sheetSource = readFileSync(resolve(__dirname, '../../styles/fabricate.css'), 'utf8');

describe('InteractableConfigApp shell', () => {
  it('is an ApplicationV2 + SvelteApplicationMixin app keyed by a stable id', () => {
    assert.ok(appSource.includes('SvelteApplicationMixin('), 'uses the SvelteApplicationMixin');
    assert.ok(appSource.includes('foundry.applications.api.ApplicationV2'), 'extends ApplicationV2');
    assert.ok(appSource.includes('static SVELTE_COMPONENT = InteractableConfigRoot'), 'mounts the config root');
    assert.ok(appSource.includes("id: 'fabricate-interactable-config'"), 'stable window id');
  });

  it('opens against a behaviour ref / document and keeps one instance per ref', () => {
    assert.ok(appSource.includes('static _instances = new Map()'), 'tracks one instance per ref');
    assert.ok(appSource.includes('static async show(target = {})'), 'static show(target)');
    assert.ok(appSource.includes('identifyRegionBehaviorRef(target.document)'), 'accepts a RegionBehavior document');
    assert.ok(appSource.includes('existing.bringToFront()'), 're-show brings the existing window to front');
  });

  it('clears its per-ref instance on close() and the _onClose safety net', () => {
    assert.ok(appSource.includes('InteractableConfigApp._instances.delete(key)'), 'close paths clear the instance map');
    assert.ok(appSource.includes('async close(options)') && appSource.includes('_onClose(options)'), 'both close paths exist');
  });

  it('routes every write through the active-GM behaviour-update edge (no client mutation)', () => {
    // The panel must not call behavior.update(...) directly; all writes go through
    // emitInteractableBehaviorWrite (local apply on the active GM, socket emit
    // otherwise) or the active-GM-routed applier seams.
    // writeBehavior wraps system-CONTENTS under `system` exactly once — a
    // RegionBehavior.update needs `{ system: ... }` or the write silently no-ops
    // (BUG: Disable/Lock never persisted). The relink/recreate seams wrap
    // separately and must NOT route through writeBehavior.
    assert.ok(appSource.includes('emitInteractableBehaviorWrite(behavior)({ system: systemPatch })'), 'writeBehavior wraps the system patch under { system }');
    assert.ok(!/behavior\.update\(/.test(appSource), 'no direct behavior.update(...) client mutation');
    assert.ok(appSource.includes('applyInteractableBehaviorUpdate'), 'relink/recreate route the GM behaviour-update edge');
  });

  it('wires the action seams to their live edges', () => {
    assert.ok(appSource.includes('_requestActivation?.(behavior, {') && appSource.includes("activationSource: 'gmTest'"), 'test-as-player runs the activation pipeline with gmTest');
    assert.ok(appSource.includes('canvas?.animatePan?.('), 'jump pans the camera');
    assert.ok(appSource.includes('relinkVisual(behavior, selected'), 'relink uses the selected visual');
    assert.ok(appSource.includes('this._controlledVisual()'), 'relink resolves a controlled Tile/Drawing/Token generically');
    assert.ok(appSource.includes('recreateLinkedTile(behavior'), 'recreate creates a replacement tile');
    assert.ok(appSource.includes('recreateLinkedDrawing(behavior'), 'create-drawing-marker uses recreateLinkedDrawing');
    assert.ok(appSource.includes('planClearVisualLink('), 'remove clears the visual link');
    assert.ok(appSource.includes('planSetEnabled(') && appSource.includes('planSetLocked('), 'enable/lock toggles use the pure planners');
    assert.ok(appSource.includes('planInteractableDeletion(region'), 'delete decides scope via the pure ownership plan (issue 533)');
    assert.ok(appSource.includes('executeInteractableDeletion(region, plan)'), 'delete applies the plan (region vs behaviour-only)');
    assert.ok(!appSource.includes('region.delete?.()'), 'never wholesale-deletes a promoted user region');
    assert.ok(appSource.includes('applyMissingPolicy('), 'missing-visual recovery reuses applyMissingPolicy');
  });

  it('upgrades a region-only interactable to a linked Tile via the Create-marker seam', () => {
    assert.ok(appSource.includes('createMarker:'), 'declares the Create-marker service');
    // The upgrade reuses recreateLinkedTile (GM-routed) and flips the behaviour
    // back to a visible marker (mode marker, un-hidden) — not a divergent path.
    assert.ok(appSource.includes("linkedVisual: { mode: 'marker' }"), 'flips linkedVisual.mode back to marker');
    assert.ok(appSource.includes('presentation: { hidden: false }'), 'un-hides the upgraded interactable');
  });

  it('offers a Create-drawing-marker seam (Phase 4) that flips the behaviour to a visible marker', () => {
    assert.ok(appSource.includes('createDrawingMarker:'), 'declares the Create-drawing-marker service');
    assert.ok(appSource.includes('recreateLinkedDrawing(behavior'), 'creates a Drawing via recreateLinkedDrawing (GM-routed)');
    assert.ok(/createDrawingMarker:[\s\S]*?_assertGM\(\)/.test(appSource), 'GM-guarded');
  });

  it('relinks generically (Tile OR Drawing OR Token) via a single Relink-selected seam', () => {
    assert.ok(appSource.includes('relinkSelected:'), 'declares the generic relinkSelected service');
    assert.ok(appSource.includes('canvas?.drawings?.controlled'), 'considers a controlled Drawing for relink');
    assert.ok(appSource.includes('canvas?.tokens?.controlled'), 'considers a controlled Token for relink');
  });

  it('confirms destructive actions through a 3-way DialogV2 choice (choiceDialog), never globalThis.confirm', () => {
    assert.ok(appSource.includes('choiceDialog('), 'uses the DialogV2 choice bridge');
    assert.ok(!appSource.includes('globalThis.confirm('), 'never uses globalThis.confirm');
    // Remove-visual + delete-interactable both offer a Cancel outcome that does
    // not mutate (a real 3-way choice, not a yes/no that always clears).
    assert.ok(appSource.includes("if (choice === 'cancel') return"), 'a cancel outcome aborts without mutating');
    assert.ok(appSource.includes("action: 'unlink'") && appSource.includes("action: 'delete'"), 'remove-visual offers unlink-only and unlink+delete');
    assert.ok(appSource.includes("action: 'deleteWithVisual'"), 'delete offers delete + visual');
  });

  it('GM-guards every mutating action seam (defense in depth)', () => {
    assert.ok(appSource.includes('_assertGM()'), 'declares a GM guard');
    assert.ok(appSource.includes('game?.user?.isGM === true'), 'guard checks the GM flag');
    assert.ok(appSource.includes('if (!this._assertGM())'), 'mutating seams short-circuit for non-GMs');
  });

  it('self-registers via the app factory (no static import where avoidable)', () => {
    assert.ok(appSource.includes('registerInteractableConfigApp(InteractableConfigApp)'), 'registers with the factory');
  });

  it('configures the source through the pure planner + the GM-routed write seam (issue 342)', () => {
    // The identity picker reuses the SHARED source enumeration (no third
    // enumeration) and writes through the existing GM-routed updateBehavior seam
    // via the pure planConfigureSource (never a partial identity).
    assert.ok(appSource.includes("from './interactableSourceLibrary.js'"), 'reuses the shared source enumeration');
    assert.ok(appSource.includes('listSystemOptions(this._sourceDeps())'), 'lists systems from the shared library');
    assert.ok(appSource.includes('listToolSourceOptions(this._sourceDeps()'), 'lists tools from the shared library');
    assert.ok(appSource.includes('listTaskSourceOptions(this._sourceDeps()'), 'lists tasks from the shared library');
    assert.ok(appSource.includes('configureSource:'), 'declares the configureSource service');
    assert.ok(appSource.includes('planConfigureSource(readInteractableBehaviorSystem(behavior)'), 'uses the pure planner');
    assert.ok(/configureSource:[\s\S]*?_assertGM\(\)/.test(appSource), 'configureSource is GM-guarded');
    // The write routes through writeBehavior (the GM-routed seam), and no-ops on an
    // incomplete selection (planner returns null → no partial write).
    assert.ok(/configureSource:[\s\S]*?if \(!patch\) return undefined/.test(appSource), 'no-ops on an incomplete selection (no partial write)');
    assert.ok(/configureSource:[\s\S]*?writeBehavior\(patch\.system\)/.test(appSource), 'routes the GM behaviour-update seam');
  });

  it('reconciles the linked tile hidden on enable/disable + hidden toggles, but NOT on lock', () => {
    // setEnabled + setHidden reconcile the marker's player visibility (concealed
    // ⇒ tile.hidden = true) immediately after the behaviour write; setLocked must
    // NOT touch tile.hidden (a locked interactable stays visible to players).
    assert.ok(appSource.includes('_reconcileMarkerHidden()'), 'declares the hidden reconcile helper');
    assert.ok(appSource.includes('resolveMarkerHidden(system)'), 'uses the pure resolveMarkerHidden decision');
    assert.ok(appSource.includes('setHidden: (hidden)'), 'declares a dedicated setHidden service that reconciles');
    // Both setEnabled and setHidden call the reconcile; setLocked does not.
    const setEnabledBlock = appSource.slice(appSource.indexOf('setEnabled: (enabled)'), appSource.indexOf('setHidden: (hidden)'));
    assert.ok(setEnabledBlock.includes('_reconcileMarkerHidden()'), 'setEnabled reconciles the tile hidden');
    const setLockedStart = appSource.indexOf('setLocked: (locked)');
    const setLockedBlock = appSource.slice(setLockedStart, appSource.indexOf('applyMissingVisualPolicy:', setLockedStart));
    assert.ok(!setLockedBlock.includes('_reconcileMarkerHidden()'), 'setLocked does NOT reconcile tile hidden (locked stays visible)');
    // The reconcile routes through the active-GM visual-update edge (not a direct write).
    assert.ok(/_reconcileMarkerHidden\(\)\s*\{[\s\S]*?emitInteractableVisualUpdate\(/.test(appSource), 'reconcile routes the active-GM visual-update edge');
    assert.ok(/_reconcileMarkerHidden\(\)\s*\{[\s\S]*?update: \{ hidden: desiredHidden \}/.test(appSource), 'reconcile writes the tile hidden flag');
  });
});

describe('InteractableConfigApp behaviour-write wrap (BUG: Disable/Lock no-op)', () => {
  afterEach(() => {
    delete globalThis.game;
  });

  // Build a fake RegionBehavior wired into a fake scene→region→behaviour graph so
  // `emitInteractableBehaviorWrite` (the App's write seam) resolves + applies it
  // locally as the active GM. `update` records the exact shape it received — the
  // contract the App's `writeBehavior({ system: systemPatch })` wrap depends on.
  function fakeBehaviorGraph() {
    const updates = [];
    const behavior = {
      id: 'beh1',
      type: 'fabricate.interactable',
      update: async (data) => { updates.push(data); }
    };
    const region = { id: 'reg1', behaviors: { get: (id) => (id === 'beh1' ? behavior : null) } };
    const scene = { id: 'scn1', regions: { get: (id) => (id === 'reg1' ? region : null) } };
    behavior.parent = region;
    region.parent = scene;
    const user = {};
    globalThis.game = {
      user,
      users: { activeGM: user },
      scenes: { get: (id) => (id === 'scn1' ? scene : null) },
      socket: { emit: () => { throw new Error('must not emit when active GM'); } }
    };
    return { behavior, updates };
  }

  it('setEnabled composes planSetEnabled → behavior.update({ system: { state: { enabled } } })', async () => {
    const { behavior, updates } = fakeBehaviorGraph();
    // The App's setEnabled does: writeBehavior(planSetEnabled(system, false).system)
    // and writeBehavior wraps once under `system`.
    const patch = planSetEnabled({ interactableType: 'gatheringTask', state: { enabled: true } }, false);
    assert.ok(patch, 'planner returns a patch for a real value change');
    await emitInteractableBehaviorWrite(behavior)({ system: patch.system });
    assert.deepEqual(updates, [{ system: { state: { enabled: false } } }], 'wrapped under system, not raw state');
  });

  it('setLocked composes planSetLocked → behavior.update({ system: { state: { locked } } })', async () => {
    const { behavior, updates } = fakeBehaviorGraph();
    const patch = planSetLocked({ interactableType: 'gatheringTask', state: { locked: false } }, true);
    assert.ok(patch, 'planner returns a patch for a real value change');
    await emitInteractableBehaviorWrite(behavior)({ system: patch.system });
    assert.deepEqual(updates, [{ system: { state: { locked: true } } }], 'wrapped under system, not raw state');
  });
});

describe('InteractableConfigRoot body', () => {
  it('renders from the injected services summary (thin view)', () => {
    assert.ok(rootSource.includes('services?.summarize?.()'), 'reads the summary view model from services');
    assert.ok(rootSource.includes('services?.resolveSourceLabel?.()'), 'resolves the tool/task label via services');
    assert.ok(rootSource.includes('services?.resolveEnvironmentLabel?.()'), 'resolves the environment label via services');
  });

  it('writes editable fields through services.updateBehavior (active-GM routed)', () => {
    assert.ok(rootSource.includes('services?.updateBehavior?.('), 'editable fields route through updateBehavior');
    assert.ok(rootSource.includes("services?.updateBehavior?.({ presentation: { promptText:"), 'prompt text is editable');
    assert.ok(rootSource.includes("services?.updateBehavior?.({ activation: { audience }"), 'audience is editable');
    assert.ok(rootSource.includes("services?.updateBehavior?.({ linkedVisual: { missingPolicy }"), 'missing policy is editable');
  });

  it('exposes every action button wired to its services seam', () => {
    assert.ok(rootSource.includes('services?.testAsPlayer?.()'), 'Test as player');
    assert.ok(rootSource.includes('services?.jumpToRegion?.()') && rootSource.includes('services?.jumpToVisual?.()'), 'Jump buttons');
    assert.ok(rootSource.includes('services?.relinkSelected?.()'), 'Relink selected (generic)');
    assert.ok(rootSource.includes('services?.createReplacementTile?.()'), 'Create replacement tile');
    assert.ok(rootSource.includes('services?.createDrawingMarker?.()'), 'Create drawing marker');
    assert.ok(rootSource.includes('services?.removeVisualMarker?.()'), 'Remove visual marker');
    assert.ok(rootSource.includes('services?.setEnabled?.(!view.state.enabled)'), 'Enable/Disable toggle');
    assert.ok(rootSource.includes('services?.setLocked?.(!view.state.locked)'), 'Lock/Unlock toggle');
    assert.ok(rootSource.includes('services?.setHidden?.('), 'Hidden toggle routes through the setHidden service (reconciles the tile)');
    assert.ok(rootSource.includes('services?.deleteInteractable?.()'), 'Delete');
  });

  it('shows the missing-visual recovery affordances behind the missing status', () => {
    assert.ok(rootSource.includes("visualStatus.severity === 'missing'"), 'gates recovery on the missing status');
    assert.ok(rootSource.includes('describeVisualStatus('), 'uses the pure visual-status helper');
  });

  it('offers a Create-marker upgrade for a region-only interactable (status none)', () => {
    assert.ok(rootSource.includes("visualStatus.severity === 'none'"), 'gates the upgrade on the region-only status');
    assert.ok(rootSource.includes('services?.createMarker?.()'), 'wires the Create-marker seam');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.CreateMarker'), 'localized Create marker label');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker'), 'localized Create drawing marker label');
  });

  it('offers Relink + Remove affordances for a resolved (ok) marker', () => {
    assert.ok(rootSource.includes("visualStatus.severity === 'ok'"), 'gates the resolved-marker actions on the ok status');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.RemoveVisualMarker'), 'localized Remove visual marker label');
  });

  it('localizes every string through the foundry bridge under the Config namespace', () => {
    assert.ok(rootSource.includes("import { localize }"), 'imports the localize bridge');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.'), 'uses Config-namespaced keys');
  });

  // EVERY LOCATOR THE SMOKE USES IS STILL EMITTED (issue 1520).
  //
  // Each of these attributes moved from an element this file writes onto a shared primitive's
  // element - through a rest spread, a `triggerData` map or a `dataAttr` prop - and one
  // of them (`data-interactable-needs-config`) had NO route at all until `Notice`'s
  // declared hook prop was used, because that component takes no rest spread. The View Lab's
  // two config cases select on three of them as well, and a lab selector that resolves nothing
  // fails the WHOLE capture rather than one frame.
  //
  // THE MECHANISM MOVED TO `tests/helpers/interactablesSmokeLocators.js` (issue 1520, phase 5),
  // which is where the browser's and the manager's own copies of this clause read it from as
  // well. One extraction and one matcher, so the token terminator and the non-vacuity floor
  // cannot be right in one window's suite and wrong in another's - and so three near-identical
  // loops do not become new duplicated lines under the SonarCloud gate.
  //
  // The PREFIX is scoped and the negative lookahead is load-bearing rather than tidy: phase 5
  // added `data-interactable-manager-*` and `data-interactable-browser-*` hooks to the same
  // harness, and an unscoped `data-interactable-*` scan would assert THIS root writes them.
  it('still emits every data-interactable-* locator the Foundry smoke drives', () => {
    assertLocatorsEmitted({
      locators: prefixedTokensIn(SMOKE_SOURCE, 'data-interactable-(?!manager-|browser-)'),
      rootSource,
      floor: 9,
      what: 'config-panel hooks',
      root: 'the config root',
    });
    // The window's own root container, which the smoke waits on three times and which the
    // conversion deliberately KEEPS: it is the scroll box, not a control family.
    assert.ok(SMOKE_SOURCE.includes('.fabricate-interactable-config'), 'the smoke keys on the root container');
    assert.ok(rootSource.includes('class="fabricate-interactable-config"'), 'and the root container is still emitted');
  });

  // AN OPTION PANEL IS NEVER NARROWER THAN THE TRIGGER IT DROPS FROM (issue 1520 review).
  //
  // The published `interactables-config-source-open` frame - the one the design-system spec now
  // REQUIRES this change to carry, because it is the only assertion that distinguishes a panel
  // portalled onto the window frame from one that fell back to `<body>` - shipped a 340px option
  // panel hanging under a 450px trigger. The two halves are separately correct and wrong
  // together: this window states `width: 100%` on the trigger, as `Select` documents a
  // converting full-width site must, and `Select`'s `form` rung caps its PANEL at 340px, which
  // was the primitive's own untouched band from before any full-width caller existed. A native
  // `<select>`'s popup is never narrower than its control, and these replaced native `<select>`s.
  //
  // Every link is read, because the cap is spent through three files: the constant this window
  // passes, the prop the primitive honours in preference to its band, and the clamp that turns
  // the pair into a width. The count is EXACT so a ninth select added without the cap reds here
  // rather than shipping one narrow panel among eight correct ones.
  it('caps its option panels wide enough for a full-width trigger', () => {
    assert.ok(
      rootSource.includes('const OPTION_PANEL_MAX_WIDTH = 480'),
      "the cap is this window's declared width, so it never binds and the trigger decides"
    );
    // THE CORPUS IS THE EMITTING HALF, matching the sibling clause in
    // `interactable-browser-app.test.js` (issue 1520 review round 2). Correct either way today —
    // no comment in this root writes a `<Select …/>` tag — but an EXACT count over a whole-file
    // corpus is a census a docblock example can move, and two clauses added in one change should
    // not read the same file two ways.
    const selects = emittingHalfOf(rootSource).match(/<Select\b[\s\S]*?\/>/g) ?? [];
    assert.equal(selects.length, 8, 'the panel renders eight shared selects');
    for (const tag of selects) {
      assert.ok(
        tag.includes('maxWidth={OPTION_PANEL_MAX_WIDTH}'),
        `a select opens at the primitive's 340px band under a full-width trigger:\n${tag}`
      );
    }
    assert.ok(
      /\.fabricate-select-field \.fabricate-select-trigger\)\s*\{\s*width:\s*100%/.test(rootSource),
      'the trigger is full width, which is what makes the band too narrow'
    );

    // The primitive's half, both ends: the band the cap replaces, and the precedence that lets a
    // caller replace it. A `maxWidth` prop that stopped winning over the band would leave every
    // assertion above green and every panel narrow again.
    assert.ok(
      selectSource.includes('form: Object.freeze({ minWidth: 240, maxWidth: 340 })'),
      "the form rung's own band is the 340px one this window overrides"
    );
    assert.ok(
      selectSource.includes('maxWidth={maxWidth || band.maxWidth}'),
      'a caller-supplied cap wins over the rung band'
    );

    // And the clamp, which is why raising the cap widens the panel instead of fixing it at 480:
    // the panel takes the trigger's width, floored at `minWidth` and ceilinged at `maxWidth`.
    assert.ok(
      popoverLayoutSource.includes('clamp(Math.max(triggerWidth, minWidth), minWidth, maxWidth)'),
      'the panel width tracks the trigger between the two bounds'
    );
  });

  // THE PANEL'S STYLING CONTRACT, STATED FORWARD (issue 1520).
  //
  // This clause used to assert `rootSource.includes('.fab-ic-')` under the message "component
  // classes are fab-ic-* scoped" - which asserted the PRESENCE of the exact debt issue 1520
  // removes, and which would still pass today, because layout residue keeps the prefix alive.
  // Deleting it would have left this suite saying nothing at all about how the window is
  // painted, so it is inverted instead: every CONTROL family is a shared primitive imported
  // from `src/ui/svelte/components/`, and the `.fab-ic-*` names that survive are an
  // EXACT allow-list of this window's own layout.
  //
  // THE STATEMENT AND ITS DATA BOTH LIVE IN `tests/helpers/interactablesWindowContract.js`,
  // which the browser's and the manager's own copies of this clause read as well: one shape
  // over three allow-lists, so an exactness that is right for one window cannot be loosened
  // for another - and so three near-identical bodies do not become new duplicated lines.
  it('renders the shared control primitives and keeps only its own layout classes', () => {
    assertWindowContract({ rootSource, contract: CONFIG_PANEL_CONTRACT });
  });

  // THE LIVE STATE IS A SWITCH WHERE THE LABEL IS A STATE, AND A PRESSED BUTTON WHERE IT IS NOT
  // (issue 1520, and the maintainer ruling at review).
  //
  // Two of this panel's four `aria-pressed` controls are `<StatusToggle>`s - the task-node link,
  // whose two labels read "Linked to gathering task" / "Independent…", and "Hidden from players".
  // The other two are NOT, and that is the ruling rather than an omission: "Disable" and "Lock"
  // flip to "Enable" and "Unlock", which are action verbs, so a knob drawn ON beside the word
  // "Enable" states the opposite of the state it reports. Issue 1625 supplies the state readings
  // and converts them; until then they are `ManagerButton`s carrying `aria-pressed`.
  //
  // Every link in each chain is read, because any one of them alone would go green while the
  // pair beside it was broken.
  it('shows the live linked/hidden state on the shared switch (on -> aria-pressed + is-on)', () => {
    assert.ok(rootSource.includes('on={!isUnlinked}'), 'the task-node switch is on when the node is linked');
    assert.ok(rootSource.includes('on={view.presentation.hidden}'), 'the hidden switch is on when the interactable is hidden from players');

    // The primitive's half: `on` becomes the announcement AND the drawn position. The Foundry
    // smoke asserts `aria-pressed` on the node-link toggle and the View Lab's configured case
    // selects on it, so this link is load-bearing well beyond this file.
    assert.ok(statusToggleSource.includes('aria-pressed={on}'), 'StatusToggle announces `on` as aria-pressed');
    assert.ok(statusToggleSource.includes('on ? STATE_CLASSES.on : STATE_CLASSES.off'), 'StatusToggle draws `on` as its state class');
    assert.ok(statusToggleSource.includes("const STATE_CLASSES = Object.freeze({ on: 'is-on', off: 'is-off' })"), 'the state class is is-on/is-off');

    // The sheet's half: the on position is a THEMED accent, never a literal colour - which is
    // the substance the deleted `.fab-ic-btn-toggle.is-active` assertion carried.
    assert.ok(
      /\.fabricate-toggle\.manager-status-toggle\.is-on\s*\{[^}]*var\(--fab-accent\)/.test(sheetSource),
      'the on position is painted with the themed accent token'
    );
  });

  // AND EACH SWITCH REACHES THE `aria-pressed` BRANCH, which the clause above does NOT establish
  // (issue 1520 review). `StatusToggle` renders one of three hosts off its `as` prop, and only
  // the default `button` host writes `aria-pressed`: `as="checkbox"` renders a `<label>` around
  // a real `<input type="checkbox">` and `as="indicator"` renders a `<span role="img">`, neither
  // of which announces a pressed state at all. So "the root passes `on`" plus "the primitive CAN
  // emit `aria-pressed` from `on`" leaves the one step between them unasserted - and the step is
  // load-bearing: the Foundry smoke reads `aria-pressed` off the node-link control and
  // `interactables-config-configured` selects on it, so a host change here would fail a capture
  // WHOLE rather than fail a test.
  //
  // Asserted as the ABSENCE of a host declaration on every tag, not as the presence of an
  // expected one, because the default is what these sites want and writing `as="button"` on each
  // would be the same statement made twice. The rest spread is refused for the same reason it
  // would defeat the check: `{...someBag}` could carry an `as` this scan cannot see.
  it('leaves every one of its switches on the default pressable host', () => {
    const tags = rootSource.match(/<StatusToggle\b[\s\S]*?\/>/g) ?? [];
    assert.equal(tags.length, 2, 'the panel renders exactly the node-link and hidden switches');
    for (const tag of tags) {
      assert.ok(!/\bas=/.test(tag), `a switch declares a host, so it may not announce aria-pressed:\n${tag}`);
      assert.ok(!/\{\.\.\./.test(tag), `a switch spreads props, which could carry a host:\n${tag}`);
    }
    // The primitive's half of the same statement, so a default flipped there reds here too.
    assert.ok(statusToggleSource.includes("as = 'button'"), 'the unspecified host is the pressable button');
  });

  // THE TWO CONTROLS THAT DECLINED THE CONVERSION, PINNED AS BUTTONS (issue 1520, maintainer
  // ruling). Without this clause the ruling lives only in a source comment, and the next reader
  // "finishes the job" - which is exactly the outcome the ruling rejects. The polarity is pinned
  // with it: `aria-pressed` reads DISABLED and LOCKED, which is what the shipped button announced
  // before the conversion and what issue 1625 must preserve when it supplies the state readings.
  it('keeps Disable and Lock as pressed buttons, with the state on aria-pressed', () => {
    assert.ok(rootSource.includes('aria-pressed={view.state.enabled === false}'), 'Disable announces pressed while the interactable is disabled');
    assert.ok(rootSource.includes('aria-pressed={view.state.locked === true}'), 'Lock announces pressed while the interactable is locked');
    assert.ok(!rootSource.includes('on={view.state.enabled === false}'), 'Disable is not a switch');
    assert.ok(!rootSource.includes('on={view.state.locked === true}'), 'Lock is not a switch');

    // The pressed state has a VISUAL expression, which is the half the sheet records as missing
    // for the component browser's grouping switch - a `.manager-button` under a class with no CSS
    // anywhere, so its `aria-pressed` state was announced and never drawn. Keyed on the attribute
    // rather than on a companion class, so the drawn and announced states cannot drift.
    assert.ok(
      /\.fab-ic-actions :global\(\.fabricate-button\[aria-pressed='true'\]\)\s*\{[^}]*var\(--fab-accent\)/.test(rootSource),
      'the pressed state is drawn from the themed accent token, keyed on aria-pressed'
    );
  });

  it('renders the read-only facts as an inline grid and labels the gate "Status"', () => {
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.StatusLabel'), 'uses the Status label key (renamed from Activation)');
    assert.ok(!rootSource.includes('FABRICATE.Canvas.Interactable.Config.ActivationLabel'), 'no longer references the Activation label key');
    // Grid layout: 3 columns with the environment fact, 2 without — driven by a
    // class toggle, with a min-width container collapse for narrow panels.
    assert.ok(rootSource.includes("class:has-environment={view.interactableType === 'gatheringTask'}"), 'environment presence toggles the grid columns');
    assert.ok(/\.fab-ic-fact-list\s*\{[\s\S]*?display:\s*grid/.test(rootSource), 'fact list is a grid (inline columns), not a vertical stack');
    assert.ok(rootSource.includes('repeat(3, minmax(0, 1fr))'), '3 columns when the environment fact is present');
    // dt/dd semantics preserved.
    assert.ok(rootSource.includes('<dt>') && rootSource.includes('<dd>'), 'keeps dt/dd fact semantics');
  });

  it('pins the "Needs configuration" identity state + the picker write-through (issue 342)', () => {
    // A prominent unconfigured state, driven by the single authority surfaced on
    // the view model (view.unconfigured), with a write-through picker.
    assert.ok(rootSource.includes('view?.unconfigured === true'), 'reads the unconfigured authority from the view model');
    assert.ok(rootSource.includes('data-interactable-needs-config'), 'renders the Needs-configuration state');
    assert.ok(rootSource.includes('FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigTitle'), 'localized Needs-configuration title');
    assert.ok(rootSource.includes('data-interactable-identity-section'), 'declares the identity/source section');
    // The picker reads the shared enumeration through services and writes the
    // selection back via the configureSource seam.
    assert.ok(rootSource.includes('services?.listSystems?.()'), 'lists systems via services');
    assert.ok(rootSource.includes('services?.listTools?.(') && rootSource.includes('services?.listTasks?.('), 'lists tools/tasks via services');
    assert.ok(rootSource.includes('services?.configureSource?.(selection)'), 'applies the selection through configureSource');
    // The Apply button is gated so an incomplete selection cannot be submitted.
    assert.ok(rootSource.includes('disabled={!canApplyIdentity}'), 'Apply is disabled until the selection is complete');
    // THE PROMINENCE IS THE NOTICE'S WARNING TONE, AND IT IS PAINTED ONCE (issue 1520).
    //
    // This clause used to read the section's own `.fab-ic-identity.is-unconfigured` accent box.
    // That class sat on the SECTION - around the banner AND the picker beneath it - so keeping
    // it beside a toned `<Notice>` would have drawn two tinted, bordered boxes for one state,
    // in two different colour families. The box is deleted and the tone is where the statement
    // lives, so the assertion is a positive one about the tone reaching the bar.
    assert.ok(rootSource.includes('tone="warning"'), 'the needs-configuration bar is a warning-toned Notice');
    assert.ok(rootSource.includes('dataAttr="data-interactable-needs-config"'), 'the hook rides the declared prop, which is the only route Notice offers');
    assert.ok(
      /\.fab-notice\.is-warning\s*\{[^}]*var\(--fab-warning-border\)[^}]*var\(--fab-warning-soft\)/.test(noticeSource),
      'the warning tone paints the bar with themed warning tokens'
    );
    assert.ok(
      /warning:\s*'fas fa-triangle-exclamation'/.test(noticeSource),
      'the warning tone supplies the same alert glyph the hand-rolled banner drew'
    );
    // The negative half is written as the RULE and the DIRECTIVE rather than as the bare token,
    // because the comment above records why the box left and a bare-token check would be
    // satisfied by deleting that explanation instead of by re-adding the box.
    assert.ok(!/\.fab-ic-identity\.is-unconfigured\s*\{/.test(rootSource), 'the section-wide accent box rule is gone');
    assert.ok(!rootSource.includes('class:is-unconfigured'), 'and nothing puts the class back on the section');
  });

  it('disambiguates same-named systems in the source picker (issue 346)', () => {
    assert.ok(
      rootSource.includes("import { buildSystemLabelMap, systemDisplayLabel } from '../util/systemDisambiguation.js'"),
      'uses the shared system-disambiguation helper'
    );
    assert.ok(rootSource.includes('buildSystemLabelMap(systemOptions)'), 'builds the disambiguated label map');
    assert.ok(
      rootSource.includes('systemDisplayLabel(option, systemLabels)'),
      'renders the disambiguated label in the system picker'
    );
  });

  it('rewords the prompt placeholder away from "toast" jargon', () => {
    assert.ok(!/PromptPlaceholder[^)]*toast/i.test(rootSource), 'no "toast" jargon in the prompt placeholder fallback');
    assert.ok(rootSource.includes('Shown to players in the interaction prompt'), 'plain-language prompt placeholder fallback');
  });
});
