import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';

import { FABRICATE_HOOKS, MANAGER_HOOKS, PLAYER_HOOKS } from '../src/config/hooks.js';
import { FABRICATE_ENTRY_SOURCE } from './helpers/bootstrapEntrySource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = FABRICATE_ENTRY_SOURCE;

/**
 * Assert one public hook namespace is on the aggregate, correctly named, and documented.
 *
 * @param {string} domain Hook domain segment (`manager`, `player`).
 * @param {Readonly<Record<string, string>>} namespace The exported constant bag.
 */
function assertHookNamespace(domain, namespace) {
  const documented = readFileSync(resolve(__dirname, '../docs/api/index.md'), 'utf8');
  assert.ok(
    mainSource.includes('HOOKS: FABRICATE_HOOKS'),
    'game.fabricate.api.HOOKS should publish the whole aggregate'
  );
  assert.equal(FABRICATE_HOOKS[domain], namespace, `the ${domain} namespace is on the aggregate`);
  const names = Object.values(namespace);
  assert.ok(names.length > 0, `expected at least one ${domain} hook`);
  const convention = new RegExp(`^fabricate\\.${domain}\\.[a-z][A-Za-z]*$`);
  for (const name of names) {
    assert.match(
      name,
      convention,
      `${name} should follow the fabricate.<domain>.<eventCamelCase> convention`
    );
    assert.ok(documented.includes(`\`${name}\``), `${name} should be documented in docs/api`);
  }
}

/**
 * Assert one page-session extension registry is imported once and bound to the public API.
 *
 * @param {string} name Registry export name.
 * @param {string} modulePath Module specifier as `main.js` writes it.
 */
function assertRegistryBind(name, modulePath) {
  assert.ok(
    mainSource.includes(`import { ${name} } from '${modulePath}';`),
    `main.js should import the ${name} page-session registry singleton`
  );
  assert.ok(
    mainSource.includes(`${name}.bindPublicApi(game.fabricate.api);`),
    `game.fabricate.api should receive the stable public registration object from ${name}`
  );
  assert.equal(
    (mainSource.match(new RegExp(`const ${name}`, 'g')) || []).length,
    0,
    'bindFabricateGlobal must not recreate the registry during init/ready replay'
  );
}

test('every public manager hook is namespaced, reachable on the API, and documented', () => {
  assertHookNamespace('manager', MANAGER_HOOKS);
});

test('every public player hook is namespaced, reachable on the API, and documented', () => {
  assertHookNamespace('player', PLAYER_HOOKS);
});

test('Fabricate publishes the stable manager extension API through both lifecycle binds', () => {
  assertRegistryBind('managerExtensions', '../ui/managerExtensions.js');
});

test('Fabricate publishes the stable player extension API through both lifecycle binds', () => {
  assertRegistryBind('playerExtensions', '../ui/playerExtensions.js');
});

test('Fabricate exposes deleteRecipe on the main Foundry API object', () => {
  assert.ok(
    mainSource.includes('async deleteRecipe(recipeId)'),
    'Fabricate should expose a deleteRecipe method on the main game.fabricate API object'
  );
  // Issue 1132: it routes through the CASCADING set primitive rather than the `RecipeManager` leaf,
  // so the public API and the GM studio cannot disagree about what deleting a recipe reaches.
  assert.ok(
    mainSource.includes(
      'return await this.craftingSystemManager.deleteRecipes(recipe.craftingSystemId, [recipeId]);'
    ),
    'Fabricate.deleteRecipe should route through CraftingSystemManager.deleteRecipes'
  );
});

test('Fabricate bridges replicated crafting-data setting changes into local refresh hooks', () => {
  // Matched as a pattern rather than a literal line, so an added or removed named import from the
  // same module cannot fail an assertion whose subject is the wiring.
  assert.match(
    mainSource,
    /import \{[^}]*\bhandleFabricateSettingChange\b[^}]*\} from '\.\.?\/config\/settingChangeBridge\.js'/,
    'main.js should import the setting-change bridge'
  );
  assert.ok(
    mainSource.includes('handleFabricateSettingChange(key, fabricateSettingChangeTargets())'),
    'the updateSetting hook should invoke the bridge with the changed key'
  );
  assert.ok(
    mainSource.includes('craftingSystemManager: fabricate.craftingSystemManager') &&
      mainSource.includes('recipeManager: fabricate.recipeManager'),
    'the bridge should receive both live managers so cross-client reloads apply'
  );
});

