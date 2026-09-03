/**
 * Phase 8 (issue 335) — string-shape coverage for the GM Manage Interactables app
 * + root, mirroring the `interactable-browser-app.test.js` convention (the Svelte
 * components are not compiled in the Node test runner, so we assert their source
 * shape). The pure decisions (scene-scan rows, promote) are unit-tested directly
 * under tests/canvas/regions/.
 *
 * Covers: ApplicationV2 + SvelteApplicationMixin singleton semantics, the services
 * bag delegating to the pure scene-scan + promote helpers and the SHARED
 * behaviour-system builder, delete routed through services.confirmDialog (DialogV2,
 * never globalThis.confirm()), open-config / jump seams, and the root's list +
 * promote surfaces.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractablesManagerApp.svelte.js'),
  'utf8'
);
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/interactables/InteractablesManagerRoot.svelte'),
  'utf8'
);

describe('InteractablesManagerApp singleton window', () => {
  it('is an ApplicationV2 + SvelteApplicationMixin app keyed by a stable id', () => {
    assert.ok(appSource.includes('SvelteApplicationMixin('), 'uses the SvelteApplicationMixin');
    assert.ok(appSource.includes('foundry.applications.api.ApplicationV2'), 'extends ApplicationV2');
    assert.ok(
      appSource.includes('static SVELTE_COMPONENT = InteractablesManagerRoot'),
      'mounts the manager root'
    );
    assert.ok(appSource.includes("id: 'fabricate-interactables-manager'"), 'stable window id');
    assert.ok(
      appSource.includes("classes: ['fabricate', 'fabricate-interactables-manager']"),
      'carries the namespaced app-root class for the CSS gate'
    );
  });

  it('tracks a single shared instance and re-focuses on show() with the V13 re-entrancy guard', () => {
    assert.ok(appSource.includes('static _instance = null'), 'tracks a single instance');
    assert.ok(appSource.includes('static _renderPromise = null'), 'tracks an in-flight render');
    assert.ok(appSource.includes('static async show()'), 'exposes a static show()');
    assert.ok(appSource.includes('existing.bringToFront()'), 're-show brings the existing window to front');
    const newIdx = appSource.indexOf('new InteractablesManagerApp()');
    const guardIdx = appSource.indexOf('if (existing) {');
    assert.ok(newIdx > guardIdx, 'the only construct sits after the existing-instance guard');
  });

  it('clears the singleton on close() and the _onClose safety net', () => {
    assert.ok(appSource.includes('InteractablesManagerApp._instance = null;'), 'clears the singleton');
    assert.ok(appSource.includes('_onClose(options)'), 'has the _onClose safety net');
  });

  it('self-registers via the app factory (no static import chain into Node tests)', () => {
    assert.ok(
      appSource.includes('registerInteractablesManagerApp(InteractablesManagerApp)'),
      'registers with the factory'
    );
  });

  it('builds list rows through the pure scene-scan helper (reuse, no reinvented scan)', () => {
    assert.ok(appSource.includes("import { scanSceneInteractables }"), 'imports the pure scene-scan');
    assert.ok(appSource.includes('scanSceneInteractables(scene, {'), 'listRows delegates to the scan');
    assert.ok(
      appSource.includes('resolveSourceLabel:') && appSource.includes('resolveVisualResolved:'),
      'injects the source-label + visual-resolution lookups'
    );
    assert.ok(
      appSource.includes('resolveLinkedVisual(system, { scene }) !== null'),
      'marker status resolves the live linked visual'
    );
  });

  it('opens the rich config from the list (the missing entry point) by ref', () => {
    assert.ok(
      appSource.includes('getInteractableConfigAppClass().show({ ref })'),
      'openConfig opens the existing rich editor by ref'
    );
  });

  it('jumps to a region via the canvas pan (reusing the shape-centre pan)', () => {
    assert.ok(appSource.includes('jumpToRegion:'), 'exposes a jump seam');
    assert.ok(appSource.includes('canvas?.animatePan?.('), 'jump pans the canvas to the region centre');
  });

  it('routes delete through services.confirmDialog (DialogV2.confirm), never globalThis.confirm()', () => {
    assert.ok(appSource.includes('await confirmDialog('), 'delete confirms through the DialogV2 bridge');
    assert.ok(!appSource.includes('globalThis.confirm('), 'never calls globalThis.confirm()');
  });

  it('routes delete through the provenance-aware plan/execute helpers, never a bare region.delete (issue 533)', () => {
    assert.ok(
      appSource.includes('planInteractableDeletion(region'),
      'delete decides scope via the pure ownership plan'
    );
    assert.ok(
      appSource.includes('executeInteractableDeletion(region, plan)'),
      'delete applies the plan (region vs behaviour-only)'
    );
    assert.ok(
      !appSource.includes('region.delete?.()'),
      'never wholesale-deletes the region directly (would destroy a promoted user region)'
    );
    assert.ok(
      appSource.includes('DeletePromptRegion') && appSource.includes('DeletePromptBehaviour'),
      'confirm copy tells the GM whether the region or only the behaviour is removed'
    );
  });

  it('promotes through the pure decision + the SHARED behaviour-system builder (no second builder)', () => {
    assert.ok(appSource.includes("import { decidePromoteRegion }"), 'imports the pure promote decision');
    assert.ok(appSource.includes('decidePromoteRegion({'), 'promote delegates to the pure decision');
    assert.ok(
      appSource.includes('buildBehaviorSystem: (spawn) => buildInteractableBehaviorSystem(spawn)'),
      'promotion uses the same buildInteractableBehaviorSystem builder'
    );
    assert.ok(
      appSource.includes("region.createEmbeddedDocuments('RegionBehavior'"),
      'attaches the behaviour to the existing (any-shape) region'
    );
  });

  it('runs the gathering-task environment-resolution precedence for a task promotion', () => {
    assert.ok(appSource.includes("import { resolveDropEnvironment }"), 'imports the env precedence');
    assert.ok(appSource.includes('resolveDropEnvironment({'), 'resolves the env via the shared precedence');
    assert.ok(appSource.includes("import { promptDropEnvironment }"), 'reuses the env dialog edge');
  });

  it('creates the optional promote marker via the existing recreate-tile/drawing seams', () => {
    assert.ok(
      appSource.includes('recreateLinkedTile') && appSource.includes('recreateLinkedDrawing'),
      'reuses the existing recreate seams for the marker'
    );
    assert.ok(
      appSource.includes('applyBehaviorUpdate: applyInteractableBehaviorUpdate'),
      'marker recreate writes the linkedVisual ref back via the active-GM edge'
    );
  });

  it('reuses the SHARED browser source enumeration (Tools + Gathering Tasks) for the picker', () => {
    assert.ok(
      appSource.includes("from './interactableSourceLibrary.js'"),
      'imports the same shared source enumeration the browser uses'
    );
    assert.ok(
      appSource.includes('listSystems: () => listSystemOptions(this._sourceDeps())'),
      'listSystems delegates to the shared system enumeration'
    );
    assert.ok(
      appSource.includes('listToolsForSystem: (systemId) => listToolSourceOptions(this._sourceDeps(), systemId)'),
      'the promote Tool picker delegates to the shared Tool enumeration (the No-sources fix)'
    );
    assert.ok(
      appSource.includes('listTasksForSystem: (systemId) => listTaskSourceOptions(this._sourceDeps(), systemId)'),
      'the promote Task picker delegates to the shared Task enumeration'
    );
    assert.ok(
      appSource.includes('getGatheringConfig: () => getSetting(SETTING_KEYS.GATHERING_CONFIG)'),
      'the shared deps bag wires the persisted gathering config for Tasks'
    );
  });

  it('gates every mutating seam on GM', () => {
    assert.ok(appSource.includes('_assertGM()'), 'mutating seams assert GM');
    assert.ok(appSource.includes("game?.user?.isGM === true"), 'GM gate reads the live user');
  });
});

describe('InteractablesManagerRoot body', () => {
  // Table-driven source-shape assertions: each entry is `[needle, label]`. Driving
  // the checks through one helper keeps the suite compact and (deliberately)
  // distinct in shape from the sibling browser/config source-shape suites.
  const expectAll = (pairs) => {
    for (const [needle, label] of pairs) {
      assert.ok(rootSource.includes(needle), label);
    }
  };

  it('reads everything through the injected services bag (no duplicate data access)', () => {
    expectAll([
      ['services?.listRows?.()', 'rows via services'],
      ['services?.listRegions?.()', 'regions via services'],
      ['services?.listSystems?.()', 'systems via services'],
      ['services?.listToolsForSystem?.(', 'tools via services'],
      ['services?.listTasksForSystem?.(', 'tasks via services'],
    ]);
  });

  it('renders each row with name, type, source label, state, and marker status', () => {
    expectAll([
      ['row.name', 'row name'],
      ['typeLabel(row.interactableType)', 'row type label'],
      ['row.sourceLabel', 'row source label'],
      ['stateBadges(row.state)', 'row state badges'],
      ['markerLabel(row.markerStatus)', 'row marker status'],
    ]);
  });

  it('covers each marker-status variant + each state in its label maps', () => {
    expectAll([
      ...['Tile', 'Drawing', 'Token', 'region-only', 'missing'].map((s) => [`'${s}'`, `marker map handles ${s}`]),
      ['FABRICATE.Canvas.Manage.StateDisabled', 'disabled state badge'],
      ['FABRICATE.Canvas.Manage.StateLocked', 'locked state badge'],
      ['FABRICATE.Canvas.Manage.StateConsumed', 'consumed state badge'],
    ]);
  });

  it('each row exposes keyboard-actionable open-config / jump / delete buttons', () => {
    expectAll([
      ['openConfig(row.ref)', 'open config action'],
      ['jump(row.ref)', 'jump action'],
      ['remove(row.ref)', 'delete action'],
      ['FABRICATE.Canvas.Manage.OpenConfig', 'localized open-config label'],
      ['FABRICATE.Canvas.Manage.JumpToRegion', 'localized jump label'],
      ['FABRICATE.Canvas.Manage.Delete', 'localized delete label'],
    ]);
  });

  it('surfaces the promote affordance + source picker (region, system, type, source, marker)', () => {
    expectAll([
      ['FABRICATE.Canvas.Manage.PromoteToggle', 'promote toggle'],
      ['bind:value={selectedRegionId}', 'region picker'],
      ['bind:value={selectedSystemId}', 'system picker'],
      ['bind:group={sourceType}', 'source-type chooser (tool / task)'],
      ['bind:value={selectedReferenceId}', 'source picker'],
      ['bind:group={visualMode}', 'marker vs region-only'],
      ['services?.promote?.(', 'confirm calls the promote seam'],
    ]);
  });

  it('disambiguates same-named systems and defaults to a source-bearing one (issue 346)', () => {
    expectAll([
      ["from '../../util/systemDisambiguation.js'", 'uses the shared disambiguation helper'],
      ['buildSystemLabelMap(systems)', 'builds the disambiguated label map'],
      ['systemDisplayLabel(system, systemLabels)', 'renders the disambiguated label in the promote system picker'],
      ['pickDefaultSystemId(systems, systemHasSources)', 'default selection prefers a source-bearing system'],
      ['function systemHasSources(systemId)', 'tests for selectable sources of the current source type'],
    ]);
  });

  it('renders an empty state when the scene has no interactables', () => {
    expectAll([
      ['{#if rows.length === 0}', 'empty branch'],
      ['FABRICATE.Canvas.Manage.Empty', 'localized empty-state copy'],
    ]);
  });
});
