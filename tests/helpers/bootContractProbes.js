/**
 * The wiring probes `tests/bootstrap/fabricate-boot-contract.test.js` runs against one real boot
 * (issue 1933): identities the composition root hands its collaborators, the single-writer gates
 * asked as three users, and the boot-registered hook and socket handlers called with core-shaped
 * payloads. Every spy is restored, so the descriptors the contract measures afterwards are intact.
 */

/** The listener `main.js` registered for one hook event, or `null` when it registered none. */
export function handlerOf(event) {
  const entry = [...globalThis.Hooks.registrations.values()].find((row) => row.event === event);
  return entry?.handler ?? null;
}

/** Replace one member with a recorder, returning the restore; a prototype member is shadowed. */
function spyOn(target, name, replacement) {
  const own = Object.getOwnPropertyDescriptor(target, name);
  target[name] = replacement;
  return () => (own ? Object.defineProperty(target, name, own) : delete target[name]);
}

/** An identity claim that cannot pass on two absent operands. */
const sameLiveObject = (actual, expected) => expected != null && actual === expected;

/** What the composition root hands each engine, and which listeners share one handler. */
export function wiringReferences(facade, runtime) {
  const engine = runtime.getGatheringEngine();
  const took = (field, expected) => sameLiveObject(engine?.[field], expected);
  return {
    gatheringEngineTookEnvironmentStore: took('environmentStore', facade.gatheringEnvironmentStore),
    gatheringEngineTookRunManager: took('runManager', facade.gatheringRunManager),
    gatheringEngineTookRichState: took('richState', facade.gatheringRichStateService),
    gatheringEngineTookEvaluator: took('evaluator', facade.gatheringGateAndCheckEvaluator),
    gatheringEngineTookSystemManager: took('systemManager', facade.craftingSystemManager),
    gatheringEngineTookSelectableActors: took(
      'getSelectableActors',
      runtime.getGatheringSelectableActors
    ),
    gatheringEngineTookRunViewer: took('getRunViewer', runtime.getGatheringRunViewer),
    gatheringEngineTookLocalize: took('localize', runtime.localizeGathering),
    gatheringEngineTookLocationResolver: took('locationResolver', facade.gatheringLocationService),
    gatheringEngineTookTravelStore: took('travelStore', facade.gatheringRealmStore),
    gatheringEngineTookBlindRunStore: took('blindRunStore', facade.gatheringBlindRunStore),
    gatheringEngineTookComplicationWriter: took(
      'complicationDeliveryWriter',
      facade.complicationDeliveryWriter
    ),
    gatheringEngineTookPauseCheck: took('isGamePaused', runtime.isCurrentWorldPaused),
    gatheringEngineSelectsByOwnership: selectsByOwnership(engine),
    gatheringEngineTookJournalAuthority: engine?.versionedRunAuthority != null,
    gatheringEngineHasToolSeams:
      typeof engine?.toolAvailability?.check === 'function' &&
      typeof engine?.toolBreakage?.plan === 'function',
    recipeManagerResolvesLiveSystemManager: sameLiveObject(
      facade.recipeManager?._getCraftingSystemManager?.(),
      facade.craftingSystemManager
    ),
    recipeManagerResolvesLiveSystem: resolvesLiveSystem(facade),
    currencyStoreIsTheWorldStore:
      facade.currencyConfigStore instanceof facade.api.CurrencyConfigStore,
    richStateDepletesThroughWriter: probeDepletionSeam(facade),
    createSettingSharesUpdateSettingListener: sameLiveObject(
      handlerOf('createSetting'),
      handlerOf('updateSetting')
    ),
    journalPageDeleteSharesCreateRefresh: sameLiveObject(
      handlerOf('deleteJournalEntryPage'),
      handlerOf('createJournalEntryPage')
    ),
    userConnectedSharesUpdateUserBootstrap: sameLiveObject(
      handlerOf('userConnected'),
      handlerOf('updateUser')
    ),
  };
}

/** Whether the engine's attempt predicate is the per-user ownership rule, asked of two players. */
function selectsByOwnership(engine) {
  const owner = { id: 'probe-owner', isGM: false };
  const stranger = { id: 'probe-stranger', isGM: false };
  const actor = { testUserPermission: (user, level) => level === 'OWNER' && user === owner };
  return (
    engine?.isActorSelectable?.({ actor, viewer: owner }) === true &&
    engine.isActorSelectable({ actor, viewer: stranger }) === false
  );
}