test('Fabricate routes gathering node depletion to the active GM', () => {
  // A player cannot write the world setting the environment node pools live in, so the decrement
  // MUST be relayed.
  assert.ok(
    mainSource.includes('createGatheringNodeDepletionWriter') &&
      mainSource.includes('routeGatheringNodeDepleteMessage') &&
      mainSource.includes("from '../systems/gatheringNodeSocket.js'"),
    'main.js should import the gathering node depletion writer and router'
  );
  assert.ok(
    mainSource.includes('allowSender: gatheringDepletionRateLimiter'),
    'the inbound route should be rate limited per sender'
  );
  assert.ok(
    /depleteEnvironmentNode: \(payload\) =>\s*fabricate\.gatheringNodeDepletionWriter\.deplete\(payload\)/.test(
      mainSource
    ),
    'the rich-state service should receive the GM-routed depletion seam'
  );
  assert.ok(
    mainSource.includes('routeGatheringNodeDepleteMessage(payload, {'),
    'the module socket handler should route inbound depletion messages'
  );
  assert.ok(
    mainSource.includes('gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore'),
    'the setting-change bridge should receive the environment store so clients reload node counts'
  );
});

test('Fabricate gates matured timed gathering runs to the primary GM', () => {
  // `resumeTimedRuns` defaults to `() => true` so unit fixtures resume, which makes
  // this wiring load-bearing: without it EVERY connected client resolves the same
  // matured run and double-applies its items, tool wear and node depletion.
  assert.ok(
    mainSource.includes('resumeTimedRuns: isPrimaryGM'),
    'the gathering engine should receive the real primary-GM check for timed resumption'
  );
});

test('Fabricate wires RecipeManager to the live crafting-system manager', () => {
  // BOTH seams are pinned. `getCraftingSystem` resolves one system; `getCraftingSystemManager`
  // (issue 1072) is the manager itself, which the twelve paths that used to read `game.fabricate`
  // inline now route through — including `_validateSignatures`.
  assert.match(
    mainSource,
    /fabricate\.recipeManager\s*=\s*new RecipeManager\(\{\s*getCraftingSystem:\s*\(systemId\)\s*=>\s*fabricate\.craftingSystemManager\?\.getSystem\?\.\(systemId\)\s*\?\?\s*null,\s*getCraftingSystemManager:\s*\(\)\s*=>\s*fabricate\.craftingSystemManager\s*\?\?\s*null,\s*currencyConfigStore:\s*fabricate\.currencyConfigStore,?\s*\}\)/s,
    'RecipeManager production initialization should receive the live crafting-system resolver and manager'
  );
});

