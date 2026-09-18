/** Assemble the View Lab's world and boot the REAL Fabricate runtime against it. */
import { installFoundryShim, settingsKey } from '../foundry/installFoundryShim.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';
import { JOURNAL_RUN_SOCKET_KIND } from '../../../src/systems/journalRunCommands.js';
import { JOURNAL_RUN_CLAIM_PAGE_ID } from '../../../src/systems/journalRunAuthority.js';

import { buildLabActors, buildDocumentIndex } from './labActors.js';
import {
  buildLabContent,
  ICON_BASE,
  LAB_SYSTEM_IDS,
  seedJournalNoCheckFixture,
} from './labContent.js';
import { seedLabInteractables } from './labInteractables.js';
import { stockJournalPrototype } from './labJournalPrototype.js';
import { installUpdateSemantics, makeGetFlag } from './labFlags.js';
import {
  buildLabBlindRunSecret,
  buildLabRunStates,
  createLabJournalCaseController,
  installLabRunStates,
  LAB_RETAINED_CLAIM,
} from './labRunStates.js';

const FABRICATE_NAMESPACE = 'fabricate';

// These variants change persisted authoring before the real services initialize. The default
// world remains unchanged, including every existing d100 editor and gathering screenshot.
function seedGatheringTaskMode(content, mode) {
  if (!['straight', 'routed', 'routed-unmatched'].includes(mode)) return;
  const system = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.HERBALISM);
  const slice = content.gatheringConfig.systems[LAB_SYSTEM_IDS.HERBALISM];
  const task = structuredClone(slice.tasks.find((entry) => entry.id === 'hb-task-slowbloom'));
  task.resolutionMode = mode === 'straight' ? 'straight' : 'routed';
  task.resultGroups = [
    {
      id: 'lab-gathering-yield',
      name: mode === 'routed-unmatched' ? 'Old abundance name' : 'Abundant',
      results: [{ id: 'lab-gathering-emberbloom', componentId: 'hb-emberbloom', quantity: 2 }],
    },
  ];
  if (mode !== 'straight') {
    system.gatheringCraftingCheck = {
      ...system.gatheringCraftingCheck,
      routed: {
        rollFormula: '1d20',
        dc: 15,
        type: 'relative',
        thresholdMode: 'meet',
        relativeOutcomes: [
          { id: 'lab-abundant', name: 'Abundant', success: true, dc: 0 },
          { id: 'lab-failed', name: 'Failed', success: false, dc: -15 },
        ],
      },
    };
  }
  const replaceTask = (entry) => (entry.id === task.id ? task : entry);
  slice.tasks = slice.tasks.map(replaceTask);
  content.gatheringConfig.tasks = content.gatheringConfig.tasks.map(replaceTask);
}

/** 14 days into the world's calendar, so relative timestamps render as something. */
export const LAB_WORLD_TIME = 1_209_600;