/** Whether the recipe manager's system resolver answers the live manager's own record. */
function resolvesLiveSystem(facade) {
  const [first] = facade.craftingSystemManager.getSystems();
  const expected = facade.craftingSystemManager.getSystem(first?.id);
  return sameLiveObject(facade.recipeManager.getCraftingSystem?.(first?.id), expected);
}

/** Whether the rich-state node service's depletion seam reaches the GM-routed writer. */
function probeDepletionSeam(facade) {
  const reached = [];
  const writer = facade.gatheringNodeDepletionWriter;
  const restore = spyOn(writer, 'deplete', (payload) => reached.push(payload));
  try {
    facade.gatheringRichStateService?.nodeService?.depleteEnvironmentNode?.({ probe: true });
  } finally {
    restore();
  }
  return reached.length === 1 && reached[0].probe === true;
}

/** A connected role-3 ASSISTANT: `isGM` holds for it in core, and it is never `activeGM` here. */
export const ASSISTANT_GM = Object.freeze({
  id: 'user-lab-assistant-gm',
  name: 'Assistant GM',
  isGM: true,
  role: 3,
  active: true,
});

/** Run `work` as `user`, awaited, so an async pass meets one user throughout; the lab GM returns. */
export async function asLabUser(user, work) {
  const game = globalThis.game;
  const previous = game.user;
  game.user = user;
  try {
    return await work();
  } finally {
    game.user = previous;
  }
}

const RECORDED_CONSOLE = Object.freeze(['info', 'debug', 'log', 'warn', 'error']);
const RECORDED_NOTIFICATIONS = Object.freeze(['info', 'warn', 'error']);

/**
 * Run `work` with every console level and notification channel recorded rather than printed.
 *
 * @returns {Promise<{posted: Array, logged: Array, result: unknown}>} `[level, message, options]`
 * per notification and `[level, ...args]` per console line.
 */
export async function recordNoticeOutput(work) {
  const posted = [];
  const logged = [];
  const originalConsole = Object.fromEntries(
    RECORDED_CONSOLE.map((level) => [level, console[level]])
  );
  const { notifications } = globalThis.ui;
  for (const level of RECORDED_CONSOLE) {
    console[level] = (...args) => logged.push([level, ...args]);
  }
  const post = (level) => (message, options) => posted.push([level, message, options]);
  globalThis.ui.notifications = {
    ...notifications,
    ...Object.fromEntries(RECORDED_NOTIFICATIONS.map((level) => [level, post(level)])),
  };
  try {
    return { posted, logged, result: await work() };
  } finally {
    Object.assign(console, originalConsole);
    globalThis.ui.notifications = notifications;
  }
}

/** Ask each wired single-writer gate as the active GM, an assistant GM and a player. */
export function probeGmGates(facade, runtime) {
  const game = globalThis.game;
  // The lab GM is `game.users.activeGM`, standing in for the role-4 GAMEMASTER.
  const activeGm = game.user;
  const assistantGm = ASSISTANT_GM;
  const player = game.users.get('user-lab-player');
  const gates = {
    gatheringResumeTimedRuns: () => runtime.getGatheringEngine().resumeTimedRuns(),
    craftingRunResume: () => facade.craftingRunManager._isPrimaryGM(),
    salvageRunResume: () => facade.salvageRunManager._isPrimaryGM(),
  };
  const askAs = (user, gate) => {
    game.user = user;
    try {
      return gate();
    } finally {
      game.user = activeGm;
    }
  };
  return Object.fromEntries(
    Object.entries(gates).map(([name, gate]) => [
      name,
      {
        activeGmAllowed: askAs(activeGm, gate) === true,
        assistantGmRefused: askAs(assistantGm, gate) === false,
        playerRefused: askAs(player, gate) === false,
      },
    ])
  );
}

/** Which collaborator each replicated-setting key reaches through the shared bridge listener. */
export function probeSettingBridge(facade) {
  const reached = [];
  const record = (name) => () => {
    reached.push(name);
    return false;
  };
  const restores = [
    spyOn(facade.craftingSystemManager, 'reload', record('craftingSystemManager.reload')),
    spyOn(facade.recipeManager, 'reload', record('recipeManager.reload')),
    spyOn(facade.gatheringEnvironmentStore, 'load', record('gatheringEnvironmentStore.load')),
  ];
  try {
    const bridge = handlerOf('createSetting');
    for (const key of ['craftingSystems', 'recipes', 'gatheringEnvironments']) {
      bridge({ key: `fabricate.${key}` }, {}, 'user-lab-gm');
    }
  } finally {
    for (const restore of restores) restore();
  }
  return reached;
}