test('Fabricate wires the world currency config into both currency readers', () => {
  // Currency is world scope since issue 1278, and `getCurrencyRequirementConfig` composes the
  // per-system `enabled` flag with the world's ladder.
  assert.ok(
    mainSource.includes('fabricate.currencyConfigStore = new CurrencyConfigStore({'),
    'main.js should construct the world currency config store'
  );
  assert.match(
    mainSource,
    /new CraftingEngine\([\s\S]*?currencyConfigStore:\s*fabricate\.currencyConfigStore/,
    'CraftingEngine should receive the world currency config store'
  );
});

test('Fabricate macro helper exposes deleteRecipe', () => {
  assert.ok(
    mainSource.includes('deleteRecipe: async (recipeId) => {'),
    'the global fabricate helper should expose deleteRecipe'
  );
  assert.ok(
    mainSource.includes('return await game.fabricate.deleteRecipe(recipeId);'),
    'the global fabricate helper should delegate to game.fabricate.deleteRecipe'
  );
});

test('Fabricate exposes the canonical gathering location getters and mutators', () => {
  assert.ok(mainSource.includes('getGatheringPartyStore()'), 'getGatheringPartyStore method');
  assert.ok(mainSource.includes('getGatheringRealmStore()'), 'getGatheringRealmStore method');
  assert.ok(mainSource.includes('getGatheringLocationService()'), 'getGatheringLocationService method');
  assert.ok(mainSource.includes('getGatheringLocationForActor('), 'getGatheringLocationForActor method');
  assert.ok(mainSource.includes('setGatheringPartyRealmOverride('), 'setGatheringPartyRealmOverride method');
  assert.ok(mainSource.includes('clearGatheringPartyRealmOverride('), 'clearGatheringPartyRealmOverride method');
  assert.ok(mainSource.includes('revealGatheringRealmForActor('), 'revealGatheringRealmForActor method');
  assert.ok(mainSource.includes('hideGatheringRealmForActor('), 'hideGatheringRealmForActor method');
});

test('Fabricate retains the deprecated *Region* delegates that forward to the realm methods', () => {
  assert.ok(mainSource.includes('getGatheringRegionStore()'), 'getGatheringRegionStore delegate');
  assert.ok(mainSource.includes('setGatheringPartyRegionOverride('), 'setGatheringPartyRegionOverride delegate');
  assert.ok(mainSource.includes('clearGatheringPartyRegionOverride('), 'clearGatheringPartyRegionOverride delegate');
  assert.ok(mainSource.includes('revealGatheringRegionForActor('), 'revealGatheringRegionForActor delegate');
  assert.ok(mainSource.includes('hideGatheringRegionForActor('), 'hideGatheringRegionForActor delegate');
  // The delegates forward to the canonical realm method via the shared deprecate() helper.
  assert.ok(mainSource.includes("deprecate('getGatheringRegionStore', 'getGatheringRealmStore')"), 'getGatheringRegionStore warns + forwards');
  assert.ok(mainSource.includes('return this.getGatheringRealmStore();'), 'delegate forwards to canonical realm method');
});

test('the location API methods gate on isGatheringRealmsEnabled (no-op when disabled)', () => {
  // The five public location entry points must short-circuit when the
  // realm/travel subsystem is disabled for the target system, reading the
  // single shared predicate so the gate never drifts from the engine/resolver.
  assert.ok(
    mainSource.includes(
      "import { getRealmRevealMode, isGatheringRealmsEnabled } from '../systems/gatheringRealms.js';"
    ),
    'main.js imports the shared gate predicate and the WORLD reveal-mode reader'
  );
  // Each guard resolves the system via craftingSystemManager and bails before doing work.
  assert.ok(
    mainSource.includes('if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;'),
    'getGatheringLocationForActor / set / clear overrides no-op (null) when disabled'
  );
  assert.ok(
    mainSource.includes('if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);'),
    'revealGatheringRealmForActor no-ops (false) when disabled'
  );
  assert.ok(
    /if \(!isGatheringRealmsEnabled\(this\.craftingSystemManager\?\.getSystem\(systemId\)\)\)\s*return Promise\.resolve\(false\);/.test(
      mainSource
    ),
    'hideGatheringRealmForActor no-ops (false) when disabled'
  );
});

test('Fabricate registers a GM-only discipline on realm mutators', () => {
  // The reveal mutator validates the realm against the WORLD library (issue 1282).
  assert.ok(
    mainSource.includes('validateRealmExists: this.gatheringRealmStore?.get?.()'),
    'reveal validates the realm exists in the world travel config'
  );
});

test('game.fabricate.api exposes the canonical realm class + deprecated alias', () => {
  assert.ok(mainSource.includes('GatheringRealmStore,'), 'GatheringRealmStore canonical in api');
  assert.ok(mainSource.includes('GatheringRegionStore: GatheringRealmStore,'), 'GatheringRegionStore alias in api');
  assert.ok(mainSource.includes('GatheringPartyStore,'), 'GatheringPartyStore in api');
  assert.ok(mainSource.includes('GatheringLocationService,'), 'GatheringLocationService in api');
});

test('game.fabricate.gathering exposes the canonical realm helpers', () => {
  assert.ok(mainSource.includes('getPartyStore: () => fabricate.getGatheringPartyStore()'), 'getPartyStore helper');
  assert.ok(mainSource.includes('getRealmStore: () => fabricate.getGatheringRealmStore()'), 'getRealmStore helper');
  assert.ok(mainSource.includes('getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options)'), 'getLocationForActor helper');
  assert.ok(mainSource.includes('setPartyRealmOverride: (options) => fabricate.setGatheringPartyRealmOverride(options)'), 'setPartyRealmOverride helper');
  assert.ok(mainSource.includes('revealRealmForActor: (options) => fabricate.revealGatheringRealmForActor(options)'), 'revealRealmForActor helper');
});

test('Fabricate wires the crafting listing builder with a component resolver (issue 1075)', () => {
  // The builder's privilege gates and matching logic are unit-tested directly, but the composition
  // that hands them a resolver is not: without this line every crafting row's owned-material tally
  // silently reads as if the player owns nothing, and no existing test goes red.
  assert.ok(
    /import \{ findMatchingComponent \} from '\.\.?\/utils\/essenceResolver\.js';/.test(mainSource),
    'main.js should import the same component resolver InventoryListingBuilder matches with'
  );
  assert.ok(
    mainSource.includes('resolveComponentForItem: findMatchingComponent,'),
    'the crafting listing builder should receive the component resolver, or every player row silently reads "missing materials"'
  );
});

test('Fabricate hydrates the crafting recipe detail phase through the crafting listing builder (issue 1075)', () => {
  // `hydrateCraftingRecipe` is the detail-phase companion to the cheap `listCraftingForActor`
  // summary rows (issue 1075).
  assert.ok(
    mainSource.includes(
      'hydrateCraftingRecipe({ recipeId = null, actorId = null, componentSourceActorIds = null } = {}) {'
    ),
    'main.js should expose hydrateCraftingRecipe on the Fabricate API object'
  );
  assert.ok(
    mainSource.includes('return this._getCraftingListingBuilder().buildRecipeDetail({'),
    "hydrateCraftingRecipe should route through the crafting listing builder's detail phase"
  );
});

test('Fabricate exposes the versioned Journal command and per-user dismissal seams', () => {
  for (const method of [
    'executeJournalRunCommand(command, options)',
    // Two arguments, load-bearing. This pin used to read the one-argument form, and sat twelve
    // lines above another pin whose comment claimed the options were forwarded (issue 1759).
    'dismissJournalRun(options)',
    'getDismissedJournalRunKeys(options)',
    'getJournalRunAuthorityAvailability()',
    'setupJournalRunAuthority()',
    'reconcileJournalRunAuthority(options)',
  ]) {
    assert.ok(mainSource.includes(method), `${method} should be exposed on game.fabricate`);
  }
  assert.ok(
    mainSource.includes("Hooks.on('createJournalEntryPage', refreshJournalRunAuthorityAvailability)"),
    'embedded authority-claim creation should refresh the synchronous availability cache'
  );
  assert.ok(
    mainSource.includes("Hooks.on('deleteJournalEntryPage', refreshJournalRunAuthorityAvailability)"),
    'embedded authority-claim release should refresh the synchronous availability cache'
  );
  assert.ok(
    mainSource.includes("Hooks.on('updateUser', bootstrapJournalRunAuthority)"),
    'a GM election update should trigger guarded recovery bootstrap in the newly active realm'
  );
  assert.ok(
    mainSource.includes("Hooks.on('userConnected', bootstrapJournalRunAuthority)"),
    'a GM connection transition should trigger guarded recovery bootstrap'
  );
  // `setupJournalRunAuthority()` survives as an idempotent ensure, not a one-shot provisioner:
  // every world now provisions automatically, so refusing an existing ledger would make the
  // documented API report a healthy world as broken.
  assert.ok(
    mainSource.includes(
      'Ensure the private run-authority ledger exists, as the active GM. Idempotent: an existing'
    ),
    'setupJournalRunAuthority should be documented as an idempotent ensure'
  );
  assert.doesNotMatch(
    mainSource,
    /ledger-already-exists/,
    'an existing ledger is no longer a refusal reason anywhere on the public surface'
  );
});

test('the real Journal composition emitter survives socket serialization and preserves recipients', () => {
  const start = mainSource.indexOf('function createJournalCommandsForFabricate(');
  // Bounded at its own column-zero closing brace: the factory is the last declaration in
  // `src/bootstrap/journalOperations.js`, so a following-comment bound would run into another file.
  const end = mainSource.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start + 2, 'the journal command factory must be present');
  let composed;
  const received = [];
  // Foundry V13.351/V14.365 handleCustomSocket destructures this argument: a
  // default covers omission, but cannot cover undefined serialized as array null.
  const handleCustomSocket = (event, message, { recipients } = {}) => {
    received.push({ event, message, recipients });
  };
  const dependencies = {
    createFoundryJournalRunAuthority: () => ({}),
    createJournalExecutionReconstructor: () => ({}),
    createCraftingJournalOperations: () => ({}),
    createGatheringJournalRunOperations: () => ({}),
    createJournalRunCommandService: (options) => { composed = options; return {}; },
    installCraftingJournalRunAuthority: () => {},
    EVENT_SCENE_SOCKET: 'module.fabricate',
    game: { socket: { emit: (...args) => handleCustomSocket(...JSON.parse(JSON.stringify(args))) } },
  };
  compileFunction(
    `${mainSource.slice(start, end)}\nreturn createJournalCommandsForFabricate({});`,
    Object.keys(dependencies)
  )(...Object.values(dependencies));
  const request = { kind: 'journalRunCommand', requestId: 'request' };
  const reply = { kind: 'journalRunReply', requestId: 'request' };
  composed.emit(request);
  composed.emit(reply, { recipients: ['initiating-player'] });
  assert.deepEqual(received, [
    { event: 'module.fabricate', message: request, recipients: undefined },
    { event: 'module.fabricate', message: reply, recipients: ['initiating-player'] },
  ]);
});

