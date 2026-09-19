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
import d0Spine from './foundry-smoke/scenarios/d0-spine.mjs';
import phaseE from './foundry-smoke/scenarios/phase-e.mjs';
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

      await runScenarios([d0Spine, phaseE], ctx);

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