function seedSettings(content, actors, managedSystemId, experimentalFeatures, noParties) {
  const settings = new Map();
  const put = (key, value) => settings.set(settingsKey(FABRICATE_NAMESPACE, key), value);
  // Membership, component sources and the remembered crafting actor are all PLAYER-CHARACTER
  // concerns.
  const characterActors = actors.filter((actor) => actor.type === 'character');
  const uuidOf = (id) => actors.find((actor) => actor.id === id)?.uuid ?? null;

  // With the smoke seed enabled the lab's own three systems would sit ALONGSIDE the smoke's, which
  // is not a 1:1 comparison - the system library would show seven rows where the smoke shows its
  // own set. Start empty and let the replayed seed be the only source of crafting data.
  put('craftingSystems', content.systems);
  put('recipes', content.recipes);
  put('gatheringEnvironments', content.environments);
  put('gatheringConfig', content.gatheringConfig);
  // The world currency ladder (issue 1278).
  put('currencyConfig', content.currencyConfig);
  // The world travel config (issue 1282).
  put('travelConfig', content.travelConfig);
  // The WORLD TOOL corpus (issue 1373, epic 1357).
  put('toolScope', content.toolScope);
  // The WORLD COMPONENT scope and the WORLD VOCABULARY (issue 1392, epic 1357, PR 7a). POSITION
  // AMONG THE PUTS IS COSMETIC.
  put('componentScope', content.componentScope);
  put('worldVocabulary', content.worldVocabulary);
  // FIVE parties, and every one of them earns its place in the World > Parties card list: the pane
  // is paged at four, searchable once more than one exists, and draws its enable gate, its unlinked
  // travel-actor tile and its disabled treatment only when a party is in that state.
  put(
    'gatheringParties',
    noParties
      ? []
      : [
          {
            id: 'lab-party',
            name: 'The Ashfall Company',
            // No `craftingSystemId`. Parties are world-level and cross-system by design
            // (`GatheringPartyStore`), and `_normalizeParty` returns a fixed six-field record that
            // has no such key — so authoring one asserts a scoping that does not exist and is
            // dropped on read.
            enabled: true,
            memberActorUuids: characterActors.map((actor) => actor.uuid),
            // A party cannot enable without one. The mule carries the load, which is also why he holds
            // the multi-source stock the crafting frames draw from.
            travelActorUuid: characterActors[2]?.uuid ?? characterActors[0].uuid,
          },
          {
            id: 'lab-party-long-haul',
            name: 'The Long Haul',
            enabled: true,
            memberActorUuids: [],
            travelActorUuid: uuidOf('lab-actor-wagon'),
          },
          {
            id: 'lab-party-emberwatch',
            name: 'Emberwatch Foragers',
            enabled: false,
            memberActorUuids: characterActors.slice(0, 2).map((actor) => actor.uuid),
            travelActorUuid: characterActors[0]?.uuid ?? null,
          },
          {
            id: 'lab-party-second-kiln',
            name: 'Second Kiln Crew',
            enabled: false,
            memberActorUuids: [],
            travelActorUuid: null,
          },
          {
            id: 'lab-party-wagonwright',
            name: 'The Wagonwright Circle',
            enabled: false,
            memberActorUuids: characterActors.slice(2).map((actor) => actor.uuid),
            travelActorUuid: null,
          },
        ]
  );
  // ONE INHERITING SECTION, seeded so the state can be PHOTOGRAPHED (issue 1372). The lab runs
  // every migration, and `buildMembershipRecord` writes every section OVERRIDING for every
  // `(entity, system)` pair it creates.
  put('essenceScope', {
    entities: [],
    defaults: {},
    membership: {
      [`aether|${LAB_SYSTEM_IDS.SMITHING}`]: {
        entityId: 'aether',
        systemId: LAB_SYSTEM_IDS.SMITHING,
        inherit: { effectSource: true, macro: false },
        enabled: false,
      },
    },
  });
  // Selection preferences, so the player app opens on a populated actor and system rather than on
  // an empty-state prompt that says nothing about the UI.
  put('lastCraftingActor', characterActors[0].id);
  put('lastGatheringActor', characterActors[0].id);
  put(
    'lastComponentSources',
    characterActors.map((actor) => actor.id)
  );
  put('lastManagedCraftingSystem', managedSystemId ?? LAB_SYSTEM_IDS.SMITHING);
  put('lastAlchemySystem', LAB_SYSTEM_IDS.ALCHEMY);
  put('favouriteRecipes', ['sm-r-longsword', 'hb-r-healing']);
  put('progressiveResultOrder', {});
  put('gatheringHideUnavailableEnvironments', false);
  put('managerRailCollapsed', false);
  // The smoke world runs with experimental features on, and the manager rail advertises its Graph
  // placeholder only behind that toggle.
  put('experimentalFeatures', experimentalFeatures);
  return settings;
}

/**
 * Empty the world of Tools ENTIRELY, so the world Tools Catalogue renders its no-state (issue 1373,
 * maintainer feedback round 2). So all three sources go: the world corpus, every system's library,
 * and the flat roster beside them.
 *
 * @param {object} content the built lab content, mutated in place.
 */
function stripTools(content) {
  content.tools = [];
  for (const system of content.systems ?? []) {
    if (system && typeof system === 'object') system.tools = [];
  }
  content.toolScope = {
    entities: [],
    defaults: {},
    membership: {},
    toolBreakage: content.toolScope?.toolBreakage ?? { authority: 'toolSpecific' },
  };
  const clearToolIds = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) clearToolIds(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'toolIds' && Array.isArray(value)) {
        node[key] = [];
        continue;
      }
      clearToolIds(value);
    }
  };
  clearToolIds(content.recipes ?? []);
}

/**
 * Remove the world's OWN authored component records, leaving the migration's lifted ones (issue
 * 1540).
 *
 * @param {object} content the built lab content, mutated in place.
 */
function stripAuthoredWorldComponents(content) {
  content.componentScope = { entities: [], defaults: {} };
}