test('player-facing starts explicitly select the current journal lifecycle', () => {
  assert.match(
    mainSource,
    /async craft\(actor, recipe, options = \{\}\)[\s\S]*?return executePublicCraft\(\{[\s\S]*?engine: this\.craftingEngine,[\s\S]*?runManager: this\.craftingRunManager,/,
    'the general public craft facade should use the lifecycle-selecting boundary'
  );
  assert.match(
    mainSource,
    // The options are FORWARDED, not dropped: `executePublicCraft` asks for the
    // non-interactive route, because the public API has no user to answer a roll dialog
    // and `promptCheck` waits for one without a timeout (issue 1683).
    /executeCommand: \(command, options\) => this\.executeJournalRunCommand\(command, options\),\s*resolveUuid: \(uuid\) => globalThis\.fromUuid\?\.\(uuid\),/,
    'a ready public craft should execute through the command service and hydrate result UUIDs locally'
  );
  assert.match(
    mainSource,
    /async craftRecipe[\s\S]*?return await this\.craft\([\s\S]*?lifecycleVersion:\s*1,[\s\S]*?\n\s*}\);/,
    'craftRecipe should start a versioned crafting run'
  );
  assert.match(
    mainSource,
    /async submitAlchemyAttempt[\s\S]*?this\.craftingEngine\.craftAlchemy\([\s\S]*?lifecycleVersion:\s*1,[\s\S]*?\n\s*}\);/,
    'submitAlchemyAttempt should start a versioned alchemy run'
  );
  assert.match(
    mainSource,
    /startGatheringAttempt[\s\S]*?selectedActor[\s\S]*?actor:\s*selectedActor,\s*lifecycleVersion:\s*1[\s\S]*?'requestStart'/,
    'startGatheringAttempt should start a versioned gathering run'
  );
  assert.ok(
    mainSource.includes('installGatheringJournalRunAuthority({'),
    'the constructed gathering engine should receive the journal authority adapter'
  );
  assert.ok(
    /fabricate\s*\.craft\(actor, recipe\)\s*\.then\(\(result\) => \{/.test(mainSource),
    'the /craft chat command should delegate through the public craft facade'
  );
  assert.ok(
    mainSource.includes('return await game.fabricate.craft(actor, recipeId, options);'),
    'the global craft helper should delegate through the public craft facade'
  );
  assert.match(
    mainSource,
    /start: async \(\{ actor, payload, executionGrant, requestId, sender \}\)[\s\S]*?start\.call\(fabricate\.craftingEngine, \{\s*viewer: sender,/,
    'the crafting start handler should pass the socket-attested sender as the viewer'
  );
});
