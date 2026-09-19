/**
 * Playwright smoke test that verifies Fabricate loads correctly in a live Foundry VTT instance and
 * exercises core crafting flows, from the setup page through world launch, fixture seeding, the
 * captured manager and crafting walks, and the terminal console-error check.
 *
 * Writes `test-results/summary.json` (machine-readable verdict and error list), `console.log` and
 * `screenshot-*.png`. Run as `node scripts/foundry-test-run.mjs`; `FOUNDRY_ADMIN_KEY`,
 * `FOUNDRY_URL` and `FOUNDRY_SCREENSHOT_HEAD_SHA` override the admin password, the base URL and
 * the exact-head stamp.
 */

import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendAllowedConsoleErrorPatterns,
  evaluateSmokeOutcome,
  isTransientPageTeardown,
  shouldTolerateSmokeTeardown,
  TRANSIENT_TEARDOWN_SKIP_PREFIX
} from './lib/foundrySmokeSignal.js';
import { runFixturedScreenshotSection } from './lib/smokeSectionFixture.js';
import {
  planWorldScopeIdentitySmoke,
  seededFlagPaths,
  WORLD_SCOPE_SMOKE_FLAG_NAMESPACE,
} from './lib/worldScopeIdentitySmoke.js';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
// The setup -> license -> auth -> launch -> join path lives in scripts/lib/foundryBrowserBoot.js so
// the narrow V13 arm (scripts/foundry-version-assert.mjs) can boot a Foundry page without importing
// this file, which exports nothing and runs `main()` on import.
import {
  acceptLicenseIfPresent as acceptLicenseIfPresentShared,
  authenticateIfRequired as authenticateIfRequiredShared,
  createBootReporter,
  getPathname,
  joinWorldSession as joinWorldSessionShared,
  launchWorld as launchWorldShared
} from './lib/foundryBrowserBoot.js';
// The rail's (id, label) pairs (issue 1362).
import {
  MANAGER_SYSTEM_RAIL_ENTRIES,
  MANAGER_WORLD_SCOPED_RAIL_ENTRIES,
  railSelector
} from './lib/managerRailEntries.js';
import { resolveScreenshotHeadSha } from './ui-pr-screenshot-evidence.mjs';
import { readAllowedConsoleErrorPatternsCsv, resolveSmokeProfileFlags } from './foundry-smoke/profile.mjs';
import { createSmokeContext } from './foundry-smoke/context.mjs';
import { runSmokeCleanup } from './foundry-smoke/cleanup.mjs';
import { runScenarios } from './foundry-smoke/runScenarios.mjs';
import { SMOKE_SCENARIOS } from './foundry-smoke/registry.mjs';
import d0Recipes from './foundry-smoke/scenarios/d0-recipes.mjs';
import d0ComponentsChecks from './foundry-smoke/scenarios/d0-components-checks.mjs';
import d0TagsEssences from './foundry-smoke/scenarios/d0-tags-essences.mjs';
import d0Gathering from './foundry-smoke/scenarios/d0-gathering.mjs';
import d0Tools from './foundry-smoke/scenarios/d0-tools.mjs';
import d0WorldScopeIdentity from './foundry-smoke/scenarios/d0-world-scope-identity.mjs';
import d0Knowledge from './foundry-smoke/scenarios/d0-knowledge.mjs';
import d0OverviewInteractables from './foundry-smoke/scenarios/d0-overview-interactables.mjs';
import d0ImportAlchemyExperimental from './foundry-smoke/scenarios/d0-import-alchemy-experimental.mjs';
import {
  activateSceneAndAwaitCanvasReady,
  assertNoScreenshotOverlays,
  assertPointerTarget,
  attachConsoleCapture,
  closeOpenApplications,
  describeBlockingOverlay,
  dismissFoundryNotifications,
  exerciseManagerEnvironmentPointerTargets,
  exerciseManagerPointerTargets,
  exerciseManagerSystemEditPointerTargets,
  installNotificationHidingCss,
  managerSystemRowSelector,
  selectSmokeSystemInManager,
  setManagerWindowSize,
  settleManagerNav,
  softClick,
  suppressFoundryTours
} from './foundry-smoke/pageOps/pageLifecycle.mjs';
import {
  assertManagerLayoutStable,
  assertProgressiveStageListSound,
  assertRecipeRowsHittable,
  captureAlchemyThemes,
  captureBulkEditFrame,
  captureGroupedContinuationFrame,
  captureManagerThemes,
  captureRecipeEditorRoundtrip,
  captureRecipeResultsTab,
  captureStableManagerView,
  chooseSelectOption,
  clickSegment,
  COMPONENT_BULK_EDIT_STUDIO,
  handleRollPromptIfPresent,
  openChecksActivity,
  openChecksSection,
  openManagerCraftingSection,
  openManagerMultiStepFeatureTile,
  openManagerRecipeEditor,
  RECIPE_BULK_EDIT_STUDIO,
  returnToSystemLibrary,
  selectRecipeRowsByName
} from './foundry-smoke/pageOps/managerViews.mjs';
import {
  assertDisabledToolOnBreakFieldset,
  assertSavedToolStudioCapture,
  assertToolStudioEditorLayout,
  assertToolStudioLibraryLayout,
  captureToolStudioProduct,
  clickToolTabAndAssertEffect,
  ensureSlotOpen,
  requireSingleLocator,
  resetToolStudioScroll,
  saveToolStudioDraftIfDirty,
  scrollToolEditorPanelToReveal,
  toggleToolControlAndRestore,
  withSingleToolDraftTransition,
  withSingleToolStoreMutation
} from './foundry-smoke/pageOps/toolStudio.mjs';


// A browser/page teardown at the very end of a long headless run (the Chromium being killed while a
// final screenshot click is still in flight) can leave a floating page promise that rejects AFTER
// the run's verdict is already recorded in summary.json.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (isTransientPageTeardown(message)) {
    process.stderr.write(`Ignoring transient teardown rejection after the run: ${message}\n`);
    return;
  }
  process.stderr.write(`foundry-test-run unhandled rejection: ${message}\n`);
  process.exit(1);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RESULTS_DIR = join(ROOT, 'test-results');

// Self-derive the endpoint so a standalone `test:foundry:run` (invoked as its own process after
// `test:foundry:up`) targets the same per-worktree port up bound, instead of the old fixed :30100
// (issue #827).
const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port
}).url;
const ADMIN_KEY = process.env.FOUNDRY_ADMIN_KEY ?? 'fabricate-test-admin';
const WORLD_ID = 'fabricate-smoke-ci';

const profile = resolveSmokeProfileFlags();
const {
  RAW_SMOKE_PROFILE,
  SMOKE_PROFILE,
  RUN_SCREENSHOT_PHASES,
  RUN_FULL_ONLY_BEHAVIORS,
  RUN_FULL_ONLY_GATHERING_STATES,
  SCREENSHOT_TARGET_LABELS,
  SCREENSHOT_SCOPING_ACTIVE
} = profile;

/** @type {string[]} */
const consoleErrors = [];
/** Console/pageerror entries that matched an allowed waiver pattern and so did
 *  NOT fail the run. Echoed to $GITHUB_STEP_SUMMARY for audit (issue #628). */
/** @type {string[]} */
const waivedConsoleErrors = [];
/** @type {string[]} */
const consoleLog = [];

const ALLOWED_CONSOLE_ERROR_PATTERNS_CSV = readAllowedConsoleErrorPatternsCsv();

const screenshotRunIdentity = {
  runId: randomUUID(),
  headSha: resolveScreenshotHeadSha({
    explicitHeadSha: process.env.FOUNDRY_SCREENSHOT_HEAD_SHA,
    ciHeadSha: process.env.GITHUB_SHA,
  }),
  targetLabels: [...SCREENSHOT_TARGET_LABELS].sort((a, b) => a.localeCompare(b)),
};