/**
 * Build the lab world and boot the real Fabricate facade against it.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] Determinism seed.
 * @param {boolean} [options.noParties] Seed an EMPTY party list. Unlike `clearSystem` this
 *   needs no post-construction store call: the pane's empty state is a function of the
 *   persisted setting, so seeding `[]` is both the shortest path and the truthful one.
 * @param {boolean} [options.noTools] Build a world with NO Tools anywhere. See
 *   {@link stripTools} for why an empty `toolScope` alone would not produce one.
 * @param {boolean} [options.noAuthoredWorldComponents] Seed NO world component records of the
 *   lab's own. This does NOT empty the world component catalogue by itself — the migration still
 *   lifts one record per crafting system component — so a case wanting an empty catalogue pairs
 *   it with `clearSystem`. See {@link stripAuthoredWorldComponents}.
 * @param {boolean} [options.noInteractables] Attach NO `fabricate.interactable` behaviours to the
 *   scene's region, for the Manage Interactables panel's empty state. A FLAG rather than a second
 *   fixture shape, because it is the one state no behaviour COUNT can produce: the panel scans
 *   whatever the active scene carries, so "nothing on this scene" is a property of the world
 *   rather than of which behaviour a case opens. See `labInteractables.js` for why the two config
 *   states are seeded behaviours instead.
 * @param {string|null} [options.journalCaseState] Focused persisted Journal state for View Lab.
 * @returns {Promise<object>} The world, with `fabricate`, `shim`, and `content` attached.
 */
