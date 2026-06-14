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

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractableConfigApp.svelte.js'),
  'utf8'
);
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/InteractableConfigRoot.svelte'),
  'utf8'
);

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
    assert.ok(appSource.includes('region.delete?.()'), 'delete removes the region');
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

  it('namespaces its CSS under the .fabricate-interactable-config root', () => {
    assert.ok(rootSource.includes('class="fabricate-interactable-config"'), 'root element carries the namespaced class');
    assert.ok(rootSource.includes('.fab-ic-'), 'component classes are fab-ic-* scoped');
  });

  it('shows the live disabled/locked state on the toggle buttons (aria-pressed + is-active)', () => {
    assert.ok(rootSource.includes('fab-ic-btn-toggle'), 'toggle buttons carry a togglable class');
    assert.ok(rootSource.includes('class:is-active={view.state.enabled === false}'), 'Disable button reads active when disabled');
    assert.ok(rootSource.includes('class:is-active={view.state.locked === true}'), 'Lock button reads active when locked');
    assert.ok(rootSource.includes('aria-pressed={view.state.enabled === false}'), 'Disable button exposes aria-pressed');
    assert.ok(rootSource.includes('aria-pressed={view.state.locked === true}'), 'Lock button exposes aria-pressed');
    // The active treatment uses theme tokens (no literal colours).
    assert.ok(rootSource.includes('.fab-ic-btn-toggle.is-active'), 'styles the active toggle state');
    assert.ok(/\.fab-ic-btn-toggle\.is-active\s*\{[^}]*var\(--fab-accent/.test(rootSource), 'active treatment uses themed accent token');
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
    // The unconfigured state uses theme tokens only (no literal colours).
    assert.ok(/\.fab-ic-identity\.is-unconfigured\s*\{[\s\S]*?var\(--fab-accent/.test(rootSource), 'unconfigured treatment uses themed accent token');
  });

  it('rewords the prompt placeholder away from "toast" jargon', () => {
    assert.ok(!/PromptPlaceholder[^)]*toast/i.test(rootSource), 'no "toast" jargon in the prompt placeholder fallback');
    assert.ok(rootSource.includes('Shown to players in the interaction prompt'), 'plain-language prompt placeholder fallback');
  });
});
