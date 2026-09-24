/**
 * The module entry's boot contract (issue 1715), observed from a real boot: the facade's
 * descriptors and key sets, the ordered hook registrations, the composition phase order, the socket
 * router, the deprecation log and the keybinding registrations. It reads no `src/` text and is
 * frozen once regenerated.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import {
  installReadyRecorders,
  probeComplicationWriter,
  probeCraftCommand,
  probeEnvironmentRunCleanup,
  probeGatheringResultCreator,
  probeGatheringSceneFollowsRequester,
  probeGmGates,
  probeImporterSeams,
  probeJournalAuthorityHooks,
  probeSettingBridge,
  probeSocketRoutes,
  probeWorldTimeDispatch,
  wiringReferences,
} from '../helpers/bootContractProbes.js';
import { withFabricateLifecycleReplay } from '../helpers/extension-composition-harness.js';

const GOLDEN_PATH = resolve(import.meta.dirname, '../fixtures/fabricateBootContract.golden.json');

const REGENERATE =
  'UPDATE_BOOT_CONTRACT_GOLDEN=1 node --conditions=browser --test ' +
  'tests/bootstrap/fabricate-boot-contract.test.js, then review the diff';

/** Instance fields whose first assignment orders the composition root. */
const COMPOSED_FIELDS = Object.freeze([
  '_startupMarks',
  'currencyConfigStore',
  'characterLibrariesStore',
  'componentScopeStore',
  'essenceScopeStore',
  'toolScopeStore',
  'worldVocabularyStore',
  'recipeManager',
  'craftingSystemManager',
  'craftingRunManager',
  'salvageRunManager',
  'gatheringRunManager',
  'gatheringGateAndCheckEvaluator',
  'recipeVisibilityService',
  'resolutionModeService',
  'itemPilesIntegration',
  'actorInventoryCoinSpender',
  'actorPropertyCoinSpender',
  'compendiumImporter',
  'craftingEngine',
  'journalRunCommands',
  'gatheringRealmStore',
  'gatheringEnvironmentStore',
  'gatheringPartyStore',
  'gatheringLocationService',
  'gatheringNodeDepletionWriter',
  'gatheringRichStateService',
  'gatheringBlindRunStore',
  'gatheringBlindStartWriter',
  'complicationDeliveryWriter',
  'ready',
]);

/** Prototype members whose call position orders the composition root. */
const COMPOSED_CALLS = Object.freeze(['registerSettings', '_runMigrations']);

/** The world stores both managers derive their basis from, and the drift audit reads (1359). */
const ORDERED_STORES = Object.freeze([
  'componentScopeStore',
  'essenceScopeStore',
  'toolScopeStore',
  'worldVocabularyStore',
]);

/** Setting reads whose position is load-bearing: the theme and the stack-quantity path. */
const WATCHED_SETTING_READS = Object.freeze(['theme', 'itemStackQuantityPath']);

/**
 * The ten deprecated aliases, in the order the contract exercises them: five facade methods and
 * five `game.fabricate.gathering` namespace members, each of which must warn exactly once.
 */
const DEPRECATED_ALIASES = Object.freeze([
  ['facade', 'getGatheringRegionStore', []],
  ['facade', 'setGatheringPartyRegionOverride', [{}]],
  ['facade', 'clearGatheringPartyRegionOverride', [{}]],
  ['facade', 'revealGatheringRegionForActor', [{}]],
  ['facade', 'hideGatheringRegionForActor', [{}]],
  ['gathering', 'getRegionStore', []],
  ['gathering', 'setPartyRegionOverride', [{}]],
  ['gathering', 'clearPartyRegionOverride', [{}]],
  ['gathering', 'revealRegionForActor', [{}]],
  ['gathering', 'hideRegionForActor', [{}]],
]);

/** Facade members probed through a detached reference, so an instance-bound copy is visible. */
const BINDING_PROBES = Object.freeze([
  'craftRecipe',
  'salvageComponent',
  'salvageComponents',
  'destroyComponents',
  'startGatheringAttempt',
  'listGatheringForActor',
  'listCraftingForActor',
  'listInventoryForActor',
  'listAlchemyForActor',
  'listJournalForActor',
  'executeJournalRunCommand',
  'rollActorCheck',
  'awardComponents',
  'creditCurrency',
  'readPooledHoldings',
  'consumePooledHoldings',
  'getGatheringRegionStore',
  'evaluateSelectedSet',
]);

