import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';
import { rewriteClientImports } from '../helpers/rewriteClientImports.js';
// The raw `.js` closure of `SearchablePopover`.
import {
  ADDITIONAL_DICE_NOTICE_RAW_MODULES,
  CHECK_TARGET_RAW_MODULES,
  GATHERING_DROPS_COMPILED_MODULES,
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  PAGINATION_COMPILED_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createSvelteCompiler,
} from '../helpers/svelte-component-harness.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringView;
let createActorBarStore;
let mounted;
let target;


const { writeCompiledSvelte } = createSvelteCompiler(repoRoot, () => tempRoot);

function writeCompiledModule(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compileModule(source, { filename: sourcePath, generate: 'client', dev: true });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function copyModule(sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
}

function environment(overrides = {}) {
  return {
    id: 'env-meadow',
    name: 'Sunlit Meadow',
    img: 'icons/svg/sun.svg',
    description: 'A field.',
    locked: false,
    selectionMode: 'targeted',
    revealPolicy: 'never',
    region: 'Greenvale',
    risk: 'safe',
    attemptable: true,
    discoveredTaskCount: 0,
    composedTaskCount: 0,
    biomeTags: [],
    tasks: [],
    discoveredTasks: [],
    ...overrides
  };
}

function listing(environments, selectedActorId = 'a1') {
  return { visible: true, selectedActorId, environments };
}

// A `services` bag whose listGatheringForActor records calls and their options.
function makeGatheringServices(result) {
  const calls = { list: [] };
  const services = {
    listGatheringForActor: (opts) => {
      calls.list.push(opts);
      return Promise.resolve(typeof result === 'function' ? result(opts) : result);
    },
    startGatheringAttempt: () => Promise.resolve({ accepted: true })
  };
  return { services, calls };
}

// A store backed by the real actorBarStore (so its `selectedActorId` is a
// reactive source the GatheringView fetch $effect can track).
function makeStore({ actors = [], seededId = '' } = {}) {
  const storeServices = {
    listSelectableActors: () => actors,
    getSelectedActorId: () => seededId,
    setSelectedActorId: () => {},
    getGatheringConditions: () => ({ weather: 'clear', timeOfDay: 'day' })
  };
  return createActorBarStore({ services: storeServices });
}

async function mountView(services) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringView, { target, props: { services } });
  flushSync();
  await tick();
  await tick();
  flushSync();
}

async function settle() {
  await tick();
  await tick();
  flushSync();
}

