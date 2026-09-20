/**
 * The rich GM Interactable config panel: its shell's structure contract, its root's, and the
 * behaviour of the three seams whose CONTRACT IS AN ORDER IN TIME rather than a shape (issue 1697
 * retired this file's source-text pins). The pure view logic lives in
 * `interactable-config-view.test.js` and `interactable-config-actions.test.js`.
 */

import { describe, it, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';

import { emitInteractableBehaviorWrite } from '../../src/canvas/interactableSocketBridge.js';
import {
  planSetEnabled,
  planSetLocked,
} from '../../src/canvas/regions/interactableConfigActions.js';
import {
  SMOKE_SOURCE,
  prefixedTokensIn,
} from '../helpers/interactablesSmokeLocators.js';
import {
  CONFIG_PANEL_CONTRACT,
  assertWindowContract,
} from '../helpers/interactablesWindowContract.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { identifierNames, walkNodes } from '../helpers/moduleAst.js';
import {
  attributeExpression,
  carriesSpread,
  declaresAttribute,
} from '../helpers/svelteStructureContract.js';
import {
  claimsForComponent,
  constantLiteral,
  defineStructureContract,
  renderedNodes,
  structureOf,
  templateNodes,
} from '../helpers/structureContract.js';
import { repoRoot } from '../helpers/sourceScan.js';

const APP = 'src/ui/InteractableConfigApp.svelte.js';
const ROOT = 'src/ui/svelte/apps/InteractableConfigRoot.svelte';
/** The primitives this panel adopted (issue 1520). */
const NOTICE = 'src/ui/svelte/components/Notice.svelte';
const STATUS_TOGGLE = 'src/ui/svelte/components/StatusToggle.svelte';
const SELECT = 'src/ui/svelte/components/Select.svelte';
const POPOVER_LAYOUT = 'src/ui/svelte/util/iconPickerPopover.js';

/** `styles/fabricate.css` is the shipped GLOBAL sheet, not `src/` text: it stays a text read. */
const sheetSource = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');

/** One mutating seam of the services bag, addressed by name so a claim cannot slide onto another. */
const seam = (property) => ({ file: APP, member: '_buildServices', property });

describe('InteractableConfigApp shell', () => {
  defineStructureContract('is an ApplicationV2 + SvelteApplicationMixin app', APP, {
    extendsCall: ['SvelteApplicationMixin'],
    reads: ['foundry.applications.api.ApplicationV2'],
    names: ['SVELTE_COMPONENT', 'InteractableConfigRoot', '_instances', 'Map'],
  });

  defineStructureContract(
    'keyed by a stable window id, at the declared size and area class',
    { file: APP, record: ['id', 'fabricate-interactable-config'] },
    {
      property: [
        ['id', 'fabricate-interactable-config'],
        ['tag', 'div'],
        ['title', 'FABRICATE.Canvas.Interactable.Config.Title'],
        ['resizable', true],
        ['width', 480],
      ],
      keys: ['classes', 'position', 'window'],
      spellsExactly: ['fabricate', 'fabricate-interactable-config-app', 'fabricate-app'],
    }
  );

  defineStructureContract(
    'opens against a behaviour ref / document and keeps one instance per ref',
    { file: APP, member: 'show' },
    {
      calls: ['identifyRegionBehaviorRef', 'bringToFront'],
      reads: ['target.document', 'target.ref', 'existing.rendered', 'InteractableConfigApp._instances'],
    }
  );

  defineStructureContract('clears its per-ref instance on close()', { file: APP, member: 'close' }, {
    reads: ['InteractableConfigApp._instances.delete', 'InteractableConfigApp._instances.get'],
    callsWith: [['delete', 'key']],
  });

  defineStructureContract(
    'and on the _onClose safety net',
    { file: APP, member: '_onClose' },
    {
      reads: ['InteractableConfigApp._instances.delete', 'InteractableConfigApp._instances.get'],
      callsWith: [['delete', 'key']],
    }
  );

  defineStructureContract(
    'routes every write through the active-GM behaviour-update edge (no client mutation)',
    APP,
    {
      names: ['applyInteractableBehaviorUpdate', 'emitInteractableBehaviorWrite'],
      // The one safe FILE-WIDE negative: this file calls `.update(` on no receiver at all, so the
      // absence cannot be satisfied by a same-named method on the instance Map.
      callsNo: ['update'],
      readsNo: ['behavior.update', 'region.delete', 'globalThis.confirm'],
    }
  );

  defineStructureContract(
    'and wraps the system patch exactly once on the way through',
    { file: APP, member: '_buildServices', constant: 'writeBehavior' },
    {
      calls: ['emitInteractableBehaviorWrite', '_resolveBehavior'],
      keys: ['system'],
      names: ['systemPatch'],
    }
  );

  defineStructureContract('test-as-player runs the activation pipeline with gmTest', seam('testAsPlayer'), {
    calls: ['_assertGM', '_resolveBehavior', '_controlledActorId'],
    reads: ['InteractableManager.instance._requestActivation'],
    property: [['activationSource', 'gmTest']],
  });

  defineStructureContract('jump pans the camera', { file: APP, member: '_panToRegion' }, {
    calls: ['animatePan', '_shapeCenter'],
    reads: ['globalThis.canvas.animatePan'],
  });

  defineStructureContract('relink uses the selected visual, resolved generically', seam('relinkSelected'), {
    calls: ['_assertGM', 'relinkVisual', '_controlledVisual', '_refresh'],
    callsWith: [['relinkVisual', 'behavior']],
  });

  defineStructureContract(
    'which considers a controlled Tile, Drawing or Token',
    { file: APP, member: '_controlledVisual' },
    {
      reads: [
        'globalThis.canvas.tiles.controlled',
        'globalThis.canvas.drawings.controlled',
        'globalThis.canvas.tokens.controlled',
      ],
    }
  );

  defineStructureContract('recreate creates a replacement tile', seam('createReplacementTile'), {
    calls: ['_assertGM', 'recreateLinkedTile'],
  });

  defineStructureContract(
    'the Create-drawing-marker seam creates a Drawing and flips to a visible marker',
    seam('createDrawingMarker'),
    {
      calls: ['_assertGM', 'recreateLinkedDrawing', 'writeBehavior'],
      property: [
        ['mode', 'marker'],
        ['hidden', false],
      ],
      keys: ['linkedVisual', 'presentation'],
    }
  );

  defineStructureContract(
    'and the Create-marker upgrade reuses recreateLinkedTile for the same flip',
    seam('createMarker'),
    {
      calls: ['_assertGM', 'recreateLinkedTile', 'writeBehavior'],
      property: [
        ['mode', 'marker'],
        ['hidden', false],
      ],
    }
  );

  defineStructureContract('remove clears the visual link through a 3-way choice', seam('removeVisualMarker'), {
    calls: ['_assertGM', 'planClearVisualLink', 'choiceDialog', 'emitInteractableVisualDelete'],
    property: [
      ['action', 'unlink'],
      ['action', 'delete'],
      ['action', 'cancel'],
      ['defaultAction', 'unlink'],
    ],
    compares: ['cancel', 'delete', 'Token'],
  });

  defineStructureContract('enable/lock toggles use the pure planners', seam('setEnabled'), {
    calls: ['_assertGM', 'planSetEnabled', 'writeBehavior', '_reconcileMarkerHidden'],
  });

  defineStructureContract('and the lock seam its own', seam('setLocked'), {
    calls: ['_assertGM', 'planSetLocked', 'writeBehavior'],
    // A locked interactable stays VISIBLE, so this seam must not reconcile the marker.
    callsNo: ['_reconcileMarkerHidden'],
  });

  defineStructureContract('while the hidden toggle does reconcile it', seam('setHidden'), {
    calls: ['_assertGM', 'writeBehavior', '_reconcileMarkerHidden'],
    keys: ['presentation', 'hidden'],
    compares: [true],
  });

  defineStructureContract(
    'delete decides scope via the pure ownership plan and applies it (issue 533)',
    seam('deleteInteractable'),
    {
      calls: [
        '_assertGM',
        'planInteractableDeletion',
        'executeInteractableDeletion',
        'choiceDialog',
        'emitInteractableVisualDelete',
      ],
      callsWith: [
        ['planInteractableDeletion', 'region'],
        ['executeInteractableDeletion', 'plan'],
      ],
      property: [
        ['action', 'delete'],
        ['action', 'deleteWithVisual'],
        ['action', 'cancel'],
      ],
      compares: ['cancel', 'deleteWithVisual', 'region', 'Token'],
    }
  );

  defineStructureContract(
    'missing-visual recovery reuses applyMissingPolicy',
    seam('applyMissingVisualPolicy'),
    { calls: ['_assertGM', 'applyMissingPolicy', 'recreateLinkedTile', '_refresh'] }
  );

  defineStructureContract('GM-guards every mutating action seam (defense in depth)', { file: APP, member: '_assertGM' }, {
    reads: ['globalThis.game.user.isGM'],
    compares: [true],
  });

  defineStructureContract('self-registers via the app factory (no static import where avoidable)', APP, {
    imports: ['./appFactory.js'],
    callsWith: [['registerInteractableConfigApp', 'InteractableConfigApp']],
  });

  defineStructureContract(
    'configures the source through the pure planner + the GM-routed write seam (issue 342)',
    seam('configureSource'),
    {
      calls: ['_assertGM', 'planConfigureSource', 'writeBehavior', '_refresh'],
      reads: ['patch.system'],
    }
  );

  defineStructureContract('and lists its options from the shared source enumeration', APP, {
    imports: ['./interactableSourceLibrary.js'],
  });

  defineStructureContract('systems come from the shared library', seam('listSystems'), {
    calls: ['listSystemOptions', '_sourceDeps'],
  });

  defineStructureContract('as do tools', seam('listTools'), {
    calls: ['listToolSourceOptions', '_sourceDeps'],
    callsWith: [['listToolSourceOptions', 'systemId']],
  });

  defineStructureContract('and tasks', seam('listTasks'), {
    calls: ['listTaskSourceOptions', '_sourceDeps'],
    callsWith: [['listTaskSourceOptions', 'systemId']],
  });

  defineStructureContract(
    'the hidden reconcile routes the active-GM visual-update edge and writes the tile flag',
    { file: APP, member: '_reconcileMarkerHidden' },
    {
      calls: ['resolveMarkerHidden', 'resolveLinkedVisual', 'emitInteractableVisualUpdate'],
      reads: ['system.linkedVisual.documentName', 'tile.hidden', 'ref.sceneId'],
      property: [['documentName', 'Tile']],
      keys: ['hidden', 'update'],
      names: ['desiredHidden', 'visualUuid'],
      compares: ['Tile'],
    }
  );
});

describe('InteractableConfigApp behaviour-write wrap (BUG: Disable/Lock no-op)', () => {
  afterEach(() => {
    delete globalThis.game;
    delete globalThis.fromUuidSync;
  });

  // Build a fake RegionBehavior wired into a fake scene→region→behaviour graph so
  // `emitInteractableBehaviorWrite` (the App's write seam) resolves + applies it
  // locally as the active GM. `update` records the exact shape it received — the
  // contract the App's `writeBehavior({ system: systemPatch })` wrap depends on.
  function fakeBehaviorGraph({ system = null, onWrite = null } = {}) {
    const updates = [];
    const behavior = {
      id: 'beh1',
      type: 'fabricate.interactable',
      system,
      update: async (data) => {
        if (onWrite) await onWrite();
        updates.push(data);
        if (behavior.system) mergeInto(behavior.system, data.system);
      },
    };
    const region = { id: 'reg1', behaviors: { get: (id) => (id === 'beh1' ? behavior : null) } };
    const scene = { id: 'scn1', regions: { get: (id) => (id === 'reg1' ? region : null) } };
    behavior.parent = region;
    region.parent = scene;
    const user = { isGM: true };
    globalThis.game = {
      user,
      users: { activeGM: user },
      scenes: { get: (id) => (id === 'scn1' ? scene : null) },
      socket: {
        emit: () => {
          throw new Error('must not emit when active GM');
        },
      },
    };
    return { behavior, region, scene, updates };
  }

  /** Apply a behaviour patch the way Foundry would, so a re-read sees post-write state. */
  function mergeInto(target, patch) {
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = target[key] ?? {};
        mergeInto(target[key], value);
      } else {
        target[key] = value;
      }
    }
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

  // THE ORDER IS THE CONTRACT, AND NO CONTRACT ROW CAN STATE IT (issue 1697). A row proves the
  // right functions are named in the right seam; it cannot prove the marker reconcile waits for
  // the behaviour write to settle and then re-resolves, rather than reading a captured snapshot.
  // The app class imports a `.svelte` root Node cannot parse, so the module graph is loaded with
  // that one extension stubbed and Foundry's ApplicationV2 base faked — nothing else is replaced,
  // and `_buildServices()` is the real composition under test.
  let InteractableConfigApp;

  before(async () => {
    registerHooks({
      load(url, context, nextLoad) {
        if (!url.endsWith('.svelte')) return nextLoad(url, context);
        return { format: 'module', source: 'export default null;', shortCircuit: true };
      },
    });
    globalThis.foundry = {
      applications: { api: { ApplicationV2: class {} } },
    };
    ({ InteractableConfigApp } = await import('../../src/ui/InteractableConfigApp.svelte.js'));
  });

  const TILE_UUID = 'Scene.scn1.Tile.tile1';
  const REGION_UUID = 'Scene.scn1.Region.reg1';

  function linkedTileGraph() {
    const log = [];
    let releaseWrite;
    const gate = new Promise((done) => {
      releaseWrite = done;
    });
    const system = {
      interactableType: 'gatheringTask',
      state: { enabled: true, locked: false },
      presentation: { hidden: false },
      linkedVisual: { mode: 'marker', documentName: 'Tile', uuid: TILE_UUID },
      systemId: 'alchemy',
      taskId: 'forage',
    };
    const graph = fakeBehaviorGraph({
      system,
      onWrite: async () => {
        await gate;
        log.push({ what: 'behaviour' });
      },
    });
    const tile = {
      documentName: 'Tile',
      id: 'tile1',
      uuid: TILE_UUID,
      hidden: false,
      flags: {
        fabricate: {
          isInteractableVisual: true,
          linkedRegionUuid: REGION_UUID,
          linkedBehaviorId: 'beh1',
        },
      },
      update: async (data) => {
        log.push({ what: 'tile', data, enabled: system.state.enabled, hidden: system.presentation.hidden });
        Object.assign(tile, data);
      },
    };
    graph.region.uuid = REGION_UUID;
    globalThis.fromUuidSync = (uuid) => {
      if (uuid === TILE_UUID) return tile;
      if (uuid === REGION_UUID) return graph.region;
      return null;
    };
    const panel = new InteractableConfigApp({
      ref: { sceneId: 'scn1', regionId: 'reg1', behaviorId: 'beh1' },
    });
    return { ...graph, log, tile, system, panel, releaseWrite };
  }

  for (const [name, drive, reads] of [
    ['setEnabled', (services) => services.setEnabled(false), { enabled: false, hidden: false }],
    ['setHidden', (services) => services.setHidden(true), { enabled: true, hidden: true }],
  ]) {
    it(`${name} reconciles the linked Tile only after the behaviour write settles, against post-write state`, async () => {
      const { log, tile, panel, releaseWrite } = linkedTileGraph();
      const pending = drive(panel._buildServices());
      await Promise.resolve();
      assert.deepEqual(log, [], 'nothing reaches the Tile while the behaviour write is in flight');

      releaseWrite();
      await pending;
      await new Promise((done) => setTimeout(done, 0));

      assert.deepEqual(
        log.map((entry) => entry.what),
        ['behaviour', 'tile'],
        'the behaviour settles first, then the marker is reconciled'
      );
      assert.deepEqual(log[1].data, { hidden: true }, 'a concealed interactable hides its marker');
      assert.equal(log[1].enabled, reads.enabled, 'the reconcile re-reads the behaviour after the write');
      assert.equal(log[1].hidden, reads.hidden, 'including the half this seam wrote');
      assert.equal(tile.hidden, true, 'and the Tile document ends up hidden');
    });
  }

  it('setLocked leaves the linked Tile visible, because a locked interactable still shows', async () => {
    const { log, tile, panel, releaseWrite } = linkedTileGraph();
    const pending = panel._buildServices().setLocked(true);
    releaseWrite();
    await pending;
    await new Promise((done) => setTimeout(done, 0));

    assert.deepEqual(
      log.map((entry) => entry.what),
      ['behaviour'],
      'locking writes the behaviour and touches no marker'
    );
    assert.equal(tile.hidden, false);
  });
});