/** What one `updateWorldTime` reaches, the handler dispatching without awaiting. */
export async function probeWorldTimeDispatch(facade, runtime) {
  const reached = {};
  const record = (name) => (argument) => {
    reached[name] = [...(reached[name] ?? []), argument];
  };
  const engine = runtime.getGatheringEngine();
  const restores = [
    spyOn(facade.craftingRunManager, 'processWorldTime', record('craftingRuns')),
    spyOn(facade.craftingEngine, 'processVersionedWorldTime', record('versionedCrafting')),
    spyOn(facade.craftingEngine, 'processPendingSalvageRuns', record('salvage')),
    spyOn(engine, 'processWorldTime', record('gathering')),
  ];
  const tick = () => new Promise((settle) => setTimeout(settle, 0));
  try {
    handlerOf('updateWorldTime')(4242, 1, {}, 'user-lab-gm');
    await tick();
    // Guarded: a crafting processor that throws must not starve the gathering one.
    restores.push(
      spyOn(facade.craftingRunManager, 'processWorldTime', () => {
        throw new Error('probe: the crafting processor failed');
      })
    );
    const { error } = console;
    console.error = () => {};
    try {
      handlerOf('updateWorldTime')(4343, 1, {}, 'user-lab-gm');
      await tick();
    } finally {
      console.error = error;
    }
  } finally {
    for (const restore of restores.reverse()) restore();
  }
  return reached;
}

/** The `/craft <name>` chat command, answered through the public craft facade. */
export function probeCraftCommand(facade) {
  const game = globalThis.game;
  const actor = { id: 'probe-actor' };
  const recipe = { id: 'probe-recipe' };
  const crafted = [];
  const previousCharacter = game.user.character;
  game.user.character = actor;
  const restores = [
    spyOn(facade, 'craft', (...args) => {
      crafted.push(args);
      return Promise.resolve({ success: true, message: 'crafted' });
    }),
    spyOn(facade.recipeManager, 'getRecipes', () => [recipe]),
  ];
  try {
    const answer = handlerOf('chatMessage')(globalThis.ui?.chat ?? {}, '/craft Probe Recipe', {
      speaker: {},
      user: game.user.id,
    });
    return {
      suppressesChat: answer === false,
      delegatesToFacadeCraft:
        crafted.length === 1 && crafted[0][0] === actor && crafted[0][1] === recipe,
    };
  } finally {
    game.user.character = previousCharacter;
    for (const restore of restores) restore();
  }
}

/** One addressed complication, as a delivery payload carries it. */
const PROBE_COMPLICATION = Object.freeze({
  componentId: 'c',
  complicationId: 'k',
  resultId: 'r',
  activity: 'salvage',
  bucket: 'stageMissed',
});

/** What the composed complication writer emits from a player client, and what it mints. */
export function probeComplicationWriter(facade) {
  const game = globalThis.game;
  const activeGm = game.user;
  const emitted = [];
  const restores = [
    spyOn(globalThis.foundry.utils, 'randomID', () => 'minted-probe'),
    spyOn(game.socket, 'emit', (...args) => emitted.push(args)),
  ];
  game.user = game.users.get('user-lab-player');
  try {
    facade.complicationDeliveryWriter.deliver({
      craftingSystemId: 'probe-system',
      actorUuid: 'Actor.probe',
      complications: [PROBE_COMPLICATION],
    });
  } finally {
    game.user = activeGm;
    for (const restore of restores) restore();
  }
  return { channel: emitted[0]?.[0] ?? null, resolutionId: emitted[0]?.[1]?.resolutionId ?? null };
}