export async function buildLabWorld({
  seed = 20_260_601,
  managedSystemId = null,
  experimentalFeatures = true,
  clearSystem = false,
  longTravelLabels = false,
  noParties = false,
  noTools = false,
  noAuthoredWorldComponents = false,
  noInteractables = false,
  gatheringTaskMode = null,
  journalCaseState = null,
} = {}) {
  const content = buildLabContent({ journalCaseState });
  if (
    ['ready-single', 'waiting-auto-eligible', 'automatic-completion'].includes(journalCaseState)
  ) {
    seedJournalNoCheckFixture(content);
  }
  seedGatheringTaskMode(content, gatheringTaskMode);
  if (noTools) stripTools(content);
  if (noAuthoredWorldComponents) stripAuthoredWorldComponents(content);
  // A real Manager refresh resolves an empty selection to the first available crafting system.
  if (clearSystem) content.systems = [];
  const actors = buildLabActors(content);
  const documents = buildDocumentIndex(content, actors);
  const shippedLocalize = await createLocalizer();
  const localize = (key) =>
    longTravelLabels && key === 'FABRICATE.Admin.Manager.Travel.Tabs.MapLinks'
      ? 'Map Region Links Across the Active Scene'
      : shippedLocalize(key);

  const world = {
    seed,
    content,
    settings: seedSettings(content, actors, managedSystemId, experimentalFeatures, noParties),
    documents,
    actorList: actors,
    scenes: [
      {
        id: 'lab-scene',
        uuid: 'Scene.lab-map',
        name: 'The Verdant Reach',
        background: {
          src: `${ICON_BASE}/environment/wilderness/cave-entrance-dwarven-hill.webp`,
        },
        regions: [
          {
            id: 'deep-gate',
            uuid: 'Scene.lab-map.Region.deep-gate',
            name: 'Deep Gate Approach',
            color: '#8b6f47',
          },
        ],
      },
    ],
    worldTime: LAB_WORLD_TIME,
    i18n: toI18nStub(localize),
    localize,
  };

  // BEFORE the shim, because `installFoundryShim` wraps `world.scenes` in the collection
  // `game.scenes` exposes and captures `current` / `active` off it.
  const worldHasInteractableSources = !clearSystem && !noTools;
  if (!noInteractables && worldHasInteractableSources) seedLabInteractables(world);

  const shim = installFoundryShim(world);
  world.shim = shim;
  // The authority-unavailable case starts without a ledger, which is what blocks its actions.
  if (journalCaseState !== 'authority-unavailable') {
    const ledger = createLabRunAuthorityLedger(journalCaseState === 'claim-retained');
    const journal = globalThis.game.journal;
    const get = journal.get;
    journal.contents.push(ledger);
    journal.get = (id) => (id === ledger.id ? ledger : get(id));
  }

  // Dynamic, and only now: `src/main.js` registers hooks at module scope.
  const runtime = await import('../../../src/main.js');
  const fabricate = runtime.default;
  await fabricate.initialize();
  globalThis.game.fabricate = fabricate;
  installLabJournalTransport(globalThis.game, fabricate.journalRunCommands);

  // The rest of `Hooks.once('ready')`, called directly. `initialize()` is not the whole startup.
  await runtime.processFabricateWorldTime();
  await runtime.runRecipeItemFlagAutoStamp();
  await runtime.runComponentFlagAutoStamp();
  await runtime.runToolFlagAutoStamp();
  await runtime.runOwnedItemComponentIdentityRestamp();
  world.fabricate = fabricate;

  if (!fabricate.craftingSystemManager?.initialized) {
    throw new Error(
      'view lab: CraftingSystemManager did not initialize; the fixture world is unusable'
    );
  }
  if (!fabricate.recipeManager?.initialized) {
    throw new Error('view lab: RecipeManager did not initialize; the fixture world is unusable');
  }

  // Journal runs. Written after the crafting data exists, because each run resolves to a real
  // recipe - a run pointing at a recipe that is not there renders as a redacted stub and proves
  // nothing about how the journal draws a failed or time-gated run.
  const rememberedIdForVisibility =
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastCraftingActor')) ??
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastGatheringActor'));
  const visibilityActor = globalThis.game.actors.get(rememberedIdForVisibility) ?? actors[0];
  const allRecipes = fabricate.getRecipeManager().getRecipes({ enabled: true }) ?? [];
  const visibility = fabricate.recipeVisibilityService;
  const playerViewer = { id: 'user-lab-player', isGM: false };
  const journalRecipes = allRecipes.filter((recipe) => {
    try {
      return (
        visibility?.evaluateRecipeAccess?.({
          recipe,
          viewer: playerViewer,
          craftingActor: visibilityActor,
          componentSourceActors: [visibilityActor],
        })?.visible === true
      );
    } catch {
      return false;
    }
  });
  // Onto the actor the JOURNAL resolves, not the lab's own first actor.
  const rememberedId =
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastCraftingActor')) ??
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastGatheringActor'));
  const journalActor = globalThis.game.actors.get(rememberedId) ?? actors[0];
  await stockJournalPrototype(journalActor, content, journalCaseState);
  // If the viewer can see none of them, fall back to the full set: a journal of redacted rows still
  // shows how each STATUS renders, where an empty journal shows nothing at all.
  const runRecipes = journalRecipes.length > 0 ? journalRecipes : allRecipes;
  if (runRecipes.length > 0) {
    const runContainers = buildLabRunStates({
      actor: journalActor,
      userId: 'user-lab-player',
      recipes: runRecipes,
      environments: content.environments,
      tasks: content.gatheringConfig.tasks,
      journalCaseState,
    });
    installLabRunStates(journalActor, runContainers);
    if (journalCaseState) {
      const controller = createLabJournalCaseController({
        actor: journalActor,
        containers: runContainers,
        state: journalCaseState,
        recipes: runRecipes,
        nowWorldTime: () => Number(fabricate.getWorldTime?.() ?? LAB_WORLD_TIME),
        onPersist: () => invalidateJournalFixtureCaches(fabricate),
      });
      fabricate.executeJournalCaseFixtureCommand = controller.execute;
      fabricate.journalCaseFixtureEvents = controller.events;
    }
    // The in-flight blind run's secret half (issue 901).
    const blindRunSecret = buildLabBlindRunSecret({
      actor: journalActor,
      environments: content.environments,
      tasks: content.gatheringConfig.tasks,
    });
    // Keyed by run id, as `GatheringBlindRunStore` stores it (`SETTING_KEYS.GATHERING_BLIND_RUNS`).
    world.settings.set(settingsKey(FABRICATE_NAMESPACE, 'gatheringBlindRuns'), {
      [blindRunSecret.runId]: blindRunSecret,
    });
    // The run managers memoise each actor's container the first time they read it, and
    // `initialize()` reads it — so a container written afterwards is invisible until the cache is
    // dropped. The symptom is a journal with runs on the actor and none on screen.
    invalidateJournalFixtureCaches(fabricate);
  }

  return world;
}

function invalidateJournalFixtureCaches(fabricate) {
  for (const manager of [
    fabricate.craftingRunManager,
    fabricate.salvageRunManager,
    fabricate.gatheringRunManager,
  ]) {
    manager?.invalidateCache?.();
  }
}

// The in-memory document edge lets the REAL authority and craft pipeline run in local and CI
// captures. It is deliberately not evidence of server arbitration or cross-client persistence.
/**
 * @param {boolean} [retainedClaim] Seed a RETAINED execution claim — the state a refused
 *   command leaves behind when the authority cannot prove the refusal happened before any
 *   write. Only `reconcileJournalRunAuthority` clears it, which is the affordance issue 1648
 *   put in the app, so the lab has to be able to reach the state to photograph it.
 */
