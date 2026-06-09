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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    assert.ok(appSource.includes('emitInteractableBehaviorWrite(behavior)(systemPatch)'), 'writeBehavior routes through the GM writer');
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
    assert.ok(appSource.includes('planRestock(system)'), 'restock uses the pure planner');
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
    assert.ok(rootSource.includes('services?.restockNode?.()'), 'Restock');
    assert.ok(rootSource.includes('services?.setEnabled?.(!view.state.enabled)'), 'Enable/Disable toggle');
    assert.ok(rootSource.includes('services?.setLocked?.(!view.state.locked)'), 'Lock/Unlock toggle');
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
});
