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

import {
  SMOKE_SOURCE,
  assertLocatorsEmitted,
  classTokensMatching,
  dataHooksMatching,
} from '../helpers/interactablesSmokeLocators.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(
  resolve(__dirname, '../../src/ui/InteractablesManagerApp.svelte.js'),
  'utf8'
);
const rootSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/interactables/InteractablesManagerRoot.svelte'),
  'utf8'
);

/**
 * The shared radio primitive this panel's three fieldsets became (issue 1520), read so the
 * conversion clause can assert the WHOLE chain: what this root passes, and what the primitive
 * turns it into.
 */
const segmentedSource = readFileSync(
  resolve(__dirname, '../../src/ui/svelte/apps/manager/SegmentedControl.svelte'),
  'utf8'
);

/**
 * Every control family this root imports from the shared library, and where each one lives.
 *
 * The IMPORT PATH is pinned, not merely the identifier: an adoption that reached for a local
 * copy is not this window joining the library. `SegmentedControl` is the one entry whose path is
 * `apps/manager/` rather than `components/`, and that is recorded rather than smoothed over -
 * issue 1509 moves it, and this pin is what makes the move visible here when it lands.
 */
const ADOPTED_PRIMITIVES = Object.freeze([
  ['Chip', '../../components/Chip.svelte'],
  ['Field', '../../components/Field.svelte'],
  ['IconButton', '../../components/IconButton.svelte'],
  ['InspectorCard', '../../components/InspectorCard.svelte'],
  ['ManagerButton', '../../components/ManagerButton.svelte'],
  ['Select', '../../components/Select.svelte'],
  ['SegmentedControl', '../manager/SegmentedControl.svelte'],
]);

/**
 * The `fab-im-*` names that survive the conversion, EXACTLY.
 *
 * Every one is this window's own LAYOUT - the header rhythm, the toolbar row, the promote card's
 * hint and action row, the list and its rows - which is the half a shared primitive cannot own.
 * No control family is on this list, and that is the assertion.
 *
 * The whole family also MOVED, from `styles/fabricate.css` into this root's own scoped block:
 * those 29 sheet rules were the only thing keeping the panel's appearance rooted at an
 * application class, so a scoped block is what makes the window host-independent.
 * `fabricate-interactables-manager-body` is deliberately NOT here - it stays in the sheet,
 * because the window's scroll containment is its frame contract rather than its content layout.
 *
 * THREE ENTRIES ARE NOT CLASSES AT ALL, and they are on the list because the scan reads the
 * prefix wherever it is written: `fab-im-source-type`, `fab-im-visual-mode` and
 * `fab-im-marker-kind` are the radio groups' `name` attributes, carried across the conversion
 * byte for byte. Pinning them here is what keeps a rename from silently detaching the Foundry
 * smoke's own radio locator from the group it addresses.
 */