const byCodePoint = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/** One descriptor row: the measured triple plus `Function#length` where the value is callable. */
function describe(target, name) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  const accessor = typeof descriptor.get === 'function' || typeof descriptor.set === 'function';
  return {
    name,
    enumerable: descriptor.enumerable,
    writable: accessor ? null : descriptor.writable,
    configurable: descriptor.configurable,
    accessor,
    length: typeof descriptor.value === 'function' ? descriptor.value.length : null,
  };
}

const describeAll = (target) =>
  Object.getOwnPropertyNames(target).sort(byCodePoint).map((name) => describe(target, name));

/** Record the composition's phase order without changing what it composes. */
function installCompositionRecorder(instance) {
  const log = [];
  const prototype = Object.getPrototypeOf(instance);
  const restore = [];
  const seenReads = new Set();
  let registered = false;
  // From the first world store to the second manager: each store's load and corpus read, and any
  // setting write, in the order the composition makes them.
  const storeOrder = [];
  let recordingStores = false;
  const recordStoreOrder = (field, value) => {
    if (field === ORDERED_STORES[0]) recordingStores = true;
    if (!recordingStores) return;
    storeOrder.push(`assign:${field}`);
    if (field === 'craftingSystemManager') recordingStores = false;
    if (!ORDERED_STORES.includes(field)) return;
    for (const method of ['load', 'corpus']) {
      const original = value[method];
      value[method] = function recordStoreCall(...args) {
        if (recordingStores) storeOrder.push(`${method}:${field}`);
        return original.apply(this, args);
      };
    }
  };

  for (const name of COMPOSED_CALLS) {
    const original = prototype[name];
    Object.defineProperty(prototype, name, {
      value(...args) {
        log.push(`call:${name}`);
        return original.apply(this, args);
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
    restore.push(() =>
      Object.defineProperty(prototype, name, {
        value: original,
        enumerable: false,
        writable: true,
        configurable: true,
      })
    );
  }

  for (const field of COMPOSED_FIELDS) {
    let held = instance[field];
    const present = Object.hasOwn(instance, field);
    Object.defineProperty(instance, field, {
      get: () => held,
      set(value) {
        log.push(`assign:${field}`);
        held = value;
        recordStoreOrder(field, value);
      },
      enumerable: true,
      configurable: true,
    });
    restore.push(() => {
      if (!present && held === undefined) {
        delete instance[field];
        return;
      }
      Object.defineProperty(instance, field, {
        value: held,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });
  }

  const settings = globalThis.game.settings;
  const originalRegister = settings.register;
  const originalGet = settings.get;
  const originalSet = settings.set;
  settings.register = function register(...args) {
    if (!registered) {
      registered = true;
      log.push('settings:register');
    }
    return originalRegister.apply(this, args);
  };
  settings.get = function get(namespace, key, ...rest) {
    if (WATCHED_SETTING_READS.includes(key) && !seenReads.has(key)) {
      seenReads.add(key);
      log.push(`setting:${key}`);
    }
    return originalGet.call(this, namespace, key, ...rest);
  };
  settings.set = function set(namespace, key, ...rest) {
    if (recordingStores) storeOrder.push(`set:${key}`);
    return originalSet.call(this, namespace, key, ...rest);
  };
  restore.push(() => {
    settings.register = originalRegister;
    settings.get = originalGet;
    settings.set = originalSet;
  });

  return {
    log,
    storeOrder,
    restore: () => {
      for (const undo of restore.reverse()) undo();
    },
  };
}

/** A `game.socket` that records its listeners, the lab shim leaving the field null. */
function installSocketRecorder() {
  const listeners = new Map();
  globalThis.game.socket = {
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    off: () => {},
    emit: () => {},
    listeners: (event) => listeners.get(event) ?? [],
  };
  return listeners;
}

/** Record `game.keybindings.register`; after `init` it throws, as core does. */
function installKeybindingRecorder() {
  const keybindings = globalThis.game.keybindings;
  const original = keybindings.register;
  const rows = [];
  const recorder = { rows, phase: 'init', restore: () => (keybindings.register = original) };
  keybindings.register = function register(namespace, action, definition) {
    rows.push({ phase: recorder.phase, action: `${namespace}.${action}`, editable: definition?.editable });
    if (recorder.phase !== 'init') throw new Error('You cannot register a Keybinding after the init hook');
    return original.call(this, namespace, action, definition);
  };
  return recorder;
}

/** Exercise each deprecated alias once and return the warnings it produced, in order. */
function recordDeprecationWarnings(facade) {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    const [first] = args;
    if (typeof first === 'string' && first.startsWith('Fabricate: ')) warnings.push(first);
  };
  try {
    for (const [surface, name, args] of DEPRECATED_ALIASES) {
      const target = surface === 'facade' ? facade : facade.gathering;
      try {
        target[name](...args);
      } catch {
        // The warning is the subject; several aliases refuse on their arguments afterwards.
      }
    }
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

/** Whether a call failed, counting an async member's rejection as a failure. */
async function failed(invoke) {
  try {
    await invoke();
    return false;
  } catch {
    return true;
  }
}

/**
 * Each probed member called through the facade and again through a detached reference. A method
 * written as an arrow instead of shorthand loses `this` on both, and an instance-bound copy keeps
 * it on both; only prototype method shorthand answers `false` then `true`.
 */
async function probeBinding(facade) {
  const rows = [];
  for (const name of BINDING_PROBES) {
    const detached = facade[name];
    rows.push({
      name,
      length: detached.length,
      failsAttached: await failed(() => facade[name]()),
      failsDetached: await failed(() => detached()),
    });
  }
  return rows;
}

/** Everything the boot contract compares, measured from one real boot. */
async function measureBootContract({ init, ready, loadModule }) {
  const hooks = globalThis.Hooks;
  const hookEventsAtYield = [...hooks.registrations.values()].map((entry) => entry.event);
  const instance = (await loadModule('/src/main.js')).default;
  // Before every recorder below, so `init`'s `game.fabricate` bind leaves the composition log alone.
  const keybindingRecorder = installKeybindingRecorder();
  await init();
  keybindingRecorder.phase = 'after-init';
  const { COMPANION_CONTRACT: COMPANION_CONTRACT_FOR_PUBLICATION } = await loadModule(
    '/src/systems/companionContract.js'
  );
  let companionPublication;
  const companionWarnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const [first] = args;
    if (typeof first === 'string' && first.includes('game.fabricate.api.COMPANION')) {
      companionWarnings.push(first);
      throw new Error('the warning sink failed');
    }
  };
  const apiAtInit = globalThis.game.fabricate.api;
  const companionAtInit = apiAtInit.companion;
  const apiKeysAtInit = Object.keys(apiAtInit);
  const warningsBeforeAlias = companionWarnings.length;
  const aliasDescriptor = Object.getOwnPropertyDescriptor(apiAtInit, 'COMPANION');
  const aliasAtInit = apiAtInit.COMPANION;
  const composition = installCompositionRecorder(instance);
  // The `ready` backstop re-binds `game.fabricate` BEFORE `initialize()`, so a listener of the
  // `fabricate.journalRunAuthorityRestored` that pass fires meets a bound global. The bind
  // registers no hook, so only this recorder can see it move.
  const gameGlobal = globalThis.game;
  let boundFacade = gameGlobal.fabricate;
  Object.defineProperty(gameGlobal, 'fabricate', {
    get: () => boundFacade,
    set(value) {
      composition.log.push('bind:game.fabricate');
      boundFacade = value;
    },
    enumerable: true,
    configurable: true,
  });
  const socketListeners = installSocketRecorder();
  const readyRecorders = await installReadyRecorders(loadModule);

  const callAllLog = [];
  const originalCallAll = hooks.callAll;
  hooks.callAll = function callAll(name, ...rest) {
    callAllLog.push({ name, registrationsBefore: hooks.registrations.size });
    if (name === 'fabricate.ready') readyRecorders.readySequence.push('callAll:fabricate.ready');
    return originalCallAll.call(this, name, ...rest);
  };

  try {
    await ready();
    const reboundApi = globalThis.game.fabricate.api;
    const warningCountBeforeLowercaseReadyRead = companionWarnings.length;
    const companionAfterReady = reboundApi.companion;
    const aliasAfterReady = reboundApi.COMPANION;
    const spreadApi = { ...reboundApi };
    const serializedApi = JSON.parse(JSON.stringify(reboundApi));
    companionPublication = {
      keysAtInitIncludeBoth:
        apiKeysAtInit.includes('companion') && apiKeysAtInit.includes('COMPANION'),
      warningsBeforeAlias,
      warnings: [...companionWarnings],
      lowercaseIsContractAtInit: companionAtInit === COMPANION_CONTRACT_FOR_PUBLICATION,
      aliasIsContractAtInit: aliasAtInit === COMPANION_CONTRACT_FOR_PUBLICATION,
      lowercaseIsContractAfterReady: companionAfterReady === COMPANION_CONTRACT_FOR_PUBLICATION,
      lowercaseWarningsAfterReady:
        companionWarnings.length - warningCountBeforeLowercaseReadyRead,
      aliasSurvivesReadyRebind: aliasAfterReady === companionAfterReady,
      spreadAliasIsPrimary: spreadApi.COMPANION === spreadApi.companion,
      serializedAliasMatchesPrimary:
        JSON.stringify(serializedApi.COMPANION) === JSON.stringify(serializedApi.companion),
      aliasEnumerable: aliasDescriptor?.enumerable === true,
      aliasIsAccessor: typeof aliasDescriptor?.get === 'function',
    };
  } finally {
    console.warn = originalWarn;
    keybindingRecorder.restore();
    hooks.callAll = originalCallAll;
    readyRecorders.restore();
    Object.defineProperty(gameGlobal, 'fabricate', {
      value: boundFacade,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    composition.restore();
  }

  const facade = globalThis.game.fabricate;
  const { FABRICATE_HOOKS } = await loadModule('/src/config/hooks.js');
  const { COMPANION_CONTRACT } = await loadModule('/src/systems/companionContract.js');
  const whenReady = await Promise.race([
    facade.whenReady().then(() => 'resolved'),
    new Promise((settle) => setTimeout(() => settle('pending'), 500)),
  ]);
  const runtime = await loadModule('/src/bootstrap/gatheringRuntime.js');
  const [socketListener] = socketListeners.get('module.fabricate') ?? [];

  return {
    hookEventsAtYield,
    hookEventsAfterReady: [...hooks.registrations.values()].map((entry) => entry.event),
    callAllLog,
    socketListenerCount: socketListeners.get('module.fabricate')?.length ?? 0,
    socketChannels: [...socketListeners.keys()].sort(byCodePoint),
    instanceProperties: describeAll(facade),
    prototypeProperties: describeAll(Object.getPrototypeOf(facade)),
    gatheringKeys: Object.keys(facade.gathering).sort(byCodePoint),
    apiKeys: Object.keys(facade.api).sort(byCodePoint),
    macroApiKeys: Object.keys(globalThis.fabricate).sort(byCodePoint),
    companionPublication,
    references: {
      apiHooksIsFabricateHooks: facade.api.HOOKS === FABRICATE_HOOKS,
      apiCompanionIsCompanionContract: facade.api.companion === COMPANION_CONTRACT,
      facadeIsEntrySingleton: facade === instance,
      recipeManagerTookCurrencyStore:
        facade.recipeManager.currencyConfigStore === facade.currencyConfigStore,
      craftingEngineTookCurrencyStore:
        facade.craftingEngine.currencyConfigStore === facade.currencyConfigStore,
      craftingEngineTookRecipeManager:
        facade.craftingEngine.recipeManager === facade.recipeManager,
      craftingEngineTookRunManager:
        facade.craftingEngine.craftingRunManager === facade.craftingRunManager,
      craftingEngineTookSalvageRunManager:
        facade.craftingEngine.salvageRunManager === facade.salvageRunManager,
      craftingEngineTookResolutionModeService:
        facade.craftingEngine.resolutionModeService === facade.resolutionModeService,
      craftingEngineTookComplicationWriter:
        facade.craftingEngine.complicationDeliveryWriter === facade.complicationDeliveryWriter,
      componentScopeStoreIsShared:
        facade.getComponentScopeStore() === facade.componentScopeStore,
      essenceScopeStoreIsShared: facade.getEssenceScopeStore() === facade.essenceScopeStore,
      toolScopeStoreIsShared: facade.getToolScopeStore() === facade.toolScopeStore,
      vocabularyScopeStoreIsShared:
        facade.getVocabularyScopeStore() === facade.worldVocabularyStore,
      readyFlag: facade.ready === true,
      whenReadyResolution: whenReady,
      ...wiringReferences(facade, runtime),
    },
    compositionLog: composition.log,
    worldStoreOrder: composition.storeOrder,
    keybindingRegistrations: keybindingRecorder.rows,
    deprecationWarnings: recordDeprecationWarnings(facade),
    binding: await probeBinding(facade),
    publicHookNames: Object.values(facade.api.HOOKS)
      .flatMap((namespace) => Object.values(namespace))
      .sort(byCodePoint),
    startupMarks: readyRecorders.startupMarks,
    readySequence: readyRecorders.readySequence,
    gmGates: probeGmGates(facade, runtime),
    settingBridge: probeSettingBridge(facade),
    worldTimeDispatch: await probeWorldTimeDispatch(facade, runtime),
    craftCommand: probeCraftCommand(facade),
    journalAuthorityHooks: probeJournalAuthorityHooks(facade),
    environmentRunCleanup: probeEnvironmentRunCleanup(facade),
    socketRoutes: probeSocketRoutes(facade, socketListener),
    complicationWriter: probeComplicationWriter(facade),
    gatheringSceneFollowsRequester: probeGatheringSceneFollowsRequester(runtime),
    gatheringResultCreatorReadsLiveSystemManager: await probeGatheringResultCreator(
      facade,
      runtime
    ),
    importerSeams: await probeImporterSeams(facade),
  };
}

test('the module entry boots to its pinned contract', { timeout: 300000 }, async () => {
  let measured = null;
  await withFabricateLifecycleReplay(async (context) => {
    measured = await measureBootContract(context);
  });

  assert.deepStrictEqual(measured.companionPublication, {
    keysAtInitIncludeBoth: true,
    warningsBeforeAlias: 0,
    warnings: [
      'Fabricate: game.fabricate.api.COMPANION is deprecated; use ' +
        'game.fabricate.api.companion instead. See ' +
        'https://mistersilver-uk.github.io/fabricate/api/#companion-contract',
    ],
    lowercaseIsContractAtInit: true,
    aliasIsContractAtInit: true,
    lowercaseIsContractAfterReady: true,
    lowercaseWarningsAfterReady: 0,
    aliasSurvivesReadyRebind: true,
    spreadAliasIsPrimary: true,
    serializedAliasMatchesPrimary: true,
    aliasEnumerable: true,
    aliasIsAccessor: true,
  });

  if (process.env.UPDATE_BOOT_CONTRACT_GOLDEN === '1') {
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(measured, null, 2)}\n`);
  }
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  // Compared field by field so a failure names the contract that moved rather than printing the
  // whole boot; the whole-object comparison below is what makes the set of fields itself exact.
  assert.deepStrictEqual(
    measured.hookEventsAtYield,
    golden.hookEventsAtYield,
    'the module-scope and initialize()-time hook registrations, unfiltered and in order'
  );
  assert.deepStrictEqual(
    measured.hookEventsAfterReady,
    golden.hookEventsAfterReady,
    'hoisting the ready-body registrations above `await fabricate.initialize()` moves the six ' +
      'inner registrations to the end of this array'
  );
  assert.deepStrictEqual(measured.callAllLog, golden.callAllLog, 'the callAll positions');
  assert.deepStrictEqual(
    measured.instanceProperties,
    golden.instanceProperties,
    'the own properties of `game.fabricate`, with their measured descriptors'
  );
  assert.deepStrictEqual(
    measured.prototypeProperties,
    golden.prototypeProperties,
    'the prototype members, with their measured descriptors: an `Object.assign`-installed slice ' +
      'reds on enumerability and an instance-installed one reds by leaving this set'
  );
  assert.deepStrictEqual(measured.gatheringKeys, golden.gatheringKeys);
  assert.deepStrictEqual(measured.apiKeys, golden.apiKeys);
  assert.deepStrictEqual(measured.macroApiKeys, golden.macroApiKeys);
  assert.deepStrictEqual(measured.references, golden.references);
  assert.deepStrictEqual(
    measured.compositionLog,
    golden.compositionLog,
    'the composition phase order, including the migration pass and the stack-quantity path'
  );
  assert.deepStrictEqual(
    measured.deprecationWarnings,
    golden.deprecationWarnings,
    'each of the ten deprecated aliases warns exactly once, through one shared warned-name set'
  );
  assert.deepStrictEqual(
    measured.binding,
    golden.binding,
    'a facade member written as an arrow rather than method shorthand fails attached too'
  );
  assert.deepStrictEqual(
    measured.keybindingRegistrations,
    golden.keybindingRegistrations,
    'every keybinding registers during `init`; core refuses one registered any later'
  );
  assert.deepStrictEqual(measured, golden, REGENERATE);
});

test('the boot contract golden is not vacuous', () => {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  assert.equal(golden.hookEventsAtYield.length, 12);
  assert.equal(golden.hookEventsAfterReady.length, 29);
  assert.equal(golden.socketListenerCount, 1);
  assert.equal(golden.instanceProperties.length, 46);
  assert.equal(golden.prototypeProperties.length, 140);
  assert.equal(golden.gatheringKeys.length, 17);
  assert.equal(golden.deprecationWarnings.length, 10);
  assert.equal(new Set(golden.deprecationWarnings).size, 10);
  assert.equal(
    golden.instanceProperties.filter((row) => row.enumerable).length,
    46,
    'every own property is a plain assignment'
  );
  assert.equal(
    golden.prototypeProperties.filter((row) => row.enumerable).length,
    0,
    'every prototype member is non-enumerable, as a class method is'
  );
  assert.equal(
    golden.prototypeProperties.filter((row) => row.accessor).length,
    0,
    'there is no accessor among them, so no descriptor lacks `writable`'
  );
  assert.ok(golden.compositionLog.length >= 30);
  assert.deepStrictEqual(
    golden.keybindingRegistrations,
    [{ phase: 'init', action: 'fabricate.fabricateInteractHere', editable: [{ key: 'KeyE' }] }],
    'the interact keybinding registers exactly once, during `init`, and nothing registers after'
  );
  assert.deepEqual(
    Object.entries(golden.references).filter(([, value]) => value !== true && value !== 'resolved'),
    [],
    'every reference-identity claim is positive; a regeneration must not bank a false one'
  );
  assert.equal(golden.publicHookNames.length, 12);
  assert.equal(golden.startupMarks.length, 8, 'four phases, each opened and closed');
  assert.equal(golden.readySequence.at(-1), 'callAll:fabricate.ready');
  assert.deepEqual(
    Object.values(golden.gmGates)
      .flatMap((row) => Object.values(row))
      .filter((answer) => answer !== true),
    [],
    'every single-writer gate admits the active GM and refuses an assistant GM and a player'
  );
  assert.equal(golden.settingBridge.length, 3);
  assert.equal(golden.journalAuthorityHooks.length, 4);
  assert.equal(golden.environmentRunCleanup.length, 3);
  assert.equal(golden.complicationWriter.resolutionId, 'minted-probe');
  assert.deepEqual(
    golden.gatheringSceneFollowsRequester,
    {
      remoteViewerOnSceneB: 'allowed',
      currentUserViewingSceneB: 'FABRICATE.Gathering.Blocked.SceneMissing',
    },
    "a remote requester is judged on its own viewed scene, this client's user on its canvas"
  );
  assert.ok(
    golden.gatheringResultCreatorReadsLiveSystemManager.includes('probe'),
    'the result creator resolves a component through the live crafting system manager'
  );
  assert.equal(Object.keys(golden.worldTimeDispatch).length, 4);
  const stores = ['componentScopeStore', 'essenceScopeStore', 'toolScopeStore'];
  assert.deepEqual(
    golden.worldStoreOrder,
    [
      ...[...stores, 'worldVocabularyStore'].flatMap((store) => [`assign:${store}`, `load:${store}`]),
      ...stores.map((store) => `corpus:${store}`),
      'assign:recipeManager',
      'assign:craftingSystemManager',
    ],
    'each store loads before the drift audit reads it, and nothing is written before both managers'
  );
  assert.equal(golden.importerSeams.reached.length, 14, 'every importer seam follows its field');
  assert.deepEqual(
    golden.importerSeams.reached.filter((call) => call.includes('.save ')),
    [
      'gatheringEnvironmentStore.save [[{"id":"probe-environment"}]]',
      'gatheringRealmStore.save [{"probe":"travel"}]',
      'componentScopeStore.save [{"probe":"components"}]',
      'essenceScopeStore.save [{"probe":"essences"}]',
      'toolScopeStore.save [{"probe":"tools"}]',
    ],
    'every save forwards the value it was handed'
  );
  assert.deepEqual(golden.importerSeams.settings, [
    'get fabricate.gatheringConfig',
    'set fabricate.gatheringConfig {"probe":"gatheringConfig"}',
  ]);
  assert.deepEqual(
    golden.importerSeams.admits,
    { activeGm: true, assistantGm: true, player: false },
    'the importer is GM-gated, not single-writer'
  );
  assert.ok(golden.socketRoutes.depletionsApplied > 0 && golden.socketRoutes.complicationsApplied > 0);
  assert.ok(golden.binding.every((row) => typeof row.length === 'number'));
  assert.ok(
    golden.binding.some((row) => row.failsDetached && !row.failsAttached),
    'at least one probe distinguishes a prototype method from a bound or arrow copy'
  );
});