/** The inbound depletion and complication routes on the one `module.fabricate` listener. */
export function probeSocketRoutes(facade, listener) {
  const sender = 'user-lab-player';
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  const depleted = [];
  const restore = spyOn(
    facade.gatheringRichStateService,
    'applyEnvironmentNodeDepletion',
    (args) => {
      depleted.push(args);
      if (args.taskId === 'throws') throw new Error('the apply failed');
    }
  );
  const deplete = (taskId) =>
    listener({ action: 'gatheringNodeDeplete', environmentId: 'env', taskId }, sender);
  const complication = (resolutionId) =>
    listener(
      {
        action: 'complicationDeliver',
        craftingSystemId: 'probe-system',
        actorUuid: 'Actor.probe-missing',
        resolutionId,
        complications: [PROBE_COMPLICATION],
      },
      sender
    );
  const count = (prefix) => warnings.filter((message) => message.startsWith(prefix)).length;
  try {
    let depletionThrowContained = true;
    try {
      deplete('throws');
    } catch {
      depletionThrowContained = false;
    }
    for (let index = 0; index < 30; index += 1) deplete(`task-${index}`);
    complication('resolution-0');
    const appliedOnce = count('Fabricate | Refused a complication delivery: the addressed actor');
    complication('resolution-0');
    const afterDuplicate = count(
      'Fabricate | Refused a complication delivery: the addressed actor'
    );
    for (let index = 1; index <= 100; index += 1) complication(`resolution-${index}`);
    return {
      depletionThrowContained,
      depletionsApplied: depleted.length,
      depletionRateLimitRefusals: count(
        'Fabricate | Refused a gathering node depletion: sender rate limit'
      ),
      complicationDuplicateDropped: appliedOnce === 1 && afterDuplicate === 1,
      complicationsApplied: count(
        'Fabricate | Refused a complication delivery: the addressed actor'
      ),
      complicationRateLimitRefusals: count(
        'Fabricate | Refused a complication delivery: sender rate limit'
      ),
    };
  } finally {
    restore();
    console.warn = originalWarn;
  }
}

/**
 * Record the `fabricate:` startup marks, and the ready-time order of the first world-time pass
 * against `fabricate.ready` (which the `callAll` recorder appends).
 */
export async function installReadyRecorders(loadModule) {
  const { performance } = globalThis;
  const { mark } = performance;
  const startupMarks = [];
  const readySequence = [];
  const restores = [
    spyOn(performance, 'mark', function recordMark(name, ...rest) {
      if (String(name).startsWith('fabricate:')) startupMarks.push(name);
      return mark.call(this, name, ...rest);
    }),
  ];
  for (const [path, className, method, label] of READY_MARKERS) {
    const { prototype } = (await loadModule(path))[className];
    const original = prototype[method];
    restores.push(
      spyOn(prototype, method, function recordReadyStep(...args) {
        readySequence.push(label);
        return original.apply(this, args);
      })
    );
  }
  const restore = () => {
    for (const undo of restores.reverse()) undo();
  };
  return { startupMarks, readySequence, restore };
}

/** The ready-time steps whose relative order is load-bearing, each recorded on its prototype. */
const READY_MARKERS = Object.freeze([
  [
    '/src/systems/CraftingSystemManager.js',
    'CraftingSystemManager',
    'initialize',
    'craftingSystemManager.initialize',
  ],
  [
    '/src/systems/GatheringEnvironmentStore.js',
    'GatheringEnvironmentStore',
    'load',
    'gatheringEnvironmentStore.load',
  ],
  [
    '/src/systems/CraftingRunManager.js',
    'CraftingRunManager',
    'processWorldTime',
    'craftingRuns.processWorldTime',
  ],
]);

/** The run-cleanup seams the environment store was handed, each reaching the run manager. */
export function probeEnvironmentRunCleanup(facade) {
  const reached = [];
  const runs = facade.gatheringRunManager;
  const record =
    (name) =>
    (...args) =>
      reached.push([name, ...args]);
  const restores = ['removeRunsForSystem', 'removeRunsForEnvironment', 'removeRunsForTask'].map(
    (name) => spyOn(runs, name, record(name))
  );
  try {
    const cleanup = facade.gatheringEnvironmentStore.runCleanup;
    cleanup.removeRunsForSystem('system-probe');
    cleanup.removeRunsForEnvironment('environment-probe');
    cleanup.removeRunsForTask('task-probe', { probe: true });
  } finally {
    for (const restore of restores) restore();
  }
  return reached;
}

/** Which journal-authority seam each boot-registered document and user hook reaches. */
export function probeJournalAuthorityHooks(facade) {
  const reached = [];
  const commands = facade.journalRunCommands;
  const restores = [
    spyOn(commands, 'refreshJournalRunAuthorityAvailability', () => reached.push('refresh')),
    spyOn(commands, 'bootstrapJournalRunAuthority', () => reached.push('bootstrap')),
  ];
  const user = globalThis.game.user;
  try {
    for (const [event, args] of [
      ['createJournalEntryPage', [{}, {}, 'user-lab-gm']],
      ['deleteJournalEntryPage', [{}, {}, 'user-lab-gm']],
      ['updateUser', [user, { active: true }, {}, 'user-lab-gm']],
      ['userConnected', [user, true]],
    ]) {
      handlerOf(event)?.(...args);
    }
  } finally {
    for (const restore of restores) restore();
  }
  return reached;
}