const SURVIVING_LAYOUT_CLASSES = Object.freeze([
  'fab-im-empty',
  'fab-im-header',
  'fab-im-list',
  'fab-im-list-section',
  'fab-im-marker-kind',
  'fab-im-promote',
  'fab-im-promote-actions',
  'fab-im-promote-hint',
  'fab-im-row',
  'fab-im-row-actions',
  'fab-im-row-main',
  'fab-im-row-meta',
  'fab-im-row-name',
  'fab-im-source-type',
  'fab-im-subtitle',
  'fab-im-title',
  'fab-im-toolbar',
  'fab-im-visual-mode',
]);

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
      appSource.includes(
        "classes: ['fabricate', 'fabricate-interactables-manager', 'fabricate-app']"
      ),
      'carries the namespaced app-root class for the CSS gate, plus the shared `fabricate-app` ' +
        'area class issue 1520 adopted at the FRAME. The area class is what `resolveOverlayHost` ' +
        'walks to, so a converted control that portals a panel lands inside this window instead ' +
        'of on `<body>`; putting it on the Svelte root would satisfy a source reader while ' +
        'resolving a non-positioned host. It carries no size floor — that is on ' +
        '`fabricate-app-window`, which only the player window emits.'
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

  // THE PICKERS ARE SHARED CONTROLS NOW (issue 1520), so what this clause pins is the WIRING
  // rather than a `bind:` directive this file no longer writes. `Select` and `SegmentedControl`
  // both report an intent through `onChange` and take their current value as a plain prop -
  // deliberately, because the caller owns the state - so a two-way binding would be the wrong
  // shape even if one were available.
  it('surfaces the promote affordance + source picker (region, system, type, source, marker)', () => {
    expectAll([
      ['FABRICATE.Canvas.Manage.PromoteToggle', 'promote toggle'],
      ['onChange={(next) => (selectedRegionId = next)}', 'region picker'],
      ['onChange={(next) => (selectedSystemId = next)}', 'system picker'],
      ['onChange={(next) => (sourceType = next)}', 'source-type chooser (tool / task)'],
      ['onChange={(next) => (selectedReferenceId = next)}', 'source picker'],
      ['onChange={(next) => (visualMode = next)}', 'marker vs region-only'],
      ['onChange={(next) => (markerKind = next)}', 'Tile vs Drawing marker kind'],
      ['services?.promote?.(', 'confirm calls the promote seam'],
    ]);
  });

  // THE THREE FIELDSETS ARE SEGMENTED TRACKS, AND THE CHAIN IS ASSERTED END TO END (issue 1520).
  //
  // The library routes a closed set of two-to-four NAMED options with no sentence each to
  // `Segmented`; the option-card group is what a set with a description per option wants, and
  // none of these three has one. The `name` attributes are carried across BYTE FOR BYTE, because
  // they are DOM group identities rather than class names and the Foundry smoke's own radio
  // locator reads one of them.
  it('renders the three promote choices as shared segmented tracks with their group names intact', () => {
    const tracks = rootSource.split('<SegmentedControl').slice(1);
    assert.ok(tracks.length === 3, 'exactly three segmented tracks (source type, marker, marker kind)');
    for (const name of ['fab-im-source-type', 'fab-im-visual-mode', 'fab-im-marker-kind']) {
      assert.ok(
        rootSource.includes(`groupName="${name}"`),
        `${name} survives as the radio group's DOM identity`
      );
    }
    // Each track NAMES ITSELF, because a `<label>` around a radiogroup names nothing - a
    // radiogroup is not a labelable element - so the visible caption in the `<Field as="div">`
    // beside it is not an accessible name.
    assert.ok(
      (rootSource.match(/ariaLabel=\{text\('FABRICATE\.Canvas\.Manage\.Promote/g) ?? []).length === 3,
      'all three tracks carry their own accessible name'
    );
    // The primitive's half: it renders REAL radios inside a radiogroup, which is what makes the
    // control keyboard- and screen-reader-operable rather than three styled divs.
    assert.ok(segmentedSource.includes('role="radiogroup"'), 'SegmentedControl is a radiogroup');
    assert.ok(/\n\s*type="radio"/.test(segmentedSource), 'SegmentedControl renders real radios');
    // ANCHORED AT ITS OWN LINE, not matched as a substring: `name` is a suffix of `data-name`, so
    // `includes` reports a group identity moved onto an inert `data-*` attribute - which no radio
    // groups by - as an honoured one. Proved by mutation.
    assert.ok(/\n\s*name=\{groupName\}/.test(segmentedSource), 'SegmentedControl honours groupName');
  });

  // THE PANEL'S STYLING CONTRACT, STATED FORWARD (issue 1520).
  it('renders the shared control primitives and keeps only its own layout classes', () => {
    assert.ok(
      rootSource.includes('class="fabricate-interactables-manager-body"'),
      'root element carries the namespaced class'
    );

    for (const [primitive, path] of ADOPTED_PRIMITIVES) {
      assert.ok(
        rootSource.includes(`import ${primitive} from '${path}'`),
        `${primitive} is imported from ${path}`
      );
      // ...and it is RENDERED, because an unused import adopts nothing.
      assert.ok(
        new RegExp(`<${primitive}[\\s/>]`).test(rootSource),
        `${primitive} is rendered by the panel`
      );
    }

    const residue = [...new Set(rootSource.match(/fab-im-[a-z-]+/g) ?? [])].sort();
    assert.deepEqual(
      residue,
      [...SURVIVING_LAYOUT_CLASSES],
      "the surviving fab-im-* names are exactly this window's own layout"
    );
  });

  // EVERY LOCATOR THE SMOKE USES IS STILL EMITTED (issue 1520).
  //
  // Nothing statically tied a locator in `scripts/foundry-test-run.mjs` to a class or attribute
  // this root writes, and the smoke cannot run in CI - so a conversion that moved one off the
  // DOM was invisible to `npm test`. This panel is the one the smoke drives hardest: it walks
  // the list, opens the promote card, pins the system, chooses the source type, chooses the
  // source and confirms, across twelve locators. See
  // `tests/helpers/interactablesSmokeLocators.js` for the token terminator and the floor, both
  // of which are shared with the config panel's own copy of this clause.
  it('still emits every locator the Foundry smoke drives against this panel', () => {
    assertLocatorsEmitted({
      locators: dataHooksMatching(SMOKE_SOURCE, 'data-interactable-manager-'),
      rootSource,
      floor: 6,
      what: 'manage-panel hooks',
      root: 'the interactables manager root',
    });
    assertLocatorsEmitted({
      locators: classTokensMatching(SMOKE_SOURCE, 'fab-im-'),
      rootSource,
      floor: 3,
      what: 'manage-panel layout classes',
      root: 'the interactables manager root',
    });
    // The window's own root container, which the smoke waits on and which the conversion
    // deliberately KEEPS: it is the scroll box, not a control family.
    assert.ok(
      SMOKE_SOURCE.includes('.fabricate-interactables-manager'),
      'the smoke keys on the window root'
    );
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
