/**
 * Assemble the View Lab's world and boot the REAL Fabricate runtime against it.
 *
 * The important design decision lives here. The lab does not reimplement Fabricate's read side —
 * it seeds `game.settings` with the same shapes production persists, installs the Foundry globals,
 * and then imports `src/main.js` and calls the real `Fabricate.initialize()`. From that point the
 * lab is rendering through the real `CraftingSystemManager`, the real `RecipeManager`, the real
 * `CraftingListingBuilder` / `InventoryListingBuilder` / `AlchemyListingBuilder`, and the real
 * craftability evaluation.
 *
 * That matters for a screenshot specifically: a hand-authored listing payload can only ever show
 * what its author remembered to include, so the frame proves the fixture, not the code. Booting the
 * real facade means a broken projection shows up as a broken frame.
 *
 * Ordering is load-bearing:
 *   1. build the fixture data (pure),
 *   2. install the Foundry globals,
 *   3. ONLY THEN dynamically import `src/main.js` — it registers a dozen hooks at module scope and
 *      would throw against a bare realm,
 *   4. initialize as GM (initialization migrates and writes),
 *   5. flip the viewer for player frames.
 */
import { buildLabActors, buildDocumentIndex } from './labActors.js';
import { buildLabBlindRunSecret, buildLabRunStates, installLabRunStates } from './labRunStates.js';
import { buildLabContent, ICON_BASE, LAB_SYSTEM_IDS } from './labContent.js';
import { installFoundryShim, settingsKey } from '../foundry/installFoundryShim.js';
import { createLocalizer, toI18nStub } from '../labI18n.js';

const FABRICATE_NAMESPACE = 'fabricate';

/** 14 days into the world's calendar, so relative timestamps render as something. */
export const LAB_WORLD_TIME = 1_209_600;