async function seedSmokeGatheringLibrary(page, craftingSetup) {
  await page.evaluate(async ({ sysId, componentMap }) => {
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.conditions = { ...(config.conditions || {}), weather: 'rain', timeOfDay: 'dusk' };
    config.systems = config.systems || {};
    const systemConfig = config.systems[sysId] || {};
    const withoutIds = (entries, ids) => (Array.isArray(entries) ? entries : [])
      .filter(entry => !ids.has(String(entry?.id || '')));
    config.systems[sysId] = {
      ...systemConfig,
      // System-level GatheringRules: a non-'never' reveal policy is required for the blind
      // environment card to surface the "(x/y)" discovered teaser.
      rules: {
        ...(systemConfig.rules || {}),
        revealPolicy: 'onAttempt'
      },
      vocabularies: {
        ...(systemConfig.vocabularies || {}),
        regions: { values: ['northreach'] }
      },
      tasks: [
        ...withoutIds(systemConfig.tasks, new Set([
          'smoke-forage-library',
          'smoke-meadow-herbs', 'smoke-sunken-survey', 'smoke-crystal-dew',
          'smoke-slow-bloom', 'smoke-withered-search', 'smoke-moonpetal'
        ])),
        {
          id: 'smoke-forage-library',
          name: 'Forage Wild Herbs',
          description: 'Forage the wayside for common herbs and roots.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
          enabled: true,
          region: 'northreach',
          biomes: ['forest'],
          weather: ['rain'],
          timeOfDay: ['dusk'],
          itemSelectionMode: 'highestRankedDrop',
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{
            id: 'smoke-drop-herb',
            componentId: componentMap['Mystic Herb'],
            quantity: 2,
            dropRate: 80,
            enabled: true
          }]
        },
        // Player-gathering scenario library tasks.
        {
          id: 'smoke-meadow-herbs', name: 'Gather Meadow Herbs',
          description: 'Pick fresh herbs from the open meadow.',
          img: 'icons/consumables/plants/fern-sprig-stem-leaf-herb-green.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-meadow-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 90, enabled: true }]
        },
        {
          id: 'smoke-sunken-survey', name: 'Survey Sunken Reagents',
          description: 'Wade the flooded ruins for reagents settled in the silt.',
          img: 'icons/environment/wilderness/wall-ruins.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-sunken-drop', componentId: componentMap['Iron Ore'], quantity: 1, dropRate: 70, enabled: true }]
        },
        {
          id: 'smoke-crystal-dew', name: 'Bottle Crystal Dew',
          description: "Cut dew-laden crystal fronds with a herbalist's sickle.",
          img: 'icons/consumables/potions/flask-corked-blue.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          toolIds: ['smoke-herbalist-sickle'],
          dropRows: [{ id: 'smoke-crystal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-slow-bloom', name: 'Tend Slow Bloom',
          description: 'Tend the slow bloom until it ripens.',
          img: 'icons/commodities/flowers/lily-bloom.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          timeRequirement: { minutes: 1, hours: 0, days: 0, months: 0, years: 0 },
          dropRows: [{ id: 'smoke-bloom-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 80, enabled: true }]
        },
        {
          id: 'smoke-withered-search', name: 'Search Withered Patch',
          description: 'Pick over a blighted patch for anything still growing.',
          img: 'icons/consumables/plants/dried-herb-bundle-brown.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-withered-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 0, enabled: true }]
        },
        {
          id: 'smoke-moonpetal', name: 'Secret Moonpetal Harvest',
          description: 'Harvest moonpetals that open only by night.',
          img: 'icons/commodities/flowers/lotus-white.webp',
          enabled: true, region: 'meadowlands', itemSelectionMode: 'highestRankedDrop',
          dropRows: [{ id: 'smoke-moonpetal-drop', componentId: componentMap['Mystic Herb'], quantity: 1, dropRate: 70, enabled: true }]
        }
      ],
      tools: [
        ...withoutIds(systemConfig.tools, new Set(['smoke-herbalist-sickle'])),
        {
          id: 'smoke-herbalist-sickle',
          label: 'Herbalist Sickle',
          enabled: true,
          componentId: componentMap['Herbalist Sickle'],
          requirement: { formula: '@tools.herbalism.value' },
          breakage: { mode: 'limitedUses', maxUses: 5 },
          onBreak: { mode: 'flagBroken' }
        }
      ],
      events: [
        ...withoutIds(systemConfig.events, new Set(['smoke-bramble-event'])),
        {
          id: 'smoke-bramble-event',
          name: 'Bramble Snare',
          description: 'Thorned brambles snare the careless gatherer.',
          img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
          enabled: true,
          dangerTags: ['hazardous'],
          region: 'northreach',
          biomes: ['forest'],
          weather: ['rain'],
          timeOfDay: ['dusk'],
          dropRate: 35
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    // Tools are system-owned (the `craftingSystems` setting).
    await game.fabricate.getCraftingSystemManager()?.updateSystem?.(sysId, {
      tools: Array.isArray(config.systems?.[sysId]?.tools) ? config.systems[sysId].tools : []
    });

    // Seed two environment-store fixtures so the player Gathering tab frame exercises both the
    // locked teaser path and the blind chip + "(x/y)" discovered suffix.
    const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
    if (environmentStore) {
      const existingIds = new Set((environmentStore.list?.() || []).map(env => String(env?.id || '')));
      if (!existingIds.has('smoke-blind-grove')) {
        await environmentStore.create({
          id: 'smoke-blind-grove',
          craftingSystemId: sysId,
          name: 'Shrouded Grove',
          description: 'A fog-veiled grove where the harvest is never certain until tried.',
          img: 'icons/magic/nature/tree-spirit-green.webp',
          enabled: true,
          selectionMode: 'blind',
          region: 'northreach',
          biomes: ['forest'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
      if (!existingIds.has('smoke-locked-hollow')) {
        await environmentStore.create({
          id: 'smoke-locked-hollow',
          craftingSystemId: sysId,
          name: 'Sealed Barrow',
          description: 'A hollow sealed against trespass, not yet open to gatherers.',
          img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
          enabled: false,
          selectionMode: 'targeted',
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          enabledTaskIds: ['smoke-forage-library']
        });
      }
    }
  }, { sysId: craftingSetup.systemId, componentMap: craftingSetup.componentMap });
}

/** Seed the craft-execution coverage fixtures for issue #489. */
async function seedSmokeCraftExecutionFixtures(page, craftingSetup, crafterId) {
  return await page.evaluate(async ({ arcaneSystemId, mysticHerbComponentId, crafterId }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Execution fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // ── 1. World items ──────────────────────────────────────────────────────
    const worldSpecs = [
      // simple system
      { name: 'Smoke Plank', img: 'icons/commodities/wood/lumber-stack.webp' },
      { name: 'Smoke Crate', img: 'icons/containers/boxes/box-gift-white.webp' },
      { name: 'Smoke Mallet', img: 'icons/tools/hand/hammer-cobbler-steel.webp' },
      { name: 'Smoke Toy', img: 'icons/commodities/wood/blocks-cut-brown.webp' },
      { name: 'Smoke Chisel', img: 'icons/tools/hand/chisel-steel-brown.webp' },
      { name: 'Smoke Dowel', img: 'icons/commodities/wood/lumber-plank-brown.webp' },
      { name: 'Smoke Anvil', img: 'icons/tools/smithing/anvil.webp' },
      { name: 'Smoke Bracket', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Relic', img: 'icons/commodities/treasure/crown-gold-laurel-wreath.webp' },
      { name: 'Smoke Shard', img: 'icons/commodities/gems/gem-fragments-red.webp' },
      // Issue 777: the required-tools salvage subject (see the salvage config below).
      { name: 'Smoke Toolchest', img: 'icons/containers/chest/chest-wooden-tied-white.webp' },
      // simple system — multi-option ingredient recipe (issue #552): two
      // interchangeable coil components the crafter holds + the woven result.
      { name: 'Smoke Copper Coil', img: 'icons/commodities/metal/fragments-steel-barbed.webp' },
      { name: 'Smoke Bronze Coil', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Filigree', img: 'icons/commodities/metal/ingot-gold.webp' },
      // Simple system — the requirement-rail / shared essence pool fixtures (issue 917).
      { name: 'Smoke Duskcrystal', img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp' },
      { name: 'Smoke Tidebloom', img: 'icons/commodities/flowers/lotus-white.webp' },
      { name: 'Smoke Starmote', img: 'icons/commodities/materials/bowl-powder-teal.webp' },
      // The fixed (non-selectable) requirement every new rail recipe opens with, so each rail frame
      // shows a met fixed tile beside the states actually under test.
      { name: 'Smoke Runeplate', img: 'icons/commodities/metal/ingot-stack-steel.webp' },
      // routedByIngredients system
      { name: 'Smoke Ingot A', img: 'icons/commodities/metal/ingot-engraved-silver.webp' },
      { name: 'Smoke Ingot B', img: 'icons/commodities/metal/ingot-gold.webp' },
      { name: 'Smoke Ring', img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp' },
      { name: 'Smoke Amulet', img: 'icons/equipment/neck/amulet-round-engraved-gold.webp' },
      // routedByCheck system
      { name: 'Smoke Bar', img: 'icons/commodities/metal/ingot-plain-steel.webp' },
      { name: 'Smoke Masterwork Blade', img: 'icons/weapons/swords/sword-guard-blue.webp' },
      { name: 'Smoke Standard Blade', img: 'icons/weapons/swords/greatsword-blue.webp' },
      // Progressive system — three result stages with distinct difficulties (issue 651).
      { name: 'Smoke Clay', img: 'icons/commodities/stone/clay-grey.webp' },
      // Issue 675: the progressive-salvage subject.
      { name: 'Smoke Cracked Amphora', img: 'icons/containers/kitchenware/vase-clay-painted-blue-gold.webp' },
      { name: 'Smoke Brick', img: 'icons/commodities/stone/masonry-bricks-brown.webp' },
      { name: 'Smoke Kiln-Fired Ceramic Roofing Tile', img: 'icons/commodities/stone/paver-tile-blue.webp' },
      { name: 'Smoke Glazed Amphora', img: 'icons/containers/kitchenware/jug-clay-brown.webp' },
      // Issue 766: one physical world item registered as a salvageable component in two crafting
      // systems (the simple forge and the progressive forge).
      { name: 'Smoke Air Shard', img: 'icons/commodities/gems/pearl-turquoise.webp' }
    ];
    const createdItems = await Item.createDocuments(
      worldSpecs.map((s) => ({ name: s.name, type: itemType, img: s.img }))
    );
    const world = {};
    for (const item of createdItems) world[item.name] = item;
    const executionItemIds = createdItems.map((i) => i.id);

    // Register a set of world items as managed components on a system, giving
    // each the supplied difficulty (progressive result awarding needs difficulty
    // >= 1; it is inert for the other modes).
    const registerComponents = async (systemId, names, difficulty = 1) => {
      const map = {};
      for (const name of names) {
        const result = await csm.addItemFromUuid(systemId, world[name].uuid);
        map[name] = result.item.id;
        await csm.updateItem(systemId, map[name], { difficulty });
      }
      return map;
    };

    // Inventory copies matched to the managed component by `flags.core.sourceId`.
    const invCopies = (name, qty, extraFabricateFlags = null) =>
      Array.from({ length: qty }, () => ({
        name: world[name].name,
        type: world[name].type,
        img: world[name].img,
        flags: {
          core: { sourceId: world[name].uuid },
          ...(extraFabricateFlags ? { fabricate: extraFabricateFlags } : {})
        }
      }));

    // ── 2. SIMPLE system (+ breakage / limitedUses / negative-gating / salvage) ─
    const simpleSystem = await csm.createSystem({
      name: 'Smoke Simple Forge',
      description: 'Issue #489: simple-mode crafts, tool breakage, and salvage execution coverage.'
    });
    const simpleSystemId = simpleSystem.id;
    const simpleMap = await registerComponents(simpleSystemId, [
      'Smoke Plank', 'Smoke Crate', 'Smoke Mallet', 'Smoke Toy',
      'Smoke Chisel', 'Smoke Dowel', 'Smoke Anvil', 'Smoke Bracket',
      'Smoke Relic', 'Smoke Shard',
      // Issue 777: the required-tools salvage subject — salvaging it needs the Mallet
      // (which the crafter holds) and the Anvil (which it does not), so the player-salvage-
      // tools frame shows one available and one unavailable required-tool row.
      'Smoke Toolchest',
      // Multi-option ingredient recipe (issue #552) components.
      'Smoke Copper Coil', 'Smoke Bronze Coil', 'Smoke Filigree',
      // Issue 917: the shared essence pool's carriers + the fixed rail requirement.
      'Smoke Duskcrystal', 'Smoke Tidebloom', 'Smoke Starmote', 'Smoke Runeplate',
      // Issue 766: also registered in the progressive forge below — one physical stack,
      // two systems, one collapsed card.
      'Smoke Air Shard'
    ]);
    // Issue 766: Smoke Air Shard salvage in the simple forge (simple mode, yields Smoke Shard).
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-simple-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-simple-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
          }
        ]
      }
    });
    const malletToolId = 'smoke-mallet-tool';
    const chiselToolId = 'smoke-chisel-tool';
    const anvilToolId = 'smoke-anvil-tool';
    const chiselMaxUses = 2;
    await csm.updateSystem(simpleSystemId, {
      resolutionMode: 'simple',
      salvageResolutionMode: 'simple',
      // Issue 765: unlock explicit multi-step authoring so the simple system can host
      // a stepped recipe (the player-crafting-multistep screenshot subject).
      features: { multiStepRecipes: true, essences: true },
      // Issue 917: authored tag vocabulary for 'Smoke Sigil Etching' (acceptance criterion 5).
      itemTags: ['smoke-voidbound'],
      // Three authored essences (issue 917).
      essenceDefinitions: [
        {
          id: 'smoke-star-essence',
          name: 'Smoke Star Essence',
          description: 'Distinctive authored essence icon fixture for player Crafting evidence.',
          icon: 'fas fa-star-of-life',
          colorToken: 'butter'
        },
        {
          id: 'smoke-tide-essence',
          name: 'Smoke Tide Essence',
          description: 'Second authored essence: the shared-pool frame needs two tints to read.',
          icon: 'fas fa-water',
          colorToken: 'lavender'
        },
        {
          // Deliberately carried by nothing in the world.
          id: 'smoke-ember-essence',
          name: 'Smoke Ember Essence',
          description: 'Authored essence with no carrier in the world — the short-tile fixture.',
          icon: 'fas fa-fire',
          colorToken: 'rose'
        }
      ],
      tools: [
        {
          // Always breaks (rng()*100 ∈ [0,100) < 100) → deterministic breakageChance break.
          id: malletToolId,
          label: 'Smoke Mallet',
          enabled: true,
          componentId: simpleMap['Smoke Mallet'],
          breakage: { mode: 'breakageChance', breakageChance: 100 },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // LimitedUses: applyUsage increments first, then evaluateBreakage compares post-increment
          // `timesUsed >= maxUses`.
          id: chiselToolId,
          label: 'Smoke Chisel',
          enabled: true,
          componentId: simpleMap['Smoke Chisel'],
          breakage: { mode: 'limitedUses', maxUses: chiselMaxUses },
          onBreak: { mode: 'flagBroken' }
        },
        {
          // Required by the negative-gating recipe; the crafter never holds it.
          id: anvilToolId,
          label: 'Smoke Anvil',
          enabled: true,
          componentId: simpleMap['Smoke Anvil'],
          breakage: { mode: 'immune' },
          onBreak: { mode: 'flagBroken' }
        }
      ]
    });
    // Issue 917: per-unit essence yields on the pool's carriers.
    const simpleCarrierEssences = {
      'Smoke Duskcrystal': { 'smoke-star-essence': 2, 'smoke-tide-essence': 2 },
      'Smoke Tidebloom': { 'smoke-star-essence': 1, 'smoke-tide-essence': 1 },
      // The single-essence contrast row: one tinted contribution chip beside the duals' two.
      'Smoke Starmote': { 'smoke-star-essence': 1 }
    };
    for (const [name, essences] of Object.entries(simpleCarrierEssences)) {
      await csm.updateItem(simpleSystemId, simpleMap[name], { essences });
    }

    // Salvage config on Smoke Relic: simple mode (deterministic success, no
    // timeRequirement, no tools) → exactly one result group per validateSalvage.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Relic'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [{
          id: 'smoke-relic-parts',
          name: 'Salvaged Parts',
          results: [{ id: 'smoke-shard-result', componentId: simpleMap['Smoke Shard'], quantity: 2 }]
        }]
      }
    });
    // Issue 777: required-tools salvage subject.
    await csm.updateItem(simpleSystemId, simpleMap['Smoke Toolchest'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        toolIds: [malletToolId, anvilToolId],
        resultGroups: [{
          id: 'smoke-toolchest-parts',
          name: 'Reclaimed Parts',
          results: [{ id: 'smoke-toolchest-shard', componentId: simpleMap['Smoke Shard'], quantity: 1 }]
        }]
      }
    });

    const simpleRecipe = await rm.createRecipe({
      name: 'Smoke Assemble Crate',
      description: 'Simple-mode craft: one ingredient set, one result group.',
      craftingSystemId: simpleSystemId,
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Crate',
        results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }]
      }]
    });
    const breakageRecipe = await rm.createRecipe({
      name: 'Smoke Carve Toy',
      description: 'Simple-mode craft whose breakageChance tool always breaks.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/blocks-cut-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Toy', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });
    await rm.updateRecipe(breakageRecipe.id, { toolIds: [malletToolId] });
    const limitedUsesRecipe = await rm.createRecipe({
      name: 'Smoke Turn Dowel',
      description: 'Simple-mode craft whose limitedUses tool breaks at its maxUses threshold.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/wood/lumber-plank-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
    });
    await rm.updateRecipe(limitedUsesRecipe.id, { toolIds: [chiselToolId] });
    const negativeToolRecipe = await rm.createRecipe({
      name: 'Smoke Bend Bracket',
      description: 'Simple-mode craft requiring a tool the crafter does not hold (negative gating).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/fragments-steel-barbed.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }]
      }],
      resultGroups: [{ name: 'Bracket', results: [{ componentId: simpleMap['Smoke Bracket'], quantity: 1 }] }]
    });
    await rm.updateRecipe(negativeToolRecipe.id, { toolIds: [anvilToolId] });

    // Multi-option ingredient recipe (issue #552): a component OR authored essence choice.
    const multiOptionRecipe = await rm.createRecipe({
      name: 'Smoke Weave Filigree',
      description: 'Simple-mode craft with one component-or-essence ingredient choice (issue #552).',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/metal/ingot-gold.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-coil-choice',
          name: 'Coil',
          options: [
            { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Copper Coil'] } },
            { quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }
          ]
        }]
      }],
      resultGroups: [{
        name: 'Filigree',
        results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }]
      }]
    });

    await rm.createRecipe({
      name: 'Smoke Legacy Essence Seal',
      description: 'Legacy set-level essence requirement with an authored icon.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Plank',
          options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
        }],
        essences: { 'smoke-star-essence': 2 }
      }],
      resultGroups: [{ name: 'Seal', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    await rm.createRecipe({
      name: 'Smoke First-Class Essence Draught',
      description: 'First-class essence ingredient and shopping-list shortage fixture.',
      craftingSystemId: simpleSystemId,
      img: 'icons/commodities/treasure/token-gold-gem-purple.webp',
      ingredientSets: [{
        ingredientGroups: [{
          id: 'smoke-star-essence-group',
          name: 'Star Essence',
          // 6, not the pre-917 3: the world now holds 4 Star (2 + 1 + 1 across the three carriers),
          // and a need of 3 would clear the shopping-list shortage this recipe is also the fixture
          // for — `player-crafting-essence-shopping` waits on an acquire row that would then never
          // render.
          options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 6 } }]
        }]
      }],
      resultGroups: [{ name: 'Draught', results: [{ componentId: simpleMap['Smoke Toy'], quantity: 1 }] }]
    });

    // Three recipes, each authored for one rendered state the redesign has to prove and that no
    // existing fixture can reach.

    // (1) The rail's three states in one frame.
    await rm.createRecipe({
      name: 'Smoke Runestaff Binding',
      description: 'Requirement rail: a met fixed slot, an unchosen choice slot, and a short essence slot.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
      ingredientSets: [{
        id: 'smoke-rail-set',
        ingredientGroups: [
          {
            id: 'smoke-rail-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            // Two alternatives the crafter holds neither of.
            id: 'smoke-rail-binding',
            name: 'Binding',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          },
          {
            id: 'smoke-rail-ember',
            name: 'Ember Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-ember-essence', amount: 4 } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Runestaff', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (2) The shared pool.
    await rm.createRecipe({
      name: 'Smoke Tidecore Tempering',
      description: 'Shared essence pool: two requirements in one set funded jointly from dual carriers.',
      craftingSystemId: simpleSystemId,
      img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
      ingredientSets: [{
        id: 'smoke-shared-pool-set',
        ingredientGroups: [
          {
            id: 'smoke-shared-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-shared-star',
            name: 'Star Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-star-essence', amount: 2 } }]
          },
          {
            id: 'smoke-shared-tide',
            name: 'Tide Essence',
            options: [{ quantity: 1, match: { type: 'essence', essenceId: 'smoke-tide-essence', amount: 3 } }]
          },
          {
            id: 'smoke-shared-fitting',
            name: 'Fitting',
            options: [
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Anvil'] } },
              { quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Bracket'] } }
            ]
          }
        ]
      }],
      resultGroups: [{ name: 'Tidecore', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // (3) The item-bag defect (acceptance criterion 5). The tag names nothing any seeded component
    // carries, so the tile has no inventory item to borrow an image from and must render its glyph.
    await rm.createRecipe({
      name: 'Smoke Sigil Etching',
      description: 'Tag requirement with nothing matching in inventory: the tile must render a glyph, not the item bag.',
      craftingSystemId: simpleSystemId,
      img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp',
      ingredientSets: [{
        id: 'smoke-tag-unmatched-set',
        ingredientGroups: [
          {
            id: 'smoke-tag-plate',
            name: 'Runeplate',
            options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Runeplate'] } }]
          },
          {
            id: 'smoke-tag-voidbound',
            name: 'Voidbound Reagent',
            options: [{ quantity: 1, match: { type: 'tags', tags: ['smoke-voidbound'], tagMatch: 'any' } }]
          }
        ]
      }],
      resultGroups: [{ name: 'Sigil', results: [{ componentId: simpleMap['Smoke Filigree'], quantity: 1 }] }]
    });

    // Explicit multi-step simple recipe (issue 765): the reported defect.
    const multiStepRecipe = await rm.createRecipe({
      name: 'Smoke Raise Tent',
      description:
        'Simple-mode multi-step craft (issue #765): step 1 cuts planks, step 2 raises the frame.',
      craftingSystemId: simpleSystemId,
      // A Foundry core raster already exercised by this fixture (the crate world item)
      // so the recipe thumbnail never 404s in the capture.
      img: 'icons/containers/boxes/box-gift-white.webp',
      ingredientSets: [],
      resultGroups: [],
      steps: [
        {
          name: 'Cut Planks',
          timeRequirement: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Plank',
              options: [{ quantity: 2, match: { type: 'component', componentId: simpleMap['Smoke Plank'] } }]
            }]
          }],
          resultGroups: [{ name: 'Dowel', results: [{ componentId: simpleMap['Smoke Dowel'], quantity: 1 }] }]
        },
        {
          name: 'Raise Frame',
          timeRequirement: { minutes: 0, hours: 1, days: 0, months: 0, years: 0 },
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Dowel',
              options: [{ quantity: 1, match: { type: 'component', componentId: simpleMap['Smoke Dowel'] } }]
            }]
          }],
          resultGroups: [{ name: 'Crate', results: [{ componentId: simpleMap['Smoke Crate'], quantity: 1 }] }]
        }
      ]
    });

    // ── 3. ROUTED-BY-INGREDIENTS system (multi-set → differing groups) ──────
    const ingredientRouterSystem = await csm.createSystem({
      name: 'Smoke Ingredient Router',
      description: 'Issue #489: routedByIngredients multi-set routing coverage.'
    });
    const ingredientRouterSystemId = ingredientRouterSystem.id;
    const routerMap = await registerComponents(ingredientRouterSystemId, [
      'Smoke Ingot A', 'Smoke Ingot B', 'Smoke Ring', 'Smoke Amulet'
    ]);
    await csm.updateSystem(ingredientRouterSystemId, { resolutionMode: 'routedByIngredients' });
    const setAId = 'smoke-set-a';
    const setBId = 'smoke-set-b';
    const ringGroupId = 'smoke-group-ring';
    const amuletGroupId = 'smoke-group-amulet';
    const ingredientRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Cast Jewelry',
      description: 'routedByIngredients: each ingredient set maps to a different result group.',
      craftingSystemId: ingredientRouterSystemId,
      img: 'icons/equipment/finger/ring-band-engraved-lines-gold.webp',
      complex: true,
      ingredientSets: [
        {
          id: setAId,
          name: 'Silver route',
          resultGroupId: ringGroupId,
          ingredientGroups: [{
            name: 'Ingot A',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot A'] } }]
          }]
        },
        {
          id: setBId,
          name: 'Gold route',
          resultGroupId: amuletGroupId,
          ingredientGroups: [{
            name: 'Ingot B',
            options: [{ quantity: 1, match: { type: 'component', componentId: routerMap['Smoke Ingot B'] } }]
          }]
        }
      ],
      resultGroups: [
        { id: ringGroupId, name: 'Ring', results: [{ componentId: routerMap['Smoke Ring'], quantity: 1 }] },
        { id: amuletGroupId, name: 'Amulet', results: [{ componentId: routerMap['Smoke Amulet'], quantity: 1 }] }
      ]
    });

    // ── 4. ROUTED-BY-CHECK system (multi-group → different tiers) ───────────
    const checkRouterSystem = await csm.createSystem({
      name: 'Smoke Check Router',
      description: 'Issue #489: routedByCheck multi-group tier routing coverage.'
    });
    const checkRouterSystemId = checkRouterSystem.id;
    const checkMap = await registerComponents(checkRouterSystemId, [
      'Smoke Bar', 'Smoke Masterwork Blade', 'Smoke Standard Blade'
    ]);
    await csm.updateSystem(checkRouterSystemId, {
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        enabled: true,
        routed: {
          type: 'relative',
          // 1d20 + 20 (21-40) vs dc 12 always meets Masterwork (dc 5) → deterministic tier.
          rollFormula: '1d20 + 20',
          dc: 12,
          thresholdMode: 'meet',
          relativeOutcomes: [
            { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
            { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
            { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
          ]
        }
      }
    });
    const masterGroupId = 'smoke-group-master';
    const standardGroupId = 'smoke-group-standard';
    const checkRoutedRecipe = await rm.createRecipe({
      name: 'Smoke Forge Blade',
      description: 'routedByCheck: two result groups mapped to different outcome tiers.',
      craftingSystemId: checkRouterSystemId,
      img: 'icons/weapons/swords/sword-guard-blue.webp',
      complex: true,
      ingredientSets: [{
        name: 'Stock',
        ingredientGroups: [{
          name: 'Bar',
          options: [{ quantity: 1, match: { type: 'component', componentId: checkMap['Smoke Bar'] } }]
        }]
      }],
      resultGroups: [
        {
          id: masterGroupId,
          name: 'Masterwork Blade',
          checkOutcomeIds: ['craft-masterwork'],
          results: [{ componentId: checkMap['Smoke Masterwork Blade'], quantity: 1 }]
        },
        {
          id: standardGroupId,
          name: 'Standard Blade',
          checkOutcomeIds: ['craft-standard'],
          results: [{ componentId: checkMap['Smoke Standard Blade'], quantity: 1 }]
        }
      ]
    });

    // ── 5. PROGRESSIVE system (single deterministic advance) ────────────────
    const progressiveSystem = await csm.createSystem({
      name: 'Smoke Progressive Forge',
      description: 'Issue #489: progressive budget-vs-difficulty completion coverage.'
    });
    const progressiveSystemId = progressiveSystem.id;
    const progressiveMap = await registerComponents(
      progressiveSystemId,
      [
        'Smoke Clay',
        'Smoke Brick',
        'Smoke Kiln-Fired Ceramic Roofing Tile',
        'Smoke Glazed Amphora',
        // Issue 675: the ONLY progressive-salvage fixture in the repo.
        'Smoke Cracked Amphora',
        // Issue 766: the SAME world item already registered in the simple forge — so one
        // owned copy resolves to a component in both systems and collapses to one card.
        'Smoke Air Shard'
      ],
      1
    );
    // `registerComponents` applies one difficulty to every name, so re-stamp the three result
    // stages individually.
    const progressiveStageDifficulty = {
      'Smoke Brick': 1,
      'Smoke Kiln-Fired Ceramic Roofing Tile': 4,
      'Smoke Glazed Amphora': 9
    };
    for (const [name, difficulty] of Object.entries(progressiveStageDifficulty)) {
      await csm.updateItem(progressiveSystemId, progressiveMap[name], { difficulty });
    }
    const progressiveStageResults = [
      { id: 'smoke-brick-result', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
      { id: 'smoke-tile-result', componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'], quantity: 1 },
      { id: 'smoke-amphora-result', componentId: progressiveMap['Smoke Glazed Amphora'], quantity: 1 }
    ];
    await csm.updateSystem(progressiveSystemId, {
      resolutionMode: 'progressive',
      features: { craftingChecks: true },
      craftingCheck: {
        enabled: true,
        // 1d20 + 20 budget (21-40) far exceeds the Smoke Brick difficulty (1) so a
        // single advance awards it (progressive is budget-vs-difficulty, not tiered).
        progressive: { rollFormula: '1d20 + 20', awardMode: 'equal' }
      },
      // Issue 675 — salvage's own mode and check block, authored independently of the recipe's
      // above.
      salvageResolutionMode: 'progressive',
      salvageCraftingCheck: {
        enabled: true,
        progressive: { rollFormula: '1d20 + 6', awardMode: 'partial' }
      }
    });
    // Progressive salvage on Smoke Cracked Amphora: one roll spent down the SAME three
    // stages (difficulties 1 / 4 / 9), authored in ascending order so a player reorder
    // visibly changes the "Reached at >=N" badges.
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Cracked Amphora'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        // Left at its default TRUE so the player CAN reorder: this fixture exists to
        // capture the reorder affordances, which `false` would (correctly) remove.
        allowPlayerResultReorder: true,
        resultGroups: [
          {
            id: 'smoke-amphora-salvage',
            name: 'Amphora Fragments',
            results: [
              { id: 'smoke-salvage-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 },
              {
                id: 'smoke-salvage-tile',
                componentId: progressiveMap['Smoke Kiln-Fired Ceramic Roofing Tile'],
                quantity: 1
              },
              {
                id: 'smoke-salvage-amphora',
                componentId: progressiveMap['Smoke Glazed Amphora'],
                quantity: 1
              }
            ]
          }
        ]
      }
    });
    // Issue 766: Smoke Air Shard salvage in the progressive forge (simple mode here for a
    // deterministic capture, yielding Smoke Brick).
    await csm.updateItem(progressiveSystemId, progressiveMap['Smoke Air Shard'], {
      salvage: {
        enabled: true,
        ingredientQuantity: 1,
        resultGroups: [
          {
            id: 'smoke-air-prog-salvage',
            name: 'Air Fragments',
            results: [{ id: 'smoke-air-prog-brick', componentId: progressiveMap['Smoke Brick'], quantity: 1 }]
          }
        ]
      }
    });
    const progressiveRecipe = await rm.createRecipe({
      name: 'Smoke Mold Brick',
      description: 'progressive: one low-difficulty result awarded in a single advance.',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/masonry-bricks-brown.webp',
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brick',
        results: progressiveStageResults
      }]
    });

    // Flag-OFF sibling (issue 651): the same three stages with the GM's reorder permission
    // withheld, so the player stage list renders its fixed state (no grips, no move buttons,
    // ordinals + difficulty retained, "Order set by the GM" line).
    await rm.createRecipe({
      name: 'Smoke Kiln Firing',
      description: 'progressive: stage order fixed by the GM (allowPlayerResultReorder: false).',
      craftingSystemId: progressiveSystemId,
      img: 'icons/commodities/stone/paver-tile-blue.webp',
      allowPlayerResultReorder: false,
      ingredientSets: [{
        ingredientGroups: [{
          name: 'Clay',
          options: [{ quantity: 1, match: { type: 'component', componentId: progressiveMap['Smoke Clay'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Fired ware',
        results: progressiveStageResults
      }]
    });

    // ── 6. Crafter inventory top-up ─────────────────────────────────────────
    await crafter.createEmbeddedDocuments('Item', [
      ...invCopies('Smoke Plank', 5),                 // simple(1) + breakage(1) + limitedUses(2) crafts; negative consumes none
      ...invCopies('Smoke Mallet', 1),                // breakageChance tool
      ...invCopies('Smoke Chisel', 1),                // limitedUses tool (broken by crafting maxUses times)
      // Two copies (issue 675), not one.
      ...invCopies('Smoke Relic', 2),                 // salvageable component
      ...invCopies('Smoke Toolchest', 1),             // issue 777: required-tools salvage subject
      ...invCopies('Smoke Copper Coil', 1),           // multi-option recipe alternative A (#552)
      ...invCopies('Smoke Bronze Coil', 1),           // multi-option recipe alternative B (#552)
      // Issue 917 — the shared essence pool's ledger, in deliberate quantities.
      ...invCopies('Smoke Duskcrystal', 1),           // dual carrier (Star 2, Tide 2)
      ...invCopies('Smoke Tidebloom', 1),             // dual carrier (Star 1, Tide 1)
      ...invCopies('Smoke Starmote', 1),              // single-essence contrast carrier (Star 1)
      // TWO, so the fixed rail tile reads "owned 2, spends 1" in the consumption plan
      // rather than a degenerate 1-of-1.
      ...invCopies('Smoke Runeplate', 2),             // the fixed requirement of every rail fixture
      ...invCopies('Smoke Ingot A', 1),               // routedByIngredients set A
      ...invCopies('Smoke Ingot B', 1),               // routedByIngredients set B (asserted NOT produced)
      ...invCopies('Smoke Bar', 1),                   // routedByCheck stock
      ...invCopies('Smoke Clay', 1),                  // progressive stock
      ...invCopies('Smoke Cracked Amphora', 1),       // progressive-salvage subject (#675)
      // Issue 766: ONE physical copy registered in BOTH forges. It must collapse to a
      // SINGLE card (quantity ×1, counted once — never ×2) with a system selector.
      ...invCopies('Smoke Air Shard', 1)              // multi-system collapse subject (#766)
    ]);

    // A dropRate:100 d100 task under a scene-less manual environment so the rc/ci
    // gather-inventory-delta assertion via startGatheringAttempt is deterministic (no scene gate,
    // no tool gate, no roll prompt).
    const rcGatherTaskId = 'smoke-rc-forage';
    const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
    config.systems = config.systems || {};
    const arcaneConfig = config.systems[arcaneSystemId] || {};
    const existingTasks = Array.isArray(arcaneConfig.tasks) ? arcaneConfig.tasks : [];
    config.systems[arcaneSystemId] = {
      ...arcaneConfig,
      tasks: [
        ...existingTasks.filter((task) => task?.id !== rcGatherTaskId),
        {
          id: rcGatherTaskId,
          name: 'Smoke RC Forage',
          description: 'Guaranteed-drop forage for the rc/ci gather-delta assertion.',
          img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
          enabled: true,
          // No weather/timeOfDay constraints (like the meadowlands library tasks):
          // the direct start path does not apply CONDITIONS_BLOCKED, and leaving them
          // off keeps this "guaranteed-success" task honestly unconditional.
          region: 'northreach',
          biomes: ['forest'],
          itemSelectionMode: 'highestRankedDrop',
          dropRows: [{
            id: 'smoke-rc-drop',
            componentId: mysticHerbComponentId,
            quantity: 1,
            dropRate: 100,
            enabled: true
          }]
        }
      ]
    };
    await game.settings.set('fabricate', 'gatheringConfig', config);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    // rc/ci gather env: manual composition picks ONLY the guaranteed task (issue 1315: manual
    // composes exactly `enabledTaskIds`, so the id lives there rather than on a force list, which
    // manual mode ignores) and no events, so the always-run inventory-delta assertion cannot be
    // perturbed by a hazardous event flipping the outcome.
    const rcGatherEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke RC Meadow',
      description: 'Scene-less guaranteed-success environment for the rc/ci gather-delta assertion.',
      img: 'icons/consumables/plants/grass-leaves-green.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      compositionMode: 'manual',
      region: 'northreach',
      biomes: ['forest'],
      enabledTaskIds: [rcGatherTaskId]
    });
    // Full-profile hazard env: automatic composition + matching region/biome, so it composes both
    // the guaranteed task and the seeded hazardous smoke-bramble-event.
    const hazardEnvironment = await environmentStore.create({
      craftingSystemId: arcaneSystemId,
      name: 'Smoke Hazard Grove',
      description: 'Scene-less environment that composes the hazardous Bramble Snare event for #489.',
      img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: '',
      region: 'northreach',
      biomes: ['forest'],
      dangerTags: ['hazardous'],
      eventPolicy: 'successWithEvent',
      eventSelectionMode: 'highestRankedDrop'
    });

    return {
      executionItemIds,
      executionSystemIds: [
        simpleSystemId, ingredientRouterSystemId, checkRouterSystemId, progressiveSystemId
      ],
      executionRecipeIds: [
        simpleRecipe.id, breakageRecipe.id, limitedUsesRecipe.id, negativeToolRecipe.id,
        multiOptionRecipe.id,
        ingredientRoutedRecipe.id, checkRoutedRecipe.id, progressiveRecipe.id
      ],
      simple: {
        systemId: simpleSystemId,
        simpleRecipeId: simpleRecipe.id,
        breakageRecipeId: breakageRecipe.id,
        limitedUsesRecipeId: limitedUsesRecipe.id,
        negativeToolRecipeId: negativeToolRecipe.id,
        malletComponentId: simpleMap['Smoke Mallet'],
        chiselComponentId: simpleMap['Smoke Chisel'],
        relicComponentId: simpleMap['Smoke Relic']
      },
      ingredientRouted: {
        recipeId: ingredientRoutedRecipe.id,
        // Deliberately the SECOND set → the Amulet group (resultGroups[1], NOT the
        // first group), so the assertion proves the router selects a non-index-0
        // group by set assignment rather than always emitting resultGroups[0].
        chosenSetId: setBId
      },
      checkRouted: { recipeId: checkRoutedRecipe.id },
      progressive: { recipeId: progressiveRecipe.id, systemId: progressiveSystemId, recipeName: 'Smoke Mold Brick' },
      gather: { environmentId: rcGatherEnvironment.id, taskId: rcGatherTaskId },
      hazard: { environmentId: hazardEnvironment.id, taskId: rcGatherTaskId }
    };
  }, {
    arcaneSystemId: craftingSetup.systemId,
    mysticHerbComponentId: craftingSetup.componentMap['Mystic Herb'],
    crafterId
  });
}

/** Seed the player-facing Alchemy workbench coverage fixtures (issue #543). */
async function seedSmokeAlchemyFixtures(page, craftingSetup, crafterId) {
  return await page.evaluate(async ({ crafterId }) => {
    const csm = game.fabricate.getCraftingSystemManager();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);
    if (!crafter) throw new Error(`Alchemy fixtures: crafter ${crafterId} not found`);

    const rawItemTypes = game.documentTypes?.Item ?? game.system?.documentTypes?.Item ?? [];
    const itemTypes = Array.from(rawItemTypes);
    const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

    // Existing world items the crafter already owns: reuse them as managed
    // components so the workbench inventory column shows owned, placeable rows.
    const worldByName = Object.fromEntries(game.items.contents.map((item) => [item.name, item]));
    const requireWorldItem = (name) => {
      const item = worldByName[name];
      if (!item) throw new Error(`Alchemy fixtures: world item "${name}" not found`);
      return item;
    };

    // Product / second-system world items. Alchemy result groups reference managed components, so
    // the products (and the second system's ingredient) must be registered components too.
    const productSpecs = [
      { name: 'Elixir of Vigor', img: 'icons/consumables/potions/potion-tube-corked-red.webp' },
      { name: 'Verdant Tonic', img: 'icons/consumables/potions/flask-corked-blue.webp' },
      { name: 'Powdered Root', img: 'icons/consumables/plants/dried-herb-bundle-brown.webp' },
      { name: 'Soothing Balm', img: 'icons/consumables/potions/bottle-round-corked-red.webp' },
      // Issue #752: the minimal alchemy-mode system's one signature — a reagent and the brew it
      // renders into.
      { name: 'Smoke Bench Reagent', img: 'icons/consumables/plants/grass-leaves-green.webp' },
      { name: 'Smoke Bench Brew', img: 'icons/consumables/potions/bottle-conical-corked-blue.webp' }
    ];
    const createdProducts = await Item.createDocuments(
      productSpecs.map((spec) => ({ name: spec.name, type: itemType, img: spec.img }))
    );
    const productByName = Object.fromEntries(createdProducts.map((item) => [item.name, item]));
    const alchemyProductItemIds = createdProducts.map((item) => item.id);

    const registerComponent = async (systemId, worldItem) => {
      const result = await csm.addItemFromUuid(systemId, worldItem.uuid);
      if (!result?.item?.id) {
        throw new Error(`Alchemy fixtures: failed to register component "${worldItem.name}"`);
      }
      return result.item.id;
    };

    // ── System 1: Bubbling Cauldron (alchemy, reuses owned components) ───────
    const cauldron = await csm.createSystem({
      name: 'Bubbling Cauldron',
      description: 'Issue #543: player alchemy workbench — combine herbs to discover brews.'
    });
    if (!cauldron?.id) throw new Error('Alchemy fixtures: Bubbling Cauldron create failed');
    const cauldronId = cauldron.id;
    await csm.updateSystem(cauldronId, {
      resolutionMode: 'alchemy',
      enabled: true,
      // Simple check mode (#554): a mandatory pass/fail check + a reserved failure
      // result set. Exercises the check-gated workbench + the failure-group authoring.
      alchemy: {
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false,
        checkMode: 'simple'
      },
      craftingCheck: { simple: { rollFormula: '1d20', dc: 10 } }
    });
    const cauldronMap = {
      'Mystic Herb': await registerComponent(cauldronId, requireWorldItem('Mystic Herb')),
      'Empty Vial': await registerComponent(cauldronId, requireWorldItem('Empty Vial')),
      'Dragon Scale': await registerComponent(cauldronId, requireWorldItem('Dragon Scale')),
      'Elixir of Vigor': await registerComponent(cauldronId, productByName['Elixir of Vigor']),
      'Verdant Tonic': await registerComponent(cauldronId, productByName['Verdant Tonic'])
    };
    const elixirRecipe = await rm.createRecipe({
      name: 'Elixir of Vigor',
      description: 'Alchemy: two mystic herbs reduce to a vigor elixir.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/potion-tube-corked-red.webp',
      ingredientSets: [{
        name: 'Herbal base',
        ingredientGroups: [{
          name: 'Mystic Herb',
          options: [{ quantity: 2, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
        }]
      }],
      resultGroups: [
        {
          name: 'Elixir',
          results: [{ componentId: cauldronMap['Elixir of Vigor'], quantity: 1 }]
        },
        {
          // Reserved failure result set (#554): produced on a failed Simple check.
          role: 'failure',
          name: '',
          results: [{ componentId: cauldronMap['Dragon Scale'], quantity: 1 }]
        }
      ]
    });
    const tonicRecipe = await rm.createRecipe({
      name: 'Verdant Tonic',
      description: 'Alchemy: one mystic herb bottled in an empty vial makes a tonic.',
      craftingSystemId: cauldronId,
      img: 'icons/consumables/potions/flask-corked-blue.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Bottled brew',
        ingredientGroups: [
          {
            name: 'Mystic Herb',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Mystic Herb'] } }]
          },
          {
            name: 'Empty Vial',
            options: [{ quantity: 1, match: { type: 'component', componentId: cauldronMap['Empty Vial'] } }]
          }
        ]
      }],
      resultGroups: [{
        name: 'Tonic',
        results: [{ componentId: cauldronMap['Verdant Tonic'], quantity: 1 }]
      }]
    });

    // ── System 2: Herbalist's Table (second alchemy discipline) ─────────────
    const herbalist = await csm.createSystem({
      name: "Herbalist's Table",
      description: "Issue #543: a second alchemy discipline so the workbench chooser offers a choice."
    });
    if (!herbalist?.id) throw new Error("Alchemy fixtures: Herbalist's Table create failed");
    const herbalistId = herbalist.id;
    await csm.updateSystem(herbalistId, {
      resolutionMode: 'alchemy',
      enabled: true,
      alchemy: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false }
    });
    const herbalistMap = {
      'Powdered Root': await registerComponent(herbalistId, productByName['Powdered Root']),
      'Soothing Balm': await registerComponent(herbalistId, productByName['Soothing Balm'])
    };
    const balmRecipe = await rm.createRecipe({
      name: 'Soothing Balm',
      description: 'Alchemy: powdered root renders into a soothing balm.',
      craftingSystemId: herbalistId,
      img: 'icons/consumables/potions/bottle-round-corked-red.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Root base',
        ingredientGroups: [{
          name: 'Powdered Root',
          options: [{ quantity: 1, match: { type: 'component', componentId: herbalistMap['Powdered Root'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Balm',
        results: [{ componentId: herbalistMap['Soothing Balm'], quantity: 1 }]
      }]
    });

    // The minimal alchemy-mode system whose Crafting → Settings surface the manager
    // alchemy-settings capture photographs (demonstrating #736's #713 half).
    const bench = await csm.createSystem({
      name: 'Smoke Alchemy Bench',
      description: 'Issue #752: minimal alchemy-mode system for the manager alchemy-settings capture.'
    });
    if (!bench?.id) throw new Error('Alchemy fixtures: Smoke Alchemy Bench create failed');
    const benchId = bench.id;
    await csm.updateSystem(benchId, {
      resolutionMode: 'alchemy',
      enabled: true,
      // `checkMode: 'simple'` is load-bearing for the manager alchemy-settings capture, not
      // decoration.
      alchemy: {
        checkMode: 'simple',
        learnOnCraft: true,
        consumeOnFail: true,
        showAttemptHistoryToPlayers: false
      }
    });
    const benchMap = {
      'Smoke Bench Reagent': await registerComponent(benchId, productByName['Smoke Bench Reagent']),
      'Smoke Bench Brew': await registerComponent(benchId, productByName['Smoke Bench Brew'])
    };
    const benchRecipe = await rm.createRecipe({
      name: 'Smoke Bench Brew',
      description: 'Alchemy: one reagent renders into a bench brew.',
      craftingSystemId: benchId,
      img: 'icons/consumables/potions/bottle-conical-corked-blue.webp',
      resultSelection: { provider: 'ingredientSet' },
      ingredientSets: [{
        name: 'Reagent base',
        ingredientGroups: [{
          name: 'Smoke Bench Reagent',
          options: [{ quantity: 1, match: { type: 'component', componentId: benchMap['Smoke Bench Reagent'] } }]
        }]
      }],
      resultGroups: [{
        name: 'Brew',
        results: [{ componentId: benchMap['Smoke Bench Brew'], quantity: 1 }]
      }]
    });

    // Every recipe must have been created enabled (createRecipe throws on an
    // invalid alchemy shape; a disabled recipe would drop its system from the
    // chooser since the listing filters `{ enabled: true }`).
    const alchemyRecipes = [elixirRecipe, tonicRecipe, balmRecipe, benchRecipe];
    for (const recipe of alchemyRecipes) {
      if (!recipe?.id) throw new Error('Alchemy fixtures: recipe create returned no id');
      if (recipe.enabled !== true) {
        throw new Error(
          `Alchemy fixtures: recipe "${recipe.name}" was not created enabled ` +
          `(invalid alchemy shape or signature collision)`
        );
      }
    }

    return {
      alchemySystemIds: [cauldronId, herbalistId, benchId],
      cauldronSystemId: cauldronId,
      herbalistSystemId: herbalistId,
      benchSystemId: benchId,
      alchemyRecipeIds: alchemyRecipes.map((recipe) => recipe.id),
      alchemyProductItemIds,
      alchemyComponentMap: { [cauldronId]: cauldronMap, [herbalistId]: herbalistMap, [benchId]: benchMap }
    };
  }, { crafterId });
}

/** Execute and assert the issue #489 craft-execution coverage scenarios. */
async function runCraftExecutionAsserts(page, fixtures, crafterId) {
  return await page.evaluate(async ({ fixtures, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });

    const engine = game.fabricate.getCraftingEngine();
    const rm = game.fabricate.getRecipeManager();
    const crafter = game.actors.get(crafterId);

    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);
    const toolItem = (name) => crafter.items.contents.find((i) => i.name === name) || null;
    // Mirror src/gatheringToolRuntime.js isToolBroken so the assertion reads the
    // flag through the same defensive accessors the runtime writes/reads it with.
    const isBroken = (item) =>
      item?.getFlag?.('fabricate', 'toolBroken') === true
      || item?.getFlag?.('fabricate', 'fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.toolBroken') === true
      || foundry.utils.getProperty(item, 'flags.fabricate.fabricate.toolBroken') === true;

    // ── simple craft ────────────────────────────────────────────────────────
    try {
      const before = countByName('Smoke Crate');
      const recipe = rm.getRecipe(fixtures.simple.simpleRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Crate');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Crate inventory ${before} -> ${after}, expected +1`);
      record('exec-craft-simple', true);
    } catch (err) {
      record('exec-craft-simple', false, err.message);
    }

    // ── routedByCheck multi-group (Masterwork produced, Standard NOT) ────────
    try {
      const masterBefore = countByName('Smoke Masterwork Blade');
      const standardBefore = countByName('Smoke Standard Blade');
      const recipe = rm.getRecipe(fixtures.checkRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const masterAfter = countByName('Smoke Masterwork Blade');
      const standardAfter = countByName('Smoke Standard Blade');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (masterAfter !== masterBefore + 1) {
        throw new Error(`Masterwork Blade ${masterBefore} -> ${masterAfter}, expected +1 (selected tier group)`);
      }
      if (standardAfter !== standardBefore) {
        throw new Error(`Standard Blade ${standardBefore} -> ${standardAfter}, expected unchanged (unselected tier group)`);
      }
      record('exec-craft-routed-by-check', true);
    } catch (err) {
      record('exec-craft-routed-by-check', false, err.message);
    }

    // The chosen set (set B) maps to the Amulet group, which is resultGroups[1] — NOT the first
    // group — so this fails against an "always emit resultGroups[0]" bug, proving set→group routing
    // selects a non-index-0 group.
    try {
      const ringBefore = countByName('Smoke Ring');
      const amuletBefore = countByName('Smoke Amulet');
      const recipe = rm.getRecipe(fixtures.ingredientRouted.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, {
        componentSourceActors: [crafter],
        ingredientSetId: fixtures.ingredientRouted.chosenSetId
      });
      const ringAfter = countByName('Smoke Ring');
      const amuletAfter = countByName('Smoke Amulet');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (amuletAfter !== amuletBefore + 1) {
        throw new Error(`Smoke Amulet ${amuletBefore} -> ${amuletAfter}, expected +1 (chosen set's non-first group)`);
      }
      if (ringAfter !== ringBefore) {
        throw new Error(`Smoke Ring ${ringBefore} -> ${ringAfter}, expected unchanged (other set's group / resultGroups[0])`);
      }
      record('exec-craft-routed-by-ingredients', true);
    } catch (err) {
      record('exec-craft-routed-by-ingredients', false, err.message);
    }

    // ── progressive (single deterministic advance awards the result) ─────────
    try {
      const before = countByName('Smoke Brick');
      const recipe = rm.getRecipe(fixtures.progressive.recipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const after = countByName('Smoke Brick');
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      if (after !== before + 1) throw new Error(`Smoke Brick ${before} -> ${after}, expected +1`);
      record('exec-craft-progressive', true);
    } catch (err) {
      record('exec-craft-progressive', false, err.message);
    }

    // ── breakageChance tool break (flagBroken + " (broken)" suffix) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.breakageRecipeId);
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!result.success) throw new Error(`craft failed: ${result.message}`);
      const mallet = toolItem('Smoke Mallet (broken)') || toolItem('Smoke Mallet');
      if (!mallet) throw new Error('Smoke Mallet tool item not found after craft');
      if (!isBroken(mallet)) {
        throw new Error('Smoke Mallet toolBroken flag not set after breakageChance craft');
      }
      if (!mallet.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Mallet name "${mallet.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-chance', true);
    } catch (err) {
      record('exec-tool-breakage-chance', false, err.message);
    }

    // MaxUses is 2: craft twice. The first (post-increment timesUsed 1 < 2) must NOT break; the
    // second (timesUsed 2 >= 2) crosses the threshold and breaks.
    try {
      const recipe = rm.getRecipe(fixtures.simple.limitedUsesRecipeId);
      const first = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!first.success) throw new Error(`first craft failed: ${first.message}`);
      const chiselAfterFirst = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chiselAfterFirst) throw new Error('Smoke Chisel tool item not found after first craft');
      if (isBroken(chiselAfterFirst)) {
        throw new Error('Smoke Chisel broke before reaching maxUses (sub-threshold craft)');
      }
      const second = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      if (!second.success) throw new Error(`second craft failed: ${second.message}`);
      const chisel = toolItem('Smoke Chisel (broken)') || toolItem('Smoke Chisel');
      if (!chisel) throw new Error('Smoke Chisel tool item not found after second craft');
      if (!isBroken(chisel)) {
        throw new Error('Smoke Chisel toolBroken flag not set at maxUses threshold craft');
      }
      if (!chisel.name.endsWith(' (broken)')) {
        throw new Error(`Smoke Chisel name "${chisel.name}" missing " (broken)" suffix`);
      }
      record('exec-tool-breakage-limited-uses', true);
    } catch (err) {
      record('exec-tool-breakage-limited-uses', false, err.message);
    }

    // ── negative tool-gating (required tool absent → success:false) ──────────
    try {
      const recipe = rm.getRecipe(fixtures.simple.negativeToolRecipeId);
      const bracketBefore = countByName('Smoke Bracket');
      const result = await game.fabricate.craft(crafter, recipe, { componentSourceActors: [crafter] });
      const bracketAfter = countByName('Smoke Bracket');
      if (result.success !== false) throw new Error('craft succeeded but the required tool is absent');
      if (!/tool/i.test(result.message || '')) {
        throw new Error(`failure message "${result.message}" is not a tool-gating reason`);
      }
      if (bracketAfter !== bracketBefore) {
        throw new Error(`Smoke Bracket ${bracketBefore} -> ${bracketAfter}, expected no product on gated craft`);
      }
      record('exec-negative-tool-gating', true);
    } catch (err) {
      record('exec-negative-tool-gating', false, err.message);
    }

    // ── salvage (results non-null + result component lands in inventory) ─────
    try {
      const shardBefore = countByName('Smoke Shard');
      const result = await engine.salvage(
        crafter.uuid,
        fixtures.simple.systemId,
        fixtures.simple.relicComponentId,
        { skipTimeGate: true }
      );
      const shardAfter = countByName('Smoke Shard');
      if (!result.success) throw new Error(`salvage failed: ${result.message}`);
      if (result.results == null) throw new Error('salvage results is null (expected non-null)');
      if (shardAfter <= shardBefore) {
        throw new Error(`Smoke Shard ${shardBefore} -> ${shardAfter}, expected increase from salvage`);
      }
      record('exec-salvage-run', true);
    } catch (err) {
      record('exec-salvage-run', false, err.message);
    }

    // ── guaranteed-success gather (inventory increase via startGatheringAttempt) ─
    try {
      await game.fabricate.setSelectedGatheringActorId(crafterId);
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: fixtures.gather.environmentId,
        taskId: fixtures.gather.taskId
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        const reason = result?.blockedReasons?.[0]?.code || result?.blockedReasons?.[0] || 'unknown';
        throw new Error(`gather not accepted (state=${result?.state}, blocked=${JSON.stringify(reason)})`);
      }
      if (after <= before) {
        throw new Error(`Mystic Herb ${before} -> ${after}, expected increase from guaranteed-success gather`);
      }
      record('exec-gather-inventory-delta', true);
    } catch (err) {
      record('exec-gather-inventory-delta', false, err.message);
    }

    return steps;
  }, { fixtures, crafterId });
}