function createLabRunAuthorityLedger(retainedClaim = false) {
  const ledger = installUpdateSemantics({
    id: 'lab-run-authority',
    flags: { fabricate: { journalRunAuthorityLedger: true } },
    pages: new Map(),
  });
  ledger.getFlag = makeGetFlag(ledger);
  if (retainedClaim) seedRetainedClaim(ledger);
  ledger.createEmbeddedDocuments = async (type, sources, options) => {
    if (type !== 'JournalEntryPage' || options?.keepId !== true) {
      throw new Error('view lab: unexpected authority claim creation');
    }
    const created = [];
    for (const source of sources) {
      if (ledger.pages.has(source._id)) continue;
      const page = { ...structuredClone(source), id: source._id };
      page.getFlag = makeGetFlag(page);
      ledger.pages.set(page.id, page);
      created.push(page);
    }
    return created;
  };
  ledger.deleteEmbeddedDocuments = async (type, ids) => {
    if (type !== 'JournalEntryPage')
      throw new Error('view lab: unexpected authority claim deletion');
    return ids.flatMap((id) => {
      const page = ledger.pages.get(id);
      return ledger.pages.delete(id) ? [page] : [];
    });
  };
  return ledger;
}

/**
 * The maintainer's own stuck world, in fixture form: a `pause` the lifecycle refused before it
 * wrote anything, recorded `recoveryRequired` with its refusal message, whose claim the authority
 * KEPT.
 */
function seedRetainedClaim(ledger) {
  const { claimId, requestId, requestKind, requestStatus, failureReason, failureMessage, claimedAt } =
    LAB_RETAINED_CLAIM;
  ledger.flags.fabricate.journalRunAuthorityState = {
    version: 1,
    requests: {
      [requestId]: {
        kind: requestKind,
        operationId: requestId,
        status: requestStatus,
        senderId: 'user-lab-player',
        sessionId: 'lab-session',
        startedAt: claimedAt,
        settledAt: claimedAt,
        claimId,
        response: { success: false, reason: failureReason, message: failureMessage },
      },
    },
    prepareTokens: {},
    reconciliations: [],
  };
  const page = {
    id: JOURNAL_RUN_CLAIM_PAGE_ID,
    _id: JOURNAL_RUN_CLAIM_PAGE_ID,
    flags: {
      fabricate: {
        journalRunClaimId: claimId,
        journalRunRequestId: requestId,
        journalRunClaimedAt: claimedAt,
      },
    },
  };
  page.getFlag = makeGetFlag(page);
  ledger.pages.set(page.id, page);
}

// There is one browser realm in the lab.
function installLabJournalTransport(game, service) {
  let delivery = Promise.resolve();
  let reply = null;
  const listeners = new Map();
  game.socket = {
    // Retain the real ready-hook registrations and Socket.IO-style disposal. Outbound emits do not
    // echo to these local listeners.
    on(channel, listener) {
      const entries = listeners.get(channel) ?? [];
      entries.push(listener);
      listeners.set(channel, entries);
      return this;
    },
    off(channel, listener) {
      if (channel === undefined) listeners.clear();
      else if (listener === undefined) listeners.delete(channel);
      else {
        const entries = listeners.get(channel) ?? [];
        const index = entries.indexOf(listener);
        if (index !== -1) entries.splice(index, 1);
        if (entries.length === 0) listeners.delete(channel);
      }
      return this;
    },
    listeners(channel) {
      return [...(listeners.get(channel) ?? [])];
    },
    emit(channel, payload, options) {
      if (channel !== 'module.fabricate') return;
      if (payload?.kind === JOURNAL_RUN_SOCKET_KIND.REPLY) {
        reply = { payload, senderId: game.user.id, recipients: options?.recipients };
        return;
      }
      if (payload?.kind !== JOURNAL_RUN_SOCKET_KIND.REQUEST) return;
      const sender = game.user;
      delivery = delivery
        .then(async () => {
          const viewer = game.user;
          reply = null;
          game.user = game.users.activeGM;
          try {
            await service.handleSocketMessage(payload, sender.id);
          } finally {
            game.user = viewer;
          }
          if (reply && (!Array.isArray(reply.recipients) || reply.recipients.includes(viewer.id))) {
            service.acceptReply(reply.payload, reply.senderId);
          }
        })
        .catch((error) => {
          console.error('view lab: Journal command delivery failed', error);
        });
    },
  };
}