function seedSettings(content, actors, managedSystemId, experimentalFeatures, noParties) {
  const settings = new Map();
  const put = (key, value) => settings.set(settingsKey(FABRICATE_NAMESPACE, key), value);
  // Membership, component sources and the remembered crafting actor are all PLAYER-CHARACTER
  // concerns. They were blanket `actors.map(...)` calls, which is safe only while every actor
  // in the world is a character — and the World > Parties evidence needs one that is not
  // (`lab-actor-wagon`, a vehicle). A blanket map would have enrolled it as a member of the
  // enabled `lab-party`, colliding with its role as the second enabled party's travel actor
  // under `GatheringPartyStore`'s composite-uniqueness invariant, and would have persisted a
  // wagon as a crafting component source. The lab writes the raw settings map and validation
  // runs only in `_persist`, so neither would have thrown: an impossible world would have
  // rendered and published as evidence.
  const characterActors = actors.filter((actor) => actor.type === 'character');
  const uuidOf = (id) => actors.find((actor) => actor.id === id)?.uuid ?? null;

  // With the smoke seed enabled the lab's own three systems would sit ALONGSIDE the smoke's, which
  // is not a 1:1 comparison - the system library would show seven rows where the smoke shows its
  // own set. Start empty and let the replayed seed be the only source of crafting data.
  put('craftingSystems', content.systems);
  put('recipes', content.recipes);
  put('gatheringEnvironments', content.environments);
  put('gatheringConfig', content.gatheringConfig);
  // The world currency ladder (issue 1278). World scope, like `gatheringConfig`: a crafting
  // system carries only `requirements.currency.enabled`, so without this the World > Currency
  // page photographs an empty card and every currency cost renders as a raw unit id.
  put('currencyConfig', content.currencyConfig);
  // The world travel config (issue 1282). World scope for the same reason the currency ladder
  // is: a crafting system carries only `gatheringRealmSettings.enabled`, so without this the
  // World > Travel page photographs an empty realm list and every realm-gated environment
  // resolves against nothing.
  put('travelConfig', content.travelConfig);
  // The WORLD TOOL corpus (issue 1373, epic 1357). World scope, like the currency ladder: a
  // crafting system carries its own in-system tools, and the world record that is SHARED across
  // systems lives in its own setting. Without it the world Tools Catalogue photographs its
  // no-state hero and the world Tool entry is unreachable, because the only way in is a
  // catalogue row.
  put('toolScope', content.toolScope);
  // The WORLD COMPONENT scope and the WORLD VOCABULARY (issue 1392, epic 1357, PR 7a). Both
  // beside `toolScope` for its reason and read from `labContent`, where the fixture states what
  // each record exists to make photographable.
  //
  // `componentScope` here is a PARTIAL seed - one world-only record and its default, with no
  // `membership` key at all - and the partiality is deliberate rather than an omission, matching
  // the `essenceScope` seed below. `1.30.0`'s world-scope pass lifts the rest out of the systems
  // on every lab build, and its per-pair guard skips an entity whose default is already present,
  // so this record survives the pass rather than being overwritten by it.
  //
  // POSITION AMONG THE PUTS IS COSMETIC. The shim's settings map answers a SEEDED key with its
  // seed whether or not `registerSettings()` has declared it, so nothing here depends on the
  // registration landing first. What DOES depend on it is production, where
  // `ClientSettings#assertSetting` throws on an unregistered key — and that ordering is pinned
  // by the source-order assertions in `tests/scoped-definition-read-and-basis.test.js`, not by
  // this file.
  put('componentScope', content.componentScope);
  put('worldVocabulary', content.worldVocabulary);
  // FIVE parties, and every one of them earns its place in the World > Parties card list:
  // the pane is paged at four, searchable once more than one exists, and draws its enable
  // gate, its unlinked travel-actor tile and its disabled treatment only when a party is in
  // that state. One party photographed none of it.
  //
  // The set is legal under `GatheringPartyStore._validateList`, which is checked here because
  // the lab does NOT check it: the settings map is written raw and validation runs only in
  // `_persist`. A travel actor is not required to enable, and an actor uuid
  // may associate with at most ONE enabled party as member or travel actor;
  // disabled parties are skipped entirely (`:280`), so they may reuse any actor freely.
  //
  //   - `lab-party` — enabled; the three characters; Vosk as travel actor. Content unchanged.
  //   - `lab-party-long-haul` — enabled, ZERO members, travel actor the vehicle. Its only
  //     association is the wagon, which no enabled party claims, and it is what makes the
  //     picker's documented "every world actor" candidate set visible in a frame.
  //   - three DISABLED parties: one with members, one with neither members nor a travel actor
  //     (the enable gate closed and the unlinked tile, the two states the prototype has no
  //     equivalent of), and one named so a literal search for "wagon" matches exactly two of
  //     the five — this one by NAME and `lab-party-long-haul` by its TRAVEL ACTOR's name,
  //     which is what the widened filter added and what a name-only filter cannot fake.
  put(
    'gatheringParties',
    noParties
      ? []
      : [
          {
            id: 'lab-party',
            name: 'The Ashfall Company',
            // No `craftingSystemId`. Parties are world-level and cross-system by design
            // (`GatheringPartyStore`), and `_normalizeParty` returns a fixed six-field record that has no
            // such key — so authoring one asserts a scoping that does not exist and is dropped on read.
            // It also read as a CONTRADICTION of the frame it feeds: `manager-world-parties-normal`
            // photographs this herbalism-named party on the system-independent World → Parties path,
            // correct precisely because the scoping is not real.
            // `GatheringPartyStore._normalizeParty` reads `memberActorUuids` and `enabled`, and it takes
            // UUIDs rather than ids. This was authored as `memberActorIds` with bare ids and
            // `travelActorUuid: null`, so every field normalised away and World → Parties rendered
            // "Disabled · 0 members" — the ninth instance of the same defect class on this branch: a
            // shape production does not read, degrading to a default that looks like a rendered state.
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
  // ── ONE INHERITING SECTION, seeded so the state can be PHOTOGRAPHED (issue 1372) ───────────
  //
  // The lab runs every migration, and `buildMembershipRecord` writes every section OVERRIDING for
  // every `(entity, system)` pair it creates. So with no seed here every essence in every lab
  // system is fully overridden, and NO View Lab case can render an inheriting inherit row or a
  // `· world default` on-craft card — the two states the whole world-scope model exists to
  // express. Both were unit-covered and neither was in the registry, which is the shape that lets
  // a regression ship green.
  //
  // The seed is the MEMBERSHIP RECORD ALONE. The migration's lift half is gated PER PAIR
  // (`if (payload.membership[key]) continue;`), so this record survives it, while its defaults
  // half is gated per ENTITY and therefore still ELECTS `aether`'s world defaults from the donor
  // system exactly as it would have. Seeding a world default here as well would take that election
  // out of the frame and put a hand-written value in its place.
  //
  // `aether` in `lab-smithing` is the pair, because it is the one the three essence-editor cases
  // open, and `effectSource` is the section, because `manager-essence-edit-on-craft` documents the
  // MACRO card's missing state and scrolling to it is how that frame stays distinct from the
  // first-state frame. Leaving `macro` overridden keeps both of those true, so exactly one row on
  // one screen changes and it is a row a case already photographs.
  //
  // `enabled: false` matches what the migration would have written for this record (`aether` is a
  // disabled essence), so the catalogue's three-state per-system cell reads `disabled` here as it
  // did before rather than flipping to `enabled`.
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
  // placeholder only behind that toggle. Leaving it off gives the lab an eight-row rail where the
  // smoke has nine - a structural difference in every manager frame.
  put('experimentalFeatures', experimentalFeatures);
  return settings;
}

/**
 * Empty the world of Tools ENTIRELY, so the world Tools Catalogue renders its no-state
 * (issue 1373, maintainer feedback round 2).
 *
 * ── WHY CLEARING `toolScope` IS NOT ENOUGH, AND FINDING THAT OUT IS THE POINT ────────────────
 * The lab seeds no `migrationVersion`, so every registered migration runs on every build — and
 * `1.30.0`'s world-scope pass LIFTS each crafting system's own `tools[]` into world records. A
 * world with an empty `toolScope` and three systems carrying eleven tools between them therefore
 * boots with an ELEVEN-ROW catalogue, which is precisely why "there is no empty world tool
 * catalogue" survived two automated parity passes: the state is unreachable from the corpus the
 * fixture authors, and only reachable by removing the tools the migration reads.
 *
 * So all three sources go: the world corpus, every system's library, and the flat roster beside
 * them. `toolIds` references are nulled with them, because a recipe requiring a Tool that no
 * longer exists is a different world state from one that requires none, and this flag is for the
 * catalogue's empty state rather than for a broken-reference frame.
 *
 * The world break mode is KEPT. It is a world setting rather than a Tool, the catalogue's scope
 * band states it whether or not any Tool exists, and an empty catalogue whose one authored
 * control had also been blanked would photograph two absences as one.
 *
 * @param {object} content the built lab content, mutated in place.
 * @returns {void}
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
 * Build the lab world and boot the real Fabricate facade against it.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] Determinism seed.
 * @param {boolean} [options.noParties] Seed an EMPTY party list. Unlike `clearSystem` this
 *   needs no post-construction store call: the pane's empty state is a function of the
 *   persisted setting, so seeding `[]` is both the shortest path and the truthful one.
 * @param {boolean} [options.noTools] Build a world with NO Tools anywhere. See
 *   {@link stripTools} for why an empty `toolScope` alone would not produce one.
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
} = {}) {
  const content = buildLabContent();
  if (noTools) stripTools(content);
  // A real Manager refresh resolves an empty selection to the first available crafting system.
  // The dedicated World Parties no-selection case therefore needs the truthful world state that
  // makes an empty selection stable: no crafting systems, while global Parties and actors remain.
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

  const shim = installFoundryShim(world);
  world.shim = shim;

  // Dynamic, and only now: `src/main.js` registers hooks at module scope.
  const runtime = await import('../../../src/main.js');
  const fabricate = runtime.default;
  await fabricate.initialize();
  globalThis.game.fabricate = fabricate;

  // The rest of `Hooks.once('ready')`, called directly.
  //
  // `initialize()` is not the whole startup. The ready body also matures world time and runs four
  // flag auto-stamps, and those are what populate the tier-1 `roles` identity that `sourceUuid.js`
  // resolves against FIRST — without them every tool and component fell through to the
  // name-matching tier that production never reaches on a stamped world.
  //
  // Called individually rather than by dispatching the `ready` event, which was tried and reverted:
  // the same body reaches `addModuleButtonsToItemsDirectory`, which injects into Foundry's Items
  // sidebar and errors when it is absent. The lab has no sidebar by design, and satisfying it would
  // mean drawing a facsimile of Foundry chrome. Naming the five functions gets the startup work
  // without the sidebar integration the lab can never honestly satisfy.
  //
  // Order matches `src/main.js`: the tool stamp reads refs the component stamp and the migration
  // runner write, and the owned-item restamp reads what the component stamp produced.
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
  // Only recipes the PLAYER can see. A run pointing at a recipe the viewer has no access to renders
  // as "Hidden recipe" — correct behaviour, but it tells you nothing about how a failed or
  // time-gated run draws, which is the whole point of the journal frames.
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
  // Onto the actor the JOURNAL resolves, not the lab's own first actor. Under the smoke seed the
  // crafter is an imported hero and the seed points `lastCraftingActor` at it, so writing runs onto
  // the lab actor puts them somewhere the journal never looks - it renders empty and nothing says why.
  const rememberedId =
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastCraftingActor')) ??
    world.settings.get(settingsKey(FABRICATE_NAMESPACE, 'lastGatheringActor'));
  const journalActor = globalThis.game.actors.get(rememberedId) ?? actors[0];
  // If the viewer can see none of them, fall back to the full set: a journal of redacted rows still
  // shows how each STATUS renders, where an empty journal shows nothing at all.
  const runRecipes = journalRecipes.length > 0 ? journalRecipes : allRecipes;
  if (runRecipes.length > 0) {
    installLabRunStates(
      journalActor,
      buildLabRunStates({
        actor: journalActor,
        userId: 'user-lab-player',
        recipes: runRecipes,
        environments: content.environments,
      })
    );
    // The in-flight blind run's secret half (issue 901). It is NOT a flag: the drawn task, its
    // start-time snapshot and its node reservation live in the `gatheringBlindRuns` WORLD setting,
    // which only a GM may write — that is the integrity boundary the fix draws, and the reason a
    // GM's Journal can preview the task while the acting player's cannot.
    //
    // Written HERE rather than in `seedSettings` because it has to name the journal actor, which is
    // only resolved above; and after `installLabRunStates` so the run and its secret land together.
    // The setting map is the same one the shim reads through, so a post-boot write is visible to
    // `GatheringBlindRunStore` exactly as a GM's own `game.settings.set` would be — and nothing
    // prunes it, because `prune()` has no caller in `main.js`.
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
    for (const manager of [
      fabricate.craftingRunManager,
      fabricate.salvageRunManager,
      fabricate.gatheringRunManager,
    ]) {
      manager?.invalidateCache?.();
    }
  }

  return world;
}