/**
 * Full-profile-only gather assertions for issue #489: the seeded 0%-drop ("empty") gather, the
 * scene-blocked gather, and the hazardous "Bramble Snare" event firing.
 */
async function runFullProfileGatherAsserts(page, craftingSetup, gatherFixture, crafterId) {
  return await page.evaluate(async ({ arcaneSystemId, hazardEnvironmentId, hazardTaskId, crafterId }) => {
    const steps = [];
    const record = (step, passed, error) => steps.push({ step, passed, ...(error ? { error } : {}) });
    const crafter = game.actors.get(crafterId);
    await game.fabricate.setSelectedGatheringActorId(crafterId);
    const countByName = (name) => crafter.items.contents
      .filter((i) => i.name === name)
      .reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);

    const environmentStore = game.fabricate.getGatheringEnvironmentStore();
    const envByName = (name) =>
      (environmentStore.list?.() || []).find((env) => env?.name === name) || null;

    // ── 0%-drop ("empty") gather: accepted, but no items awarded ─────────────
    try {
      const witheredEnv = envByName('Withered Patch');
      if (!witheredEnv) throw new Error('Withered Patch environment not seeded (full profile)');
      const before = countByName('Mystic Herb');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: witheredEnv.id,
        taskId: 'smoke-withered-search'
      });
      const after = countByName('Mystic Herb');
      if (result?.accepted !== true) {
        throw new Error(`empty gather not accepted (state=${result?.state})`);
      }
      const created = Array.isArray(result.createdResults) ? result.createdResults : [];
      if (created.length !== 0 || after !== before) {
        throw new Error(`0%-drop gather awarded items (createdResults=${created.length}, inv ${before}->${after})`);
      }
      record('exec-gather-empty', true);
    } catch (err) {
      record('exec-gather-empty', false, err.message);
    }

    // ── scene-blocked gather: not accepted, scene-block reason ───────────────
    try {
      const sunkenEnv = envByName('Sunken Ruins');
      if (!sunkenEnv) throw new Error('Sunken Ruins environment not seeded (full profile)');
      const result = await game.fabricate.startGatheringAttempt({
        rememberedActorId: crafterId,
        environmentId: sunkenEnv.id,
        taskId: 'smoke-sunken-survey'
      });
      if (result?.accepted === true) throw new Error('scene-blocked gather was accepted');
      const reasons = JSON.stringify(result?.blockedReasons || []);
      if (!/SCENE/i.test(reasons)) {
        throw new Error(`scene-blocked gather reason not scene-related: ${reasons}`);
      }
      record('exec-gather-scene-blocked', true);
    } catch (err) {
      record('exec-gather-scene-blocked', false, err.message);
    }

    // ── hazardous "Bramble Snare" event fires (deterministic dropRate) ───────
    try {
      // Force the seeded hazardous event to fire deterministically: raise its dropRate to 100 for
      // this assertion (restored afterwards) so the d100 event throw always lands.
      const config = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
      const systemConfig = config.systems?.[arcaneSystemId] || {};
      const events = Array.isArray(systemConfig.events) ? systemConfig.events : [];
      const brambleIndex = events.findIndex((event) => event?.id === 'smoke-bramble-event');
      if (brambleIndex < 0) throw new Error('smoke-bramble-event not seeded (full profile)');
      const originalDropRate = events[brambleIndex].dropRate;
      events[brambleIndex] = { ...events[brambleIndex], dropRate: 100 };
      config.systems[arcaneSystemId] = { ...systemConfig, events };
      await game.settings.set('fabricate', 'gatheringConfig', config);
      try {
        const result = await game.fabricate.startGatheringAttempt({
          rememberedActorId: crafterId,
          environmentId: hazardEnvironmentId,
          taskId: hazardTaskId
        });
        if (result?.accepted !== true) throw new Error(`hazard gather not accepted (state=${result?.state})`);
        const firedEvents = result?.checkResult?.events || [];
        const fired = firedEvents.some((event) => event?.id === 'smoke-bramble-event')
          || JSON.stringify(firedEvents).includes('Bramble Snare');
        if (!fired) {
          throw new Error(`Bramble Snare did not fire (events=${JSON.stringify(firedEvents)})`);
        }
        record('exec-gather-hazard-event', true);
      } finally {
        const restore = foundry.utils.deepClone(game.settings.get('fabricate', 'gatheringConfig') || {});
        const restoreSystem = restore.systems?.[arcaneSystemId] || {};
        const restoreEvents = Array.isArray(restoreSystem.events) ? restoreSystem.events : [];
        const idx = restoreEvents.findIndex((event) => event?.id === 'smoke-bramble-event');
        if (idx >= 0) {
          restoreEvents[idx] = { ...restoreEvents[idx], dropRate: originalDropRate };
          restore.systems[arcaneSystemId] = { ...restoreSystem, events: restoreEvents };
          await game.settings.set('fabricate', 'gatheringConfig', restore);
        }
      }
    } catch (err) {
      record('exec-gather-hazard-event', false, err.message);
    }

    return steps;
  }, {
    arcaneSystemId: craftingSetup.systemId,
    hazardEnvironmentId: gatherFixture.environmentId,
    hazardTaskId: gatherFixture.taskId,
    crafterId
  });
}

// Phase D0's children, in their declared order. The world-scope identity check is not a
// `D0_SKIPPABLE_SECTIONS` entry and always runs, between the tools and knowledge sections.
const D0_SECTION_SCENARIOS = [
  d0Recipes,
  d0ComponentsChecks,
  d0TagsEssences,
  d0Gathering,
  d0Tools,
  d0WorldScopeIdentity,
  d0Knowledge,
  d0OverviewInteractables,
  d0ImportAlchemyExperimental
];

// ── Cleanup tracking ──────────────────────────────────────────────────────
const cleanup = {
  actorIds: [],
  itemIds: [],
  userIds: [],
  sceneIds: [],
  systemId: null,
  blockedSystemId: null,
  // The `visibilityMode: 'restricted'` system whose recipe carries an access grant
  // (issue 643 §4b) — the only fixture that renders the recipe rail's ACCESS branch.
  restrictedSystemId: null,
  recipeIds: [],
  // Issue #489 craft-execution coverage fixtures: dedicated per-mode crafting systems (simple /
  // routedByIngredients / routedByCheck / progressive) and their world items.
  executionSystemIds: [],
  executionItemIds: []
};