describe('InteractableConfigRoot body', () => {
  defineStructureContract('renders from the injected services summary (thin view)', ROOT, {
    reads: [
      'services.summarize',
      'services.resolveSourceLabel',
      'services.resolveEnvironmentLabel',
      'snapshot.view',
      'snapshot.now',
    ],
  });

  defineStructureContract(
    'writes editable fields through services.updateBehavior (active-GM routed)',
    { file: ROOT, fn: 'commitPrompt' },
    { reads: ['services.updateBehavior'], keys: ['presentation', 'promptText'] }
  );

  defineStructureContract(
    'the audience field the same way',
    { file: ROOT, fn: 'setAudience' },
    { reads: ['services.updateBehavior'], keys: ['activation', 'audience'] }
  );

  defineStructureContract(
    'and the missing-visual policy',
    { file: ROOT, fn: 'setMissingPolicy' },
    { reads: ['services.updateBehavior'], keys: ['linkedVisual', 'missingPolicy'] }
  );

  defineStructureContract('and the name', { file: ROOT, fn: 'commitName' }, {
    reads: ['services.updateBehavior'],
    keys: ['name'],
  });

  defineStructureContract('exposes every action button wired to its services seam', ROOT, {
    reads: [
      'services.testAsPlayer',
      'services.jumpToRegion',
      'services.jumpToVisual',
      'services.relinkSelected',
      'services.createReplacementTile',
      'services.createDrawingMarker',
      'services.createMarker',
      'services.removeVisualMarker',
      'services.setEnabled',
      'services.setLocked',
      'services.setHidden',
      'services.deleteInteractable',
      'view.state.enabled',
      'view.state.locked',
    ],
  });

  defineStructureContract('gates the recovery affordances on the visual status', ROOT, {
    calls: ['describeVisualStatus'],
    reads: ['visualStatus.severity'],
    compares: ['missing', 'none', 'ok'],
    spells: [
      'FABRICATE.Canvas.Interactable.Config.CreateMarker',
      'FABRICATE.Canvas.Interactable.Config.CreateDrawingMarker',
      'FABRICATE.Canvas.Interactable.Config.RemoveVisualMarker',
    ],
  });

  defineStructureContract(
    'localizes every string through the foundry bridge under the Config namespace',
    ROOT,
    { imports: ['../util/foundryBridge.js'], names: ['localize'], spells: ['FABRICATE.Canvas.Interactable.Config.'] }
  );

  // EVERY LOCATOR THE SMOKE USES IS STILL EMITTED (issue 1520).
  it('still emits every data-interactable-* locator the Foundry smoke drives', () => {
    const locators = prefixedTokensIn(SMOKE_SOURCE, 'data-interactable-(?!manager-|browser-)');
    assert.ok(
      locators.length >= 9,
      `the smoke locates ${locators.length} config-panel hooks, expected at least 9 - ` +
        'a scan that matches nothing would leave every clause below vacuous'
    );
    const subject = structureOf(ROOT);
    for (const locator of locators) {
      assert.ok(
        subject.writes(locator) || subject.spellsExactly(locator),
        `${locator} is still drawn by the config root - as an attribute it writes, a data bag key ` +
          'or a declared hook prop, and not merely named in a comment about it'
      );
    }
    // The window's own root container.
    assert.ok(SMOKE_SOURCE.includes('.fabricate-interactable-config'), 'the smoke keys on the root container');
  });

  defineStructureContract('and the root container is still emitted', ROOT, {
    attributes: [['class', 'fabricate-interactable-config']],
  });

  // AN OPTION PANEL IS NEVER NARROWER THAN THE TRIGGER IT DROPS FROM (issue 1520 review).
  defineStructureContract(
    'declares the cap as this window`s own width, so it never binds and the trigger decides',
    ROOT,
    { declares: ['OPTION_PANEL_MAX_WIDTH'] }
  );

  it('caps every one of its option panels wide enough for a full-width trigger', () => {
    const selects = renderedNodes(componentAstOf(ROOT), 'Select');
    assert.equal(selects.length, 8, 'the panel renders eight shared selects');
    for (const node of selects) {
      assert.equal(
        attributeExpression(node, 'maxWidth')?.name,
        'OPTION_PANEL_MAX_WIDTH',
        "a select opens at the primitive's 340px band under a full-width trigger"
      );
    }
  });

  it('and the cap is 480, this window`s own declared width', () => {
    const { instance } = componentAstOf(ROOT);
    assert.equal(constantLiteral(instance.content, 'OPTION_PANEL_MAX_WIDTH'), 480);
  });

  defineStructureContract(
    'and the trigger is full width, which is what makes the primitive`s band too narrow',
    ROOT,
    {
      styleDeclares: [
        [
          ['fabricate-interactable-config', { global: ['fabricate-select-field', 'fabricate-select-trigger'] }],
          'width',
          '100%',
        ],
      ],
    }
  );

  defineStructureContract(
    'the primitive`s own band is the 340px one this window overrides',
    { file: SELECT, constant: 'SIZES', property: 'form' },
    {
      property: [
        ['minWidth', 240],
        ['maxWidth', 340],
      ],
    }
  );

  defineStructureContract('and a caller-supplied cap wins over the rung band', SELECT, {
    passesProps: [['SearchablePopover', 'maxWidth']],
    reads: ['band.maxWidth', 'band.minWidth'],
  });

  defineStructureContract(
    'the panel width tracks the trigger between the two bounds',
    POPOVER_LAYOUT,
    { calls: ['clamp'], reads: ['Math.max', 'Math.min'], names: ['triggerWidth', 'minWidth', 'maxWidth'] }
  );

  // THE PANEL'S STYLING CONTRACT, STATED FORWARD (issue 1520).
  it('renders the shared control primitives and keeps only its own layout classes', () => {
    assertWindowContract({ componentFile: ROOT, contract: CONFIG_PANEL_CONTRACT });
  });

  // THE LIVE STATE IS A SWITCH WHERE THE LABEL IS A STATE.
  defineStructureContract('shows the live linked/hidden state on the shared switch', ROOT, {
    passesProps: [['StatusToggle', 'on']],
    reads: ['view.presentation.hidden'],
    names: ['isUnlinked'],
  });

  defineStructureContract(
    'the primitive announces `on` as aria-pressed and draws it as its state class',
    STATUS_TOGGLE,
    {
      writes: ['aria-pressed'],
      names: ['STATE_CLASSES'],
      defaults: [['as', 'button']],
    }
  );

  defineStructureContract(
    'and the state class is is-on/is-off',
    { file: STATUS_TOGGLE, constant: 'STATE_CLASSES' },
    {
      property: [
        ['on', 'is-on'],
        ['off', 'is-off'],
      ],
    }
  );

  it('paints the on position with the themed accent token', () => {
    // `styles/fabricate.css` is the shipped global sheet rather than a component's scoped block.
    assert.ok(
      /\.fabricate-toggle\.manager-status-toggle\.is-on\s*\{[^}]*var\(--fab-accent\)/.test(sheetSource),
      'the on position is painted with the themed accent token'
    );
  });

  // AND EACH SWITCH REACHES THE `aria-pressed` BRANCH (issue 1520 review). `StatusToggle` renders
  // one of three hosts off its `as` prop, and only the default `button` host writes
  // `aria-pressed`: `as="checkbox"` renders a real checkbox and `as="indicator"` a
  // `<span role="img">`, neither of which announces a pressed state at all.
  it('and the primitive gives `aria-pressed` the `on` prop itself, not a second flag', () => {
    const announced = templateNodes(componentAstOf(STATUS_TOGGLE))
      .map((node) => attributeExpression(node, 'aria-pressed'))
      .filter(Boolean);
    assert.equal(announced.length, 1, 'exactly one host announces a pressed state');
    assert.deepEqual([...identifierNames(announced[0])], ['on'], 'and it announces the `on` prop');
  });

  it('leaves every one of its switches on the default pressable host', () => {
    const toggles = renderedNodes(componentAstOf(ROOT), 'StatusToggle');
    assert.equal(toggles.length, 2, 'the panel renders exactly the node-link and hidden switches');
    for (const node of toggles) {
      assert.equal(declaresAttribute(node, 'as'), false, 'a switch declaring a host may not announce aria-pressed');
      assert.equal(carriesSpread(node), false, 'a switch spreading props could carry a host');
    }
  });

  // The two controls that declined the conversion.
  defineStructureContract('keeps Disable and Lock as pressed buttons, state on aria-pressed', ROOT, {
    passesProps: [['ManagerButton', 'onclick']],
    writes: ['aria-pressed'],
    passesPropsNo: [['ManagerButton', 'on']],
    compares: [false],
    styleDeclares: [
      [
        ['fab-ic-actions', { global: [['fabricate-button', { attribute: ['aria-pressed', 'true'] }]] }],
        'border-color',
        'var(--fab-accent)',
      ],
    ],
  });

  it('asks every pressed button for the inverse of the flag it announces', () => {
    const pressed = renderedNodes(componentAstOf(ROOT), 'ManagerButton').filter((node) =>
      attributeExpression(node, 'aria-pressed')
    );
    assert.ok(pressed.length > 0, 'at least one button announces a pressed state');
    const inverted = pressed.filter((node) =>
      [...walkNodes(attributeExpression(node, 'onclick'))].some(
        (inner) => inner.type === 'UnaryExpression' && inner.operator === '!'
      )
    );
    assert.equal(
      inverted.length,
      pressed.length,
      'each pressed button toggles the state it announces, not confirms it'
    );
  });

  defineStructureContract('renders the read-only facts as an inline grid and labels the gate "Status"', ROOT, {
    spells: ['FABRICATE.Canvas.Interactable.Config.StatusLabel'],
    spellsNo: ['FABRICATE.Canvas.Interactable.Config.ActivationLabel'],
    writes: ['has-environment'],
    elements: ['dt', 'dd'],
    reads: ['view.interactableType'],
    compares: ['gatheringTask'],
    styleDeclares: [
      [['fab-ic-fact-list'], 'display', 'grid'],
      [[['fab-ic-fact-list', 'has-environment']], 'grid-template-columns', 'repeat(3, minmax(0, 1fr))'],
    ],
  });

  defineStructureContract(
    'pins the "Needs configuration" identity state + the picker write-through (issue 342)',
    ROOT,
    {
      reads: [
        'view.unconfigured',
        'services.listSystems',
        'services.listTools',
        'services.listTasks',
        'services.configureSource',
      ],
      writes: ['data-interactable-identity-section'],
      spells: ['FABRICATE.Canvas.Interactable.Config.Identity.NeedsConfigTitle'],
      renders: ['Notice'],
      passesValues: [
        ['Notice', 'tone', 'warning'],
        ['Notice', 'dataAttr', 'data-interactable-needs-config'],
      ],
      passesProps: [['Notice', 'title']],
      // The section-wide accent box left with the banner; nothing puts the class back.
      writesNo: ['is-unconfigured'],
    }
  );

  it('and gates Apply until the selection is complete', () => {
    const gated = renderedNodes(componentAstOf(ROOT), 'ManagerButton').filter((node) =>
      identifierNames(attributeExpression(node, 'disabled') ?? {}).has('canApplyIdentity')
    );
    assert.equal(gated.length, 1, 'exactly one button is disabled until the selection completes');
  });

  it('the section-wide accent box rule is gone, and its absence is asserted rather than assumed', () => {
    assert.throws(
      () => structureOf(ROOT).styleDeclares([[['fab-ic-identity', 'is-unconfigured']], 'border-color']),
      /no scoped rule/,
      'a CSS claim over an absent selector must fail rather than pass vacuously'
    );
  });

  defineStructureContract('the warning tone paints the bar with themed warning tokens', NOTICE, {
    styleDeclares: [
      [[['fab-notice', 'is-warning']], 'border-color', 'var(--fab-warning-border)'],
      [[['fab-notice', 'is-warning']], 'background', 'var(--fab-warning-soft)'],
    ],
  });

  defineStructureContract(
    'and supplies the same alert glyph the hand-rolled banner drew',
    { file: NOTICE, constant: 'DEFAULT_ICONS' },
    { property: [['warning', 'fas fa-triangle-exclamation']] }
  );

  defineStructureContract('disambiguates same-named systems in the source picker (issue 346)', ROOT, {
    imports: ['../util/systemDisambiguation.js'],
    callsWith: [
      ['buildSystemLabelMap', 'systemOptions'],
      ['systemDisplayLabel', 'systemLabels'],
    ],
  });

  it('rewords the prompt placeholder away from "toast" jargon', () => {
    const subject = claimsForComponent(componentAstOf(ROOT));
    assert.equal(
      subject.spellsExactly('Shown to players in the interaction prompt'),
      true,
      'plain-language prompt placeholder fallback'
    );
    assert.equal(
      subject.spells('toast'),
      false,
      'no "toast" jargon anywhere the component can render it'
    );
  });
});