describe('GatheringView ↔ actor bar wiring', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-gathering-bar-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    for (const modulePath of FOUNDRY_BRIDGE_RAW_MODULES) copyModule(modulePath);
    copyModule('src/gatheringImageDefaults.js');
    copyModule('src/ui/svelte/util/disclosurePhrase.js');
    copyModule('src/ui/svelte/util/gatheringFormat.js');
    copyModule('src/ui/svelte/util/gatheringConditionIcons.js');
    copyModule('src/ui/svelte/apps/gathering/gatheringBlockedReasons.js');
    // Issue 1648: the authority-refusal wording GatheringView falls back to when a
    // versioned start is refused. Omitting it HANGS this suite (# cancelled).
    copyModule('src/ui/svelte/util/journalRunReasons.js');
    copyModule('src/ui/svelte/apps/gathering/selectionDefault.js');
    copyModule('src/ui/svelte/apps/gathering/scopedSelection.js');
    copyModule('src/ui/svelte/util/sceneImages.js');
    copyModule('src/ui/svelte/apps/gathering/linkedSceneImage.js');
    // GatheringTaskDetail imports the calendar-aware respawn-ETA duration
    // formatter, which imports the foundryCalendar helpers.
    copyModule('src/ui/svelte/util/formatDuration.js');
    copyModule('src/systems/foundryCalendar.js');
    // GatheringView routes its crafting-data subscription through the invalidation-domain
    // taxonomy (issue 1078 part B1); omitting it HANGS this suite (# cancelled).
    copyModule('src/systems/invalidationDomains.js');
    // Issue 2008: an attempt's additional-dice notice is worded by the prompt presenter.
    for (const modulePath of [
      ...STATUS_TONE_RAW_MODULES,
      ...ADDITIONAL_DICE_NOTICE_RAW_MODULES,
      ...CHECK_TARGET_RAW_MODULES,
      'src/systems/countEvaluation.js',
      'src/utils/fillPlaceholders.js',
      // The retained-claim release a refused Attempt offers a GM, and the notice wording it
      // reads. Omitting either hangs this suite as `# cancelled`.
      'src/ui/svelte/apps/journal/runRecovery.js',
      'src/ui/svelte/apps/journal/runStateNotice.js',
    ]) {
      copyModule(modulePath);
    }
    writeCompiledModule('src/ui/svelte/stores/actorBarStore.svelte.js');

    for (const paginationModule of PAGINATION_COMPILED_MODULES) {
      writeCompiledSvelte(paginationModule);
    }
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    // Issue 2053: the attempt buttons record the window a roll prompt opens in.
    // Issue 1782: the drop-rate ramp the chance bar's `BandedBar` reads its fills from.
    for (const rawModule of [
      ...SEARCHABLE_POPOVER_RAW_MODULES,
      ...LOCALIZE_OR_RAW_MODULES,
      'src/ui/svelte/util/rollPromptOrigin.js',
      'src/ui/svelte/util/dropRateTier.js',
    ]) {
      const rawDestination = join(tempRoot, rawModule);
      mkdirSync(dirname(rawDestination), { recursive: true });
      writeFileSync(rawDestination, readFileSync(resolve(repoRoot, rawModule), 'utf8'));
    }
    // Issue 1504: the shared `<Select>`'s whole compiled closure, spread rather than copied.
    for (const selectModule of SELECT_COMPILED_MODULES) {
      writeCompiledSvelte(selectModule);
    }
    writeCompiledSvelte('src/ui/svelte/components/IconButton.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
    // `ChanceBar` is a single-row `BandedBar` over the shared `FillBar` (issues 1096, 1782). A
    // hand-rolled harness that omits either HANGS (# cancelled) rather than failing.
    for (const instrument of [
      'src/ui/svelte/components/FillBar.svelte',
      'src/ui/svelte/components/BandedBar.svelte',
    ]) {
      writeCompiledSvelte(instrument);
    }
    writeCompiledSvelte('src/ui/svelte/apps/gathering/ChanceBar.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/LinkedScene.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventDetail.svelte');
    // The tab strip and the shared EditorTabs it renders (issue 1518).
    for (const tabStrip of [
      'src/ui/svelte/apps/gathering/GatheringDetailTabs.svelte',
      'src/ui/svelte/components/EditorTabs.svelte',
    ]) {
      writeCompiledSvelte(tabStrip);
    }
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetail.svelte');
    for (const dropsModule of GATHERING_DROPS_COMPILED_MODULES) writeCompiledSvelte(dropsModule);
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskDetail.svelte');
    for (const primitive of PLAYER_APP_COMPILED_MODULES) writeCompiledSvelte(primitive);
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringView.svelte');

    GatheringView = (await import(pathToFileURL(join(
      tempRoot, 'src/ui/svelte/apps/gathering/GatheringView.svelte.js'
    )))).default;
    createActorBarStore = (await import(pathToFileURL(join(
      tempRoot, 'src/ui/svelte/stores/actorBarStore.svelte.js.js'
    )))).createActorBarStore;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('passes the store selection as rememberedActorId and fetches exactly once on mount', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const { services, calls } = makeGatheringServices(listing([environment()]));
    services.actorBar = store;

    await mountView(services);

    assert.equal(calls.list.length, 1, 'no spurious mount-time double fetch');
    assert.equal(calls.list[0].rememberedActorId, 'a1', 'passes the live store selection');
  });

  it('re-fetches with the new rememberedActorId when the store selection changes', async () => {
    const store = makeStore({
      actors: [{ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null }],
      seededId: 'a1'
    });
    store.loadSelectableActors();
    flushSync();
    const { services, calls } = makeGatheringServices(listing([environment()]));
    services.actorBar = store;

    await mountView(services);
    assert.equal(calls.list.length, 1);

    store.selectActor('a2');
    flushSync();
    await settle();

    assert.equal(calls.list.length, 2, 'actor change re-fetches the listing');
    assert.equal(calls.list[1].rememberedActorId, 'a2', 're-fetch uses the new selection');
  });

  it('first-load backstop adopts listing.selectedActorId once, only when present in the bar list', async () => {
    const store = makeStore({
      actors: [{ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null }],
      seededId: ''
    });
    // Deliberately leave the store seed empty (do NOT call loadSelectableActors's
    // fallback here): set the selectable list but keep selectedActorId empty.
    store.selectableActors.push({ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null });

    const { services, calls } = makeGatheringServices(listing([environment()], 'a2'));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.selectedActorId, 'a2', 'adopts the in-list resolved actor on the empty seed');
    const adoptCalls = calls.list.length;
    assert.ok(adoptCalls >= 1);

    // Subsequent fetch (same selection) must NOT re-adopt or ping-pong.
    store.selectActor('a1');
    flushSync();
    await settle();
    assert.equal(store.selectedActorId, 'a1', 'later selection is honored, no re-adopt back to a2');
  });

  it('does not adopt an owned non-PC listing actor absent from the bar list', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: '' });
    store.selectableActors.push({ id: 'a1', name: 'Aria', img: null });

    const { services } = makeGatheringServices(listing([environment()], 'npc-9'));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.selectedActorId, '', 'an out-of-list (owned non-PC) id is not adopted');
  });

  it('subscribes to scene changes and quietly re-fetches the listing on canvasReady', async () => {
    const registrations = [];
    const offCalls = [];
    globalThis.Hooks = {
      on: (event, fn) => { registrations.push({ event, fn }); return 'hook-canvas'; },
      off: (event, id) => { offCalls.push({ event, id }); }
    };
    try {
      const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
      store.loadSelectableActors();
      flushSync();
      const { services, calls } = makeGatheringServices(listing([environment()]));
      services.actorBar = store;

      await mountView(services);
      assert.equal(calls.list.length, 1);
      // The view subscribes to canvasReady (scene change) alongside other hooks
      // (e.g. travel-marker token movement); assert canvasReady is among them.
      const canvasReg = registrations.find(reg => reg.event === 'canvasReady');
      assert.ok(canvasReg, 'subscribes to canvasReady');

      // Simulate the player navigating to / the GM activating a scene.
      canvasReg.fn();
      await settle();
      assert.equal(calls.list.length, 2, 'canvasReady triggers a listing re-fetch');
      // The populated grid stays mounted across the quiet refresh (no spinner swap).
      assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'keeps the populated layout');

      unmount(mounted);
      mounted = null;
      assert.ok(
        offCalls.some(({ event, id }) => event === 'canvasReady' && id === 'hook-canvas'),
        'unsubscribes the canvasReady hook on destroy'
      );
    } finally {
      delete globalThis.Hooks;
    }
  });

  it('quietly re-fetches the listing when a party travel marker token moves', async () => {
    const registrations = [];
    const offCalls = [];
    globalThis.Hooks = {
      on: (event, fn) => { registrations.push({ event, fn }); return `hook-${event}`; },
      off: (event, id) => { offCalls.push({ event, id }); }
    };
    try {
      const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
      store.loadSelectableActors();
      flushSync();
      const { services, calls } = makeGatheringServices(listing([environment()]));
      services.actorBar = store;
      services.isTravelMarkerActor = (actorUuid) => actorUuid === 'Actor.marker';

      await mountView(services);
      assert.equal(calls.list.length, 1);
      const updateReg = registrations.find(reg => reg.event === 'updateToken');
      assert.ok(updateReg, 'subscribes to updateToken for travel-marker movement');

      // A NON-marker token moving must not re-fetch (filtered by isTravelMarkerActor).
      updateReg.fn({ actor: { uuid: 'Actor.other' } }, { x: 5 });
      await settle();
      assert.equal(calls.list.length, 1, 'a non-marker token move is ignored');

      // The party's travel marker moving quietly re-fetches the live listing.
      updateReg.fn({ actor: { uuid: 'Actor.marker' } }, { x: 10 });
      await settle();
      assert.equal(calls.list.length, 2, 'travel-marker move re-fetches the listing');
      assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'keeps the populated layout (quiet)');

      // A token that only carries the marker's world-actor id (e.g. an unlinked
      // token) is matched via `Actor.<actorId>` and also re-fetches.
      updateReg.fn({ actorId: 'marker' });
      await settle();
      assert.equal(calls.list.length, 3, 're-fetches for a token referencing the marker world actor');

      unmount(mounted);
      mounted = null;
      assert.ok(
        offCalls.some(({ event }) => event === 'updateToken'),
        'unsubscribes the updateToken hook on destroy'
      );
    } finally {
      delete globalThis.Hooks;
    }
  });

  it('REGRESSION: mounts and fetches unmodified when services has no actorBar', async () => {
    const { services, calls } = makeGatheringServices(listing([environment()]));
    // No services.actorBar at all.
    await mountView(services);

    assert.equal(calls.list.length, 1, 'still fetches exactly once');
    assert.equal(calls.list[0].rememberedActorId, null, 'rememberedActorId defaults to null without a store');
    assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'renders the populated layout');
  });

  // The attempt must run as the SAME actor the listing was computed for.
  function attemptableEnv() {
    return environment({
      tasks: [{ id: 'task-1', name: 'Extract Ore', attemptable: true, blockedReasons: [] }]
    });
  }

  it('threads the live bar selection into startGatheringAttempt as rememberedActorId', async () => {
    const attempts = [];
    const services = {
      listGatheringForActor: () => Promise.resolve(listing([attemptableEnv()], 'a1')),
      startGatheringAttempt: (opts) => { attempts.push(opts); return Promise.resolve({ accepted: true }); }
    };
    const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    services.actorBar = store;
    await mountView(services);

    target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
    await settle();

    assert.equal(attempts.length, 1, 'attempt fired once');
    assert.equal(attempts[0].rememberedActorId, 'a1', 'attempt uses the selected actor, not an engine fallback');
    assert.equal(attempts[0].environmentId, 'env-meadow');
    assert.equal(attempts[0].taskId, 'task-1');
  });

  // #287: when no environment is selected (every environment locked, or the
  // empty/loading state) the header condition chips must still respect the
  // active system's weather / time-of-day settings instead of defaulting to
  // shown. The engine stamps weatherEnabled / timeOfDayEnabled on every
  // environment summary (including locked teasers), so the view derives header
  // visibility from the listing when there is no selection.
  it('#287: no selection (all envs locked) hides a system-disabled weather chip, keeping time-of-day', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const envs = [
      environment({ id: 'e1', locked: true, attemptable: false, weatherEnabled: false, timeOfDayEnabled: true }),
      environment({ id: 'e2', locked: true, attemptable: false, weatherEnabled: false, timeOfDayEnabled: true })
    ];
    const { services } = makeGatheringServices(listing(envs));
    services.actorBar = store;

    await mountView(services);
    await settle();

    // No environment is auto-selected when every environment is locked.
    assert.equal(store.conditionVisibility.weather, false, 'weather chip hidden: every listed system disables weather');
    assert.equal(store.conditionVisibility.timeOfDay, true, 'time-of-day chip still shown independently');
  });

  it('#287: no selection (all envs locked) hides a system-disabled time-of-day chip, keeping weather', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const envs = [
      environment({ id: 'e1', locked: true, attemptable: false, weatherEnabled: true, timeOfDayEnabled: false })
    ];
    const { services } = makeGatheringServices(listing(envs));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.conditionVisibility.timeOfDay, false, 'time-of-day chip hidden: the system disables it');
    assert.equal(store.conditionVisibility.weather, true, 'weather chip still shown independently');
  });

  it('#287: no selection shows a dimension when at least one listed system enables it', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const envs = [
      environment({ id: 'e1', locked: true, attemptable: false, weatherEnabled: false, timeOfDayEnabled: false }),
      environment({ id: 'e2', locked: true, attemptable: false, weatherEnabled: true, timeOfDayEnabled: false })
    ];
    const { services } = makeGatheringServices(listing(envs));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.conditionVisibility.weather, true, 'weather shown: e2 enables it even though e1 does not');
    assert.equal(store.conditionVisibility.timeOfDay, false, 'time-of-day hidden: no listed system enables it');
  });

  // #357: the header realm chip's baseline is the listing-level realm context
  // (party/system-scoped), so it shows even when every environment is realm-
  // locked and none is selectable. The View pushes listing.realmContext straight
  // through setRealmContext when there is no selection.
  it('#357: pushes listing.realmContext (enabled, no current realm) when no environment is selected', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    // Every environment is realm-locked → none auto-selected.
    const envs = [
      environment({ id: 'e1', locked: true, attemptable: false }),
      environment({ id: 'e2', locked: true, attemptable: false })
    ];
    const result = { ...listing(envs), realmContext: { enabled: true, realms: [], systemId: 'system-a' } };
    const { services } = makeGatheringServices(result);
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.realmContext.enabled, true, 'chip enabled with no selection (no current realm)');
    assert.deepEqual(store.realmContext.realms, [], 'empty realm list ("No current realm")');
  });

  it('#357: a selected environment refines the realm context over the listing baseline', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    // A selectable (unlocked) environment auto-selects.
    const envs = [
      environment({
        id: 'e1',
        locked: false,
        attemptable: true,
        realmsEnabled: true,
        currentRealms: [{ label: 'Verdant Expanse', placeholder: false }]
      })
    ];
    const result = { ...listing(envs), realmContext: { enabled: true, realms: [], systemId: 'system-a' } };
    const { services } = makeGatheringServices(result);
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.realmContext.enabled, true);
    assert.equal(store.realmContext.realms.length, 1, 'selected env refines to its disclosed realm');
    assert.equal(store.realmContext.realms[0].label, 'Verdant Expanse');
  });

  it('surfaces a warning notification when an attempt is rejected (never a silent no-op)', async () => {
    const warns = [];
    globalThis.ui = { notifications: { warn: (msg) => warns.push(msg) } };
    try {
      const services = {
        listGatheringForActor: () => Promise.resolve(listing([attemptableEnv()], 'a1')),
        startGatheringAttempt: () => Promise.resolve({
          accepted: false,
          blockedReasons: [{ code: 'NO_CURRENT_REALM' }]
        })
      };
      const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
      store.loadSelectableActors();
      flushSync();
      services.actorBar = store;
      await mountView(services);

      target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
      await settle();

      assert.equal(warns.length, 1, 'a rejected attempt raises exactly one notification');
      assert.match(warns[0], /CannotAttempt|NoRegion/, 'the notification names the blocked reason');
    } finally {
      delete globalThis.ui;
    }
  });

  // Issue 1648: a versioned start goes through the run authority.
  it('warns with the worded reason when the run authority refuses a versioned start', async () => {
    const warns = [];
    globalThis.ui = { notifications: { warn: (msg) => warns.push(msg) } };
    try {
      const services = {
        listGatheringForActor: () => Promise.resolve(listing([attemptableEnv()], 'a1')),
        startGatheringAttempt: () => Promise.resolve({ success: false, reason: 'ledger-missing' })
      };
      const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
      store.loadSelectableActors();
      flushSync();
      services.actorBar = store;
      await mountView(services);

      target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
      await settle();

      assert.equal(warns.length, 1, 'a refused start is never a silent no-op');
      assert.equal(warns[0], 'FABRICATE.App.Journal.Actions.LedgerMissing');
      assert.notEqual(warns[0], undefined);
    } finally {
      delete globalThis.ui;
    }
  });

  it('warns once for a refused additional-dice choice and stays silent for a dismissal (issue 2008)', async () => {
    const refused = {
      success: false,
      cancelled: true,
      additionalDiceRefusal: 'choiceInvalid',
      additionalDiceNotice: { dice: null, limit: 1, available: 1, label: '', source: 'path' },
    };
    const misconfigured = {
      success: false,
      misconfigured: true,
      message: 'The check is misconfigured.',
      data: { boughtDice: { count: 1, source: 'path' } },
    };
    // The Journal's replies, which a versioned attempt receives through `executePublicGather`.
    const { cancelled, ...journalRefused } = refused;
    const journalSpent = { success: false, reason: 'roll-unavailable', boughtDice: 1 };
    const cases = [
      [refused, ['FABRICATE.Check.AdditionalDiceRefusal.ChoiceInvalid']],
      [misconfigured, ['1 spent; the roll could not be completed.', 'The check is misconfigured.']],
      [{ success: false, cancelled: true }, []],
      [
        { accepted: true, ...journalRefused, reason: 'additional-dice-refused' },
        ['FABRICATE.Check.AdditionalDiceRefusal.ChoiceInvalid'],
      ],
      [
        { accepted: true, ...journalSpent },
        ['1 spent; the roll could not be completed.', 'FABRICATE.App.Journal.Reason.RollUnavailable'],
      ],
    ];
    assert.equal(cancelled, true);
    for (const [reply, expected] of cases) {
      const warns = [];
      const notifications = {
        warn: (msg) => {
          warns.push(msg);
        },
      };
      Object.defineProperty(globalThis, 'ui', { value: { notifications }, configurable: true, writable: true });
      try {
        const services = {
          listGatheringForActor: () => Promise.resolve(listing([attemptableEnv()], 'a1')),
          startGatheringAttempt: () => Promise.resolve(reply)
        };
        const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
        store.loadSelectableActors();
        flushSync();
        services.actorBar = store;
        await mountView(services);

        target.querySelector(':scope [data-gathering-task-detail] [data-gathering-attempt]').click();
        await settle();

        assert.deepEqual(warns, expected, JSON.stringify(reply));
      } finally {
        delete globalThis.ui;
        if (mounted) unmount(mounted);
        mounted = null;
        target?.remove();
      }
    }
  });

  // Issue 2398: a dismissed d100 prompt leaves its run ready in the Journal, so the listing reloads.
  it('reloads the listing and warns nothing when the roll prompt is dismissed', async () => {
    const warns = [];
    const notifications = {
      warn: (msg) => {
        warns.push(msg);
      },
    };
    Object.defineProperty(globalThis, 'ui', {
      value: { notifications },
      configurable: true,
      writable: true,
    });
    try {
      let listings = 0;
      const waiting = environment({
        tasks: [
          {
            id: 'task-1',
            name: 'Extract Ore',
            attemptable: false,
            blockedReasons: [{ code: 'DUPLICATE_ACTIVE_RUN', data: { taskId: 'task-1' } }],
          },
        ],
      });
      const services = {
        listGatheringForActor: () => {
          listings += 1;
          return Promise.resolve(listing([listings === 1 ? attemptableEnv() : waiting], 'a1'));
        },
        startGatheringAttempt: () =>
          Promise.resolve({ accepted: true, success: false, cancelled: true }),
      };
      const store = makeStore({
        actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }],
        seededId: 'a1',
      });
      store.loadSelectableActors();
      flushSync();
      services.actorBar = store;
      await mountView(services);
      assert.equal(listings, 1, 'the mount fetched once');
      const attempt = () =>
        target.querySelector(':scope [data-gathering-task-detail] [data-gathering-attempt]');
      assert.equal(attempt().dataset.gatheringAttemptBlocked, 'false');

      attempt().click();
      await settle();

      assert.equal(listings, 2, 'the dismissal refreshed task and run state');
      assert.equal(
        attempt().dataset.gatheringAttemptBlocked,
        'true',
        'the waiting run now blocks a second attempt'
      );
      assert.equal(attempt().disabled, true);
      assert.ok(target.querySelector(':scope [data-gathering-attempt-reason]'), 'and says why');
      assert.deepEqual(warns, [], 'a dismissal is not a refusal');
    } finally {
      delete globalThis.ui;
    }
  });

  it('never warns with a non-string, whatever refusal shape the authority returns', async () => {
    const shapes = [
      { success: false },
      { success: false, message: 42 },
      { success: false, reason: 'command-timeout' },
      { success: false, reason: 'a-reason-nobody-mapped' }
    ];
    for (const shape of shapes) {
      const warns = [];
      globalThis.ui = { notifications: { warn: (msg) => warns.push(msg) } };
      try {
        const services = {
          listGatheringForActor: () => Promise.resolve(listing([attemptableEnv()], 'a1')),
          startGatheringAttempt: () => Promise.resolve(shape)
        };
        const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
        store.loadSelectableActors();
        flushSync();
        services.actorBar = store;
        await mountView(services);

        target.querySelector('[data-gathering-task-detail] [data-gathering-attempt]').click();
        await settle();

        const label = JSON.stringify(shape);
        assert.equal(warns.length, 1, `one warning for ${label}`);
        assert.equal(typeof warns[0], 'string', `a string for ${label}`);
        assert.notEqual(warns[0], 'undefined', `never the text "undefined" for ${label}`);
        assert.notEqual(warns[0].trim(), '', `never blank for ${label}`);
      } finally {
        delete globalThis.ui;
      }
    }
  });
  // The retained claim a refused start leaves: a GM is offered the disposition prompt here.
  describe('releasing a retained claim from a refused Attempt', () => {
    const CLAIM = {
      claimId: 'claim-7',
      requestKind: 'command',
      failureReason: 'operation-failed',
      failureMessage: 'No ledger',
      claimedAt: 1000,
    };
    const BARE = { success: false, reason: 'recovery-required' };
    const MERGED = { accepted: true, success: false, reason: 'recovery-required', runId: 'run-1' };
    const press = (action) => (options) =>
      options.buttons.find((button) => button.action === action)?.callback?.();

    /**
     * Mount the view against a recording world and hand `body` its controls. `answer` responds
     * to each dialog render; with none the dialog stays open.
     */
    async function inWorld(
      { reply = BARE, claim = CLAIM, seam = true, answer = null, reconcile = null } = {},
      body
    ) {
      const dialogs = [];
      const calls = [];
      const notes = [];
      const state = { claim, reply };
      class FakeDialog {
        constructor(options) {
          this.options = options;
        }
        render() {
          dialogs.push(this.options);
          answer?.(this.options);
        }
      }
      const env = installFoundryBridgeEnv({ labels: globalThis.game.i18n, dialog: FakeDialog });
      try {
        const services = {
          listGatheringForActor: () => {
            calls.push(['list']);
            return Promise.resolve(listing([attemptableEnv()], 'a1'));
          },
          startGatheringAttempt: () => {
            calls.push(['start']);
            return Promise.resolve(state.reply);
          },
          notify: (message) => {
            notes.push(message);
          },
          reconcileJournalRunAuthority:
            reconcile ??
            ((options) => {
              calls.push(['reconcile', options]);
              state.claim = null;
              return Promise.resolve({ success: true });
            }),
        };
        if (seam) services.getRetainedJournalClaim = () => state.claim;
        const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
        store.loadSelectableActors();
        flushSync();
        services.actorBar = store;
        await mountView(services);
        const click = async () => {
          target.querySelector(':scope [data-gathering-task-detail] [data-gathering-attempt]').click();
          await new Promise((resolve) => setTimeout(resolve, 0));
          await settle();
        };
        await body({ dialogs, calls, notes, warns: env.notifications.warn, state, click });
      } finally {
        env.restore();
      }
    }

    const count = (calls, kind) => calls.filter(([name]) => name === kind).length;

    for (const [shape, reply] of [
      ['a bare refusal', BARE],
      ['an accepted start whose execute was refused', MERGED],
    ]) {
      it(`offers the GM the prompt on ${shape} and records a reconciled release`, async () => {
        await inWorld({ reply, answer: press('reconciled') }, async ({ dialogs, calls, notes, warns, click }) => {
          await click();
          assert.deepEqual(warns, ['FABRICATE.App.Journal.Actions.ClaimRetained']);
          assert.equal(dialogs.length, 1);
          assert.equal(dialogs[0].window.title, 'FABRICATE.App.Journal.Recovery.Title');
          assert.equal(
            dialogs[0].content,
            '<p>FABRICATE.App.Journal.Recovery.ClaimDetail:{&quot;failure&quot;:&quot;No ledger&quot;}</p>' +
              '<p>FABRICATE.App.Journal.Recovery.Inspect</p><p>FABRICATE.App.Journal.Recovery.Effect</p>'
          );
          assert.deepEqual(
            dialogs[0].buttons.map(({ action, label, icon, default: isDefault }) => ({ action, label, icon, isDefault })),
            [
              { action: 'reconciled', label: 'FABRICATE.App.Journal.Recovery.Reconciled', icon: 'fas fa-clipboard-check', isDefault: false },
              { action: 'abandoned', label: 'FABRICATE.App.Journal.Recovery.Abandoned', icon: 'fas fa-ban', isDefault: false },
              { action: 'cancel', label: 'FABRICATE.App.Journal.Recovery.Cancel', icon: 'fas fa-xmark', isDefault: true },
            ],
            'Cancel is the default, so Enter releases nothing'
          );
          assert.deepEqual(calls, [
            ['list'],
            ['start'],
            ['reconcile', { claimId: 'claim-7', disposition: 'reconciled' }],
            ['list'],
          ]);
          assert.deepEqual(notes, [
            'FABRICATE.App.Journal.Recovery.Released:{"disposition":"FABRICATE.App.Journal.Recovery.Disposition.reconciled"}',
          ]);
        });
      });
    }

    it('records an abandoned release', async () => {
      await inWorld({ answer: press('abandoned') }, async ({ calls, notes, click }) => {
        await click();
        assert.deepEqual(calls.find(([name]) => name === 'reconcile'), [
          'reconcile',
          { claimId: 'claim-7', disposition: 'abandoned' },
        ]);
        assert.match(notes[0], /Recovery\.Released.*Disposition\.abandoned/);
      });
    });

    for (const [label, respond] of [
      ['Cancel', press('cancel')],
      ['closing the window', (options) => options.close?.()],
      ['Enter, which presses the default', (options) => options.buttons.find((button) => button.default)?.callback?.()],
    ]) {
      it(`records nothing on ${label}, and the refusal is still toasted`, async () => {
        await inWorld({ answer: respond }, async ({ dialogs, calls, notes, warns, click }) => {
          await click();
          assert.equal(dialogs.length, 1);
          assert.equal(count(calls, 'reconcile'), 0);
          assert.deepEqual(notes, []);
          assert.equal(warns.length, 1);
          assert.equal(count(calls, 'list'), 2, 'the listing is still re-read');
        });
      });
    }

    it('notifies the authority refusal when the release is refused, and keeps the claim', async () => {
      const reconcile = () => Promise.resolve({ success: false, reason: 'reconstruction-failed' });
      await inWorld({ answer: press('reconciled'), reconcile }, async ({ notes, state, click }) => {
        await click();
        assert.deepEqual(notes, ['FABRICATE.App.Journal.Reason.ReconstructionFailed']);
        assert.equal(state.claim, CLAIM);
      });
    });

    it('notifies the release-failed wording when the release throws', async () => {
      const reconcile = () => Promise.reject(new Error('boom'));
      const consoleError = console.error;
      console.error = () => {};
      try {
        await inWorld({ answer: press('reconciled'), reconcile }, async ({ notes, click }) => {
          await click();
          assert.deepEqual(notes, ['FABRICATE.App.Journal.Recovery.ReleaseFailed']);
        });
      } finally {
        console.error = consoleError;
      }
    });

    for (const reason of ['claim-held', 'ledger-missing', 'reconstruction-failed']) {
      it(`offers no prompt for a ${reason} refusal, even with a claim cached`, async () => {
        await inWorld({ reply: { success: false, reason }, answer: press('reconciled') }, async ({ dialogs, calls, warns, click }) => {
          await click();
          assert.equal(dialogs.length, 0);
          assert.equal(count(calls, 'reconcile'), 0);
          assert.equal(warns.length, 1, 'only the refusal toast');
        });
      });
    }

    for (const [label, options] of [
      ['a player, whose seam answers null', { claim: null }],
      ['a seam the bag does not carry', { seam: false }],
    ]) {
      it(`shows ${label} only the refusal toast`, async () => {
        await inWorld({ ...options, answer: press('reconciled') }, async ({ dialogs, calls, warns, click }) => {
          await click();
          assert.equal(dialogs.length, 0);
          assert.equal(count(calls, 'reconcile'), 0);
          assert.deepEqual(warns, ['FABRICATE.App.Journal.Actions.ClaimRetained']);
        });
      });
    }

    it('opens one dialog and starts one attempt for a second Attempt while it is open', async () => {
      await inWorld({}, async ({ dialogs, calls, click }) => {
        const first = click();
        await settle();
        await click();
        assert.equal(dialogs.length, 1);
        assert.equal(count(calls, 'start'), 1);
        press('cancel')(dialogs[0]);
        await first;
        await settle();
        assert.equal(count(calls, 'start'), 1);
      });
    });

    it('offers no prompt on the next Attempt once the claim is released', async () => {
      await inWorld({ answer: press('reconciled') }, async ({ dialogs, calls, click }) => {
        await click();
        assert.equal(dialogs.length, 1);
        await click();
        assert.equal(count(calls, 'start'), 2);
        assert.equal(dialogs.length, 1, 'the released claim is no longer offered');
      });
    });
  });

  describe('a refused Attempt on a misconfigured task', () => {
    const MESSAGE = 'The task needs GM configuration.';
    const CANNOT = 'FABRICATE.App.Gathering.Detail.CannotAttempt';
    const DETAIL = 'FABRICATE.App.Gathering.Detail.CannotAttemptDetail';
    const MORE = 'FABRICATE.App.Gathering.Detail.CannotAttemptMore';
    const generic = `${CANNOT}:${JSON.stringify({ reason: MESSAGE })}`;
    const detailed = (details) => `${DETAIL}:${JSON.stringify({ reason: MESSAGE, details })}`;
    const refusal = (data) => ({
      accepted: false,
      blockedReasons: [{ code: 'TASK_MISCONFIGURED', message: MESSAGE, data }],
    });
    const blindEnv = () =>
      environment({
        id: 'env-blind',
        selectionMode: 'blind',
        revealPolicy: 'onAttempt',
        attemptable: true,
        tasks: [{ action: 'blindGather', label: 'Blind', blind: true, attemptable: true, blockedReasons: [] }],
      });

    /** Attempt once as a GM or a player and hand back what the client notified and logged. */
    async function refuse(reply, { gm, blind = false }) {
      const warns = [];
      const logs = [];
      const originalWarn = console.warn;
      const originalUser = globalThis.game.user;
      Reflect.set(globalThis, 'ui', {
        notifications: {
          warn: (msg) => {
            warns.push(msg);
          },
        },
      });
      globalThis.game.user = { isGM: gm };
      console.warn = (...args) => {
        logs.push(args);
      };
      try {
        const services = {
          listGatheringForActor: () =>
            Promise.resolve(listing([blind ? blindEnv() : attemptableEnv()], 'a1')),
          startGatheringAttempt: () => Promise.resolve(reply),
        };
        const store = makeStore({ actors: [{ id: 'a1', uuid: 'Actor.a1', name: 'Bromm' }], seededId: 'a1' });
        store.loadSelectableActors();
        flushSync();
        services.actorBar = store;
        await mountView(services);
        const button = blind ? '[data-gathering-blind-attempt]' : '[data-gathering-task-detail] [data-gathering-attempt]';
        target.querySelector(button).click();
        await settle();
        return { warns, logs };
      } finally {
        console.warn = originalWarn;
        globalThis.game.user = originalUser;
        delete globalThis.ui;
      }
    }

    it('names the start-path errors to a GM, and logs the full list', async () => {
      const errors = ['No roll formula.', 'Duplicate group "Herbs".', 'No item drop rows.'];
      const { warns, logs } = await refuse(refusal({ taskId: 'task-1', errors }), { gm: true });
      assert.deepEqual(warns, [
        detailed(`${MORE}:${JSON.stringify({ details: 'No roll formula.; Duplicate group "Herbs".', count: 1 })}`),
      ]);
      assert.deepEqual(logs, [['Fabricate | Gathering task needs configuration:', { taskId: 'task-1', errors }]]);
    });

    it('localizes the resolution-path diagnostics for a GM, from the merged execute reply', async () => {
      const started = { accepted: true, requiresExecution: true, canExecuteImmediately: true, runId: 'run-1', blockedReasons: [] };
      const settled = refusal({
        taskId: 'task-1',
        code: 'RESULT_PLAN_DIAGNOSTIC',
        diagnostics: [
          { code: 'RESULT_SOURCE_UNRESOLVED', messageKey: 'FABRICATE.Gathering.Diagnostics.ResultSourceUnresolved' },
        ],
      });
      const { warns } = await refuse({ ...started, ...settled }, { gm: true });
      assert.deepEqual(warns, [detailed('FABRICATE.Gathering.Diagnostics.ResultSourceUnresolved')]);
    });

    it('names the errors to a GM in a blind environment', async () => {
      const { warns } = await refuse(refusal({ taskId: 'task-1', errors: ['No roll formula.'] }), {
        gm: true,
        blind: true,
      });
      assert.deepEqual(warns, [detailed('No roll formula.')]);
    });

    it('states only the generic reason when the GM reply carries no data (defensive)', async () => {
      const { warns, logs } = await refuse(refusal(null), { gm: true });
      assert.deepEqual(warns, [generic]);
      assert.deepEqual(logs, [['Fabricate | Gathering task needs configuration:', { taskId: undefined, errors: [] }]]);
    });

    it('states only the generic reason to a player, whatever the reply carries', async () => {
      const { warns, logs } = await refuse(refusal({ taskId: 'task-1', errors: ['No roll formula.'] }), {
        gm: false,
      });
      assert.deepEqual(warns, [generic]);
      assert.deepEqual(logs, []);
    });
  });
});