/**
 * The scene gate asked for an environment on scene B while this client views scene A (issue
 * 1912): a remote requester viewing B is judged on B, and this client's own user on its canvas.
 */
export function probeGatheringSceneFollowsRequester(runtime) {
  const game = globalThis.game;
  const sceneA = { id: 'probe-scene-a', uuid: 'Scene.probe-scene-a' };
  const sceneB = { id: 'probe-scene-b', uuid: 'Scene.probe-scene-b' };
  const actor = { getDependentTokens: () => [{ parent: sceneB }] };
  const ask = (viewer) => {
    const answer = runtime.getGatheringEngine().sceneAccess.canAttempt({
      environment: { sceneUuid: sceneB.uuid },
      actor,
      viewer,
    });
    return answer.allowed ? 'allowed' : answer.messageKey;
  };
  const restores = [
    spyOn(game, 'scenes', { current: sceneA, get: (id) => (id === sceneB.id ? sceneB : null) }),
    spyOn(game.user, 'viewedScene', sceneB.id),
  ];
  try {
    return {
      remoteViewerOnSceneB: ask({ id: 'probe-remote-player', viewedScene: sceneB.id }),
      currentUserViewingSceneB: ask(game.user),
    };
  } finally {
    for (const restore of restores) restore();
  }
}

/** The system ids the engine's result creator asks the LIVE crafting system manager for. */
export async function probeGatheringResultCreator(facade, runtime) {
  const asked = [];
  const manager = facade.craftingSystemManager;
  const restore = spyOn(manager, 'getSystem', (id) => {
    asked.push(id);
    return null;
  });
  try {
    await runtime.getGatheringEngine().resultCreator.plan({
      system: { id: 'probe' },
      resultGroups: [{ results: [{ componentId: 'x' }] }],
    });
  } finally {
    restore();
  }
  return asked;
}

/** The composed importer's fields, each swapped for a recorder AFTER construction. */
const IMPORTER_SEAM_FIELDS = Object.freeze([
  'gatheringEnvironmentStore',
  'gatheringRealmStore',
  'componentScopeStore',
  'essenceScopeStore',
  'toolScopeStore',
]);

/**
 * What the shared importer's seams reach, with the arguments they forward, once each facade field
 * has been replaced, which only a LAZY seam follows; what its setting pair reads and writes; and
 * which users its GM gate admits.
 */
export async function probeImporterSeams(facade) {
  const game = globalThis.game;
  const importer = facade.compendiumImporter;
  const reached = [];
  const recorder = (field) =>
    Object.fromEntries(
      ['list', 'load', 'save', 'get', 'isSeeded'].map((method) => [
        method,
        (...args) => reached.push(`${field}.${method} ${JSON.stringify(args)}`) > 0,
      ])
    );
  const settings = [];
  const restores = [
    ...IMPORTER_SEAM_FIELDS.map((field) => spyOn(facade, field, recorder(field))),
    spyOn(game.settings, 'get', (namespace, key) => settings.push(`get ${namespace}.${key}`)),
    spyOn(game.settings, 'set', (namespace, key, value) =>
      settings.push(`set ${namespace}.${key} ${JSON.stringify(value)}`)
    ),
  ];
  try {
    const environments = importer._environmentStore;
    environments.list();
    environments.load();
    environments.save([{ id: 'probe-environment' }]);
    importer._travelStore.get();
    importer._travelStore.save({ probe: 'travel' });
    for (const [kind, seam] of Object.entries(importer._scopeStoreSeams)) {
      seam.isSeeded('entities');
      seam.get();
      seam.save({ probe: kind });
    }
    importer._getSetting('gatheringConfig');
    importer._setSetting('gatheringConfig', { probe: 'gatheringConfig' });
  } finally {
    for (const restore of restores) restore();
  }
  const admits = (user) => asLabUser(user, () => importer._isGM());
  return {
    reached,
    settings,
    admits: {
      activeGm: await admits(game.user),
      assistantGm: await admits(ASSISTANT_GM),
      player: await admits(game.users.get('user-lab-player')),
    },
  };
}