async function main() {
  // Read boot timings written by foundry-test-up.mjs *before* wiping
  // test-results/ — that script may have populated boot-timings.json, and we
  // want to merge those entries into the final summary so the timing table
  // reflects the whole pipeline, not just the in-browser phases.
  /** @type {Array<{ phase: string, startedAt: string, durationMs: number }>} */
  let bootTimings = [];
  try {
    const raw = await readFile(join(RESULTS_DIR, 'boot-timings.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.bootTimings)) bootTimings = parsed.bootTimings;
  } catch { /* boot timings are optional (e.g., when invoking foundry-test-run.mjs directly) */ }

  // Wipe stale artifacts so the uploaded test-results/ artifact contains
  // only the current run. Every consumer (CI artifact upload, local triage)
  // wants current-run output; nothing here is hand-authored.
  await rm(RESULTS_DIR, { recursive: true, force: true });
  await mkdir(RESULTS_DIR, { recursive: true });

  process.stdout.write(`Smoke profile: ${SMOKE_PROFILE}${RAW_SMOKE_PROFILE !== SMOKE_PROFILE ? ` (from FOUNDRY_SMOKE_PROFILE=${RAW_SMOKE_PROFILE})` : ''}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  await suppressFoundryTours(context);
  const page = await context.newPage();

  // Known non-Fabricate error patterns to ignore (keep narrow — real 404s should be caught).
  // These in-source defaults stay in source, where their justification lives.
  const ignoredErrorPatternDefaults = [
    /favicon/i,
    // The screenshot walk deliberately exercises the responsive Manager at these four evidence
    // viewports.
    /Foundry Virtual Tabletop requires a screen resolution of 1366px by 768px or greater\..*display has a resolution of (?:1280px by 720px|1280px by 520px|900px by 700px|680px by 700px)\./i,
    // Note (issue #1010): a `/reading 'OBJECTS'/` waiver used to sit here, described as a headless
    // WebGL timing artifact.
  ];

  // APPEND any run-supplied patterns (--allowed-console-error-patterns / the
  // FOUNDRY_ALLOWED_CONSOLE_ERROR_PATTERNS env var) to the defaults; the
  // defaults always keep applying.
  const ignoredErrorPatterns = appendAllowedConsoleErrorPatterns(
    ignoredErrorPatternDefaults,
    ALLOWED_CONSOLE_ERROR_PATTERNS_CSV
  );

  attachConsoleCapture(page, ignoredErrorPatterns, { consoleErrors, waivedConsoleErrors, consoleLog });

  const ctx = createSmokeContext({
    page,
    browser,
    results,
    profile,
    resultsDir: RESULTS_DIR,
    cleanup,
    bootTimings,
    screenshotRunIdentity,
    consoleErrors,
    waivedConsoleErrors,
    consoleLog
  });
  const { screenshot, startPhase, shouldRunScreenshotPhase, shouldRunScreenshotSection } = ctx;

  const results = {
    passed: false,
    steps: [],
    errors: [],
    consoleErrors: []
  };

  // How the shared boot path (scripts/lib/foundryBrowserBoot.js) reports back into this harness's
  // bookkeeping.
  const bootReporter = createBootReporter({
    screenshot,
    recordStep: (step) => results.steps.push(step),
    log: (message) => process.stdout.write(message)
  });

  // Issue #807: page.isClosed() is causation-blind (true for an intentional close OR a renderer
  // crash), so a tolerated post-captures teardown could hide a real product OOM as an untraceable
  // "transient". page 'crash' is Playwright's causation-bearing renderer-crash signal (OOM
  // canonical).
  page.on('crash', () => {
    results.rendererCrashed = true;
    process.stderr.write('Renderer process crashed (page "crash" event).\n');
  });

  try {
    await runScenarios(SMOKE_SCENARIOS, ctx);
    startPhase('boot-and-join');
    // ── Step 1: Navigate to setup page and handle first-run flows ──────────
    await page.goto(`${FOUNDRY_URL}/setup`, { waitUntil: 'networkidle' });
    results.steps.push({ step: 'navigate-setup', passed: true });

    // Handle first-run license page (redirects /setup → /license → /auth)
    await acceptLicenseIfPresentShared(page, { reporter: bootReporter });

    // Handle admin auth page (/auth → /setup)
    await authenticateIfRequiredShared(page, { adminKey: ADMIN_KEY, reporter: bootReporter });

    // If the world is already running, Foundry redirects straight to /join or /game
    const postAuthPath = getPathname(page.url());
    const worldAlreadyRunning = postAuthPath === '/join' || postAuthPath === '/game';

    if (!worldAlreadyRunning) {
      // ── Step 2: Dismiss first-run dialogs, then launch the world ───────────
      await launchWorldShared(page, {
        worldId: WORLD_ID,
        foundryUrl: FOUNDRY_URL,
        reporter: bootReporter
      });
    } else {
      process.stdout.write('World already running, skipping setup/launch.\n');
      results.steps.push({ step: 'setup-ready', passed: true, skipped: true });
      results.steps.push({ step: 'launch-world', passed: true, skipped: true });
    }

    await joinWorldSessionShared(page, {
      userLabel: 'Gamemaster',
      stepName: 'join-session',
      reporter: bootReporter
    });

    // Hide notification toasts globally — they otherwise overlay screenshots and force a
    // per-screenshot dismiss + sleep dance.
    await installNotificationHidingCss(page);

    await screenshot(page, 'world-loaded');

    // Wait for Foundry canvas to be ready
    await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

    // ── Step 3: Verify/activate Fabricate module ─────────────────────────────
    const fabricateActive = await page.evaluate(() => {
      return game.modules.get('fabricate')?.active === true;
    });

    if (!fabricateActive) {
      process.stdout.write('Fabricate module not active. Activating via Module Management...\n');
      // Enable the module through Foundry's settings API, then reload
      await page.evaluate(async () => {
        const moduleSettings = game.settings.get('core', 'moduleConfiguration') || {};
        moduleSettings['fabricate'] = true;
        await game.settings.set('core', 'moduleConfiguration', moduleSettings);
      });
      // Reload the page to apply module activation
      await page.reload({ waitUntil: 'load', timeout: 60_000 });
      // Re-join if redirected to /join
      await joinWorldSessionShared(page, { userLabel: 'Gamemaster', reporter: bootReporter });
      // Re-apply the notification-hiding CSS after reload (style tags are
      // scoped to the document and are cleared on navigation)
      await installNotificationHidingCss(page);
      await page.waitForFunction(() => typeof game !== 'undefined' && game.ready, { timeout: 30_000 });

      const nowActive = await page.evaluate(() => game.modules.get('fabricate')?.active === true);
      if (!nowActive) {
        throw new Error('Fabricate module could not be activated.');
      }
      results.steps.push({ step: 'module-activated', passed: true });
      process.stdout.write('Fabricate module activated and loaded.\n');
    } else {
      results.steps.push({ step: 'module-active', passed: true });
      process.stdout.write('Fabricate module is active.\n');
    }

    // Wait for Fabricate to be fully ready
    await page.waitForFunction(() => game.fabricate?.ready === true, { timeout: 15_000 });

    // Dismiss any overlay that might block sidebar clicks (Game Paused banner, tours, dialogs)
    await page.evaluate(() => {
      // Unpause the game if paused (the "Game Paused" overlay blocks all sidebar clicks)
      if (game.paused) game.togglePause(false);
      // Dismiss any active tour
      const tour = globalThis.foundry?.nue?.Tour;
      if (tour?.activeTour) tour.activeTour.exit();
    });
    await page.waitForTimeout(500);

    // ── Phase B: Create test actors & items ─────────────────────────────────
    startPhase('phase-B');
    process.stdout.write('Phase B: Creating test actors and items...\n');
    try {
      const createdDocs = await page.evaluate(async () => {
        // Clean up any stale test data from previous runs.
        const csm = game.fabricate.getCraftingSystemManager();
        const rm = game.fabricate.getRecipeManager();
        const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();

        // Defensively clear all gathering environments before recreating fixtures.
        if (environmentStore) {
          try {
            await game.settings.set('fabricate', 'gatheringEnvironments', []);
            environmentStore.load?.();
          } catch (err) {
            console.warn(`Failed to reset gathering environments: ${err?.message}`);
          }
        }

        const allSystems = csm.getSystems();
        // The smoke creates "Arcane Forge" and renames it to "The Herbalist's Compendium" mid-run
        // (Phase D0).
        const staleSystemNames = new Set([
          'Arcane Forge', "The Herbalist's Compendium",
          // Issue #489 craft-execution coverage systems (deterministic names) so a
          // crashed local run does not accumulate duplicate same-named systems.
          'Smoke Simple Forge', 'Smoke Ingredient Router', 'Smoke Check Router',
          'Smoke Progressive Forge'
        ]);
        const staleSystems = allSystems.filter(s => staleSystemNames.has(s.name));
        for (const sys of staleSystems) {
          console.log(`Cleaning stale crafting system: ${sys.name} (${sys.id})`);
          try { await environmentStore?.cleanupByCraftingSystem?.(sys.id); } catch { /* ok */ }
          const recipes = rm.getRecipes?.({ craftingSystemId: sys.id }) ?? [];
          for (const r of recipes) {
            try { await rm.deleteRecipe(r.id); } catch { /* ok */ }
          }
          try { await csm.deleteSystem(sys.id); } catch { /* ok */ }
        }

        // 2. Clear stale smoke-world chat before any later phase opens the chat
        //    sidebar. Old crafting cards retain image URLs from the product version
        //    that created them; allowing them to render makes an otherwise clean run
        //    fail the zero-console-error gate on obsolete asset 404s.
        const staleMessages = game.messages?.contents ?? [];
        if (staleMessages.length > 0) {
          console.log(`Cleaning ${staleMessages.length} stale smoke chat messages`);
          await ChatMessage.deleteDocuments(staleMessages.map(message => message.id));
        }

        // 3. Clean stale smoke actors (tagged flags.fabricate.smokeSeed) so the
        //    per-run re-import of the dnd5e Starter Heroes pack stays idempotent.
        const staleActors = game.actors.contents.filter(a => a.flags?.fabricate?.smokeSeed === true);
        if (staleActors.length > 0) {
          console.log(`Cleaning ${staleActors.length} stale smoke actors`);
          await Actor.deleteDocuments(staleActors.map(a => a.id));
        }

        const staleUsers = game.users.contents.filter(u =>
          ['Fabricate Gatherer', 'Fabricate Observer'].includes(u.name)
        );
        if (staleUsers.length > 0) {
          console.log(`Cleaning ${staleUsers.length} stale test users`);
          await User.deleteDocuments(staleUsers.map(u => u.id));
        }

        // 4. Clean stale items (the fixed smoke set plus the issue #489
        //    craft-execution world items, all uniquely 'Smoke '-prefixed).
        const staleItems = game.items.contents.filter(i =>
          ['Iron Ore', 'Mystic Herb', 'Dragon Scale', 'Empty Vial',
           'Iron Sword', 'Healing Potion', 'Dragon Scale Armor'].includes(i.name)
          || (typeof i.name === 'string' && i.name.startsWith('Smoke '))
        );
        if (staleItems.length > 0) {
          console.log(`Cleaning ${staleItems.length} stale test items`);
          await Item.deleteDocuments(staleItems.map(i => i.id));
        }

        const staleScenes = game.scenes.contents.filter(scene =>
          ['Fabricate Azure Grove Scene'].includes(scene.name)
        );
        if (staleScenes.length > 0) {
          console.log(`Cleaning ${staleScenes.length} stale test scenes`);
          await Scene.deleteDocuments(staleScenes.map(scene => scene.id));
        }

        // Discover valid document types — try multiple Foundry API locations
        // V13: game.documentTypes.Item, V12: game.system.documentTypes.Item
        const rawItemTypes = game.documentTypes?.Item
          ?? game.system?.documentTypes?.Item
          ?? game.system?.template?.Item?.types
          ?? [];
        const rawActorTypes = game.documentTypes?.Actor
          ?? game.system?.documentTypes?.Actor
          ?? game.system?.template?.Actor?.types
          ?? [];
        const itemTypes = Array.from(rawItemTypes);
        const actorTypes = Array.from(rawActorTypes);
        console.log('Available item types:', JSON.stringify(itemTypes));
        console.log('Available actor types:', JSON.stringify(actorTypes));

        // Use 'loot' for all items — safest common type across D&D 5e versions
        const itemType = itemTypes.includes('loot') ? 'loot' : itemTypes[0] || 'loot';

        // Create world-level items (all as loot — type doesn't matter for crafting).
        const describe = (html) => ({ description: { value: `<p>${html}</p>` } });
        const itemData = [
          { name: 'Iron Ore', type: itemType, img: 'icons/commodities/metal/ingot-worn-iron.webp',
            system: describe('Unrefined metal, dug from a hillside and still carrying the grit of the seam it came from. Smelt it before you trust it to hold an edge.') },
          { name: 'Mystic Herb', type: itemType, img: 'icons/consumables/plants/leaf-herb-green.webp',
            system: describe('A pungent leaf that keeps its colour long after cutting.') },
          { name: 'Dragon Scale', type: itemType, img: 'icons/commodities/leather/scales-blue-white.webp',
            system: describe('Shed plate, still faintly warm to the touch.') },
          { name: 'Empty Vial', type: itemType, img: 'icons/consumables/potions/vial-cork-empty.webp',
            system: describe('Cheap, corked glass. Holds a single dose.') },
          { name: 'Iron Sword', type: itemType, img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
            system: describe('A serviceable blade with a worn brass guard.') },
          { name: 'Herbalist Sickle', type: itemType, img: 'icons/tools/hand/sickle-worn-steel-grey.webp',
            system: describe('A short curved blade for taking cuttings without crushing them.') },
          { name: 'Healing Potion', type: itemType, img: 'icons/consumables/potions/potion-tube-corked-red.webp',
            system: describe('Tastes of iron and cloves.') },
          { name: 'Dragon Scale Armor', type: itemType, img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
            system: describe('Overlapping plate, light for its bulk.') }
        ];

        const items = await Item.createDocuments(itemData);
        console.log(`Created ${items.length} items:`, items.map(i => `${i.name} (${i.type})`).join(', '));

        const itemIds = items.map(i => i.id);
        const itemsByName = {};
        for (const item of items) {
          itemsByName[item.name] = { id: item.id, uuid: item.uuid };
        }

        // Import the dnd5e "Starter Heroes" pack so demo actors use official, non-AI art shipped
        // with the game system instead of bundled portraits.
        const heroPack = game.packs.get('dnd5e.heroes')
          ?? game.packs.find(p => p.documentName === 'Actor' && /hero/i.test(p.metadata?.label ?? ''));
        if (!heroPack) {
          throw new Error('dnd5e Starter Heroes compendium (dnd5e.heroes) not found — cannot seed smoke actors.');
        }
        const heroIndex = await heroPack.getIndex();
        // R1 (#750): two-actor contract. Phase B references only actors[0] (crafter) and actors[1]
        // (travelMember); importing the whole Starter Heroes pack cost ~30-45s for actors nothing
        // asserts.
        const sortedHeroEntries = Array.from(heroIndex)
          .slice()
          .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en'));
        const importedHeroes = [];
        for (const entry of sortedHeroEntries) {
          if (entry.type && entry.type !== 'character') continue;
          const actor = await game.actors.importFromCompendium(heroPack, entry._id);
          if (actor?.type === 'character') importedHeroes.push(actor);
          if (importedHeroes.length >= 2) break;
        }
        if (importedHeroes.length === 0) {
          throw new Error('dnd5e Starter Heroes compendium contained no character actors.');
        }
        await Actor.updateDocuments(importedHeroes.map(a => ({ _id: a.id, 'flags.fabricate.smokeSeed': true })));
        const actors = importedHeroes.slice().sort((a, b) => a.name.localeCompare(b.name, 'en'));
        console.log(`Imported ${actors.length} dnd5e Starter Heroes:`, actors.map(a => a.name).join(', '));
        const actorIds = actors.map(a => a.id);

        const crafter = actors[0];
        const travelMember = actors[1] ?? null;
        // Remember the crafter as the default gathering actor so the player-app
        // screenshots deterministically show the same demo character.
        try { await game.fabricate.setSelectedGatheringActorId(crafter.id); } catch { /* best effort */ }
        const testUserData = [
          { name: 'Fabricate Gatherer', role: CONST.USER_ROLES.PLAYER, password: '' },
          { name: 'Fabricate Observer', role: CONST.USER_ROLES.PLAYER, password: '' }
        ];
        const existingTestUsers = game.users.contents.filter(user =>
          testUserData.some(data => data.name === user.name)
        );
        const missingTestUsers = testUserData.filter(data =>
          !existingTestUsers.some(user => user.name === data.name)
        );
        const users = existingTestUsers.concat(
          missingTestUsers.length > 0 ? await User.createDocuments(missingTestUsers) : []
        );
        const gathererUser = users.find(user => user.name === 'Fabricate Gatherer');
        const observerUser = users.find(user => user.name === 'Fabricate Observer');
        const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        const noneLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
        await crafter.update({ ownership: { default: noneLevel, [gathererUser.id]: ownerLevel } });
        if (travelMember) await travelMember.update({ ownership: { default: noneLevel } });
        // "Who controls this character" is a union of two independent routes: the viewer holds
        // Foundry OWNER on the actor, OR the actor is that user's assigned character
        // (`User#character`).
        if (travelMember && observerUser) {
          await observerUser.update({ character: travelMember.id });
        }
        const userIds = users.map(user => user.id);

        // Build inventory copies from world items Include flags.core.sourceId so the crafting
        // engine can match embedded items back to world-level component UUIDs
        const byName = (name) => {
          const item = items.find(i => i.name === name);
          if (!item) throw new Error(`Item "${name}" not found in created items`);
          return item;
        };
        const copies = (item, qty) =>
          Array.from({ length: qty }, () => ({
            name: item.name,
            type: item.type,
            img: item.img,
            flags: { core: { sourceId: item.uuid } }
          }));

        // Crafter gets: 3x Mystic Herb, 3x Empty Vial, 1x Dragon Scale. The UI evidence phases
        // share this actor and may stage one vial in another workflow.
        await crafter.createEmbeddedDocuments('Item', [
          ...copies(byName('Mystic Herb'), 3),
          ...copies(byName('Empty Vial'), 3),
          ...copies(byName('Dragon Scale'), 1)
        ]);

        // Travel-party member gets: 3x Iron Ore, 1x Dragon Scale
        if (travelMember) {
          await travelMember.createEmbeddedDocuments('Item', [
            ...copies(byName('Iron Ore'), 3),
            ...copies(byName('Dragon Scale'), 1)
          ]);
        }

        return {
          itemIds,
          actorIds,
          userIds,
          gathererUserId: gathererUser.id,
          observerUserId: observerUser?.id ?? null,
          crafterId: crafter.id,
          travelMemberId: travelMember?.id ?? null,
          itemsByName
        };
      });

      cleanup.itemIds = createdDocs.itemIds;
      cleanup.actorIds = createdDocs.actorIds;
      cleanup.userIds = createdDocs.userIds;
      cleanup.crafterId = createdDocs.crafterId;
      cleanup.travelMemberId = createdDocs.travelMemberId;
      cleanup.gathererUserId = createdDocs.gathererUserId;
      cleanup.observerUserId = createdDocs.observerUserId;
      process.stdout.write(`  Created ${createdDocs.itemIds.length} items and ${createdDocs.actorIds.length} actors with inventories.\n`);

      // Screenshot the Items sidebar (force: true bypasses overlays like "Game Paused")
      const itemsTab = page.locator('#sidebar [data-tab="items"]').first();
      await itemsTab.click({ force: true });
      // Wait for the items directory to render an item row created in Phase B
      // (replaces a 1 s fixed sleep that was guarding sidebar render).
      await page.locator('#sidebar #items .directory-item, #sidebar [data-tab="items"] .directory-item').first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => { /* selector variants across V13 — best-effort */ });
      await screenshot(page, 'items-sidebar');
      process.stdout.write('  Screenshotted Items sidebar.\n');

      // Screenshot each actor sheet (inventory tab)
      process.stdout.write('  Opening actor sheets for screenshots...\n');
      for (const actorId of createdDocs.actorIds) {
        const actorName = await page.evaluate(async (id) => {
          const actor = game.actors.get(id);
          await actor.sheet.render(true);
          return actor.name;
        }, actorId);
        // Wait for an actor sheet to be in the DOM (covers AppV1 + V2 shells).
        // Replaces a 1.5 s fixed sleep.
        await page.locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => { /* shell selector varies; the changeTab logic below tolerates a not-yet-rendered sheet */ });
        // Navigate to inventory tab via Foundry API
        const invTabResult = await page.evaluate((id) => {
          const actor = game.actors.get(id);
          const sheet = actor?.sheet;
          if (!sheet) return { found: false, reason: 'no sheet' };

          // ApplicationV2: use changeTab API
          if (typeof sheet.changeTab === 'function') {
            try {
              sheet.changeTab('inventory', 'primary');
              return { found: true, method: 'changeTab(inventory, primary)' };
            } catch (e) {
              // Try without group
              try {
                sheet.changeTab('inventory');
                return { found: true, method: 'changeTab(inventory)' };
              } catch (e2) { /* continue */ }
            }
          }

          // ApplicationV1: use activateTab
          if (typeof sheet.activateTab === 'function') {
            try {
              sheet.activateTab('inventory');
              return { found: true, method: 'activateTab(inventory)' };
            } catch (e) { /* continue */ }
          }

          // Debug: list available methods and tab groups
          const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sheet))
            .filter(m => m.toLowerCase().includes('tab'))
            .slice(0, 10);
          const tabGroups = sheet.tabGroups ? Object.keys(sheet.tabGroups) : [];
          return { found: false, methods, tabGroups };
        }, actorId);
        if (invTabResult.found) {
          await page.waitForTimeout(500);
        }
        await screenshot(page, `actor-sheet-${actorName.replace(/\s+/g, '-').toLowerCase()}`);
        process.stdout.write(`  Screenshotted ${actorName} sheet.\n`);
        // Close the sheet
        await page.evaluate((id) => {
          const actor = game.actors.get(id);
          actor.sheet.close();
        }, actorId);
        await page.waitForTimeout(500);
      }

      results.steps.push({ step: 'create-actors-items', passed: true });
      process.stdout.write('Phase B complete: Actors and items created.\n');
    } catch (err) {
      results.steps.push({ step: 'create-actors-items', passed: false, error: err.message });
      process.stderr.write(`Phase B failed: ${err.message}\n`);
    }

    // Guard: Phases C–E depend on Phase B having created items
    const phaseBPassed = results.steps.some(s => s.step === 'create-actors-items' && s.passed);
    if (!phaseBPassed) {
      process.stderr.write('Skipping Phases C–E: Phase B did not complete.\n');
      results.steps.push({ step: 'create-crafting-system', passed: false, error: 'Skipped: Phase B failed' });
    }

    // ── Phase C: Create crafting system & recipes ────────────────────────────
    if (phaseBPassed) {
    startPhase('phase-C');
    process.stdout.write('Phase C: Creating crafting system and recipes...\n');
    try {
      // Quickstart Step 2 evidence (full profile): the GM System Library before any system exists —
      // the "No crafting systems yet" onboarding card with the primary "Create system" button.
      if (RUN_SCREENSHOT_PHASES) {
        await page.evaluate(async () => {
          const csm = game.fabricate.getCraftingSystemManager();
          for (const system of csm.getSystems()) {
            await csm.deleteSystem(system.id);
          }
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          globalThis.__fabricateSmokeManagerApp = (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        // The empty-library onboarding card renders its own primary action; wait
        // on it (not assertManagerLayoutStable, which requires table rows) so the
        // frame shows the onboarding state with the Create system button.
        await page.locator('.fabricate-manager .manager-empty .manager-button.is-primary')
          .filter({ hasText: 'Create system' }).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-systems-empty');
        await closeOpenApplications(page);
      }

      const craftingSetup = await page.evaluate(async ({ gathererUserId, crafterId, travelMemberId }) => {
        const csm = game.fabricate.getCraftingSystemManager();

        // The world currency ladder (issue 1278).
        await game.settings.set('fabricate', 'currencyConfig', {
          spendStrategy: 'actorProperty',
          providerId: '',
          macros: { canAfford: '', increment: '', decrement: '' },
          units: [
            { id: 'gp', label: 'Gold', abbreviation: 'gp', icon: 'fa-solid fa-coins', contains: [] },
            { id: 'sp', label: 'Silver', abbreviation: 'sp', icon: 'fa-solid fa-coins', contains: [] }
          ]
        });
        await game.fabricate.getCurrencyConfigStore?.()?.load?.();

        // Create the crafting system
        const system = await csm.createSystem({
          name: 'Arcane Forge',
          description: 'A mystical forge capable of transmuting raw materials into powerful artifacts.'
        });
        const systemId = system.id;
        const azureGroveScene = await Scene.create({
          name: 'Fabricate Azure Grove Scene',
          active: false,
          background: { src: 'icons/consumables/plants/leaf-herb-green.webp' }
        });

        // Register all 7 world items as managed components
        const worldItems = game.items.contents;
        const worldItemByName = Object.fromEntries(worldItems.map(item => [item.name, item]));
        const componentMap = {};
        for (const item of worldItems) {
          const result = await csm.addItemFromUuid(systemId, item.uuid);
          componentMap[item.name] = result.item.id;
        }
        for (const componentId of Object.values(componentMap)) {
          await csm.updateItem(systemId, componentId, { difficulty: 1 });
        }

        await csm.updateSystem(systemId, {
          // `routedByCheck` resolution allows multiple ingredient/result sets, so the recipe editor
          // shows the "Add ingredient set" promotion affordance (recipeCanAddSet gates on a mode
          // NOT in ['simple','progressive'] and not alchemy).
          resolutionMode: 'routedByCheck',
          features: {
            essences: true,
            gathering: true,
            multiStepRecipes: true,
            itemTags: true,
            recipeCategories: true
          },
          // Salvage is always on; pick routed mode + named outcome tiers so the
          // component editor's salvage section shows populated outcome routing (#436).
          salvageResolutionMode: 'routed',
          salvageCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '1d20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'salvage-clean', name: 'Clean Salvage', success: true, breakTools: false, dc: 6 },
                { id: 'salvage-partial', name: 'Partial Salvage', success: true, breakTools: false, dc: 0 },
                { id: 'salvage-botched', name: 'Botched', success: false, breakTools: true, dc: -6 }
              ]
            }
          },
          // Crafting check with routed outcome tiers, so a check-routed recipe's result groups can
          // be assigned outcome tiers (`checkOutcomeIds`).
          craftingCheck: {
            enabled: true,
            // Per-recipe check-modifier catalogue + default policy (issue 770).
            checkModifiers: [
              { id: 'med', label: 'Medicine', icon: 'fas fa-staff-snake', expression: '@abilities.wis.mod' },
              { id: 'alch', label: 'Alchemy', icon: 'fas fa-flask', expression: '@abilities.int.mod' },
              { id: 'herb', label: 'Herbalism', icon: 'fas fa-seedling', expression: '@abilities.dex.mod' }
            ],
            // `playerPicks` on the system (issue 1055), and it must stay there or this seed stops
            // working.
            defaultModifierPolicy: 'playerPicks',
            defaultModifierIds: ['med', 'herb'],
            // `maxModifierPicks: 2` — the size of the eligible set above, so it bounds nothing and
            // the prompt renders its MULTI-pick checkbox group ("Pick up to 2") rather than the
            // historical pick-one radio group.
            maxModifierPicks: 2,
            routed: {
              type: 'relative',
              // `1d20 + 20` (base total 21-40, plus a small ability mod) always meets the
              // Masterwork threshold, so the Phase-E Brew Healing Potion craft deterministically
              // succeeds.
              rollFormula: '1d20 + 20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'craft-masterwork', name: 'Masterwork', success: true, breakTools: false, dc: 5 },
                { id: 'craft-standard', name: 'Standard', success: true, breakTools: false, dc: 0 },
                { id: 'craft-ruined', name: 'Ruined', success: false, breakTools: true, dc: -5 }
              ]
            }
          },
          // System-level gathering check with named routed outcome tiers, so the
          // Checks tab's gathering editor renders populated when the gathering
          // economy is set to routed for the screenshot (#437).
          gatheringCraftingCheck: {
            enabled: true,
            routed: {
              type: 'relative',
              rollFormula: '1d20',
              dc: 12,
              thresholdMode: 'meet',
              relativeOutcomes: [
                { id: 'gather-bountiful', name: 'Bountiful Harvest', success: true, breakTools: false, dc: 5 },
                { id: 'gather-harvest', name: 'Harvest', success: true, breakTools: false, dc: 0 },
                { id: 'gather-spoiled', name: 'Spoiled', success: false, breakTools: false, dc: -5 }
              ]
            }
          },
          itemTags: ['rare', 'reagent', 'metallic'],
          // Two authored recipe categories, so the library's group-by-category treatment is
          // exercised with more than one group. A single "General" bucket proves nothing about
          // grouping (issue 643).
          categories: ['Alchemy', 'Smithing'],
          // Participation only. The unit LADDER is world scope since issue 1278 and is seeded
          // as the `currencyConfig` world setting below, which is what gives the currency-cost
          // requirement row a unit to target.
          requirements: {
            currency: { enabled: true }
          },
          // Character prerequisites moved to the WORLD `characterLibraries` setting
          // alongside modifiers (issue 1308/1311) — seeded below, next to the modifier
          // library, rather than on this system-scoped payload. See the comment there.
          essenceDefinitions: [
            {
              name: 'Verdant',
              description: 'The essence of growth, renewal, and living roots.',
              icon: 'fas fa-leaf',
              sourceItemUuid: worldItemByName['Mystic Herb']?.uuid ?? null
            },
            {
              name: 'Restorative',
              description: 'The essence of mending, resilience, and recovery.',
              icon: 'fas fa-heart',
              sourceItemUuid: worldItemByName['Healing Potion']?.uuid ?? null
            },
            {
              name: 'Toxic',
              description: 'The essence of venom, corruption, and dangerous decay.',
              icon: 'fas fa-skull-crossbones',
              sourceItemUuid: null
            },
            {
              name: 'Volatile',
              description: 'The essence of sparks, heat, and unstable reactions.',
              icon: 'fas fa-bolt',
              sourceItemUuid: null
            },
            {
              name: 'Positive',
              description: 'The essence of radiance, blessing, and warm light.',
              icon: 'fas fa-sun',
              sourceItemUuid: null
            },
            {
              name: 'Negative',
              description: 'The essence of shadow, concealment, and entropy.',
              icon: 'fas fa-moon',
              sourceItemUuid: null
            }
          ]
        });

        // Give Iron Ore a routed salvage configuration so the component editor's
        // salvage section renders populated result groups + outcome routing (#436).
        await csm.updateItem(systemId, componentMap['Iron Ore'], {
          salvage: {
            enabled: true,
            ingredientQuantity: 1,
            resultGroups: [
              { id: 'scrap', name: 'Scrap', results: [{ id: 'scrap-result', componentId: componentMap['Iron Ore'], quantity: 1 }] },
              { id: 'intact', name: 'Intact Parts', results: [{ id: 'intact-result', componentId: componentMap['Iron Sword'], quantity: 1 }] }
            ],
            outcomeRouting: { 'Clean Salvage': 'intact', 'Partial Salvage': 'scrap' }
          }
        });

        // Iron Sword gets authored salvage results with `enabled` absent (issue 676).
        await csm.updateItem(systemId, componentMap['Iron Sword'], {
          salvage: {
            ingredientQuantity: 1,
            resultGroups: [
              { id: 'sword-scrap', name: 'Sword Scrap', results: [{ id: 'sword-scrap-result', componentId: componentMap['Iron Ore'], quantity: 2 }] }
            ]
          }
        });

        // Create 3 recipes
        const rm = game.fabricate.getRecipeManager();

        const recipe1 = await rm.createRecipe({
          name: 'Forge Iron Sword',
          description: 'Hammer iron ore into a sturdy blade.',
          craftingSystemId: systemId,
          img: 'icons/weapons/swords/sword-guard-brass-worn.webp',
          // routedByCheck routes by the check outcome; this single-result-group recipe
          // is produced on any non-failure outcome (the single-group exemption), so no
          // outcome/tier mapping is needed. The routed modes ignore `resultSelection`.
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 2,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Forged Weapon',
            results: [{
              componentId: componentMap['Iron Sword'],
              quantity: 1
            }]
          }]
        });

        const recipe2 = await rm.createRecipe({
          name: 'Brew Healing Potion',
          description: 'Combine mystic herbs and an empty vial to create a healing draught.',
          craftingSystemId: systemId,
          img: 'icons/consumables/potions/bottle-round-corked-red.webp',
          // No per-recipe `craftingModifier` (issues 856, 1055).
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Mystic Herb',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                }]
              },
              {
                name: 'Empty Vial',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Empty Vial'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Brewed Potion',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        });

        // Books & Scrolls fixture (issue 796): seed five resolvable book/scroll recipe items and
        // link them all to "Brew Healing Potion" so its Books & Scrolls editor tab renders the
        // populated auto-fill grid — the tiling + specificity-cascade evidence the empty "Not in
        // any book or scroll" panel cannot show.
        const bookItemType = worldItemByName['Mystic Herb']?.type || 'loot';
        const bookItems = await Item.createDocuments([
          { name: "Mythwright Crafter's Handbook", type: bookItemType, img: 'icons/sundries/books/book-tooled-eye-gold-red.webp' },
          { name: "Alchemist's Field Notes", type: bookItemType, img: 'icons/sundries/documents/blueprint-recipe-alchemical.webp' },
          { name: 'Grimoire of the Verdant Path', type: bookItemType, img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp' },
          { name: 'Scroll of Restorative Draughts', type: bookItemType, img: 'icons/sundries/books/book-red-exclamation.webp' },
          { name: "The Apothecary's Compendium", type: bookItemType, img: 'icons/sundries/books/book-embossed-jewel-gold-green.webp' }
        ]);
        for (const book of bookItems) {
          const { item: bookDef } = await csm.addRecipeItemFromUuid(systemId, book.uuid);
          await csm.updateRecipeItemDefinition(systemId, bookDef.id, { recipeIds: [recipe2.id] });
        }

        const recipe3 = await rm.createRecipe({
          name: 'Craft Dragon Scale Armor',
          description: 'Forge dragon scales with iron ore into legendary armor.',
          craftingSystemId: systemId,
          img: 'icons/equipment/chest/breastplate-metal-scaled-grey.webp',
          // Single result group → produced on any non-failure outcome (single-group
          // exemption); the routed modes ignore `resultSelection`.
          ingredientSets: [{
            ingredientGroups: [
              {
                name: 'Dragon Scale',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                }]
              },
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 1,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Crafted Armor',
            results: [{
              componentId: componentMap['Dragon Scale Armor'],
              quantity: 1
            }]
          }]
        });

        // Showcase recipe whose single ingredient set exercises every requirement row type so the
        // Ingredients tab renders: a plain component, an OR group (one group with two component
        // options), a tag requirement, an essence requirement, and a currency cost. complex:true
        // forces the full set-card render; allowIncomplete persists it as a structurally-valid
        // editor shell.
        const showcaseRecipe = await rm.createRecipe({
          name: 'Showcase Requirements',
          description: 'Demonstrates every ingredient requirement row: component, OR group, tag, essence, and currency cost.',
          craftingSystemId: systemId,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          complex: true,
          ingredientSets: [{
            name: 'Primary',
            ingredientGroups: [
              {
                name: 'Iron Ore',
                options: [{
                  quantity: 2,
                  match: { type: 'component', componentId: componentMap['Iron Ore'] }
                }]
              },
              {
                name: 'Catalyst (either works)',
                options: [
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Mystic Herb'] }
                  },
                  {
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }
                ]
              },
              {
                name: 'Any reagent',
                options: [{
                  quantity: 1,
                  match: { type: 'tags', tags: ['reagent', 'rare'], tagMatch: 'any' }
                }]
              },
              // An essence requirement (issue 684): a first-class essence match (issue 649) with
              // its own end-of-row Stepper.
              {
                name: 'Verdant essence',
                options: [{
                  quantity: 1,
                  match: { type: 'essence', essenceId: 'verdant', amount: 2 }
                }]
              },
              {
                name: 'Gold cost',
                options: [{
                  quantity: 1,
                  match: { type: 'currency', unit: 'gp', amount: 100 }
                }]
              }
            ]
          }],
          resultGroups: [{
            name: 'Showcase Result',
            results: [{
              componentId: componentMap['Healing Potion'],
              quantity: 1
            }]
          }]
        }, { allowIncomplete: true });

        // Multi-step recipe so the Overview steps accordion shows the per-step duration controls
        // (data-recipe-step-time chips + the duration editor).
        const multiStepRecipe = await rm.createRecipe({
          name: 'Multi-Step Alloy',
          description: 'A two-step recipe to showcase the steps accordion and per-step durations.',
          craftingSystemId: systemId,
          img: 'icons/commodities/metal/ingot-stack-steel.webp',
          // Each step has a single result group → produced on any non-failure outcome (the
          // single-group exemption is evaluated per step); routed modes ignore `resultSelection`.
          steps: [
            {
              name: 'Smelt Ore',
              ingredientSets: [{
                name: 'Ore',
                ingredientGroups: [{
                  name: 'Iron Ore',
                  options: [{
                    quantity: 2,
                    match: { type: 'component', componentId: componentMap['Iron Ore'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Molten Iron',
                results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
              }],
              timeRequirement: { hours: 2, minutes: 30 }
            },
            {
              name: 'Forge Blade',
              ingredientSets: [{
                name: 'Blade',
                ingredientGroups: [{
                  name: 'Dragon Scale',
                  options: [{
                    quantity: 1,
                    match: { type: 'component', componentId: componentMap['Dragon Scale'] }
                  }]
                }]
              }],
              resultGroups: [{
                name: 'Finished Blade',
                results: [{ componentId: componentMap['Dragon Scale Armor'], quantity: 1 }]
              }],
              timeRequirement: { days: 1 }
            }
          ]
        }, { allowIncomplete: true });

        // Check-routed recipe deliberately authored with multiple result groups and two
        // routed-readiness gaps so the Validation tab shows both new warnings (issue 431 PR-2).
        const routedReadinessRecipe = await rm.createRecipe({
          name: 'Routed Check Readiness',
          description: 'A check-routed recipe with an unrouted result set and an unproduced outcome tier.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          complex: true,
          ingredientSets: [{
            name: 'Stock',
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [
            {
              name: 'Standard Output',
              checkOutcomeIds: ['craft-standard'],
              results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
            },
            {
              // No assigned outcome tier → fires the unroutedResultGroup warning.
              name: 'Reject Pile',
              checkOutcomeIds: [],
              results: [{ componentId: componentMap['Iron Ore'], quantity: 1 }]
            }
          ]
        }, { allowIncomplete: true });

        // Every fixture recipe above is enabled, unlocked, complete and uncategorised, so the
        // library's Disabled row, Locked row, "Can't enable" pill, empty-Produces danger row and
        // category grouping had never been photographed.
        const incompleteRecipe = await rm.createRecipe({
          name: 'Temper a Blade',
          description: 'Re-harden a finished blade to raise its edge retention.',
          craftingSystemId: systemId,
          img: 'icons/skills/melee/hand-grip-sword-red.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Sword',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Sword'] }
              }]
            }]
          }]
        }, { allowIncomplete: true });
        await rm.updateRecipe(incompleteRecipe.id, { enabled: false, category: 'Smithing' }, { allowIncomplete: true });

        // A COMPLETE recipe that is locked (visible to players, GM-only to craft) — the
        // one row state the lock control writes and nothing had ever captured.
        const lockedRecipe = await rm.createRecipe({
          name: 'Quench a Blade',
          description: 'Plunge the hot blade into brine to set its temper.',
          craftingSystemId: systemId,
          img: 'icons/skills/trades/smithing-anvil-silver-red.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Iron Ore',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: componentMap['Iron Ore'] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Tempered Weapon',
            results: [{ componentId: componentMap['Iron Sword'], quantity: 1 }]
          }]
        });
        await rm.updateRecipe(lockedRecipe.id, { locked: true, category: 'Smithing' });

        // Spread the existing recipes across the two authored categories so the library renders
        // three groups (Alchemy / General / Smithing), not one.
        await rm.updateRecipe(recipe1.id, { category: 'Smithing' }, { allowIncomplete: true });
        await rm.updateRecipe(recipe2.id, { category: 'Alchemy' }, { allowIncomplete: true });
        await rm.updateRecipe(multiStepRecipe.id, { category: 'Smithing' }, { allowIncomplete: true });

        // Two recipe items so the recipe-item editor's Validation tab can be captured in both an
        // all-clear and a mixed pass/block state.
        const bookType = worldItemByName['Iron Ore']?.type || 'loot';
        const [tomeItem, scrollItem] = await Item.createDocuments([
          {
            name: 'Tome of Brewing',
            type: bookType,
            img: 'icons/sundries/books/book-worn-brown.webp',
            system: { description: { value: '<p>A well-thumbed brewing manual that teaches its reader to brew a healing draught.</p>' } }
          },
          {
            name: 'Torn Recipe Scroll',
            type: bookType,
            img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
            system: { description: { value: '<p>A half-legible scroll whose recipe list has been torn away.</p>' } }
          }
        ]);

        // All-clear recipe item: a world item is linked (originItemUuid), a recipe is
        // linked, and learnsValid holds (learning limit off) → summary reads "All clear".
        const clearRecipeItem = (await csm.addRecipeItemFromUuid(systemId, tomeItem.uuid)).item;
        await csm.updateRecipeItemDefinition(systemId, clearRecipeItem.id, { recipeIds: [recipe2.id] });

        // Mixed recipe item: the world item is linked, but no recipe is linked, so `recipeLinked`
        // blocks while `itemLinked` and `learnsValid` pass.
        const mixedRecipeItem = (await csm.addRecipeItemFromUuid(systemId, scrollItem.uuid)).item;

        const environmentStore = game.fabricate.getGatheringEnvironmentStore();
        // Manual composition (issue 1315): the `enabledTaskIds`/`enabledEventIds` below are the
        // picked lists manual mode actually reads.
        const gatheringEnvironment = await environmentStore.create({
          craftingSystemId: systemId,
          name: 'Azure Grove',
          description: 'A tranquil grove of blue-leaved trees, rich with reagents.',
          img: 'icons/magic/nature/tree-spirit-blue.webp',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'manual',
          sceneUuid: azureGroveScene.uuid,
          region: 'northreach',
          biomes: ['forest', 'ruins'],
          dangerTags: ['hazardous'],
          eventSelectionMode: 'highestRankedDrop',
          eventPolicy: 'successWithEvent',
          enabledTaskIds: ['smoke-forage-library'],
          enabledEventIds: ['smoke-bramble-event']
        });

        const playerGatheringFixtures = [];
        const playerFixtureDefinitions = [
          {
            name: 'Verdant Meadow',
            description: 'Open grassland thick with common herbs, easy to harvest.',
            img: 'icons/consumables/plants/grass-leaves-green.webp',
            enabledTaskIds: ['smoke-meadow-herbs']
          },
          {
            name: 'Sunken Ruins',
            description: 'Half-drowned ruins where forgotten reagents still linger.',
            img: 'icons/environment/wilderness/wall-ruins.webp',
            sceneUuid: 'Scene.fabricateMissingGatheringScene',
            enabledTaskIds: ['smoke-sunken-survey']
          },
          {
            name: 'Crystal Thicket',
            description: 'A thicket of glittering crystal fronds, perilous to harvest by hand.',
            img: 'icons/magic/water/barrier-ice-crystal-wall-faceted-blue.webp',
            enabledTaskIds: ['smoke-crystal-dew']
          },
          {
            name: 'Timed Orchard',
            description: 'An orchard whose slow blooms ripen only with patience.',
            img: 'icons/consumables/fruit/apple-red-tree-green.webp',
            enabledTaskIds: ['smoke-slow-bloom']
          },
          {
            name: 'Withered Patch',
            description: 'A blighted patch picked all but bare.',
            img: 'icons/magic/fire/flame-burning-tree-stump.webp',
            enabledTaskIds: ['smoke-withered-search']
          },
          {
            name: 'Moonlit Blind Grove',
            description: 'A moonlit grove where harvests reveal themselves only once attempted.',
            img: 'icons/creatures/mammals/wolf-howl-moon-forest-blue.webp',
            selectionMode: 'blind',
            enabledTaskIds: ['smoke-moonpetal']
          }
        ];
        for (const fixture of playerFixtureDefinitions) {
          const { sceneUuid = '', selectionMode = 'targeted', ...definition } = fixture;
          playerGatheringFixtures.push(await environmentStore.create({
            craftingSystemId: systemId,
            enabled: true,
            selectionMode,
            sceneUuid,
            compositionMode: 'manual',
            ...definition
          }));
        }

        await game.settings.set('fabricate', 'gatheringConfig', {
          conditions: { weather: 'rain', timeOfDay: 'dusk' },
          systems: {
            [systemId]: {
              vocabularies: {
                regions: { values: ['northreach'] }
              },
              tasks: [{
                id: 'smoke-forage-library',
                name: 'Forage Wild Herbs',
                description: 'Forage the wayside for common herbs and roots.',
                img: 'icons/consumables/plants/herb-tied-bundle-green.webp',
                enabled: true,
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                itemSelectionMode: 'highestRankedDrop',
                dropRows: [{
                  id: 'smoke-drop-herb',
                  componentId: componentMap['Mystic Herb'],
                  quantity: 2,
                  dropRate: 80,
                  enabled: true
                }]
              }],
              tools: [{
                id: 'smoke-herbalist-sickle',
                label: 'Herbalist Sickle',
                enabled: true,
                componentId: componentMap['Herbalist Sickle'],
                requirement: { formula: '@tools.herbalism.value' },
                breakage: { mode: 'limitedUses', maxUses: 5 },
                onBreak: { mode: 'flagBroken' }
              }, {
                // Deliberately unlabelled: a recipe references this tool so the recipe Tools tab
                // proves the component-name fallback (an unlabelled tool must show the backing
                // component's name, never a raw id).
                id: 'smoke-unlabelled-tool',
                label: '',
                enabled: true,
                componentId: componentMap['Empty Vial']
              }],
              events: [{
                id: 'smoke-bramble-event',
                name: 'Bramble Snare',
                description: 'Thorned brambles snare the careless gatherer.',
                img: 'icons/magic/nature/root-vine-thorned-fire-purple.webp',
                enabled: true,
                dangerTags: ['hazardous'],
                region: 'northreach',
                biomes: ['forest'],
                weather: ['rain'],
                timeOfDay: ['dusk'],
                dropRate: 35
              }]
            }
          }
        });

        // Tools remain SYSTEM-OWNED (the `craftingSystems` setting): the Tools view and the
        // gathering tool gate both read `getSystem(id).tools`. Persist through the canonical
        // manager update after the Gathering fixture exists.
        //
        // Modifiers AND character prerequisites both moved to WORLD scope (issue 1308,
        // rehomed onto their own World > Rules & Resources routes by issue 1311). Every
        // screen that lists either — World > Rules & Resources > Modifiers /
        // Character Prerequisites, and every per-activity picker fed from
        // `selectedSystemModifiers` / `selectedCharacterPrerequisites` in
        // `CraftingSystemManagerRoot.svelte` (Checks cards, salvage/gathering modifier
        // pickers, and the Tool Studio Requirements tab) — reads the `characterLibraries`
        // world setting ONLY (`CharacterLibrariesStore#listModifiers` /
        // `#listCharacterPrerequisites`); none of them fall back to
        // `getSystem(id).modifiers` / `.characterPrerequisites`. `resolveModifierLibrary`
        // and `resolveCharacterPrerequisiteLibrary` (`src/systems/characterLibraries.js`)
        // still union in a system's legacy copies for worlds the 1.28.0 migration has not
        // yet lifted, but this smoke world is created fresh under current code, so nothing
        // exercises that fallback here — seeding only the world lists is what every
        // consumer actually needs. This is the FIRST write to `characterLibraries` in the
        // run, so a plain object literal is safe; any LATER write to this setting (e.g. the
        // Tool Studio fixture below) must read-modify-write it instead, because
        // `settings.set` REPLACES the whole value rather than merging.
        await csm.updateSystem(systemId, {
          tools: game.settings.get('fabricate', 'gatheringConfig')?.systems?.[systemId]?.tools || []
        });
        await game.settings.set('fabricate', 'characterLibraries', {
          modifiers: [
            {
              id: 'smoke-mod-herbalism',
              label: 'Herbalism Training',
              icon: 'fa-solid fa-leaf',
              expression: '@skills.nature.value'
            },
            {
              id: 'smoke-mod-survival',
              label: 'Wilderness Survival',
              icon: 'fa-solid fa-campground',
              expression: '@skills.survival.value'
            }
          ],
          characterPrerequisites: [
            { id: 'smoke-pre-trained', name: 'Trained in Alchemy', icon: 'fa-solid fa-flask', path: 'skills.alchemy.rank', op: 'gte', value: 2 },
            { id: 'smoke-pre-focused', name: 'Focused', icon: 'fa-solid fa-bullseye', path: 'flags.focused', op: 'isTrue', value: null }
          ]
        });

        // Reference the deliberately-unlabelled tool from the Brew Healing Potion
        // recipe so the recipe Tools tab demonstrates the component-name fallback.
        await rm.updateRecipe(recipe2.id, { toolIds: ['smoke-unlabelled-tool'] });

        // Seed one `fabricate.interactable` Region behaviour on the Azure Grove scene so the canvas
        // interactable config panel (Link/Unlink toggle + node editor) gets screenshot coverage in
        // Phase D0.
        const interactableTaskId = 'smoke-forage-library';
        const [interactableRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Forage Node',
          shapes: [{ type: 'rectangle', x: 1000, y: 1000, width: 400, height: 400 }],
          behaviors: [{
            type: 'fabricate.interactable',
            system: {
              interactableType: 'gatheringTask',
              sourceUuid: `Fabricate.${systemId}.gatheringTask.${interactableTaskId}`,
              systemId,
              taskId: interactableTaskId,
              environmentId: gatheringEnvironment.id,
              taskNodeLink: 'linked',
              node: null
            }
          }]
        }]);
        const interactableBehavior = interactableRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        // Seed an unconfigured `fabricate.interactable` (issue 342): a behaviour created with an
        // empty `system`, exactly like the native Region → Behaviors "+ Add Behavior → Fabricate
        // Interactable" path.
        const [unconfiguredRegion] = await azureGroveScene.createEmbeddedDocuments('Region', [{
          name: 'Fabricate Unconfigured Node',
          shapes: [{ type: 'rectangle', x: 1600, y: 1000, width: 400, height: 400 }],
          behaviors: [{ type: 'fabricate.interactable' }]
        }]);
        const unconfiguredBehavior = unconfiguredRegion?.behaviors?.find(
          behavior => behavior?.type === 'fabricate.interactable'
        ) ?? null;

        // A dedicated system seeded into a deliberately broken state so the GM system-overview view
        // renders populated rows and the system-blocker banner shows (issue 429 PR-2). It carries
        // both.
        const blockedSystem = await csm.createSystem({
          name: 'Broken Workshop',
          description: 'A system left in a broken state to demonstrate the system overview and the system-blocker banner.'
        });
        const blockedSystemId = blockedSystem.id;
        // Register two managed components so the progressive components browser shows both a set
        // difficulty and an unset ("None") value, and so the difficulty editor card has a component
        // to author against.
        const blockedComponents = [];
        for (const blockedWorldItem of game.items.contents.slice(0, 2)) {
          const added = await csm.addItemFromUuid(blockedSystemId, blockedWorldItem.uuid);
          if (added?.item?.id) blockedComponents.push({ id: added.item.id, name: blockedWorldItem.name });
        }
        // Progressive mode with no progressive crafting check → blocks:'system'.
        await csm.updateSystem(blockedSystemId, {
          resolutionMode: 'progressive',
          features: { gathering: true, craftingChecks: false },
          craftingCheck: { enabled: false }
        });
        // Give the first blocked component a usable progressive difficulty so the components column
        // renders a value next to the second component's "None" (and the difficulty editor card
        // opens with a seeded value).
        if (blockedComponents[0]) {
          await csm.updateItem(blockedSystemId, blockedComponents[0].id, { difficulty: 4 });
        }
        // Note: progressive mode with no crafting check rejects recipe creation ("Progressive mode
        // requires crafting checks enabled"), and a recipe created before the mode switch would be
        // deleted by the (pre-migration-first) updateSystem.

        // Seed a gathering library task that will NOT match the environment's conditions/biome,
        // then create a manual environment that explicitly includes it.
        const blockedConfig = game.settings.get('fabricate', 'gatheringConfig') || {};
        await game.settings.set('fabricate', 'gatheringConfig', {
          ...blockedConfig,
          systems: {
            ...(blockedConfig.systems || {}),
            [blockedSystemId]: {
              tasks: [{
                id: 'broken-stale-task',
                name: 'Phantom Harvest',
                description: 'A task that no longer matches its environment.',
                enabled: true,
                biomes: ['tundra'],
                dropRows: []
              }],
              events: [],
              tools: []
            }
          }
        });
        const blockedEnvironment = await environmentStore.create({
          craftingSystemId: blockedSystemId,
          name: 'Forsaken Hollow',
          description: 'An environment whose only included task no longer matches it.',
          enabled: true,
          selectionMode: 'targeted',
          compositionMode: 'manual',
          biomes: ['forest'],
          enabledTaskIds: ['broken-stale-task']
        });

        // A `visibilityMode: 'restricted'` system (issue 643 §4b).
        const restrictedSystem = await csm.createSystem({
          name: 'Warded Athenaeum',
          description: 'A restricted system whose recipes are granted to named players and characters.'
        });
        const restrictedSystemId = restrictedSystem.id;
        const restrictedComponentIds = [];
        for (const restrictedWorldItem of game.items.contents.slice(0, 2)) {
          const added = await csm.addItemFromUuid(restrictedSystemId, restrictedWorldItem.uuid);
          if (added?.item?.id) restrictedComponentIds.push(added.item.id);
        }
        await csm.updateSystem(restrictedSystemId, { visibilityMode: 'restricted' });
        const wardedRecipe = await rm.createRecipe({
          name: 'Warded Rite',
          description: 'A rite only the warded may perform.',
          craftingSystemId: restrictedSystemId,
          img: 'icons/sundries/scrolls/scroll-runed-brown.webp',
          ingredientSets: [{
            ingredientGroups: [{
              name: 'Ward Focus',
              options: [{
                quantity: 1,
                match: { type: 'component', componentId: restrictedComponentIds[0] }
              }]
            }]
          }],
          resultGroups: [{
            name: 'Warded Sigil',
            results: [{
              componentId: restrictedComponentIds[1] ?? restrictedComponentIds[0],
              quantity: 1
            }]
          }]
        });
        // Access-grid evidence (issue 796): the recipe editor's Access tab tiles the granted
        // characters into the same fixed three-column grid as Books & Scrolls.
        const accessGrantType = game.actors.get(crafterId)?.type || 'character';
        const accessGrantActors = await Actor.createDocuments(
          ['Seraphine the Warded', 'Brother Alden', 'Initiate Kaelen', 'Mistweaver Vane'].map((name) => ({
            name,
            type: accessGrantType,
            flags: { fabricate: { smokeSeed: true, smokeSeedRole: 'access-grant' } }
          }))
        );
        await rm.updateRecipe(
          wardedRecipe.id,
          {
            access: {
              characterIds: [crafterId, travelMemberId, ...accessGrantActors.map((a) => a.id)].filter(Boolean),
              playerIds: [gathererUserId].filter(Boolean)
            }
          },
          { allowIncomplete: true }
        );

        return {
          systemId,
          blockedSystemId,
          blockedComponentNames: blockedComponents.map((component) => component.name),
          blockedEnvironmentId: blockedEnvironment?.id ?? null,
          restrictedSystemId,
          restrictedRecipeName: 'Warded Rite',
          componentMap,
          recipeIds: [recipe1.id, recipe2.id, recipe3.id, showcaseRecipe.id, multiStepRecipe.id, routedReadinessRecipe.id, wardedRecipe.id],
          recipeItemIds: { clear: clearRecipeItem.id, mixed: mixedRecipeItem.id },
          healingPotionRecipeId: recipe2.id,
          sceneIds: [azureGroveScene.id],
          gatheringEnvironmentId: gatheringEnvironment.id,
          playerGatheringEnvironmentIds: playerGatheringFixtures.map(environment => environment.id),
          interactable: {
            sceneId: azureGroveScene.id,
            regionId: interactableRegion?.id ?? null,
            behaviorId: interactableBehavior?.id ?? null
          },
          unconfiguredInteractable: {
            sceneId: azureGroveScene.id,
            regionId: unconfiguredRegion?.id ?? null,
            behaviorId: unconfiguredBehavior?.id ?? null
          }
        };
      }, {
        gathererUserId: cleanup.gathererUserId,
        crafterId: cleanup.crafterId,
        travelMemberId: cleanup.travelMemberId
      });

      cleanup.systemId = craftingSetup.systemId;
      cleanup.blockedSystemId = craftingSetup.blockedSystemId;
      cleanup.restrictedSystemId = craftingSetup.restrictedSystemId;
      cleanup.recipeIds = craftingSetup.recipeIds;
      cleanup.sceneIds = craftingSetup.sceneIds;
      // The interactable Region is embedded in azureGroveScene, so it is cleaned
      // up with the scene (cleanup.sceneIds) — no separate cleanup key needed.
      process.stdout.write(`  Created crafting system and ${craftingSetup.recipeIds.length} recipes.\n`);

      results.steps.push({ step: 'create-crafting-system', passed: true });
      process.stdout.write(`Phase C complete: System "${craftingSetup.systemId}" with ${craftingSetup.recipeIds.length} recipes.\n`);

      // Issue #489: seed the craft-execution coverage fixtures (dedicated per-mode systems,
      // tool-breakage recipes, a salvageable component, crafter inventory, and a guaranteed-success
      // gather env/task).
      let executionFixtures = null;
      try {
        process.stdout.write('  Seeding craft-execution coverage fixtures (#489)...\n');
        executionFixtures = await seedSmokeCraftExecutionFixtures(page, craftingSetup, cleanup.crafterId);
        cleanup.executionSystemIds = executionFixtures.executionSystemIds;
        cleanup.executionItemIds = executionFixtures.executionItemIds;
        cleanup.recipeIds = [...cleanup.recipeIds, ...executionFixtures.executionRecipeIds];
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: true });
        process.stdout.write(
          `  Seeded ${executionFixtures.executionSystemIds.length} execution systems and ` +
          `${executionFixtures.executionRecipeIds.length} recipes.\n`
        );
      } catch (err) {
        results.steps.push({ step: 'seed-craft-execution-fixtures', passed: false, error: err.message });
        process.stderr.write(`Seeding craft-execution fixtures failed: ${err.message}\n`);
      }

      // Issue #543: seed the player Alchemy workbench coverage fixtures (two enabled alchemy
      // systems + valid recipes) so the shared app surfaces the Alchemy tab and its discipline
      // chooser in Phase E. Screenshot-profile only — rc/ci never opens the player app's alchemy
      // captures.
      let alchemyFixtures = null;
      if (RUN_SCREENSHOT_PHASES) {
        try {
          process.stdout.write('  Seeding player alchemy workbench fixtures (#543)...\n');
          alchemyFixtures = await seedSmokeAlchemyFixtures(page, craftingSetup, cleanup.crafterId);
          cleanup.executionSystemIds = [
            ...(cleanup.executionSystemIds || []),
            ...alchemyFixtures.alchemySystemIds
          ];
          cleanup.executionItemIds = [
            ...(cleanup.executionItemIds || []),
            ...alchemyFixtures.alchemyProductItemIds
          ];
          cleanup.recipeIds = [...cleanup.recipeIds, ...alchemyFixtures.alchemyRecipeIds];
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: true });
          process.stdout.write(
            `  Seeded ${alchemyFixtures.alchemySystemIds.length} alchemy systems and ` +
            `${alchemyFixtures.alchemyRecipeIds.length} recipes.\n`
          );
        } catch (err) {
          results.steps.push({ step: 'seed-alchemy-fixtures', passed: false, error: err.message });
          process.stderr.write(`Seeding alchemy fixtures failed: ${err.message}\n`);
        }
      }

      // Feature-gate negative test (toggle gathering off, assert button hides, toggle back on).
      if (RUN_FULL_ONLY_BEHAVIORS) {
      try {
        const otherGatheringSystemsEnabled = await page.evaluate((systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          return csm.getSystems()
            .some(system => system.id !== systemId && system.features?.gathering === true);
        }, craftingSetup.systemId);
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.locator('#sidebar [data-tab="items"]').first().click({ force: true });
        // Wait for the items-sidebar tab content to be visible — replaces a
        // 750 ms fixed sleep that was guarding render of the sidebar after a
        // settings.update that triggers a Hooks.callAll cycle.
        await page.locator('#sidebar [data-tab="items"][aria-selected="true"], #sidebar [data-application-part="items"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* selectors vary across V13 sheets — best-effort */ });
        if (!otherGatheringSystemsEnabled && await page.locator('button[data-fabricate-action="gathering"]').count() > 0) {
          throw new Error('Gathering action is visible when no system enables gathering.');
        }
        if (otherGatheringSystemsEnabled) {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
        } else {
          results.steps.push({ step: 'gathering-feature-gate-negative', passed: true });
        }
      } catch (err) {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: false, error: err.message });
      } finally {
        await page.evaluate(async (systemId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(systemId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await page.locator('button[data-fabricate-action="gathering"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .catch(() => { /* tolerate if sidebar hasn't re-rendered in time */ });
      }
      } else {
        results.steps.push({ step: 'gathering-feature-gate-negative', passed: true, skipped: true });
      }

      // Phase D0 renderer-teardown tolerance state (issue #807).
      let d0RequiredCapturesComplete = false;
      let d0TeardownTolerated = false;
      // Gated behind RUN_SCREENSHOT_PHASES so the CI smoke profile skips the ~25 manager captures
      // and pointer hit-tests; local `full` runs continue to regenerate them for visual
      // verification.
      if (!RUN_SCREENSHOT_PHASES) {
        startPhase('phase-D0-skipped');
        process.stdout.write(`Phase D0: skipped (profile=${SMOKE_PROFILE}).\n`);
        results.steps.push({ step: 'screenshot-manager', passed: true, skipped: true });
      } else {
      startPhase('phase-D0');
      process.stdout.write('Phase D0: Opening Crafting System Manager...\n');
      let previousExperimentalFeatures = false;
      try {
        previousExperimentalFeatures = await page.evaluate(async (sysId) => {
          const previousExperimentalFeatures = Boolean(game.settings.get('fabricate', 'experimentalFeatures'));
          await game.settings.set('fabricate', 'experimentalFeatures', true);
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', '');
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: "The Herbalist's Compendium",
            description: 'Configure categories, item tags, essences, and crafting behaviour for this system.'
          });
          return previousExperimentalFeatures;
        }, craftingSetup.systemId);
        await seedSmokeGatheringLibrary(page, craftingSetup);

        await page.evaluate(async () => {
          globalThis.__fabricateSmokeManagerApp = (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await selectSmokeSystemInManager(page, craftingSetup.systemId);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });
        const smokeLibraryCounts = await page.evaluate((sysId) => {
          const rawSystem = game.settings.get('fabricate', 'gatheringConfig')?.systems?.[sysId] || {};
          const app = globalThis.__fabricateSmokeManagerApp;
          let state = null;
          const unsubscribe = app?._adminStore?.viewState?.subscribe?.(value => { state = value; });
          if (typeof unsubscribe === 'function') unsubscribe();
          const viewSystem = state?.gatheringConfig?.systems?.[sysId] || {};
          return {
            rawTasks: Array.isArray(rawSystem.tasks) ? rawSystem.tasks.length : 0,
            rawEvents: Array.isArray(rawSystem.events) ? rawSystem.events.length : 0,
            rawTools: Array.isArray(rawSystem.tools) ? rawSystem.tools.length : 0,
            viewTasks: Array.isArray(viewSystem.tasks) ? viewSystem.tasks.length : 0,
            viewEvents: Array.isArray(viewSystem.events) ? viewSystem.events.length : 0,
            viewTools: Array.isArray(viewSystem.tools) ? viewSystem.tools.length : 0
          };
        }, craftingSetup.systemId);
        if (smokeLibraryCounts.viewTasks < 1 || smokeLibraryCounts.viewEvents < 1 || smokeLibraryCounts.viewTools < 1) {
          throw new Error(`Manager smoke gathering library was not loaded: ${JSON.stringify(smokeLibraryCounts)}`);
        }
        let navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(`Manager default selection should keep System Overview first. Saw: ${navLabels.join(', ')}`);
        }
        if (await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`).count() === 0) {
          throw new Error('Manager did not select the smoke test system.');
        }
        if (await page.locator('.fabricate-manager .manager-breadcrumbs button:has-text("Crafting Systems")').count() === 0) {
          throw new Error('Manager root breadcrumb is missing.');
        }
        await assertManagerLayoutStable(page, 'normal default selection');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-default-selection');

        // Capture the real system-library manager under every Fabricate theme
        // (genuine Foundry-mounted DOM re-themed via the theme attribute), then
        // restore the default theme before continuing the default-theme flow.
        await captureManagerThemes(ctx);

        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
        await settleManagerNav(page);
        navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.includes('Systems')) {
          throw new Error(`Manager selected nav should not expose a Systems tab. Saw: ${navLabels.join(', ')}`);
        }
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(`Manager selected nav should keep System Overview first. Saw: ${navLabels.join(', ')}`);
        }
        // The membership loop, by ID AND then by label (issue 1362).
        for (const entry of [...MANAGER_SYSTEM_RAIL_ENTRIES, ...MANAGER_WORLD_SCOPED_RAIL_ENTRIES]) {
          const button = page.locator(railSelector(entry.id));
          if (await button.count() === 0) {
            throw new Error(`Manager selected nav is missing rail entry #${entry.id} (${entry.label}). Saw: ${navLabels.join(', ')}`);
          }
          const rendered = (await button.locator('.manager-nav-label').first().innerText()).trim();
          if (rendered !== entry.label) {
            throw new Error(`Manager rail entry #${entry.id} should read "${entry.label}"; it reads "${rendered}".`);
          }
        }
        // The rail's crafting-system card selects (issue 643): it names the current system AND
        // lists every other, so the GM can switch without a round trip through the system library.
        const scopeSelectValue = await page
          .locator('.fabricate-manager .manager-scope-card [data-manager-scope-select]')
          .first()
          .inputValue()
          .catch(() => '');
        if (scopeSelectValue !== craftingSetup.systemId) {
          throw new Error(`Manager rail system select should name the selected system. Saw: "${scopeSelectValue}".`);
        }
        if (await page.locator('.fabricate-manager .manager-scope-return[aria-label="Return to System Library"]').count() === 0) {
          throw new Error('Manager selected-system scope is missing the return-to-library action.');
        }
        if (await page.locator('.fabricate-manager .manager-section-header .manager-button:has-text("Import")').count() > 0) {
          throw new Error('Manager duplicated Import in the System library header.');
        }
        if (await page.locator('.fabricate-manager .manager-section-header .manager-button:has-text("Create")').count() > 0) {
          throw new Error('Manager duplicated Create in the System library header.');
        }
        if (await page.locator('.fabricate-manager .manager-card-title:has-text("Quick actions")').count() > 0) {
          throw new Error('Manager inspector still shows duplicate Quick actions.');
        }
        await assertManagerLayoutStable(page, 'normal selected');
        await exerciseManagerPointerTargets(page, craftingSetup.systemId);
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-normal');

        // Collapsible left rail: capture both the expanded default and the
        // collapsed icon-strip state where the middle content column reclaims
        // the freed rail width and section navigation stays reachable.
        const railToggle = page.locator('.fabricate-manager .manager-rail-toggle').first();
        if (await railToggle.count() === 0) {
          throw new Error('Manager rail is missing its collapse/expand toggle control.');
        }
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() > 0) {
          // Ensure we start from the expanded baseline before capturing it.
          await railToggle.click();
          await page.waitForTimeout(400);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-expanded');

        await railToggle.click();
        await page.waitForTimeout(500);
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() === 0) {
          throw new Error('Manager rail toggle did not collapse the navigation rail.');
        }
        const collapsedNavIcons = await page.locator('.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button:visible').count();
        if (collapsedNavIcons === 0) {
          throw new Error('Collapsed manager rail should keep section navigation reachable as an icon strip.');
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-rail-collapsed');

        // Restore the expanded rail so subsequent manager steps see the default layout.
        await railToggle.click();
        await page.waitForTimeout(400);
        if (await page.locator('.fabricate-manager .manager-body.is-rail-collapsed').count() > 0) {
          throw new Error('Manager rail toggle did not re-expand the navigation rail.');
        }

        await returnToSystemLibrary(page);
        await settleManagerNav(page);
        // The settle signature (geometry x navCount) can be identical across this
        // transition, so anchor on the browser row actually re-mounting before the
        // non-retrying count assertions below (issue 750 review finding).
        await page.locator(managerSystemRowSelector(craftingSetup.systemId)).first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        navLabels = await page.locator('.fabricate-manager .manager-nav-label').evaluateAll(labels =>
          labels.map(label => label.textContent?.trim()).filter(Boolean)
        );
        if (navLabels.at(0) !== 'System Overview') {
          throw new Error(`Manager return to library should preserve selected-system nav. Saw nav: ${navLabels.join(', ')}`);
        }
        if (await page.locator('.fabricate-manager .manager-scope-card').count() === 0) {
          throw new Error('Manager return to library should leave the rail scope visible.');
        }
        if (await page.locator(managerSystemRowSelector(craftingSetup.systemId)).count() === 0) {
          throw new Error('Manager return to library did not return to the systems browser.');
        }
        if (await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)}[aria-selected="true"]`).count() === 0) {
          throw new Error('Manager return to library should preserve the selected system row.');
        }

        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: false } });
        }, craftingSetup.systemId);
        await page.evaluate(async () => {
          (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
        await settleManagerNav(page);
        const gatheringOffFact = await page.locator('.fabricate-manager [data-count-id="environments"]').first().evaluate(element => {
          const rect = element.getBoundingClientRect();
          const strong = element.querySelector('strong');
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.replace(/\s+/g, ' ').trim(),
            strongText: strong?.textContent?.trim(),
            className: element.className,
            gridColumn: style.gridColumn,
            width: rect.width,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            strongTagName: strong?.tagName
          };
        });
        if (gatheringOffFact.text === 'Gathering environments Off') {
          if (gatheringOffFact.strongText !== 'Off' || gatheringOffFact.strongTagName !== 'STRONG') {
            throw new Error(`Manager gathering-off fact does not preserve Off emphasis: ${JSON.stringify(gatheringOffFact)}`);
          }
          if (!String(gatheringOffFact.className).includes('is-off')) {
            throw new Error(`Manager gathering-off fact should use the full-grid special case: ${JSON.stringify(gatheringOffFact)}`);
          }
        } else if (!/^\d+ Gathering environments$/.test(gatheringOffFact.text || '')) {
          throw new Error(`Manager gathering fact text is wrong: ${JSON.stringify(gatheringOffFact)}`);
        }
        if (gatheringOffFact.scrollWidth > gatheringOffFact.clientWidth + 2) {
          throw new Error(`Manager gathering-off fact overflows: ${JSON.stringify(gatheringOffFact)}`);
        }
        await assertManagerLayoutStable(page, 'normal selected gathering off');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-gathering-off');
        await closeOpenApplications(page);
        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, { features: { essences: true, gathering: true } });
        }, craftingSetup.systemId);
        await seedSmokeGatheringLibrary(page, craftingSetup);
        // Travel route (#257): seed a region and an enabled party BEFORE the manager opens so the
        // initial store refresh picks them up and the Travel route renders real content (a party
        // row plus a current-region override) instead of the empty setup-checklist state.
        await page.evaluate(async ({ sysId, crafterId, travelMemberId, sceneId, regionId }) => {
          const realmStore = game.fabricate.getGatheringRealmStore?.();
          const partyStore = game.fabricate.getGatheringPartyStore?.();
          if (!realmStore || !partyStore) {
            throw new Error('Gathering realm/party stores unavailable for Travel seeding.');
          }
          // Select the party actors by stable id (#816).
          const crafter = game.actors.get(crafterId);
          const travelMember = travelMemberId ? game.actors.get(travelMemberId) : null;
          if (!crafter) {
            throw new Error('No smoke-seeded gathering actor found for Travel seeding.');
          }
          // Travel & Realms is disabled by default (#286). Participation is a crafting system flag
          // since #1282 — the realm library itself is world scope — so this is a system write, not
          // a realm-store one.
          const systemManager = game.fabricate.getCraftingSystemManager?.();
          await systemManager?.updateSystem?.(sysId, { gatheringRealmSettings: { enabled: true } });
          for (const party of partyStore.list()) {
            await partyStore.delete(party.id);
          }
          const existingRealm = realmStore.list()
            .find(realm => realm.name === 'Northreach Vale');
          const realm = existingRealm
            || await realmStore.create({ name: 'Northreach Vale', enabled: true });
          const scene = game.scenes.get(sceneId);
          const sceneRegion = scene?.regions?.get(regionId);
          if (!scene || !sceneRegion) {
            throw new Error('Smoke Travel map Region fixture is unavailable.');
          }
          // ONE write (#1282): `setSceneRegionLink` strips the region from every realm and
          // attaches it to this one, so the old read-modify-write loop cannot lose an update.
          await realmStore.setSceneRegionLink(sceneRegion.uuid, realm.id, {
            sceneUuid: scene.uuid
          });
          const party = await partyStore.create({ name: 'The Vale Wardens' });
          await partyStore.addMember(party.id, crafter.uuid);
          if (travelMember) await partyStore.addMember(party.id, travelMember.uuid);
          await partyStore.setTravelActor(party.id, crafter.uuid);
          await partyStore.setEnabled(party.id, true);
          await partyStore.setCurrentRealmOverride(party.id, [realm.id]);

          // Realm-lock evidence (#294): a second realm the party is NOT in, plus an environment
          // that requires it.
          const environmentStore = game.fabricate.getGatheringEnvironmentStore?.();
          if (environmentStore) {
            const hiddenVale = realmStore.list().find(r => r.name === 'Hidden Vale')
              || await realmStore.create({ name: 'Hidden Vale', enabled: true });
            const existingEnvs = (typeof environmentStore.listBySystem === 'function')
              ? (environmentStore.listBySystem(sysId) || [])
              : [];
            const alreadySeeded = Array.isArray(existingEnvs)
              && existingEnvs.some(env => env?.name === 'Hidden Hollow');
            if (!alreadySeeded) {
              await environmentStore.create({
                craftingSystemId: sysId,
                name: 'Hidden Hollow',
                description: "Out of the party's current realm — locked until they travel there.",
                img: 'icons/environment/wilderness/mine-interior-dungeon-door.webp',
                enabled: true,
                selectionMode: 'targeted',
                sceneUuid: '',
                compositionMode: 'manual',
                enabledTaskIds: ['smoke-meadow-herbs'],
                includedRealmIds: [hiddenVale.id]
              });
            }
          }
        }, {
          sysId: craftingSetup.systemId,
          crafterId: cleanup.crafterId,
          travelMemberId: cleanup.travelMemberId,
          sceneId: craftingSetup.interactable.sceneId,
          regionId: craftingSetup.interactable.regionId
        });
        await activateSceneAndAwaitCanvasReady(page, craftingSetup.interactable.sceneId);
        await page.evaluate(async () => {
          globalThis.__fabricateSmokeManagerApp = (await game.fabricate.api.loadCraftingSystemManagerAppClass()).show();
        });
        await page.locator('.fabricate-manager').first().waitFor({ state: 'visible', timeout: 10_000 });
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator(`${managerSystemRowSelector(craftingSetup.systemId)} .manager-system-identity`).first().click();
        await settleManagerNav(page);
        await page.evaluate(async () => {
          await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
        });

        await setManagerWindowSize(page, { width: 1000, height: 700 });
        await assertManagerLayoutStable(page, 'stacked selected');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-selected-stacked');

        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await page.locator('.fabricate-manager .manager-nav-button[data-nav-system-edit]').first().click();
        await page.locator('.fabricate-manager[data-manager-view="system-edit"]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await exerciseManagerSystemEditPointerTargets(page, craftingSetup.systemId);
        if (await page.locator('.fabricate-manager[data-manager-view="system-edit"]').count() === 0) {
          throw new Error('Manager system Edit did not stay inside the v2 edit route.');
        }
        for (const selector of [
          '#manager-system-name',
          '#manager-system-description',
          // Recipe-resolution mode moved to the Crafting Settings section
          // (#511 Books & Scrolls); it is no longer a system-edit control.
          '[data-edit-control="advanced-options"]',
          '[data-feature-key="gathering"]'
        ]) {
          if (await page.locator(`.fabricate-manager ${selector}`).count() === 0) {
            throw new Error(`Manager system edit is missing required control: ${selector}`);
          }
        }
        await assertManagerLayoutStable(page, 'system edit normal');
        await assertNoScreenshotOverlays(page);
        // The pointer-target pass typed a name without saving, so the identity form is dirty (issue
        // 767 now lights an Unsaved chip).
        const systemNameField = page.locator('.fabricate-manager #manager-system-name').first();
        const saveDetailsButton = page
          .locator('.fabricate-manager .manager-edit-card-heading button[type="submit"]')
          .first();
        await saveDetailsButton.click();
        await page.waitForTimeout(400);
        // Scroll the optional-feature tiles fully into frame so the capture
        // shows the complete feature set (incl. the issue-714 time tile).
        const timeFeatureTile = page.locator('.fabricate-manager [data-feature-key="time"]').first();
        if (await timeFeatureTile.count() > 0) {
          await timeFeatureTile.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
        }
        await screenshot(page, 'manager-system-edit-normal');

        await setManagerWindowSize(page, { width: 900, height: 700 });
        await assertManagerLayoutStable(page, 'system edit narrow');
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-narrow');

        // --- Dirty identity form (issue 767) --- Type an un-saved name change so the identity form
        // is dirty, then frame the identity card so the lit "Unsaved" chip beside "Save details" is
        // captured.
        await setManagerWindowSize(page, { width: 1280, height: 820 });
        await systemNameField.fill('The Herbalist (unsaved edit)');
        await page
          .locator('.fabricate-manager [data-system-details-dirty]')
          .first()
          .waitFor({ state: 'visible', timeout: 5_000 });
        const identityHeading = page
          .locator('.fabricate-manager .manager-edit-card-heading')
          .first();
        await identityHeading.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-dirty');

        // Restore the persisted name so the identity form is clean again before the walk navigates
        // away — otherwise the new route-exit guard would raise a discard dialog and block the
        // remaining captures.
        await systemNameField.fill('The Herbalist');
        await page
          .locator('.fabricate-manager [data-system-details-dirty]')
          .first()
          .waitFor({ state: 'detached', timeout: 5_000 })
          .catch(() => {});

        // --- Settings-list ergonomics (issue 768) ---
        // The three lists no longer share a page. Currency Units left for its own World route in
        // issue 1278, and Modifiers and Character prerequisites followed in issue 1311, so this
        // walk navigates to World > Rules & Resources > Modifiers and captures the ergonomics
        // there: the shared IconPicker open on a modifier (icon-picker parity) and the row-level
        // copy button on a summary row.
        await setManagerWindowSize(page, { width: 1280, height: 980 });
        await page.locator('#manager-world-nav-rules').first().click();
        await page.locator('#manager-rules-nav-modifiers').first().click();
        const modifierCard = page.locator('.fabricate-manager [data-world-modifiers]').first();
        await modifierCard.waitFor({ state: 'visible', timeout: 5_000 });
        const modifierRows = modifierCard.locator('[data-world-modifier]');
        await modifierRows.nth(1).waitFor({ state: 'visible', timeout: 5_000 });
        const modifierRowCount = await modifierRows.count();
        if (modifierRowCount !== 2) {
          throw new Error(
            `System Settings modifier fixture expected 2 rendered rows, found ${modifierRowCount}.`
          );
        }
        await modifierCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(200);

        // Open the first modifier in edit mode and open its IconPicker so the icon
        // dropdown is visible (parity with Currency Units / Character Prerequisites).
        const firstModifierRow = modifierRows.first();
        await firstModifierRow.locator('[data-toggle-modifier]').first().click();
        await page.waitForTimeout(150);
        const modifierIconTrigger = firstModifierRow.locator('.essence-icon-picker-trigger').first();
        if (await modifierIconTrigger.count() > 0) {
          await modifierIconTrigger.click();
          await page.waitForTimeout(200);
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'manager-system-edit-lists');

        // Reset: close the editor, which also dismisses the IconPicker popover.
        const modifierDone = firstModifierRow
          .locator('.manager-character-modifier-editor button:has-text("Done")')
          .first();
        if (await modifierDone.count() > 0) {
          await modifierDone.click().catch(() => {});
          await page.waitForTimeout(150);
        }

        // --- World currency configuration (#393, rehomed by #1278, folded under Rules & Resources
        // by #1311) --- The ladder is world scope now, so this walks to World > Rules & Resources >
        // Currency rather than a crafting system's Settings tab, and needs no participation toggle
        // to get there: the page is ungated precisely so a GM can author the coins BEFORE any
        // system enables them.
        await setManagerWindowSize(page, { width: 1280, height: 900 });
        await page.locator('.fabricate-manager #manager-rules-nav-currency').first().click();
        await page.waitForTimeout(300);
        const currencyCard = page.locator('.fabricate-manager [data-world-currency-units]').first();
        await currencyCard.waitFor({ state: 'visible', timeout: 5_000 });
        const currencySeed = currencyCard.locator('button:has-text("Seed presets")').first();
        if (await currencySeed.count() > 0) {
          await currencySeed.click();
          await page.waitForTimeout(600);
          await page.evaluate(async () => {
            await globalThis.__fabricateSmokeManagerApp?._adminStore?.refresh?.();
          });
        }
        await currencyCard.locator('[data-world-currency-unit]').first().waitFor({ state: 'visible', timeout: 5_000 });
        // Scroll the Currency Units card to the top of the manager's scroll area, then capture
        // the WHOLE normal-sized GM window (nav rail, header, context panel + the card) so the
        // feature is shown in context rather than as a cropped element.
        const showCurrencyCard = async () => {
          await currencyCard.evaluate((el) => el.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(250);
          await assertNoScreenshotOverlays(page);
        };
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-property');

        // The spend strategy is the app's own option list (issue 1510), so `selectOption` — which
        // is Playwright's `<select>`-ONLY API and throws on anything else — is replaced by the
        // harness's own two-click drive.
        const currencyStrategy = page.locator('.fabricate-manager [data-world-currency-strategy-select]').first();
        await chooseSelectOption(page, currencyStrategy, { value: 'macro' });
        await page.locator('.fabricate-manager [data-world-currency-macros]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-macro');

        await chooseSelectOption(page, currencyStrategy, { value: 'actorInventory' });
        await page.locator('.fabricate-manager [data-world-currency-no-provider]').first().waitFor({ state: 'visible', timeout: 5_000 });
        await showCurrencyCard();
        await screenshot(page, 'currency-actor-inventory');

        // Leave the persisted world on the default strategy. The walk does not navigate back:
        // the next section opens its own manager route (`openManagerCraftingSection`).
        await chooseSelectOption(page, currencyStrategy, { value: 'actorProperty' });
        await page.waitForTimeout(300);

        await runScenarios(D0_SECTION_SCENARIOS, ctx);

        // On a scoped `screenshots` run the experimental-off milestone capture (which sets
        // d0RequiredCapturesComplete) may be skipped, so mark the D0 required captures complete
        // here: every targeted D0 section has run by this point, so a later transient renderer
        // teardown is the tolerable post-milestone class.
        if (SCREENSHOT_SCOPING_ACTIVE) {
          d0RequiredCapturesComplete = true;
        }

        await page.evaluate(async (sysId) => {
          const csm = game.fabricate.getCraftingSystemManager();
          await csm.updateSystem(sysId, {
            name: 'Arcane Forge',
            description: 'A mystical forge capable of transmuting raw materials into powerful artifacts.'
          });
          await game.settings.set('fabricate', 'lastManagedCraftingSystem', sysId);
        }, craftingSetup.systemId);
        await closeOpenApplications(page);
        results.steps.push({ step: 'screenshot-manager', passed: true });
        process.stdout.write('Phase D0 complete: Crafting System Manager screenshotted and hit-tested.\n');
      } catch (err) {
        // Issue #807: tolerate-or-fail.
        if (
          !shouldTolerateSmokeTeardown({
            message: err.message,
            pageClosed: page.isClosed?.(),
            requiredCapturesComplete: d0RequiredCapturesComplete
          })
        ) {
          results.steps.push({ step: 'screenshot-manager', passed: false, error: err.message });
        } else {
          // Post-milestone transient renderer/page teardown: the same infra class the Phase E
          // Journal step and the unhandledRejection guard already absorb.
          d0TeardownTolerated = true;
          results.steps.push({
            step: 'screenshot-manager',
            passed: true,
            skipped: true,
            error: TRANSIENT_TEARDOWN_SKIP_PREFIX + err.message
          });
          process.stderr.write(
            `Phase D0 manager walk skipped after a transient page teardown: ${err.message}\n`
          );
        }
      } finally {
        await page.evaluate(async (previous) => {
          await game.settings.set('fabricate', 'experimentalFeatures', previous === true);
        }, previousExperimentalFeatures).catch(() => {});
      }
      }

      // ── Phase E: Craft an item ──────────────────────────────────────────────
      startPhase('phase-E');
      // Issue #807: with the D0 rethrow removed, Phase E is now reachable after a tolerated D0
      // teardown. The shared app Phase E drives cannot open on a dead/torn-down page, so skip it.
      if (!shouldRunScreenshotPhase('phase-E')) {
        // Scoped `screenshots` run whose target set has no phase-E (player/craft/ journal) label.
        process.stdout.write('Phase E: skipped (screenshots scope has no phase-E labels).\n');
        results.steps.push({ step: 'craft-item-phase', passed: true, skipped: true });
      } else if (page.isClosed?.() || d0TeardownTolerated) {
        process.stdout.write('Phase E: skipped (renderer teardown tolerated in Phase D0).\n');
        results.steps.push({ step: 'craft-item-phase', passed: true, skipped: true });
      } else {
      process.stdout.write('Phase E: Crafting a Healing Potion...\n');
      try {
        // The "Craft Item" and "Gathering" sidebar actions both open one shared window
        // (#fabricate-app); "Craft Item" lands on the Crafting tab and "Gathering" focuses the same
        // window on the Gathering tab.
        process.stdout.write('  Opening shared Fabricate app via "Craft Item"...\n');
        await closeOpenApplications(page);
        const sidebarItemsTab = page.locator('#sidebar [data-tab="items"]').first();
        await sidebarItemsTab.click({ force: true });
        // The craft button is the readiness signal — it lives in the Items directory header, so it
        // can only be visible once that panel is active.
        const craftButton = page.locator('button[data-fabricate-action="craft"]').first();
        try {
          await craftButton.waitFor({ state: 'visible', timeout: 10_000 });
        } catch (waitError) {
          const blocker = await describeBlockingOverlay(page);
          if (blocker) {
            throw new Error(
              `The "Craft Item" sidebar action never became visible, and ${blocker} is on screen — ` +
                'a modal overlay intercepts the sidebar click even with force:true. ' +
                `Original error: ${waitError.message}`
            );
          }
          throw waitError;
        }
        await craftButton.evaluate(button => button.click());

        const appShell = page.locator('#fabricate-app').first();
        await appShell.waitFor({ state: 'visible', timeout: 10_000 });

        const navItems = appShell.locator('.fabricate-app-nav-item');
        await navItems.first().waitFor({ state: 'visible', timeout: 10_000 });

        // The shared actor-selection top bar mounts with the shell and flips [data-actor-bar-state]
        // from "loading" to "ready" once its selectable actor list and gathering conditions have
        // loaded.
        await appShell.locator('[data-actor-bar-state="ready"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        // Crafting/Gathering/Journal/Inventory are always present; the Alchemy
        // tab is conditional (shown only when an enabled alchemy system has recipes).
        for (const label of ['Crafting', 'Gathering', 'Journal', 'Inventory']) {
          if (await appShell.locator(`.fabricate-app-nav-item:has-text("${label}")`).count() === 0) {
            throw new Error(`Shared Fabricate app is missing the ${label} nav tab.`);
          }
        }
        if (await navItems.count() < 4) {
          throw new Error('Shared Fabricate app should expose at least the four base nav tabs.');
        }
        if (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count() === 0) {
          throw new Error('Shared Fabricate app did not open on the Crafting tab after "Craft Item".');
        }

        // "Gathering" focuses the SAME window and switches to the Gathering tab.
        const gatheringButton = page.locator('button[data-fabricate-action="gathering"]').first();
        await gatheringButton.waitFor({ state: 'visible', timeout: 10_000 });
        await gatheringButton.evaluate(button => button.click());

        if (await page.locator('#fabricate-app').count() !== 1) {
          throw new Error('"Gathering" opened a second window instead of focusing the shared Fabricate app.');
        }
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Gathering")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        if (await appShell.locator('.fabricate-app-nav-item.active:has-text("Crafting")').count() !== 0) {
          throw new Error('Shared Fabricate app did not switch off the Crafting tab after "Gathering".');
        }

        // The nav switch above only proves the Gathering tab is active; GatheringView then fires an
        // async services.listGatheringForActor() fetch and renders a [data-gathering-state]
        // container ("loading" -> "populated"/"empty"/"error").
        await appShell.locator('[data-gathering-state]:not([data-gathering-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });

        // The populated layout now fills the center column with the environment detail
        // (GatheringDetail).
        if (await appShell.locator('[data-gathering-state="populated"]').count() > 0) {
          await appShell.locator('[data-gathering-detail] [data-gathering-detail-state="selected"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });
        }

        await assertNoScreenshotOverlays(page);
        // Dedicated player Gathering tab evidence: the same populated/selected state, captured
        // under its own label so changes under src/ui/svelte/apps/gathering/ map to a real
        // screenshot (see the 'player-gathering' VIEW_RECIPE in ui-pr-screenshot-evidence.mjs).
        await screenshot(page, 'player-gathering-environments');
        await screenshot(page, 'fabricate-app-shell');

        // Dedicated player Inventory tab evidence: switch the shared window to the Inventory tab
        // and wait for its listing to settle off "loading" so the captured frame shows the resolved
        // owned-materials grid (or the empty / no-actor state) rather than the spinner.
        await appShell.locator('.fabricate-app-nav-item:has-text("Inventory")')
          .first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Inventory")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-state]:not([data-inventory-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        // A selectable item auto-selects, so when the grid is populated wait for
        // the detail panel to render before capturing (mirrors the gathering
        // detail wait), so the frame shows the sources / used-by panel.
        if (await appShell.locator('[data-inventory-state="populated"]').count() > 0) {
          await appShell.locator('[data-inventory-detail]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-inventory');

        // Dedicated player salvage evidence (issue 675) — the first player-facing salvage surface.
        const salvageSearch = appShell.locator('[data-inventory-filters] input').first();
        await salvageSearch.waitFor({ state: 'visible', timeout: 10_000 });
        await salvageSearch.fill('Smoke Cracked Amphora');
        await page.waitForTimeout(200);
        await appShell.locator('[data-inventory-card]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-card]').first().click();
        const salvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
        await salvageTab.waitFor({ state: 'visible', timeout: 10_000 });
        await salvageTab.click();
        await appShell.locator('[data-inventory-salvage-panel="progressive"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-progressive-stage-reorderable]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-salvage');

        // The second salvage frame: the no-check body — Smoke Relic's real shape, and the shape
        // most real worlds have (a simple-mode salvage with no authored check formula recovers its
        // materials outright, with every result tagged "Guaranteed").
        await salvageSearch.fill('Smoke Relic');
        await page.waitForTimeout(200);
        await appShell.locator('[data-inventory-card]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-card]').first().click();
        const relicSalvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
        await relicSalvageTab.waitFor({ state: 'visible', timeout: 10_000 });
        await relicSalvageTab.click();
        await appShell.locator('[data-inventory-salvage-body="no-check"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-salvage-no-check');

        // Issue 777: the pre-roll required-tools disclosure.
        await salvageSearch.fill('Smoke Toolchest');
        await page.waitForTimeout(200);
        await appShell.locator('[data-inventory-card]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-card]').first().click();
        const toolchestSalvageTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
        await toolchestSalvageTab.waitFor({ state: 'visible', timeout: 10_000 });
        await toolchestSalvageTab.click();
        await appShell.locator('[data-inventory-salvage-tools]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-salvage-tools');

        // Issue 766: one physical stack registered as a salvageable component in two crafting
        // systems (Smoke Air Shard, in the simple AND progressive forges) must render as a single
        // inventory card, its quantity counted once, carrying a System selector drop-down that
        // re-scopes the whole detail body.
        const collapseSearch = appShell.locator('[data-inventory-filters] input').first();
        await collapseSearch.waitFor({ state: 'visible', timeout: 10_000 });
        await collapseSearch.fill('Smoke Air Shard');
        await page.waitForTimeout(200);
        // Exactly ONE card for the multi-system stack — the collapse contract.
        await appShell.locator('[data-inventory-card]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-card]').first().click();
        // The multi-system selector drop-down is the visual proof of the collapse. The hook is
        // on the converted trigger, which is why this wait survived the conversion unchanged.
        await appShell.locator('[data-inventory-system-select]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-inventory-multi-system');

        // Issue 764: the GM-facing Simple-mode misconfigured salvage cue. A stored Simple config
        // with more than one success result group is invalid (the engine awards only the first).
        await page.evaluate(({ systemId, componentId }) => {
          const csm = game.fabricate.getCraftingSystemManager();
          const system = csm.getSystem(systemId);
          const component = system?.components?.find((c) => c.id === componentId);
          if (!component?.salvage) {
            throw new Error('issue 764 frame: Smoke Relic salvage not found for in-memory injection');
          }
          component.salvage.resultGroups.push({ id: 'smoke-relic-surplus-764', name: 'Surplus Parts', results: [] });
        }, { systemId: executionFixtures.simple.systemId, componentId: executionFixtures.simple.relicComponentId });

        // Tab out and back so InventoryView remounts and re-fetches the (now multi-group)
        // listing — each tab body is behind an {#if}, so switching unmounts and remounts it.
        await appShell.locator('.fabricate-app-nav-item:has-text("Gathering")').first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Gathering")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('.fabricate-app-nav-item:has-text("Inventory")').first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Inventory")').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-state]:not([data-inventory-state="loading"])').first()
          .waitFor({ state: 'visible', timeout: 10_000 });

        const misconfiguredSearch = appShell.locator('[data-inventory-filters] input').first();
        await misconfiguredSearch.waitFor({ state: 'visible', timeout: 10_000 });
        await misconfiguredSearch.fill('Smoke Relic');
        await page.waitForTimeout(200);
        await appShell.locator('[data-inventory-card]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-inventory-card]').first().click();
        const misconfiguredTab = appShell.locator('[data-inventory-detail-tab="salvage"]').first();
        await misconfiguredTab.waitFor({ state: 'visible', timeout: 10_000 });
        await misconfiguredTab.click();
        await appShell.locator('[data-inventory-salvage-body="misconfigured"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 });
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-salvage-misconfigured');

        // Restore Smoke Relic's healthy single-group salvage so nothing downstream inherits
        // the injected invalid config.
        await page.evaluate(({ systemId, componentId }) => {
          const csm = game.fabricate.getCraftingSystemManager();
          const system = csm.getSystem(systemId);
          const component = system?.components?.find((c) => c.id === componentId);
          if (component?.salvage) {
            component.salvage.resultGroups = component.salvage.resultGroups.filter(
              (g) => g.id !== 'smoke-relic-surplus-764'
            );
          }
        }, { systemId: executionFixtures.simple.systemId, componentId: executionFixtures.simple.relicComponentId });

        // Clear the search so the tab is left in its browsable state for any later
        // inventory work (and so a re-entry does not inherit this filter).
        await salvageSearch.fill('');
        await page.waitForTimeout(150);

        // Restore the Gathering tab (the tab active before this inventory capture): the downstream
        // steps operate on the Gathering view (selecting the 'Azure Grove' environment, etc.), so
        // re-activate it and wait for its listing to settle off "loading" before continuing.
        await appShell.locator('.fabricate-app-nav-item:has-text("Gathering")').first().click();
        await appShell.locator('.fabricate-app-nav-item.active:has-text("Gathering")')
          .first().waitFor({ state: 'visible', timeout: 10_000 });
        await appShell.locator('[data-gathering-state]:not([data-gathering-state="loading"])')
          .first().waitFor({ state: 'visible', timeout: 10_000 });

        async function clearGatheringEnvironmentSearch() {
          const search = appShell.locator('.gathering-env-search input').first();
          if (await search.count() === 0) return;
          await search.fill('');
          await page.waitForTimeout(150);
        }

        async function selectGatheringEnvironment(name) {
          const search = appShell.locator('.gathering-env-search input').first();
          if (await search.count() > 0) {
            await search.fill(name);
            await page.waitForTimeout(200);
          }
          const card = appShell.locator('.gathering-env-card[data-locked="false"]').filter({ hasText: name }).first();
          await card.waitFor({ state: 'visible', timeout: 10_000 });
          await card.click();
          await appShell.locator('[data-gathering-detail-state="selected"]').filter({ hasText: name }).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        async function selectGatheringTask(name) {
          const row = appShell.locator('.gathering-task-row').filter({ hasText: name }).first();
          await row.waitFor({ state: 'visible', timeout: 10_000 });
          await row.scrollIntoViewIfNeeded();
          await row.click();
          await appShell.locator('[data-gathering-task-detail]').filter({ hasText: name }).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await appShell.locator('[data-gathering-drops-state="ready"], [data-gathering-drops-state="loading"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await page.waitForTimeout(250);
        }

        async function waitForGatheringAttempt(blocked) {
          await appShell.locator(`[data-gathering-attempt][data-gathering-attempt-blocked="${blocked}"]`).first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        async function captureCurrentPlayerGathering(label) {
          await assertNoScreenshotOverlays(page);
          await screenshot(page, label);
        }

        async function captureSelectedGatheringTask({ environment, task, blocked, label }) {
          await selectGatheringEnvironment(environment);
          await selectGatheringTask(task);
          if (typeof blocked === 'boolean') {
            await waitForGatheringAttempt(blocked);
          }
          await captureCurrentPlayerGathering(label);
        }

        async function clickReadyGatheringAttempt() {
          await appShell.locator('[data-gathering-attempt][data-gathering-attempt-blocked="false"]').first().click();
          // An immediate (d100) attempt opens the interactive roll prompt: capture it and click
          // Roll.
          await handleRollPromptIfPresent(ctx, 'player-gathering-roll-prompt');
          await appShell.locator('[data-gathering-state="populated"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
        }

        // Documentation journey captures: exercise the user-visible gathering states the quickstart
        // and gathering docs discuss.
        if (RUN_FULL_ONLY_GATHERING_STATES) {
          await selectGatheringEnvironment('Azure Grove');
          await appShell.locator('[data-gathering-detail-tab="events"]').first().click();
          await appShell.locator('[data-gathering-event-section]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await captureCurrentPlayerGathering('player-gathering-events');
          await appShell.locator('[data-gathering-detail-tab="tasks"]').first().click();
          await appShell.locator('[data-gathering-tasks-section]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });

          await captureSelectedGatheringTask({
            environment: 'Verdant Meadow',
            task: 'Gather Meadow Herbs',
            blocked: false,
            label: 'player-gathering-task-ready'
          });
          await clickReadyGatheringAttempt();
          await captureSelectedGatheringTask({
            environment: 'Verdant Meadow',
            task: 'Gather Meadow Herbs',
            label: 'player-gathering-after-success'
          });
          await captureSelectedGatheringTask({
            environment: 'Crystal Thicket',
            task: 'Bottle Crystal Dew',
            blocked: true,
            label: 'player-gathering-tool-blocked'
          });
          await captureSelectedGatheringTask({
            environment: 'Timed Orchard',
            task: 'Tend Slow Bloom',
            blocked: false,
            label: 'player-gathering-timed-ready'
          });
          await clickReadyGatheringAttempt();
          await captureSelectedGatheringTask({
            environment: 'Timed Orchard',
            task: 'Tend Slow Bloom',
            blocked: true,
            label: 'player-gathering-timed-active'
          });

          await selectGatheringEnvironment('Moonlit Blind Grove');
          await appShell.locator('[data-gathering-blind-card]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });
          await captureCurrentPlayerGathering('player-gathering-blind');

          await clearGatheringEnvironmentSearch();
        }

        // Region-lock evidence (#294): the locked "Hidden Hollow" env sorts last, so page forward
        // until it appears, then capture it.
        const lockedEnvCard = appShell.locator('.gathering-env-card[data-locked="true"]');
        const envNextPage = appShell.locator('.gathering-env-list [data-pagination-next]');
        for (let i = 0; i < 6 && (await lockedEnvCard.count()) === 0 && (await envNextPage.count()) > 0; i++) {
          if (await envNextPage.isDisabled()) break;
          await envNextPage.click();
          await page.waitForTimeout(150);
        }
        if ((await lockedEnvCard.count()) > 0) {
          await lockedEnvCard.first().scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-gathering-realm-locked');
        }

        // Narrow-window stacked evidence (#330): shrink the Fabricate window below the gathering
        // grid's stacking breakpoint so the three columns reflow into a single vertical stack
        // instead of clipping the side columns.
        const envPrevPage = appShell.locator('.gathering-env-list [data-pagination-prev]');
        for (let i = 0; i < 6 && (await envPrevPage.count()) > 0; i++) {
          if (await envPrevPage.isDisabled()) break;
          await envPrevPage.click();
          await page.waitForTimeout(150);
        }
        // Drive the window below the gathering grid's stacking breakpoint. This simulates the
        // small-screen case from #330 where Foundry constrains the window to a viewport narrower
        // than the CSS floor.
        const stackedSize = await page.evaluate(() => {
          const app = document.querySelector('#fabricate-app');
          if (!app) return null;
          Object.assign(app.style, {
            minWidth: '0px',
            minHeight: '0px',
            width: '780px',
            height: '760px',
            left: '20px',
            top: '20px'
          });
          return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
        });
        // Let the resize + container-query reflow settle before capturing so the
        // frame shows the fully stacked single-column layout, not a mid-transition.
        await page.waitForTimeout(600);
        await appShell.locator('[data-gathering-state="populated"]')
          .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        await assertNoScreenshotOverlays(page);
        await screenshot(page, 'player-gathering-stacked');
        results.steps.push({ step: 'player-gathering-stacked', passed: true, size: stackedSize });

        // Switch the shared window to the Crafting tab and capture its states so changes under
        // src/ui/svelte/apps/crafting/ map to real screenshots (the 'player-crafting' VIEW_RECIPES
        // entry).
        if (RUN_SCREENSHOT_PHASES) {
        try {
          // Restore the window to a normal width before re-capturing the tab.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(300);

          await appShell.locator('.fabricate-app-nav-item:has-text("Crafting")').first().click();
          await appShell.locator('[data-crafting-state]:not([data-crafting-state="loading"])')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Best-effort: select the recipe whose detail renders the given mode, so the captured
          // frame matches the label when that mode is seeded.
          async function selectCraftingRecipeByMode(mode) {
            const rows = appShell.locator('[data-recipe-id]');
            const count = await rows.count().catch(() => 0);
            for (let i = 0; i < count; i++) {
              await rows.nth(i).locator('.crafting-recipe-row-main').click().catch(() => {});
              await page.waitForTimeout(150);
              if (await appShell.locator(`[data-recipe-detail-mode="${mode}"]`).count() > 0) break;
            }
          }

          async function selectCraftingRecipeByName(name) {
            const recipeSearch = appShell.locator('.crafting-browser-search input').first();
            await recipeSearch.fill(name);
            await page.waitForTimeout(350);
            const row = appShell.locator(`[data-recipe-id]:has-text("${name}")`).first();
            await row.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await row.locator('.crafting-recipe-row-main').click({ timeout: 5_000 });
            return { recipeSearch, row };
          }

          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-simple');

          await selectCraftingRecipeByMode('routedByIngredients');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-ingredient-routed');

          await selectCraftingRecipeByMode('routedByCheck');
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-routed-by-check');

          // Produce a run-summary frame: craft the selected recipe (when craftable)
          // so the right column swaps to the run summary, then capture it.
          const craftButton = appShell.locator('[data-crafting-craft][data-crafting-craft-disabled="false"]').first();
          if (await craftButton.count() > 0) {
            await craftButton.click().catch(() => {});
            // A UI craft now opens the interactive roll prompt: capture it, then
            // click Roll so the run summary resolves and the overlay clears.
            await handleRollPromptIfPresent(ctx, 'player-crafting-roll-prompt');
            await appShell.locator('[data-crafting-run-summary]').first()
              .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-run-summary');

          // Roll-result box evidence (issue #752 — evidence for #727's pill fix): the run summary
          // only renders when a craft recorded a roll result, and it embeds the RollResultBox
          // (awarded pills + outcome).
          try {
            const rollResultBox = appShell
              .locator('[data-crafting-run-summary] [data-recipe-section="roll-result"]')
              .first();
            await rollResultBox.waitFor({ state: 'visible', timeout: 10_000 });
            await rollResultBox.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-roll-result');
            results.steps.push({ step: 'player-crafting-roll-result', passed: true });
          } catch (rollResultError) {
            results.steps.push({
              step: 'player-crafting-roll-result',
              passed: false,
              error: String(rollResultError?.message ?? rollResultError)
            });
            process.stdout.write(`  Player Crafting roll-result capture skipped: ${rollResultError?.message ?? rollResultError}\n`);
          }

          // Multi-option ingredient selector evidence (issue #552): select the seeded 'Smoke Weave
          // Filigree' recipe, whose single ingredient group offers a held component or authored
          // essence, so the detail renders the IngredientOptionSelector "Alternatives" radiogroup
          // with two selectable rows.
          try {
            // The recipe list is paginated (12/page); filter to the multi-option
            // recipe via the browser search so its row is in the DOM regardless of
            // which page it would otherwise fall on.
            const recipeSearch = appShell.locator('.crafting-browser-search input').first();
            await recipeSearch.fill('Smoke Weave Filigree');
            await page.waitForTimeout(350);
            const altRecipeRow = appShell
              .locator('[data-recipe-id]:has-text("Smoke Weave Filigree")')
              .first();
            await altRecipeRow.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await altRecipeRow.locator('.crafting-recipe-row-main').click({ timeout: 5_000 });
            // Issue 917 re-point: `[data-recipe-section="alternatives"]` is no longer always
            // present.
            await appShell.locator('[data-recipe-section="requirement-rail"]').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            const altSlotTile = appShell
              .locator('[data-requirement-slot][data-slot-kind="choice"]').first();
            await ensureSlotOpen(altSlotTile).catch(() => {});
            const altSection = appShell.locator('[data-recipe-section="alternatives"]').first();
            await altSection.waitFor({ state: 'visible', timeout: 10_000 });
            // Pointer hit-test (issue 917): the slot tile is a new card-shaped `<button>`
            // whose whole 80px column is the control, layered under the rail's wrapping
            // flex row. happy-dom computes no cascade, so only a real frame can prove
            // Foundry's global button chrome is not swallowing the click.
            await assertPointerTarget(
              page,
              altSlotTile,
              '[data-requirement-slot]',
              'Requirement rail slot tile'
            );
            await appShell.locator('.crafting-alt-option').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-alternative');
            await screenshot(page, 'player-crafting-alternatives');

            // Nice-to-have "switched" variant: click the second alternative so the
            // selection tick moves, evidencing the player choosing the other option.
            const altOptions = appShell.locator('.crafting-alt-option');
            if (await altOptions.count() > 1) {
              await altOptions.nth(1).click({ timeout: 5_000 }).catch(() => {});
              await page.waitForTimeout(250);
              await assertNoScreenshotOverlays(page);
              await screenshot(page, 'player-crafting-alternatives-switched');
            }
            // Restore the unfiltered recipe list for the subsequent stacked frame.
            await recipeSearch.fill('').catch(() => {});
            await page.waitForTimeout(200);
            results.steps.push({ step: 'player-crafting-alternatives', passed: true });
          } catch (altError) {
            results.steps.push({
              step: 'player-crafting-alternatives',
              passed: false,
              error: String(altError?.message ?? altError)
            });
            process.stdout.write(`  Player Crafting alternatives capture skipped: ${altError?.message ?? altError}\n`);
          }

          try {
            const legacy = await selectCraftingRecipeByName('Smoke Legacy Essence Seal');
            await appShell.locator('[data-io-group="essences"] .crafting-io-essence-icon').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-legacy');
            await legacy.recipeSearch.fill('');

            const firstClass = await selectCraftingRecipeByName(
              'Smoke First-Class Essence Draught'
            );
            // Issue 917 re-point: a first-class essence requirement is no longer a separate essence
            // thumb inside the ingredient image grid — it is a rail slot whose glyph carries the
            // authored icon and colour token.
            await appShell
              .locator('[data-recipe-section="requirement-rail"] [data-slot-kind="essence"] [data-medallion]')
              .first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-ingredient');

            await firstClass.row.locator('.crafting-recipe-row-add').click({ timeout: 5_000 });
            // Issue 1506: the acquire card's essence row draws the shared art tile in its glyph
            // face.
            await appShell.locator('[data-shopping-acquire-components] [data-medallion="glyph"]').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-shopping');
            await firstClass.recipeSearch.fill('');
            results.steps.push({ step: 'player-crafting-essence-icons', passed: true });
          } catch (essenceIconError) {
            results.steps.push({
              step: 'player-crafting-essence-icons',
              passed: false,
              error: String(essenceIconError?.message ?? essenceIconError)
            });
          }

          // The redesign's own surfaces.
          try {
            // Set one carrier's allocation through its real stepper input rather than the store, so
            // what the frame shows is what a player's keystroke produces.
            const setCarrierUnits = async (carrierName, units) => {
              const input = appShell
                .locator(`[data-essence-carrier]:has-text("${carrierName}") [data-stepper-input]`)
                .first();
              await input.waitFor({ state: 'visible', timeout: 8_000 });
              await input.fill(String(units));
              await input.blur().catch(() => {});
              await page.waitForTimeout(300);
            };
            // `ensureSlotOpen` (issue 917): the essence slot's tile is a real disclosure, and focus
            // auto-advance already opens the rail's first unsatisfied openable slot — which is this
            // very essence slot in both recipes this helper is used against — the moment the recipe
            // is selected.
            const openEssencePool = async () => {
              await ensureSlotOpen(
                appShell.locator('[data-requirement-slot][data-slot-kind="essence"]').first()
              );
              await appShell.locator('[data-recipe-section="essence-pool"]').first()
                .waitFor({ state: 'visible', timeout: 10_000 });
            };
            const readMeters = () => page.evaluate(() =>
              Array.from(document.querySelectorAll('#fabricate-app [data-essence-meter]')).map((node) => ({
                essenceId: node.dataset.essenceMeter,
                state: node.dataset.essenceMeterState,
                ratio: String(node.querySelector('.essence-pool-meter-ratio')?.textContent ?? '').trim()
              }))
            );
            // Container-level wait: the rail's slot row, not a particular tile. An over-specific
            // wait that times out fails the whole phase and reads as an unrelated later breakage.
            const railSlots = appShell
              .locator('[data-recipe-section="requirement-rail"] [data-requirement-rail-slots]')
              .first();

            // (1) The rail's three states in ONE frame: a met fixed slot, an UNCHOSEN
            // choice slot in accent (a to-do, never danger — the state the two-state
            // predecessor could not express), and a zero-delivered essence slot in danger,
            // with exactly one chooser open beneath it.
            const railRecipe = await selectCraftingRecipeByName('Smoke Runestaff Binding');
            await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
            const railStates = await page.evaluate(() =>
              Array.from(document.querySelectorAll('#fabricate-app [data-requirement-slot]'))
                .map((node) => `${node.dataset.slotKind}:${node.dataset.slotState}`)
                .sort((a, b) => a.localeCompare(b))
            );
            const expectedRailStates = ['choice:partial', 'essence:short', 'fixed:met'];
            if (railStates.join('|') !== expectedRailStates.join('|')) {
              throw new Error(
                `Requirement rail states were ${JSON.stringify(railStates)}, expected ${JSON.stringify(expectedRailStates)}`
              );
            }
            const openChoosers = await appShell
              .locator('[data-recipe-section="alternatives"], [data-recipe-section="essence-pool"]')
              .count();
            if (openChoosers !== 1) {
              throw new Error(`Requirement rail had ${openChoosers} choosers open, expected exactly one`);
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-slot-rail');
            await railRecipe.recipeSearch.fill('');

            // (2) Acceptance criterion 5. Nothing in inventory carries the authored tag, so the
            // tile has no item image to borrow and must render its glyph — never Foundry's
            // `icons/svg/item-bag.svg`.
            const tagRecipe = await selectCraftingRecipeByName('Smoke Sigil Etching');
            await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
            const tagReport = await page.evaluate(() => {
              const rail = document.querySelector('#fabricate-app [data-recipe-section="requirement-rail"]');
              if (!rail) return null;
              return {
                slots: rail.querySelectorAll('[data-requirement-slot]').length,
                bagImages: Array.from(rail.querySelectorAll('img'))
                  .filter((img) => String(img.getAttribute('src') ?? '').includes('item-bag')).length,
                // Issue 1506: the fallback glyph is the shared art tile's glyph face.
                glyphTiles: rail.querySelectorAll('[data-medallion="glyph"]').length,
                openChoosers: document.querySelectorAll(
                  '#fabricate-app [data-recipe-section="alternatives"], #fabricate-app [data-recipe-section="essence-pool"]'
                ).length
              };
            });
            if (!tagReport) throw new Error('Tag-requirement rail did not render');
            if (tagReport.bagImages > 0) {
              throw new Error(`Unmatched tag tile still renders the item-bag SVG: ${JSON.stringify(tagReport)}`);
            }
            if (tagReport.glyphTiles < 1) {
              throw new Error(`Unmatched tag tile rendered no fallback glyph: ${JSON.stringify(tagReport)}`);
            }
            if (tagReport.openChoosers !== 0) {
              throw new Error(`An all-fixed rail opened a chooser: ${JSON.stringify(tagReport)}`);
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-tag-unmatched');
            await tagRecipe.recipeSearch.fill('');

            // (3) The pool at its simplest: one requirement, a partial allocation, exactly one
            // stepper left non-zero, and the "your selection" recap beneath it.
            const poolRecipe = await selectCraftingRecipeByName('Smoke First-Class Essence Draught');
            await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
            await openEssencePool();
            const poolWand = appShell.locator('[data-requirement-pick-for-me]').first();
            // Pointer hit-test (issue 917): a new card-shaped pill button in the rail's own
            // header row, which no mounted test can evaluate for stacking.
            await assertPointerTarget(page, poolWand, '[data-requirement-pick-for-me]', 'Requirement rail Pick for me');
            await poolWand.click({ timeout: 5_000 });
            await page.waitForTimeout(400);
            await setCarrierUnits('Smoke Tidebloom', 0);
            await setCarrierUnits('Smoke Starmote', 0);
            // Pointer hit-test (issue 917): the `+` adjunct is a 24px icon-only control nested in a
            // list row inside a panel that only exists while its slot is open — a new stacking
            // arrangement no mounted test can evaluate.
            await assertPointerTarget(
              page,
              appShell
                .locator('[data-essence-carrier]:has-text("Smoke Tidebloom") [data-stepper-increment]')
                .first(),
              '[data-stepper-increment]',
              'Essence pool carrier increment'
            );
            const singleMeters = await readMeters();
            if (singleMeters.length !== 1 || singleMeters[0].state !== 'partial') {
              throw new Error(`Single-requirement pool was ${JSON.stringify(singleMeters)}, expected one partial meter`);
            }
            const trimmedRows = await appShell.locator('[data-essence-picked]').count();
            if (trimmedRows !== 1) {
              throw new Error(`Pool recap listed ${trimmedRows} carriers, expected exactly the one still allocated`);
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-pool');

            // (4) "Pick for me", captured on the same recipe immediately after (3) so the pair
            // reads as a genuine before/after: one carrier funding 2 of 6, then the wand restoring
            // the resolver's full suggestion.
            await poolWand.click({ timeout: 5_000 });
            await page.waitForTimeout(400);
            const pickedRows = await appShell.locator('[data-essence-picked]').count();
            if (pickedRows <= trimmedRows) {
              throw new Error(
                `Pick for me left ${pickedRows} allocated carriers, no more than the ${trimmedRows} before it`
              );
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-pick-for-me');
            await poolRecipe.recipeSearch.fill('');

            // (5) The D-ESS proof.
            const sharedRecipe = await selectCraftingRecipeByName('Smoke Tidecore Tempering');
            await railSlots.waitFor({ state: 'visible', timeout: 10_000 });
            await openEssencePool();
            await setCarrierUnits('Smoke Starmote', 1);
            await setCarrierUnits('Smoke Duskcrystal', 1);
            await setCarrierUnits('Smoke Starmote', 0);
            const sharedMeters = await readMeters();
            const sharedStates = sharedMeters
              .map((meter) => meter.state)
              .sort((a, b) => a.localeCompare(b))
              .join('|');
            if (sharedMeters.length !== 2 || sharedStates !== 'met|partial') {
              throw new Error(
                `Shared pool was ${JSON.stringify(sharedMeters)}, expected one met and one part-delivered meter`
              );
            }
            // Issue 917 re-point: the chip's class is `.essence-contribution`
            // (`EssenceContribution.svelte`) — `.essence-pool-contribution` never existed and
            // always counted zero.
            const duskContributions = await appShell
              .locator('[data-essence-carrier]:has-text("Smoke Duskcrystal") .essence-contribution')
              .count();
            if (duskContributions < 2) {
              throw new Error(
                `Dual carrier showed ${duskContributions} contribution chips, expected one per essence it funds`
              );
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-essence-pool-shared');

            // (6) The same recipe and the same essence allocation, framed on the consumption plan:
            // a fixed row (the runeplate the craft spends) and an essence-carrier row (one entry
            // per item key however many requirements that item funds), plus the "still to choose"
            // line.
            const planPanel = appShell.locator('[data-recipe-section="consumption-plan"]').first();
            await planPanel.waitFor({ state: 'visible', timeout: 10_000 });
            await planPanel.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            const planReport = await page.evaluate(() => {
              const panel = document.querySelector('#fabricate-app [data-recipe-section="consumption-plan"]');
              if (!panel) return null;
              return {
                rows: panel.querySelectorAll('[data-consumption-row]').length,
                carrierRows: panel.querySelectorAll('[data-consumption-row^="carrier:"]').length,
                pending: String(panel.querySelector('[data-consumption-pending]')?.textContent ?? '')
                  .replace(/\s+/g, ' ').trim()
              };
            });
            if (!planReport) throw new Error('Consumption plan panel did not render');
            if (planReport.rows < 2 || planReport.carrierRows < 1) {
              throw new Error(`Consumption plan showed ${JSON.stringify(planReport)}, expected a fixed row and a carrier row`);
            }
            if (planReport.pending.length === 0) {
              throw new Error('Consumption plan showed no "still to choose" line for the unsettled requirement');
            }
            // The tile's own name is the chosen option's name, not the authored group name —
            // `_resolveGroupDescription`/`_resolveIngredientVisual` in `RecipeManager.js` report
            // the option (here 'Smoke Anvil', the default pick among the unaffordable pair), never
            // the group label ('Fitting').
            if (!planReport.pending.includes('Smoke Anvil')) {
              throw new Error(`Consumption plan pending line did not name the unchosen Fitting requirement's option: ${JSON.stringify(planReport)}`);
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-consumption-plan');

            await sharedRecipe.recipeSearch.fill('');
            await page.waitForTimeout(200);
            results.steps.push({
              step: 'player-crafting-requirement-rail',
              passed: true,
              railStates,
              tagReport,
              singleMeters,
              trimmedRows,
              pickedRows,
              sharedMeters,
              planReport
            });
          } catch (railError) {
            results.steps.push({
              step: 'player-crafting-requirement-rail',
              passed: false,
              error: String(railError?.message ?? railError)
            });
            process.stdout.write(`  Player Crafting requirement-rail capture failed: ${railError?.message ?? railError}\n`);
          }

          // Select the seeded 'Smoke Raise Tent' recipe (a simple-mode recipe whose sets live on
          // steps[]).
          try {
            const recipeSearch = appShell.locator('.crafting-browser-search input').first();
            await recipeSearch.fill('Smoke Raise Tent');
            await page.waitForTimeout(350);
            const tentRow = appShell
              .locator('[data-recipe-id]:has-text("Smoke Raise Tent")')
              .first();
            await tentRow.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await tentRow.locator('.crafting-recipe-row-main').click({ timeout: 5_000 });
            // Wait for the ordered step list (a stable section marker, not leaf content).
            await appShell.locator('[data-recipe-section="steps"]').first()
              .waitFor({ state: 'visible', timeout: 10_000 });
            const stepBlocks = await appShell.locator('[data-recipe-section="steps"] [data-recipe-step]').count();
            const hasHint = await appShell.locator('[data-recipe-section="steps-hint"]').count();
            const hasCheck = await appShell.locator('[data-recipe-section="check"]').count();
            const totalDuration = String(
              await appShell.locator('[data-recipe-duration][data-recipe-duration-kind="total"]')
                .first().textContent()
            ).replace(/\s+/g, ' ').trim();
            const stepDurationLabels = await appShell
              .locator('[data-recipe-section="steps"] [data-recipe-step]')
              .evaluateAll((steps) =>
                steps.map((step) =>
                  String(step.querySelector('[data-recipe-step-duration]')?.textContent ?? '')
                    .replace(/\s+/g, ' ')
                    .trim()
                )
              );
            if (
              totalDuration !== 'Total duration: 1 hr 30 min' ||
              stepDurationLabels[0] !== '30 min' ||
              stepDurationLabels[1] !== '1 hr'
            ) {
              throw new Error(
                `Unexpected multi-step durations: total="${totalDuration}", steps=${JSON.stringify(stepDurationLabels)}`
              );
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-multistep');
            // Restore the unfiltered recipe list for the subsequent frames.
            await recipeSearch.fill('').catch(() => {});
            await page.waitForTimeout(200);
            results.steps.push({
              step: 'player-crafting-multistep',
              passed: stepBlocks >= 2 && hasHint > 0 && hasCheck === 0,
              stepBlocks,
              hasHint: hasHint > 0,
              checkCardShown: hasCheck > 0,
              totalDuration,
              stepDurationLabels
            });
          } catch (multiStepError) {
            results.steps.push({
              step: 'player-crafting-multistep',
              passed: false,
              error: String(multiStepError?.message ?? multiStepError)
            });
            process.stdout.write(`  Player Crafting multi-step capture skipped: ${multiStepError?.message ?? multiStepError}\n`);
          }

          // The change's main new player surface.
          try {
            const recipeSearch = appShell.locator('.crafting-browser-search input').first();
            const selectRecipeByName = async (name) => {
              await recipeSearch.fill(name);
              await page.waitForTimeout(350);
              const row = appShell.locator(`[data-recipe-id]:has-text("${name}")`).first();
              await row.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
              await row.locator('.crafting-recipe-row-main').click({ timeout: 5_000 });
              await appShell.locator('[data-recipe-section="progressive-stages"]').first()
                .waitFor({ state: 'visible', timeout: 10_000 });
            };

            // (1) Flag ON — the default. Settles the chevron box: the buttons render
            // whether or not anything has moved, so the reset is checkable at rest.
            await selectRecipeByName('Smoke Mold Brick');
            await assertProgressiveStageListSound(page, 'player-crafting-progressive');
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-progressive');

            // (2) Reordered.
            const moveDown = appShell.locator('[data-progressive-stage-move-down]').first();
            await moveDown.click({ timeout: 5_000 });
            await page.waitForTimeout(250);
            const reordered = await assertProgressiveStageListSound(
              page,
              'player-crafting-progressive-reordered',
              { expectAnnouncement: true }
            );
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-progressive-reordered');
            results.steps.push({
              step: 'player-crafting-progressive-reordered',
              passed: true,
              thresholds: reordered.thresholds,
              announcement: reordered.region?.text ?? ''
            });

            // (3) Flag OFF (D13): no grips, no move buttons, ordinals + difficulty kept,
            // and the muted "Order set by the GM" line. Default-true means an explicit
            // false has to be authored to reach this state at all.
            await selectRecipeByName('Smoke Kiln Firing');
            const fixedReport = await page.evaluate(() => ({
              rows: document.querySelectorAll('[data-progressive-stage-fixed]').length,
              grips: document.querySelectorAll('.crafting-stage-handle').length,
              moves: document.querySelectorAll('[data-progressive-stage-move]').length,
              ordinals: document.querySelectorAll('[data-progressive-stage-ordinal]').length,
              difficulties: document.querySelectorAll('[data-progressive-stage-difficulty]').length,
              note: document.querySelector('[data-progressive-stage-fixed-note]')?.textContent?.trim() ?? '',
              liveRegions: document.querySelectorAll('[data-progressive-stage-status]').length
            }));
            if (fixedReport.rows < 3) throw new Error(`fixed state rendered ${fixedReport.rows} rows`);
            if (fixedReport.grips > 0 || fixedReport.moves > 0) {
              throw new Error(`fixed state still offers reorder affordances: ${JSON.stringify(fixedReport)}`);
            }
            if (fixedReport.ordinals < 3 || fixedReport.difficulties < 3) {
              throw new Error(`fixed state dropped ordinals/difficulty: ${JSON.stringify(fixedReport)}`);
            }
            if (fixedReport.note.length === 0) throw new Error('fixed state shows no "order set by the GM" line');
            if (fixedReport.liveRegions > 0) throw new Error('fixed state renders a live region for an order that cannot change');
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-progressive-fixed');
            results.steps.push({ step: 'player-crafting-progressive-fixed', passed: true, ...fixedReport });

            // (4) Narrow: the long component name must ellipse while the difficulty and
            // "Reached at >=N" chips survive and the chevrons stay on-row.
            await selectRecipeByName('Smoke Mold Brick');
            const progressiveStackedSize = await page.evaluate(() => {
              const app = document.querySelector('#fabricate-app');
              if (!app) return null;
              Object.assign(app.style, { minWidth: '0px', minHeight: '0px', width: '780px', height: '760px', left: '20px', top: '20px' });
              return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
            });
            await page.waitForTimeout(600);
            const narrow = await assertProgressiveStageListSound(page, 'player-crafting-progressive-stacked');
            const narrowChips = await page.evaluate(() => {
              const visible = (selector) => Array.from(document.querySelectorAll(selector))
                .filter((node) => node.getBoundingClientRect().width > 1).length;
              const names = Array.from(document.querySelectorAll('.crafting-stage-name'));
              return {
                difficulties: visible('[data-progressive-stage-difficulty]'),
                thresholds: visible('[data-progressive-stage-threshold]'),
                ellipsed: names.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
                rowOverflow: Array.from(document.querySelectorAll('.crafting-stage-row'))
                  .filter((row) => row.scrollWidth > row.clientWidth + 2).length
              };
            });
            if (narrowChips.difficulties < 3 || narrowChips.thresholds < 3) {
              throw new Error(`narrow layout squeezed out the chips: ${JSON.stringify(narrowChips)}`);
            }
            if (narrowChips.rowOverflow > 0) {
              throw new Error(`narrow layout overflows the row (chevrons pushed off): ${JSON.stringify(narrowChips)}`);
            }
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'player-crafting-progressive-stacked');
            results.steps.push({
              step: 'player-crafting-progressive-stacked',
              passed: true,
              size: progressiveStackedSize,
              thresholds: narrow.thresholds,
              ...narrowChips
            });

            // Restore width + the unfiltered list for the frames that follow.
            await page.evaluate(() => {
              const app = document.querySelector('#fabricate-app');
              if (app) Object.assign(app.style, { width: '1100px', height: '760px', left: '40px', top: '40px' });
            });
            await recipeSearch.fill('').catch(() => {});
            await page.waitForTimeout(300);
            results.steps.push({ step: 'player-crafting-progressive', passed: true });
          } catch (progressiveError) {
            results.steps.push({
              step: 'player-crafting-progressive',
              passed: false,
              error: String(progressiveError?.message ?? progressiveError)
            });
            process.stdout.write(`  Player Crafting progressive capture failed: ${progressiveError?.message ?? progressiveError}\n`);
          }

          // Narrow-window stacked evidence: shrink below the grid's 900px stacking
          // breakpoint so the three columns reflow into a single vertical stack.
          const craftingStackedSize = await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return null;
            Object.assign(app.style, { minWidth: '0px', minHeight: '0px', width: '780px', height: '760px', left: '20px', top: '20px' });
            return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
          });
          await page.waitForTimeout(600);
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-crafting-stacked');
          results.steps.push({ step: 'player-crafting-stacked', passed: true, size: craftingStackedSize });
        } catch (craftingTabError) {
          results.steps.push({ step: 'player-crafting', passed: false, error: String(craftingTabError?.message ?? craftingTabError) });
          process.stdout.write(`  Player Crafting tab capture skipped: ${craftingTabError?.message ?? craftingTabError}\n`);
        }
        }

        // The Alchemy tab is conditional — shown only when an enabled alchemy system has recipes
        // (seeded above under RUN_SCREENSHOT_PHASES).
        if (RUN_SCREENSHOT_PHASES) {
        try {
          if (await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').count() === 0) {
            throw new Error('Alchemy tab is not present (alchemy fixtures may not have seeded).');
          }
          // Restore the window to a normal width — the crafting-stacked capture
          // above shrank it — before capturing the alchemy chooser/workbench.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { minWidth: '', minHeight: '', width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(300);

          // The alchemy listing resolves its actor from the shared top-bar selection, and the
          // no-actor state precedes the chooser in AlchemyView.
          await appShell.locator('[data-actor-bar-state="ready"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

          await appShell.locator('.fabricate-app-nav-item:has-text("Alchemy")').first().click();
          await appShell.locator('.fabricate-app-nav-item.active:has-text("Alchemy")')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Let the view settle out of its loading state.
          await appShell
            .locator('#fabricate-app [data-alchemy-state]:not([data-alchemy-state="loading"]), #fabricate-app .alchemy-chooser')
            .first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          const alchemyChooser = appShell.locator('.alchemy-chooser').first();
          if (!(await alchemyChooser.isVisible().catch(() => false))) {
            const switchDiscipline = appShell.locator('[data-alchemy-switch]').first();
            if (await switchDiscipline.count() > 0) {
              await switchDiscipline.click().catch(() => {});
            }
          }
          await alchemyChooser.waitFor({ state: 'visible', timeout: 12_000 });
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-chooser');

          // Enter a discipline (prefer the Bubbling Cauldron, whose components the
          // crafter owns) → the three-column workbench.
          const cauldronCard = appShell
            .locator(`[data-alchemy-chooser-card="${alchemyFixtures?.cauldronSystemId ?? ''}"]`).first();
          if (await cauldronCard.count() > 0) {
            await cauldronCard.click();
          } else {
            await appShell.locator('[data-alchemy-chooser-card]').first().click();
          }
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 });

          // Populate the bench: place the first available owned component so the
          // workbench frame shows chips + a signature rather than the empty bench.
          const firstAvailableComponent = appShell
            .locator('[data-alchemy-inventory-row]:not([disabled])').first();
          if (await firstAvailableComponent.count() > 0) {
            await firstAvailableComponent.click().catch(() => {});
            await page.waitForTimeout(200);
          }
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-workbench');

          // Narrow-window stacked evidence: shrink below the alchemy grid's 900px
          // container-query breakpoint so the three columns reflow into a single
          // vertical stack (workbench leading).
          const alchemyStackedSize = await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return null;
            Object.assign(app.style, { minWidth: '0px', minHeight: '0px', width: '780px', height: '760px', left: '20px', top: '20px' });
            return { width: app.getBoundingClientRect().width, height: app.getBoundingClientRect().height };
          });
          await page.waitForTimeout(600);
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'player-alchemy-stacked');

          // Restore a normal width, then capture the workbench under every theme.
          await page.evaluate(() => {
            const app = document.querySelector('#fabricate-app');
            if (!app) return;
            Object.assign(app.style, { minWidth: '', minHeight: '', width: '1100px', height: '760px', left: '40px', top: '40px' });
          });
          await page.waitForTimeout(400);
          await appShell.locator('[data-alchemy-state="workbench"]').first()
            .waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
          await captureAlchemyThemes(ctx);

          results.steps.push({ step: 'player-alchemy', passed: true, size: alchemyStackedSize });
        } catch (alchemyTabError) {
          results.steps.push({ step: 'player-alchemy', passed: false, error: String(alchemyTabError?.message ?? alchemyTabError) });
          process.stdout.write(`  Player Alchemy tab capture skipped: ${alchemyTabError?.message ?? alchemyTabError}\n`);
        }
        }

        await closeOpenApplications(page);
        results.steps.push({ step: 'open-fabricate-app-shell', passed: true });
        process.stdout.write('  Shared Fabricate app shell verified and screenshotted.\n');

        // Attempt to craft via the API
        process.stdout.write('  Executing craft: Brew Healing Potion...\n');
        const craftResult = await page.evaluate(async ({ recipeId, crafterId }) => {
          const crafter = game.actors.get(crafterId);
          if (!crafter) throw new Error(`Actor ${crafterId} not found`);

          console.log(`Crafting with ${crafter.name} (${crafter.id}), ${crafter.items.size} items in inventory`);
          const vialCopies = crafter.items.contents.filter((item) => item.name === 'Empty Vial');
          if (vialCopies.length < 2) {
            throw new Error(
              `Brew Healing Potion fixture retained ${vialCopies.length} Empty Vial copies; `
              + 'the attempt requires distinct ingredient and Tool documents'
            );
          }

          const rm = game.fabricate.getRecipeManager();
          const recipe = rm.getRecipe(recipeId);
          if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

          const result = await game.fabricate.craft(crafter, recipe, {
            componentSourceActors: [crafter]
          });

          // Check the crafter's inventory for the Healing Potion
          const potionInInventory = crafter.items.contents.some(i => i.name === 'Healing Potion');

          return {
            success: result.success,
            message: result.message,
            potionInInventory
          };
        }, { recipeId: craftingSetup.healingPotionRecipeId, crafterId: cleanup.crafterId });

        if (!craftResult.success) {
          process.stderr.write(`Craft returned failure: ${craftResult.message}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: false, error: craftResult.message });
        } else {
          process.stdout.write(`Craft succeeded: ${craftResult.message}\n`);
          process.stdout.write(`Healing Potion in inventory: ${craftResult.potionInInventory}\n`);
          results.steps.push({ step: 'craft-healing-potion', passed: true });
        }

        // Wait for the Healing Potion to actually appear in the crafter's inventory
        // before screenshotting. Catches missing-craft regressions that a
        // fixed sleep would mask. Replaces a 1 s fixed sleep.
        if (craftResult.success) {
          await page.waitForFunction((crafterId) => {
            const crafter = game.actors.get(crafterId);
            return crafter?.items?.contents?.some(i => i.name === 'Healing Potion') === true;
          }, cleanup.crafterId, { timeout: 10_000 }).catch(() => { /* surface via post-craft step state */ });
        }
        await screenshot(page, 'post-craft');
        process.stdout.write('  Screenshotted post-craft state.\n');

        // Chat card evidence (issue #752 — evidence for #727's roll-total fix): the API craft above
        // posts a crafting result card to chat.
        if (RUN_SCREENSHOT_PHASES) {
          try {
            await page.locator('#sidebar [data-tab="chat"]').first().click({ force: true }).catch(() => {});
            const craftChatCard = page.locator('#sidebar .fabricate-craft-chat').last();
            await craftChatCard.waitFor({ state: 'visible', timeout: 10_000 });
            await craftChatCard.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
            await page.waitForTimeout(200);
            const sidebarClip = await page.locator('#sidebar').first().boundingBox();
            await screenshot(page, 'chat-craft-card', sidebarClip ? { clip: sidebarClip } : {});
            process.stdout.write('  Screenshotted the crafting chat card.\n');
            results.steps.push({ step: 'chat-craft-card', passed: true });
          } catch (chatCardError) {
            results.steps.push({
              step: 'chat-craft-card',
              passed: false,
              error: String(chatCardError?.message ?? chatCardError)
            });
            process.stderr.write(`Chat craft card capture failed: ${chatCardError?.message ?? chatCardError}\n`);
          }
        }

        // Open the crafter's sheet to show the crafted item (inventory tab)
        process.stdout.write('  Opening the crafter\'s inventory to verify crafted item...\n');
        await page.evaluate(async (crafterId) => {
          const crafter = game.actors.get(crafterId);
          if (crafter) await crafter.sheet.render(true);
        }, cleanup.crafterId);
        // Wait for the actor sheet to render (replaces a 1.5 s fixed sleep).
        await page.locator('.actor.sheet, .actor-sheet, .actor.window-app, [data-application-part="primary"]').first()
          .waitFor({ state: 'visible', timeout: 10_000 })
          .catch(() => { /* sheet selectors vary by V13 sheet — tab change tolerates absence */ });
        // Navigate to inventory tab via Foundry API
        await page.evaluate((id) => {
          const actor = game.actors.get(id);
          const sheet = actor?.sheet;
          if (typeof sheet?.changeTab === 'function') {
            sheet.changeTab('inventory', 'primary');
          } else if (typeof sheet?.activateTab === 'function') {
            sheet.activateTab('inventory');
          }
        }, cleanup.crafterId);
        await page.waitForTimeout(500);
        await screenshot(page, 'crafter-post-craft-inventory');
        process.stdout.write('  Screenshotted the crafter\'s post-craft inventory.\n');

        // Close the sheet
        await page.evaluate((crafterId) => {
          const crafter = game.actors.get(crafterId);
          if (crafter) crafter.sheet.close();
        }, cleanup.crafterId);

        // Cheap API crafts, tool breakages, salvage, negative gating, and one guaranteed-success
        // gather — no screenshots, so they run in every profile.
        if (executionFixtures) {
          process.stdout.write('  Running craft-execution coverage asserts (#489)...\n');
          const execSteps = await runCraftExecutionAsserts(page, executionFixtures, cleanup.crafterId);
          for (const step of execSteps) {
            results.steps.push(step);
            process.stdout.write(`    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`);
          }

          // Full-profile-only gather assertions: the 0%-drop ("empty") and
          // scene-blocked gathers, plus the hazardous "Bramble Snare" event
          // firing — all rely on fixtures seeded only under RUN_SCREENSHOT_PHASES.
          if (RUN_FULL_ONLY_GATHERING_STATES) {
            process.stdout.write('  Running full-profile gather asserts (#489)...\n');
            const gatherSteps = await runFullProfileGatherAsserts(
              page, craftingSetup, executionFixtures.hazard, cleanup.crafterId
            );
            for (const step of gatherSteps) {
              results.steps.push(step);
              process.stdout.write(`    ${step.passed ? 'PASS' : 'FAIL'} ${step.step}${step.error ? `: ${step.error}` : ''}\n`);
            }
          }
        } else {
          process.stdout.write('  Skipping #489 execution asserts: fixtures not seeded.\n');
          results.steps.push({ step: 'exec-coverage', passed: false, error: 'Execution fixtures not seeded' });
        }

        // The Phase E craft above produced at least one terminal crafting run for the crafter, so
        // the player Journal screen has a populated, selectable run to render.
        const JOURNAL_CAPTURE_ATTEMPTS = 3;
        const captureJournalScreen = async () => {
          await closeOpenApplications(page);
          // Ensure the crafter (the actor that owns the terminal run) is the persisted bar
          // selection so the Journal lists its runs even though the harness runs as GM.
          await page.evaluate(async (crafterId) => {
            await game.fabricate.setSelectedGatheringActorId(crafterId);
          }, cleanup.crafterId);

          // Re-open the shared Fabricate app via the same "Craft Item" sidebar
          // action used earlier in this phase.
          const journalItemsTab = page.locator('#sidebar [data-tab="items"]').first();
          await journalItemsTab.click({ force: true });
          const journalCraftButton = page.locator('button[data-fabricate-action="craft"]').first();
          await journalCraftButton.waitFor({ state: 'visible', timeout: 10_000 });
          await journalCraftButton.evaluate(button => button.click());

          await appShell.waitFor({ state: 'visible', timeout: 10_000 });
          await appShell.locator('[data-actor-bar-state="ready"]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // Switch to the Journal tab (click via .evaluate to bypass any overlay,
          // matching the sidebar-action pattern above) and wait for it to activate.
          await appShell.locator('.fabricate-app-nav-item:has-text("Journal")')
            .first().evaluate(el => el.click());
          await appShell.locator('.fabricate-app-nav-item.active:has-text("Journal")')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          // JournalView mounts and fires an async listJournalForActor() fetch, rendering a
          // [data-journal-state] container ("loading" -> "populated"/ "empty"/"error").
          await appShell.locator('[data-journal-state]:not([data-journal-state="loading"])')
            .first().waitFor({ state: 'visible', timeout: 15_000 });
          await appShell.locator('[data-journal-state="populated"]')
            .first().waitFor({ state: 'visible', timeout: 15_000 });

          // Render the centre detail for a concrete run: prefer an active run card, else the first
          // terminal history row.
          const journalActiveCard = appShell.locator('.journal-run-card[data-run-id]').first();
          if (await journalActiveCard.count() > 0) {
            await journalActiveCard.click();
          } else {
            const journalHistoryRow = appShell.locator('.journal-history-row [data-history-run-id]').first();
            if (await journalHistoryRow.count() > 0) {
              await journalHistoryRow.scrollIntoViewIfNeeded();
              await journalHistoryRow.click();
            }
          }
          await appShell.locator('[data-journal-detail][data-run-key]')
            .first().waitFor({ state: 'visible', timeout: 10_000 });

          await assertNoScreenshotOverlays(page);
          await screenshot(page, 'fabricate-journal');

          // Phase E guarantees a terminal craft; capture its historical account after the
          // general Journal frame so selecting it cannot disturb that frame's selection.
          if (RUN_SCREENSHOT_PHASES) {
            const historyRows = appShell.locator('.journal-history-row [data-history-run-id]');
            const historyCount = await historyRows.count();
            let craftingRunSelected = false;
            for (let i = 0; i < historyCount; i += 1) {
              await historyRows.nth(i).scrollIntoViewIfNeeded().catch(() => {});
              await historyRows.nth(i).click().catch(() => {});
              const selectedCraftingRun = await appShell
                .locator(String.raw`[data-journal-detail][data-run-key*="\"crafting\""]`)
                .first()
                .waitFor({ state: 'visible', timeout: 5_000 })
                .then(() => true)
                .catch(() => false);
              if (selectedCraftingRun) {
                craftingRunSelected = true;
                break;
              }
            }
            if (!craftingRunSelected) {
              throw new Error('Journal history had no crafting run to show its historical account.');
            }
            // Every profile reaching this capture requires the selected run's historical account.
            await appShell.locator('[data-journal-detail] [data-journal-history-detail]')
              .first().waitFor({ state: 'visible', timeout: 5_000 });
            await assertNoScreenshotOverlays(page);
            await screenshot(page, 'fabricate-journal-craft-detail');
          }
        };
        let journalErr = null;
        for (let attempt = 1; attempt <= JOURNAL_CAPTURE_ATTEMPTS; attempt += 1) {
          try {
            process.stdout.write(
              `  Capturing the player Journal screen (attempt ${attempt}/${JOURNAL_CAPTURE_ATTEMPTS})...\n`
            );
            await captureJournalScreen();
            journalErr = null;
            break;
          } catch (attemptErr) {
            journalErr = attemptErr;
            process.stderr.write(
              `Player Journal capture attempt ${attempt} failed: ${attemptErr.message}\n`
            );
            // A torn-down page cannot be recovered within this run — stop retrying.
            if (page.isClosed?.() || isTransientPageTeardown(attemptErr.message)) break;
            // Live-page hiccup (navigation/timing): reset and retry.
            if (attempt < JOURNAL_CAPTURE_ATTEMPTS) {
              try {
                await closeOpenApplications(page);
              } catch {
                /* ignore reset failure; the next attempt re-opens the app */
              }
            }
          }
        }
        if (!journalErr) {
          results.steps.push({ step: 'player-journal', passed: true });
          process.stdout.write('  Screenshotted the player Journal screen.\n');
        } else if (
          shouldTolerateSmokeTeardown({
            message: journalErr.message,
            pageClosed: page.isClosed?.(),
            requiredCapturesComplete: true,
          })
        ) {
          // Infra teardown (renderer/page closed) — do not fail the whole smoke on a known-flaky
          // last step; mark it skipped with the reason so a persistent pattern is still visible in
          // summary.json.
          results.steps.push({
            step: 'player-journal',
            passed: true,
            skipped: true,
            error: TRANSIENT_TEARDOWN_SKIP_PREFIX + journalErr.message,
          });
          process.stderr.write(
            `Player Journal capture skipped after a transient page teardown: ${journalErr.message}\n`
          );
        } else {
          results.steps.push({ step: 'player-journal', passed: false, error: journalErr.message });
          process.stderr.write(`Player Journal capture failed: ${journalErr.message}\n`);
          try {
            await screenshot(page, 'journal-failure');
          } catch {
            /* page may already be gone */
          }
        }

        results.steps.push({ step: 'craft-item-phase', passed: true });
        process.stdout.write('Phase E complete.\n');
      } catch (err) {
        results.steps.push({ step: 'craft-item-phase', passed: false, error: err.message });
        process.stderr.write(`Phase E failed: ${err.message}\n`);
        // Issue #807: wrap the failure screenshot (mirroring journal-failure).
        try {
          await screenshot(page, 'craft-failure');
        } catch {
          /* page may already be gone — a gone-page screenshot must not throw */
        }
      }
      } // end Phase E (else branch of the D0-teardown guard)

    } catch (err) {
      results.steps.push({ step: 'create-crafting-system', passed: false, error: err.message });
      process.stderr.write(`Phase C failed: ${err.message}\n`);
    }
    } // end if (phaseBPassed)

    // Step failures are evaluated first and are never waivable by any input; a non-waived console
    // error throws only after steps are clean.
    const outcome = evaluateSmokeOutcome({ steps: results.steps, consoleErrors });
    if (outcome.reason === 'console-errors') {
      results.errors = consoleErrors;
    }
    if (outcome.throws) {
      throw new Error(outcome.message);
    }

    results.passed = true;
    process.stdout.write('Smoke test PASSED.\n');
  } catch (err) {
    results.passed = false;
    results.errors.push(err.message);
    process.stderr.write(`Smoke test FAILED: ${err.message}\n`);

    // Capture failure screenshot
    await page.screenshot({ path: join(RESULTS_DIR, 'screenshot-failure.png') }).catch(() => {});
  } finally {
    await runSmokeCleanup(ctx);
  }

  // Exit DETERMINISTICALLY on the harness's own verdict, immediately — so a floating
  // teardown promise that settles during the event-loop drain cannot influence the code.
  process.exit(results.passed ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`foundry-test-run fatal error: ${err.message}\n`);
  process.exit(1);
});
