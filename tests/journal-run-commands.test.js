import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { IngredientSet } from '../src/models/IngredientSet.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';
import { resolveAlchemySubmissions } from '../src/utils/alchemySubmissions.js';
import { resolvedComponentsFor } from '../src/systems/scopedEntityReads.js';
import { createJournalRunAuthority } from '../src/systems/journalRunAuthority.js';
import { mergeHistoryFlag } from './helpers/journal-fixtures.js';

import {
  JOURNAL_RUN_SOCKET_KIND,
  createJournalExecutionReconstructor,
  createManagerMutation,
  createGatheringJournalRunOperations,
  journalRunDismissalKey,
  createJournalRunCommandService,
  executePublicCraft,
  executePublicGather,
  installCraftingJournalRunAuthority,
  installGatheringJournalRunAuthority,
} from '../src/systems/journalRunCommands.js';

function commandHarness({
  currentUserId = 'player',
  activeGMId = 'gm',
  getActiveGM = null,
  timeoutMs = 20,
  run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' },
  getDismissals = () => ({}),
  setDismissals = async () => undefined,
  operations = null,
  promptCheck = null,
  postRollHandoff = null,
  authority = null,
} = {}) {
  const emitted = [];
  const emissionOptions = [];
  const users = new Map([
    ['player', { id: 'player', isGM: false }],
    ['other', { id: 'other', isGM: false }],
    ['gm', { id: 'gm', isGM: true }],
  ]);
  const actor = {
    uuid: 'Actor.a',
    testUserPermission: (user, level) => level === 'OWNER' && user?.id === 'player',
  };
  let id = 0;
  const service = createJournalRunCommandService({
    authority: authority ?? {
      availability: () => ({ available: true, reason: null }),
      run: async (_request, handler) =>
        handler({
          createExecutionGrant: () => ({ grant: true }),
          issuePrepareToken: () => 'token',
          consumePrepareToken: () => ({}),
          releasePrepareToken: () => true,
        }),
      consumeExecutionGrant: (grant) => grant?.grant === true,
    },
    currentUser: () => users.get(currentUserId),
    activeGM: () => getActiveGM?.() ?? users.get(activeGMId) ?? null,
    getUser: (userId) => users.get(userId) ?? null,
    resolveUuid: async (uuid) => (uuid === actor.uuid ? actor : null),
    emit: (message, options) => {
      emitted.push(message);
      emissionOptions.push(options);
    },
    randomId: () => `id-${++id}`,
    timeoutMs,
    operations: operations ?? {
      crafting: {
        getRun: () => run,
        execute: async (args) => ({ success: true, action: 'execute', args }),
        cancel: async (args) => ({ success: true, action: 'cancel', args }),
      },
    },
    getDismissals,
    setDismissals,
    promptCheck,
    postRollHandoff,
  });
  return { service, emitted, emissionOptions, actor };
}

describe('journal run command protocol', () => {
  function loadCraftingOperations() {
    const source = readFileSync(new URL('../src/bootstrap/journalOperations.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function resolveJournalSourceActors(');
    const end = source.indexOf('export function createJournalCommandsForFabricate(', start);
    assert.ok(start >= 0 && end > start, 'the production operation factory must be present');
    return compileFunction(`${source.slice(start, end)}\nreturn createCraftingJournalOperations;`,
      ['resolveAlchemySubmissions', 'resolvedComponentsFor', 'createManagerMutation'])(
        resolveAlchemySubmissions, resolvedComponentsFor, createManagerMutation);
  }

  for (const kind of ['crafting', 'matched-alchemy', 'fizzle']) {
    for (const sender of [{ id: 'player', isGM: false }, { id: 'gm', isGM: true }]) {
      it(`persists the initiating ${sender.id} through the ${kind} callback on the GM`, async () => {
        const oldGlobals = { game: globalThis.game, foundry: globalThis.foundry };
        try {
          globalThis.foundry = { utils: { randomID: () => 'identity-run' } };
          const flags = {};
          const actor = {
            id: 'a', uuid: 'Actor.a', items: [],
            getFlag: (scope, key) => flags[scope]?.[key],
            async setFlag(scope, key, value) {
              flags[scope] ??= {};
              flags[scope][key] = structuredClone(value);
              return this;
            },
          };
          const item = { id: 'herb', uuid: 'Actor.a.Item.herb', name: 'Herb',
            parent: actor, system: { quantity: 1 } };
          actor.items = [item];
          const recipe = { id: 'recipe', craftingSystemId: 'system', name: 'Brew',
            getExecutionSteps: () => [{ id: 'step', timeRequirement: { minutes: 2 },
              ingredientSets: [new IngredientSet({ id: 'set' })] }] };
          const system = { id: 'system', resolutionMode: 'alchemy',
            components: [{ id: 'herb', name: 'Herb' }],
            alchemy: { consumeOnFail: false, showAttemptHistoryToPlayers: false } };
          const runManager = new CraftingRunManager();
          // Starting a run now prepares and SPENDS its stage (D-026), so the double must
          // answer the craftability boundary the real start crosses.
          const engine = new CraftingEngine({ getRecipe: () => recipe,
            canCraft: () => ({ canCraft: true, missing: { ingredients: [], essences: [], tools: [] } }),
            getToolsForSet: () => [] }, runManager);
          engine._matchAlchemySignature = () => ({ matched: false });
          engine.installVersionedRunAuthority({ consumeExecutionGrant: async (grant) => {
            assert.equal(grant, 'private-grant');
            return { operationId: 'identity-operation', activityKind: 'alchemy',
              matched: kind === 'matched-alchemy', recipeId: recipe.id };
          } });
          globalThis.game = { user: { id: 'gm', isGM: true }, time: { worldTime: 1000 },
            fabricate: {
              getCraftingSystemManager: () => ({ getSystem: () => system }),
              getRecipeVisibilityService: () => ({ guardCraftStart: ({ viewer }) => {
                assert.equal(viewer.id, sender.id);
                assert.equal(kind, 'crafting', 'matched alchemy retains its grant-bound bypass');
                return { craftable: true };
              } }),
            } };
          const operations = loadCraftingOperations()({ craftingEngine: engine,
            craftingSystemManager: { getSystem: () => system } }, () => null);
          const operation = kind === 'fizzle' ? 'executeAlchemyFizzle' : 'start';
          const result = await operations[operation]({ actor, sender,
            executionGrant: 'private-grant', requestId: 'identity-request',
            payload: { recipeId: recipe.id, craftingSystemId: system.id,
              userId: 'forged-user', viewer: { id: 'forged-viewer' },
              submittedItems: [{ itemUuid: item.uuid, componentId: 'herb' }] } });
          assert.ok(result.runId, JSON.stringify(result));
          const reloaded = new CraftingRunManager().getRun(actor, result.runId);
          assert.equal(reloaded.userId, sender.id);
          assert.equal(reloaded.lifecycleVersion, 1);
          if (kind === 'fizzle') {
            assert.equal(reloaded.executionJournal.status, 'committed');
            assert.equal(result.disposition, 'no-match');
          } else {
            assert.equal(reloaded.status, 'waitingTime');
          }
        } finally {
          Object.assign(globalThis, oldGlobals);
        }
      });
    }
  }

  it('redacts initial crafting prompts for the attested sender rather than the executing GM', async () => {
    const originalGame = globalThis.game;
    const originalFromUuid = globalThis.fromUuid;
    try {
      globalThis.game = { user: { id: 'gm', isGM: true } };
      const canary = 'PROTECTED-RECIPE-CANARY';
      const run = { id: 'run-1', recipeId: 'recipe', lifecycleVersion: 1, runRevision: 3 };
      const publicPrompt = {
        label: canary, recipeName: canary, formula: '1d20+987', dc: 987,
        mode: 'simple', allowsSituationalModifier: true, allowAdvantage: true,
        modifierChoice: { modifiers: [{ id: canary, label: canary }] },
        allowedModifierIds: [canary], protectedFields: { nested: canary },
      };
      const privateEvaluation = { recipeId: 'recipe', rollFormula: '1d20+987' };
      let entitled = false;
      const viewers = [];
      const fabricate = {
        craftingRunManager: { getRun: () => run },
        craftingEngine: { describeVersionedStageCheck: async () => ({ required: true, publicPrompt, privateEvaluation }) },
        recipeManager: { getRecipe: () => ({ id: 'recipe', craftingSystemId: 'system' }) },
        recipeVisibilityService: { getVisibleRecipes: ({ viewer }) => {
          viewers.push(viewer.id);
          return entitled ? [{ recipe: { id: 'recipe' } }] : [];
        } },
      };
      const operations = loadCraftingOperations()(fabricate, () => harness.service);
      const harness = commandHarness({ currentUserId: 'gm', operations: { crafting: operations } });
      const { service, actor, emitted, emissionOptions } = harness;
      actor.isOwner = true;
      globalThis.fromUuid = async () => actor;
      const request = {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST, requestId: 'secret-prompt', sessionId: 'player-tab',
        actorUuid: actor.uuid, runType: 'crafting', runId: run.id, expectedRevision: 3,
        action: 'execute', senderId: 'gm', payload: {},
      };
      const hidden = await service.handleSocketMessage(request, 'player');
      assert.equal(hidden.response.checkRequired, true);
      assert.deepEqual(hidden.response.promptDescriptor, {
        allowsSituationalModifier: true, allowAdvantage: true,
      });
      assert.equal(JSON.stringify(hidden).includes(canary), false);
      assert.equal(JSON.stringify(hidden).includes('987'), false);
      assert.deepEqual(emissionOptions[0], { recipients: ['player'] });
      assert.equal(emissionOptions[0].recipients.includes('other'), false);
      assert.equal(emitted.length, 1);
      assert.deepEqual(viewers, ['player']);
      assert.equal(await operations.authorizeRollHandoff({ actor, run, payload: {}, sender: { id: 'player' } }), false);
      entitled = true;
      const visible = await service.handleSocketMessage({ ...request, requestId: 'visible-prompt' }, 'player');
      assert.deepEqual(visible.response.promptDescriptor, publicPrompt);
      assert.equal(await operations.authorizeRollHandoff({ actor, run, payload: {}, sender: { id: 'player' } }), true);
      const denied = await service.handleSocketMessage({ ...request, requestId: 'wrong-owner' }, 'other');
      assert.equal(denied.response.reason, 'owner-required');
      assert.equal(JSON.stringify(denied).includes(canary), false);
      assert.equal(publicPrompt.label, canary, 'redaction must not mutate the engine descriptor');
    } finally {
      globalThis.game = originalGame;
      globalThis.fromUuid = originalFromUuid;
    }
  });

  /**
   * `source-owner-required` was spelled, localized and vocabulary-tested, but nothing proved it
   * FIRES (issue 1648, Q-H5): deleting the gate, or making `journalSourcesOwnedBy` return `true`,
   * left every suite green while a non-GM could consume materials off an actor they do not own.
   */
  it('refuses a craft drawing materials from a source actor the sender does not own', async () => {
    const originalGame = globalThis.game;
    const originalFromUuid = globalThis.fromUuid;
    try {
      globalThis.game = { user: { id: 'gm', isGM: true } };
      const vault = {
        uuid: 'Actor.vault',
        owner: null,
        testUserPermission(user, level) {
          return level === 'OWNER' && user?.id === this.owner;
        },
      };
      const run = {
        id: 'run-1',
        lifecycleVersion: 1,
        runRevision: 3,
        componentSourceActorUuids: [vault.uuid],
      };
      const fabricate = {
        craftingRunManager: { getRun: () => run, invalidateCache: () => {} },
      };
      const production = loadCraftingOperations()(fabricate, () => null);
      const executed = [];
      const { service, actor } = commandHarness({
        currentUserId: 'gm',
        operations: {
          crafting: {
            ...production,
            cancel: async () => (executed.push('cancel'), { success: true, action: 'cancel' }),
          },
        },
      });
      globalThis.fromUuid = async (uuid) => (uuid === vault.uuid ? vault : null);
      const request = {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        sessionId: 'player-tab',
        actorUuid: actor.uuid,
        runType: 'crafting',
        runId: run.id,
        expectedRevision: 3,
        action: 'cancel',
        payload: {},
      };
      const send = (requestId, senderId) =>
        service.handleSocketMessage({ ...request, requestId, senderId }, senderId);

      // The player OWNS the crafting actor, so `owner-required` passes and the source gate is
      // the only thing left between them and another player's stock.
      assert.equal(actor.testUserPermission({ id: 'player' }, 'OWNER'), true);
      const denied = await send('foreign-source', 'player');
      assert.equal(denied.response.reason, 'source-owner-required');
      assert.deepEqual(executed, [], 'the refusal reaches no operation');

      // A GM is not bound by source ownership, and the same sender is allowed once they own it.
      assert.equal((await send('gm-source', 'gm')).response.success, true);
      vault.owner = 'player';
      assert.equal((await send('owned-source', 'player')).response.success, true);
      assert.deepEqual(executed, ['cancel', 'cancel']);

      // A source uuid that cannot be resolved is not an owned one either: the resolver answers
      // null, which the gate refuses rather than falling back to the crafting actor.
      globalThis.fromUuid = async () => {
        throw new Error('uuid store unavailable');
      };
      assert.equal(
        (await send('unresolvable-source', 'player')).response.reason,
        'source-owner-required'
      );
    } finally {
      globalThis.game = originalGame;
      globalThis.fromUuid = originalFromUuid;
    }
  });

  async function assertAuthoritativeRouteSnapshot(clientSnapshot) {
    // Execute the actual composition-edge declarations without importing main's
    // Foundry boot side effects or maintaining a second copy of its callback.
    const createOperations = loadCraftingOperations();
    const oldGlobals = { game: globalThis.game, foundry: globalThis.foundry, fromUuid: globalThis.fromUuid };
    try {
      globalThis.foundry = { utils: { randomID: () => 'route-run' } };
      globalThis.game = { user: { id: 'player' }, time: { worldTime: 1000 } };
      const sets = ['a', 'b'].map((id) => new IngredientSet({
        id, name: `Route ${id.toUpperCase()}`, resultGroupId: `yield-${id}`,
        ingredientGroups: [{ id: `group-${id}`, name: `Material ${id.toUpperCase()}`, options: [
          { id: `option-${id}`, quantity: id === 'b' ? 2 : 1, match: { type: 'component', componentId: id } },
        ] }],
      }));
      const recipe = { id: 'recipe', craftingSystemId: 'system', name: 'Routes',
        getExecutionSteps: () => [{ id: 'step', ingredientSets: sets }],
      };
      const fabricate = {
        craftingRunManager: new CraftingRunManager(),
        recipeManager: { getRecipe: (id) => id === recipe.id ? recipe : null },
      };
      let harness;
      const operations = createOperations(fabricate, () => harness.service);
      harness = commandHarness({ currentUserId: 'gm', operations: { crafting: operations } });
      const { actor, service } = harness;
      actor.id = 'a';
      actor.isOwner = true;
      actor.items = [];
      const flags = {};
      const writes = [];
      actor.getFlag = (scope, key) => flags[scope]?.[key];
      actor.setFlag = async (scope, key, value) => {
        flags[scope] ??= {};
        flags[scope][key] = structuredClone(value);
        writes.push(structuredClone(value));
        return actor;
      };
      globalThis.fromUuid = async (uuid) => uuid === actor.uuid ? actor : null;
      const run = await fabricate.craftingRunManager.createRun(actor, recipe, [actor], 'player', { lifecycleVersion: 1 });
      await fabricate.craftingRunManager.setStepSelectionPlan(actor, run.id, 0, {
        selectedIngredientSetId: 'a', selectedRequirementSnapshot: sets[0].toJSON(),
      }, { expectedRevision: 0 });
      const request = (selectionPlan, expectedRevision = 1, extra = {}) => ({
        requestId: `selection-${writes.length}-${selectionPlan.selectedIngredientSetId}`,
        sessionId: 'player-session', actorUuid: actor.uuid, runType: 'crafting', runId: run.id,
        expectedRevision, action: 'setSelection',
        payload: { stepIndex: 0, expectedStage: 0, selectionPlan, ...extra },
      });
      const clientPlan = {
        selectedIngredientSetId: 'b', ingredientOptionOverrides: {},
        ingredientEssenceAllocation: { stepId: 'step', ingredientSetId: 'b', allocation: {} },
      };
      const expected = structuredClone(sets[1].toJSON());
      const writeCount = writes.length;
      // Client evidence is unnecessary and cannot override the authored route.
      const changed = await service.handleRequest(request({
        ...clientPlan, ...(clientSnapshot && { selectedRequirementSnapshot: clientSnapshot }),
      }), 'player');
      assert.equal(changed.success, true);
      assert.equal(changed.runRevision, 2);
      assert.equal(writes.length, writeCount + 1, 'plan, snapshot and revision share one write');
      const transition = writes.at(-1).active[run.id];
      assert.deepEqual(transition.steps[0].selectionPlan, clientPlan);
      assert.deepEqual(transition.steps[0].selectedRequirementSnapshot, expected);
      assert.equal(transition.runRevision, 2);

      // New manager instance reads document persistence, not a retained in-memory run.
      fabricate.craftingRunManager = new CraftingRunManager();
      const persisted = () => fabricate.craftingRunManager.getActiveRun(actor, run.id);
      assert.deepEqual(persisted().steps[0].selectedRequirementSnapshot, expected);
      const builder = () => new RunJournalBuilder({
        craftingRunManager: fabricate.craftingRunManager, recipeManager: fabricate.recipeManager,
      }).buildListing({ actor, viewer: { id: 'gm', isGM: true } });
      assert.equal(builder().activeRuns[0].currentStep.selectionAvailability.selectedIngredientSetId, 'b');
      const beforeRefusals = structuredClone(persisted());
      for (const [command, sender, reason] of [
        [request(clientPlan), 'player', 'stale-run'],
        [request(clientPlan, 2), 'other', 'owner-required'],
        [request(clientPlan, 2, { expectedStage: 1 }), 'player', 'stale-stage'],
        [request({ selectedIngredientSetId: 'removed' }, 2), 'player', 'ingredient-set-not-found'],
      ]) {
        const refused = await service.handleRequest(command, sender);
        assert.equal(refused.success, false);
        assert.equal(refused.reason, reason);
        assert.deepEqual(persisted(), beforeRefusals);
      }
      assert.equal(writes.length, writeCount + 1);

      const removedRoute = sets.pop();
      assert.equal(builder().activeRuns[0].currentStep.selectionAvailability.staleRoute, true);
      const staleRoute = await service.handleRequest(request(clientPlan, 2), 'player');
      assert.equal(staleRoute.reason, 'ingredient-set-not-found');
      assert.deepEqual(persisted(), beforeRefusals);
      sets.push(removedRoute);
      const grantless = await operations.setSelection({
        actor, run: persisted(), runId: run.id, expectedRevision: 2,
        payload: { stepIndex: 0, selectionPlan: clientPlan }, executionGrant: null,
      });
      assert.equal(grantless.reason, 'execution-grant-invalid');
      assert.equal(writes.length, writeCount + 1);

      sets[1].name = 'Changed after selection';
      sets[1].ingredientGroups[0].options[0].quantity = 99;
      await fabricate.craftingRunManager.cancelRun(actor, run.id, { expectedRevision: 2 });
      fabricate.craftingRunManager = new CraftingRunManager();
      const history = builder().history[0];
      assert.equal(history.status, 'cancelled');
      assert.deepEqual(history.steps[0].requirementSnapshot, expected);
      assert.deepEqual(history.steps[0].selectionPlan, clientPlan);
      assert.equal(history.steps[0].requirementSnapshot.ingredientGroups[0].name, 'Material B');
      assert.deepEqual(history.steps[0].consumedIngredients, []);
    } finally {
      Object.assign(globalThis, oldGlobals);
    }
  }
  for (const clientSnapshot of [undefined, { id: 'b', name: 'Forged', ingredientGroups: [] }]) {
    it(`captures route B at the actual main command boundary with ${clientSnapshot ? 'forged' : 'absent'} client evidence and retains it after reload and cancellation`, () =>
      assertAuthoritativeRouteSnapshot(clientSnapshot));
  }

  it('defaults new public crafts to v1 while preserving a persisted legacy continuation', async () => {
    const calls = [];
    const engine = {
      craft: async (...args) => (calls.push(args), { success: true }),
    };
    const runManager = {
      getActiveRun: (_actor, runId) => runId === 'legacy-run'
        ? { id: runId, status: 'inProgress' }
        : null,
    };
    const actor = { id: 'actor' };
    const recipe = { id: 'recipe' };

    await executePublicCraft({ engine, runManager, actor, sourceActors: [actor], recipe });
    await executePublicCraft({
      engine,
      runManager,
      actor,
      sourceActors: [actor],
      recipe,
      options: { lifecycleVersion: 0 },
    });
    await executePublicCraft({
      engine,
      runManager,
      actor,
      sourceActors: [actor],
      recipe,
      options: { runId: 'legacy-run' },
    });

    assert.equal(calls[0][4].lifecycleVersion, 1);
    assert.equal(calls[1][4].lifecycleVersion, 1, 'callers cannot opt a new run out of v1');
    assert.equal(Object.hasOwn(calls[2][4], 'lifecycleVersion'), false);
  });

  it('never opens a roll prompt for the public craft API, and settles the check itself', async () => {
    // Issue 1683. `promptCheck` awaits a HUMAN and has no timeout of its own -- `sendCommand` has
    // one, the prompt does not -- so a macro or script calling `game.fabricate.craft()` hung
    // forever the moment the craft reached a stage with a check.
    let promptCalls = 0;
    const executed = [];
    const { service } = commandHarness({
      currentUserId: 'gm',
      promptCheck: async () => {
        promptCalls += 1;
        return new Promise(() => {});
      },
      operations: {
        crafting: {
          getRun: () => ({ id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' }),
          describeCheck: async () => ({ required: true, publicPrompt: {}, privateEvaluation: {} }),
          evaluateCheck: async () => ({
            success: true,
            engineEvaluated: true,
            outcome: null,
            value: null,
            data: {},
          }),
          execute: async (args) => (executed.push(args), { success: true, terminal: true }),
        },
      },
    });

    const settled = await executePublicCraft({
      engine: {
        craft: async () => ({
          success: true,
          runId: 'run-1',
          runRevision: 3,
          requiresExecution: true,
          canExecuteImmediately: true,
        }),
      },
      runManager: { getActiveRun: () => null },
      actor: { uuid: 'Actor.a' },
      sourceActors: [{ uuid: 'Actor.a' }],
      recipe: { id: 'recipe' },
      executeCommand: (command, options) => service.executeJournalRunCommand(command, options),
    });

    assert.equal(promptCalls, 0, 'the API never opens a dialog it has nobody to answer');
    assert.equal(settled.success, true, JSON.stringify(settled));
    assert.equal(executed.length, 1, 'the stage still executed, with the check settled for it');
  });

  it('opens the roll prompt for an interactive public craft, as the crafting screen asks', async () => {
    // Issue 1780. The player app's Craft button reaches the same `executePublicCraft` as a macro,
    // through `game.fabricate.craftRecipe({ interactive: true })`. Issue 1683 hard-coded the
    // execute as non-interactive, and once `main.js` began forwarding the option (issue 1759)
    // the crafting screen lost its roll dialog: the View Lab's `player-crafting-roll-prompt`
    // frame went from a standing prompt to a bare crafting tab. The flag is the CALLER's.
    let promptCalls = 0;
    const executed = [];
    const { service } = commandHarness({
      currentUserId: 'gm',
      promptCheck: async () => {
        promptCalls += 1;
        return { confirmed: true, modifierIds: ['hb-mod-medicine'] };
      },
      operations: {
        crafting: {
          getRun: () => ({ id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' }),
          describeCheck: async () => ({ required: true, publicPrompt: {}, privateEvaluation: {} }),
          evaluateCheck: async () => ({
            success: true,
            engineEvaluated: true,
            outcome: null,
            value: null,
            data: {},
          }),
          execute: async (args) => (executed.push(args), { success: true, terminal: true }),
        },
      },
    });

    const settled = await executePublicCraft({
      engine: {
        craft: async () => ({
          success: true,
          runId: 'run-1',
          runRevision: 3,
          requiresExecution: true,
          canExecuteImmediately: true,
        }),
      },
      runManager: { getActiveRun: () => null },
      actor: { uuid: 'Actor.a' },
      sourceActors: [{ uuid: 'Actor.a' }],
      recipe: { id: 'recipe' },
      options: { interactive: true },
      executeCommand: (command, options) => service.executeJournalRunCommand(command, options),
    });

    assert.equal(promptCalls, 1, 'the crafting screen still gets its roll dialog');
    assert.equal(settled.success, true, JSON.stringify(settled));
    assert.equal(executed.length, 1, 'and the stage executed with the answered check');
  });

  it('finishes a ready public gather in one call, and leaves a waiting one alone', async () => {
    // Issue 1759. Issue 1648 gave gathering a versioned lifecycle and `startGatheringAttempt` began
    // selecting it unconditionally, which routes a READY attempt away from the engine's immediate
    // resolution and into a started run awaiting execution.
    const executed = [];
    const ready = await executePublicGather({
      requestStart: async () => ({
        accepted: true,
        started: true,
        requiresExecution: true,
        canExecuteImmediately: true,
        runId: 'gather-1',
        // Top-level, as the command service's NORMALISED result carries it -- it lifts the revision
        // out and drops the run document.
        runRevision: 4,
        blockedReasons: [],
      }),
      actor: { uuid: 'Actor.a' },
      executeCommand: async (command, options) => {
        executed.push({ command, options });
        return { success: true, terminal: true, status: 'succeeded', createdResultUuids: [] };
      },
    });

    assert.equal(executed.length, 1, 'a ready attempt executes without a second caller');
    assert.deepEqual(executed[0].options, { interactive: false }, 'and never opens a dialog');
    assert.equal(executed[0].command.runType, 'gathering');
    assert.equal(executed[0].command.runId, 'gather-1');
    assert.equal(executed[0].command.expectedRevision, 4, 'the run revision guards the execute');
    assert.equal(executed[0].command.action, 'execute');
    assert.equal(ready.success, true, JSON.stringify(ready));
    assert.equal(ready.accepted, true, 'the attempt was accepted AND it executed; both are true');

    // A waiting attempt is a different thing entirely: it matures at GM-gated world time, and
    // finishing it here would spend the wait the task declares.
    const waitingExecutes = [];
    const waiting = await executePublicGather({
      requestStart: async () => ({
        accepted: true,
        started: true,
        requiresExecution: true,
        canExecuteImmediately: false,
        runId: 'gather-2',
        // Top-level, as the command service's NORMALISED result carries it -- it lifts the revision
        // out and drops the run document.
        runRevision: 1,
      }),
      actor: { uuid: 'Actor.a' },
      executeCommand: async (...args) => (waitingExecutes.push(args), { success: true }),
    });
    assert.deepEqual(waitingExecutes, [], 'a timed attempt is never completed early');
    assert.equal(waiting.canExecuteImmediately, false);

    // A refused attempt is returned untouched, so its blocked reasons still reach the caller.
    const blockedExecutes = [];
    const blocked = await executePublicGather({
      requestStart: async () => ({
        accepted: false,
        started: false,
        state: 'SCENE_BLOCKED',
        blockedReasons: [{ code: 'SCENE_BLOCKED' }],
      }),
      actor: { uuid: 'Actor.a' },
      executeCommand: async (...args) => (blockedExecutes.push(args), { success: true }),
    });
    assert.deepEqual(blockedExecutes, []);
    assert.deepEqual(blocked.blockedReasons, [{ code: 'SCENE_BLOCKED' }]);
  });

  it('forwards the gathering screen\'s interactive flag to a ready public gather', async () => {
    // Issue 1780, the gathering half: `GatheringView` starts an attempt with `interactive: true`
    // and expects its roll dialog on a required check. `executePublicGather` hard-coded the
    // execute as non-interactive, so a ready attempt with a check settled silently.
    const executed = [];
    const ready = await executePublicGather({
      requestStart: async () => ({
        accepted: true,
        started: true,
        requiresExecution: true,
        canExecuteImmediately: true,
        runId: 'gather-1',
        runRevision: 4,
        blockedReasons: [],
      }),
      actor: { uuid: 'Actor.a' },
      interactive: true,
      executeCommand: async (command, options) => {
        executed.push({ command, options });
        return { success: true, terminal: true, status: 'succeeded', createdResultUuids: [] };
      },
    });

    assert.equal(executed.length, 1);
    assert.deepEqual(executed[0].options, { interactive: true }, 'the screen\'s flag reaches it');
    assert.equal(ready.success, true, JSON.stringify(ready));
  });

  it('reports a ready gather whose execution failed as accepted but unsuccessful', async () => {
    // The start result is kept UNDER the settled one rather than replaced.
    const settled = await executePublicGather({
      requestStart: async () => ({
        accepted: true,
        started: true,
        requiresExecution: true,
        canExecuteImmediately: true,
        runId: 'gather-3',
        // Top-level, as the command service's NORMALISED result carries it -- it lifts the revision
        // out and drops the run document.
        runRevision: 2,
      }),
      actor: { uuid: 'Actor.a' },
      executeCommand: async () => ({ success: false, reason: 'claim-held' }),
    });
    assert.equal(settled.accepted, true, 'the attempt genuinely was accepted');
    assert.equal(settled.success, false, 'and the execution genuinely failed');
    assert.equal(settled.reason, 'claim-held', 'with the refusal reason intact for the player');
  });

  it('refuses a ready gather with no command client rather than reporting a silent award', async () => {
    const settled = await executePublicGather({
      requestStart: async () => ({
        accepted: true,
        started: true,
        requiresExecution: true,
        canExecuteImmediately: true,
        runId: 'gather-4',
        // Top-level, as the command service's NORMALISED result carries it -- it lifts the revision
        // out and drops the run document.
        runRevision: 1,
      }),
      actor: { uuid: 'Actor.a' },
    });
    assert.equal(settled.success, false);
    assert.equal(settled.reason, 'execute-command-unavailable');
    assert.equal(settled.authorityUnavailable, true);
  });

  it('executes a ready fully-selected public craft under a second authority request', async () => {
    const commands = [];
    const resultItem = { uuid: 'Item.result' };
    const result = await executePublicCraft({
      engine: {
        craft: async () => ({
          success: true,
          runId: 'run-1',
          runRevision: 2,
          requiresExecution: true,
          canExecuteImmediately: true,
        }),
      },
      runManager: { getActiveRun: () => null },
      actor: { uuid: 'Actor.a' },
      sourceActors: [{ uuid: 'Actor.a' }, { uuid: 'Actor.source' }],
      recipe: { id: 'recipe' },
      ingredientSetId: 'set-1',
      options: {
        ingredientOptionOverrides: { ore: 'iron' },
        ingredientEssenceAllocation: { fire: 2 },
      },
      executeCommand: async (command) => {
        commands.push(command);
        return {
          success: true,
          runId: command.runId,
          runRevision: 5,
          terminal: true,
          createdResultUuids: [resultItem.uuid, 'Item.not-propagated'],
        };
      },
      resolveUuid: async (uuid) => {
        if (uuid === resultItem.uuid) return resultItem;
        throw new Error('document has not propagated');
      },
    });

    assert.deepEqual(commands, [{
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 2,
      action: 'execute',
      payload: {
        selectionPlan: {
          selectedIngredientSetId: 'set-1',
          ingredientOptionOverrides: { ore: 'iron' },
          ingredientEssenceAllocation: { fire: 2 },
        },
        trigger: 'manual',
        sourceActorUuids: ['Actor.a', 'Actor.source'],
      },
    }]);
    assert.deepEqual(result.results, [resultItem]);
  });

  it('leaves waiting and unresolved-choice public crafts editable without stage execution', async () => {
    for (const started of [
      { success: true, runId: 'waiting', requiresExecution: false, canExecuteImmediately: false },
      { success: true, runId: 'choices', requiresExecution: true, canExecuteImmediately: false },
    ]) {
      let executions = 0;
      const result = await executePublicCraft({
        engine: { craft: async () => started },
        runManager: { getActiveRun: () => null },
        actor: { uuid: 'Actor.a' },
        sourceActors: [{ uuid: 'Actor.a' }],
        recipe: { id: 'recipe' },
        executeCommand: async () => (++executions, { success: true }),
      });
      assert.equal(result, started);
      assert.equal(executions, 0);
    }
  });

  it('routes an immediately-ready manual check through the normal player prompt', async () => {
    let prompts = 0;
    let executions = 0;
    const resultItem = { uuid: 'Item.checked-result' };
    const run = { id: 'checked-run', lifecycleVersion: 1, runRevision: 2, status: 'waiting' };
    const { service, actor } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => (++prompts, { confirmed: true, bonus: '2' }),
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Forge', allowsSituationalModifier: true },
            privateEvaluation: { recipeId: 'recipe', rollFormula: '1d20' },
          }),
          evaluateCheck: async () => ({
            engineEvaluated: true,
            success: true,
            outcome: null,
            value: 16,
            data: {},
          }),
          execute: async () => (
            ++executions,
            {
              success: true,
              runId: run.id,
              runRevision: 4,
              terminal: true,
              createdResultUuids: [resultItem.uuid],
            }
          ),
        },
      },
    });

    const result = await executePublicCraft({
      engine: {
        craft: async () => ({
          success: true,
          runId: run.id,
          runRevision: run.runRevision,
          requiresExecution: true,
          canExecuteImmediately: true,
        }),
      },
      runManager: { getActiveRun: () => null },
      actor,
      sourceActors: [actor],
      recipe: { id: 'recipe' },
      executeCommand: (command) => service.executeJournalRunCommand(command),
      resolveUuid: async (uuid) => uuid === resultItem.uuid ? resultItem : null,
    });

    assert.equal(prompts, 1);
    assert.equal(executions, 1);
    assert.deepEqual(result.results, [resultItem]);
  });

  it('composes both persisted managers into one fail-closed reconstruction callback', async () => {
    const scopes = [];
    const reconstruct = createJournalExecutionReconstructor({
      getCraftingRunManager: () => ({
        reconstructVersionedExecutions: async (scope) => (
          scopes.push(['crafting', scope]), { success: true, reconstructed: 1 }
        ),
      }),
      getGatheringRunManager: () => ({
        reconstructVersionedExecutions: async (scope) => (
          scopes.push(['gathering', scope]), { success: true, reconstructed: 2 }
        ),
      }),
    });

    const response = await reconstruct({ operationId: 'operation-1', orphaned: false });
    assert.equal(response.success, true);
    assert.deepEqual(scopes, [
      ['crafting', { operationId: 'operation-1', orphaned: false }],
      ['gathering', { operationId: 'operation-1', orphaned: false }],
    ]);
    const unavailable = createJournalExecutionReconstructor({
      getCraftingRunManager: () => ({}),
      getGatheringRunManager: () => ({}),
    });
    assert.deepEqual(await unavailable({ orphaned: true }), {
      success: false,
      reason: 'reconstruction-unavailable',
    });
  });

  it('installs exact crafting and gathering request adapters on the current engines', async () => {
    const commands = [];
    const service = {
      async executeJournalRunCommand(command) {
        commands.push(command);
        return command;
      },
      consumeExecutionGrant: (grant, context) => ({ grant, context }),
    };
    const crafting = {
      installVersionedRunAuthority(authority) {
        this.authority = authority;
      },
    };
    const gathering = {
      installVersionedRunAuthority(authority) {
        this.authority = authority;
      },
    };
    const evaluatePreparedRunCheck = () => ({ engineEvaluated: true });

    installCraftingJournalRunAuthority({ engine: crafting, service });
    installGatheringJournalRunAuthority({
      engine: gathering,
      service,
      evaluatePreparedRunCheck,
    });

    await crafting.authority.requestExecute({
      actor: { uuid: 'Actor.crafter' },
      runId: 'craft-run',
      expectedRevision: 7,
      componentSourceActorUuids: ['Actor.source'],
      trigger: 'worldTime',
    });
    await gathering.authority.requestStart({
      actor: { uuid: 'Actor.gatherer' },
      rememberedActorId: 'gatherer',
      environmentId: 'forest',
      taskId: 'herbs',
      presentTools: { systemId: 'survival', componentIds: ['sickle'] },
      interactableRef: { sceneId: 's', regionId: 'r', behaviorId: 'b' },
      completionMode: 'manual',
    });
    await gathering.authority.requestCancel({
      actor: { uuid: 'Actor.gatherer' },
      runId: 'gather-run',
      expectedRevision: 4,
    });

    assert.deepEqual(commands, [
      {
        actorUuid: 'Actor.crafter',
        runType: 'crafting',
        runId: 'craft-run',
        expectedRevision: 7,
        action: 'execute',
        payload: {
          selectionPlan: undefined,
          trigger: 'worldTime',
          sourceActorUuids: ['Actor.source'],
        },
      },
      {
        actorUuid: 'Actor.gatherer',
        runType: 'gathering',
        runId: '',
        expectedRevision: 0,
        action: 'start',
        payload: {
          rememberedActorId: 'gatherer',
          environmentId: 'forest',
          taskId: 'herbs',
          presentTools: { systemId: 'survival', componentIds: ['sickle'] },
          interactableRef: { sceneId: 's', regionId: 'r', behaviorId: 'b' },
          completionMode: 'manual',
        },
      },
      {
        actorUuid: 'Actor.gatherer',
        runType: 'gathering',
        runId: 'gather-run',
        expectedRevision: 4,
        action: 'cancel',
        payload: {},
      },
    ]);
    assert.deepEqual(
      gathering.authority.evaluatePreparedRunCheck({}, {}, {}),
      { engineEvaluated: true }
    );
    assert.throws(
      () => installGatheringJournalRunAuthority({
        engine: {},
        service,
        evaluatePreparedRunCheck,
      }),
      /adapter is unavailable/,
      'a missing production engine adapter must fail during composition'
    );
  });

  it('routes gathering start, execute, automatic execute, and cancel through the command service', async () => {
    const calls = [];
    let installedAuthority = null;
    const run = {
      id: 'gather-run',
      lifecycleVersion: 1,
      runRevision: 3,
      status: 'waiting',
    };
    const engine = {
      installVersionedRunAuthority(authority) {
        installedAuthority = authority;
      },
      async startVersionedRun(args) {
        calls.push(['start', args]);
        return { success: true, runId: 'new-run', status: 'waiting', runRevision: 1 };
      },
      async describeVersionedStageCheck(args) {
        calls.push(['describe', args]);
        return { required: false, publicPrompt: {}, privateEvaluation: {} };
      },
      async executeVersionedStage(args) {
        calls.push(['execute', args]);
        return {
          success: true,
          runId: args.runId,
          status: 'completed',
          runRevision: args.expectedRevision + 1,
          terminal: true,
        };
      },
      async cancelVersionedRun(args) {
        calls.push(['cancel', args]);
        return {
          success: true,
          accepted: true,
          cancelled: true,
          refunded: false,
          restoredCount: 0,
          run: { ...run, status: 'cancelled', runRevision: 4 },
        };
      },
    };
    const runManager = {
      invalidateCache() {},
      getRun: () => run,
      getActiveRun: () => run,
      async pauseRun(actor, runId, options) {
        calls.push(['pause', { actor, runId, options }]);
        return { ...run, status: 'paused', runRevision: 4 };
      },
      async setCompletionMode(actor, runId, value, options) {
        calls.push(['setCompletionMode', { actor, runId, value, options }]);
        return { ...run, completionMode: value, runRevision: 4 };
      },
    };
    const operations = createGatheringJournalRunOperations({
      engine,
      runManager,
      getService: () => service,
      getUser: (id) => ({ id, isGM: id === 'gm' }),
    });
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      operations: { gathering: operations },
    });
    installGatheringJournalRunAuthority({
      engine,
      service,
      evaluatePreparedRunCheck: () => ({ engineEvaluated: true }),
    });

    const actor = { uuid: 'Actor.a' };
    const started = await installedAuthority.requestStart({
      actor,
      rememberedActorId: 'a',
      environmentId: 'forest',
      taskId: 'herbs',
      completionMode: 'manual',
    });
    const executed = await installedAuthority.requestExecute({
      actor,
      runId: run.id,
      expectedRevision: 3,
      trigger: 'manual',
    });
    const automatic = await installedAuthority.requestExecute({
      actor,
      runId: run.id,
      expectedRevision: 3,
      trigger: 'worldTime',
    });
    const cancelled = await installedAuthority.requestCancel({
      actor,
      runId: run.id,
      expectedRevision: 3,
    });
    const paused = await service.executeJournalRunCommand({
      actorUuid: actor.uuid,
      runType: 'gathering',
      runId: run.id,
      expectedRevision: 3,
      action: 'pause',
    });
    const completionMode = await service.executeJournalRunCommand({
      actorUuid: actor.uuid,
      runType: 'gathering',
      runId: run.id,
      expectedRevision: 3,
      action: 'setCompletionMode',
      payload: { completionMode: 'worldTime' },
    });
    const unsupportedSelection = await service.executeJournalRunCommand({
      actorUuid: actor.uuid,
      runType: 'gathering',
      runId: run.id,
      expectedRevision: 3,
      action: 'setSelection',
      payload: { selectionPlan: {} },
    });

    assert.equal(started.runId, 'new-run');
    assert.equal(executed.status, 'completed');
    assert.equal(automatic.status, 'completed');
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.refunded, false);
    assert.equal(cancelled.restoredCount, 0);
    assert.equal(paused.success, true);
    assert.equal(completionMode.success, true);
    assert.equal(unsupportedSelection.reason, 'unsupported-operation');
    assert.equal(calls.filter(([kind]) => kind === 'start').length, 1);
    assert.deepEqual(
      calls.filter(([kind]) => kind === 'execute').map(([, args]) => args.trigger),
      ['manual', 'worldTime']
    );
    assert.equal(calls.filter(([kind]) => kind === 'cancel').length, 1);
    assert.equal(calls[0][1].viewer.id, 'gm');
  });

  it('keeps a gathering secret-check result and engine details out of the reply', async () => {
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    let posts = 0;
    const engine = {
      describeVersionedStageCheck: async () => ({
        required: true,
        publicPrompt: { label: 'Unknown task', mode: 'routedByCheck' },
        privateEvaluation: { rollFormula: '1d20+12', secret: true },
      }),
      evaluatePreparedVersionedCheck: async () => ({
        engineEvaluated: true,
        secret: true,
        success: true,
        outcome: 'hidden-result',
        value: 27,
        data: { total: 27, diceGroups: [{ group: '1d20', results: [15] }] },
      }),
      executeVersionedStage: async () => ({
        success: true,
        runId: run.id,
        status: 'completed',
        runRevision: 4,
        message: '27: hidden-result',
        results: [{ uuid: 'Item.secret' }],
      }),
    };
    const operations = createGatheringJournalRunOperations({
      engine,
      runManager: { getRun: () => run },
      getService: () => service,
      getUser: () => ({ id: 'gm', isGM: true }),
    });
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      operations: { gathering: operations },
      promptCheck: async () => ({ confirmed: true }),
      postRollHandoff: async () => { posts += 1; },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'gathering',
      runId: run.id,
      expectedRevision: 3,
      action: 'execute',
    });

    assert.deepEqual(response, {
      success: true,
      runId: run.id,
      status: 'completed',
      runRevision: 4,
      secret: true,
      reason: null,
    });
    assert.equal(posts, 0);
  });

  /**
   * QE2-8 reported that `journalStore`'s cancel discriminator now lets the prepare-token RELEASE
   * fall through to a refresh.
   */
  it('keeps a dismissed roll a refusal, and never returns the release command answer', async () => {
    const run = { id: 'released-run', lifecycleVersion: 1, runRevision: 2, status: 'waiting' };
    const released = [];
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({ confirmed: false }),
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Forge' },
            privateEvaluation: { recipeId: 'recipe', rollFormula: '1d20' },
          }),
          execute: async () => {
            throw new Error('a dismissed roll must never execute');
          },
        },
      },
      authority: {
        availability: () => ({ available: true, reason: null }),
        run: async (_request, handler) =>
          handler({
            createExecutionGrant: () => ({ grant: true }),
            issuePrepareToken: () => 'token',
            consumePrepareToken: () => ({}),
            releasePrepareToken: (token) => (released.push(token), true),
          }),
        consumeExecutionGrant: (grant) => grant?.grant === true,
      },
    });

    const result = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: run.id,
      expectedRevision: 2,
      action: 'execute',
    });

    assert.equal(released.length, 1, 'the prepare token was released');
    assert.deepEqual(result, { success: false, cancelled: true, reason: 'roll-cancelled' });
    assert.equal(result.success, false, 'so the store returns early on a dismissal, as it did');
  });

  it('accepts a command only from the server-attested sender and re-resolves ownership', async () => {
    const { service, emitted, emissionOptions } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
        senderId: 'other',
      },
      'player'
    );
    assert.equal(reply.response.success, true);
    assert.equal(reply.recipientId, 'player');
    assert.equal(emitted[0], reply);
    assert.deepEqual(emissionOptions[0], { recipients: ['player'] });

    const denied = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r2',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'other'
    );
    assert.equal(denied.response.reason, 'owner-required');
    assert.deepEqual(emissionOptions[1], { recipients: ['other'] });
  });

  it('passes the attested sender to a current-lifecycle start operation', async () => {
    let startArgs = null;
    const { service } = commandHarness({
      currentUserId: 'gm',
      operations: {
        crafting: {
          start: async (args) => (
            startArgs = args,
            {
              success: true,
              runId: 'new-run',
              requiresExecution: true,
              canExecuteImmediately: true,
            }
          ),
        },
      },
    });

    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: '',
      expectedRevision: 0,
      action: 'start',
      payload: { recipeId: 'recipe' },
    });

    assert.equal(response.success, true);
    assert.equal(response.requiresExecution, true);
    assert.equal(response.canExecuteImmediately, true);
    assert.equal(startArgs.sender.id, 'gm');
    assert.equal(startArgs.senderId, 'gm');
  });

  it('lets only the elected GM tab answer a broadcast request', async () => {
    const { service, emitted } = commandHarness({ currentUserId: 'player' });
    const result = await service.handleSocketMessage(
      {
        kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );
    assert.equal(result, null);
    assert.deepEqual(emitted, []);
  });

  it('keeps a losing elected-GM tab silent so it cannot outrun the claim winner', async () => {
    for (const reason of ['claim-held', 'recovery-pending']) {
      const { service, emitted } = commandHarness({
        currentUserId: 'gm',
        authority: {
          availability: () => ({ available: false, reason }),
          run: async () => ({ success: false, reason }),
          consumeExecutionGrant: () => null,
        },
      });
      const result = await service.handleSocketMessage(
        {
          kind: JOURNAL_RUN_SOCKET_KIND.REQUEST,
          requestId: 'r1',
          sessionId: 's1',
          actorUuid: 'Actor.a',
          runType: 'crafting',
          runId: 'run-1',
          expectedRevision: 3,
          action: 'execute',
        },
        'player'
      );
      assert.equal(result, null);
      assert.deepEqual(emitted, []);
    }
  });

  it('rejects stale revision before invoking an operation', async () => {
    const { service } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 2,
        action: 'execute',
      },
      'player'
    );
    assert.deepEqual(reply, { success: false, reason: 'stale-run', currentRevision: 3 });
  });

  it('does not invoke the mutation when the elected GM changes during context resolution', async () => {
    let activeGmId = 'gm';
    let mutations = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3 };
    const { service } = commandHarness({
      currentUserId: 'gm',
      getActiveGM: () => ({ id: activeGmId, isGM: true }),
      operations: {
        crafting: {
          getRun: async () => {
            activeGmId = 'replacement-gm';
            return run;
          },
          execute: async () => (++mutations, { success: true }),
        },
      },
    });
    const response = await service.handleRequest(
      {
        requestId: 'election-change',
        sessionId: 'one',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: run.id,
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );

    assert.deepEqual(response, { success: false, reason: 'active-gm-required' });
    assert.equal(mutations, 0);
  });

  it('fails closed for unsupported run operations with zero effects', async () => {
    const { service } = commandHarness({ currentUserId: 'gm' });
    const reply = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'gathering',
        runId: 'run-1',
        expectedRevision: 0,
        action: 'execute',
      },
      'player'
    );
    assert.equal(reply.reason, 'unsupported-operation');
  });

  it('rejects legacy runs at the versioned command boundary', async () => {
    const { service } = commandHarness({ currentUserId: 'gm', run: { id: 'run-1', runRevision: 3 } });
    const response = await service.handleRequest(
      {
        requestId: 'r1',
        sessionId: 's1',
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
        expectedRevision: 3,
        action: 'execute',
      },
      'player'
    );
    assert.equal(response.reason, 'unsupported-version');
  });

  it('dispatches an authority-prepared recipe-less alchemy fizzle through its durable operation', async () => {
    let starts = 0;
    let fizzles = 0;
    const { service } = commandHarness({
      currentUserId: 'gm',
      operations: {
        crafting: {
          prepareStart: async () => ({
            success: true,
            executionOperation: 'executeAlchemyFizzle',
            payload: { craftingSystemId: 'alchemy' },
            trustedContext: { activityKind: 'alchemy', matched: false },
          }),
          start: async () => (++starts, { success: true }),
          executeAlchemyFizzle: async () => (++fizzles, {
            success: false,
            disposition: 'no-match',
          }),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: '',
      expectedRevision: 0,
      action: 'start',
      payload: { activityKind: 'alchemy' },
    });
    assert.equal(response.disposition, 'no-match');
    assert.equal(starts, 0);
    assert.equal(fizzles, 1);
  });

  it('prepares on the GM, accepts only player decisions, and posts a validated handoff locally', async () => {
    let executeArgs = null;
    let evaluatedDecision = null;
    let posted = null;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({
        confirmed: true,
        total: 999,
        chosenModifierIds: ['allowed'],
        advantage: 'advantage',
      }),
      postRollHandoff: async (handoff) => (posted = handoff),
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Forge', mode: 'simple' },
            privateEvaluation: { rollFormula: '1d20' },
          }),
          evaluateCheck: async ({ decision }) => {
            evaluatedDecision = decision;
            return {
              engineEvaluated: true,
              success: true,
              value: 17,
              data: {},
              rollHandoff: { serializedRoll: { formula: '1d20', total: 17 } },
            };
          },
          execute: async (args) => {
            executeArgs = args;
            return { success: true };
          },
        },
      },
    });
    const result = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
      payload: { total: 500, roll: { formula: 'bad' }, selectionPlan: { setId: 'one' } },
    });
    assert.equal(result.success, true);
    assert.deepEqual(evaluatedDecision, {
      bonus: null,
      rollMode: null,
      advantage: 'advantage',
      modifierIds: ['allowed'],
    });
    assert.equal(Object.hasOwn(executeArgs.payload, 'total'), false);
    assert.equal(Object.hasOwn(executeArgs.payload, 'roll'), false);
    assert.deepEqual(executeArgs.payload.selectionPlan, { setId: 'one' });
    assert.deepEqual(posted, { serializedRoll: { formula: '1d20', total: 17 } });
  });

  it('drops a visible roll handoff when post-commit entitlement is lost', async () => {
    let entitled = true;
    let posts = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({ confirmed: true }),
      postRollHandoff: async () => { posts += 1; },
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Known recipe' },
            privateEvaluation: { recipeId: 'recipe', rollFormula: '1d20' },
          }),
          evaluateCheck: async () => ({
            engineEvaluated: true,
            success: true,
            data: {},
            rollHandoff: { serializedRoll: { formula: '1d20', total: 14 } },
          }),
          execute: async () => {
            entitled = false;
            return { success: true, runId: run.id, runRevision: 4 };
          },
          authorizeRollHandoff: async () => entitled,
        },
      },
    });

    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: run.id,
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(Object.hasOwn(response, 'rollHandoff'), false);
    assert.equal(posts, 0);
  });

  it('returns a visible roll only when post-commit entitlement remains', async () => {
    let posts = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({ confirmed: true }),
      postRollHandoff: async () => { posts += 1; },
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Known recipe' },
            privateEvaluation: { recipeId: 'recipe', rollFormula: '1d20' },
          }),
          evaluateCheck: async () => ({
            engineEvaluated: true,
            success: true,
            data: {},
            rollHandoff: { serializedRoll: { formula: '1d20', total: 14 } },
          }),
          execute: async () => ({ success: true, runId: run.id, runRevision: 4 }),
          authorizeRollHandoff: async () => true,
        },
      },
    });
    await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: run.id,
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(posts, 1);
  });

  it('releases a prepared check on local dismissal without invoking the mutation', async () => {
    let releases = 0;
    let mutations = 0;
    const { service } = commandHarness({
      currentUserId: 'gm',
      promptCheck: async () => ({ confirmed: false }),
      authority: {
        availability: () => ({ available: true, reason: null }),
        run: async (_request, handler) => handler({
          createExecutionGrant: () => ({ grant: true }),
          issuePrepareToken: () => 'token',
          consumePrepareToken: () => null,
          releasePrepareToken: () => (++releases, true),
        }),
        consumeExecutionGrant: () => ({}),
      },
      operations: {
        crafting: {
          getRun: () => ({ id: 'run-1', lifecycleVersion: 1, runRevision: 3 }),
          describeCheck: async () => ({ required: true, publicPrompt: {}, privateEvaluation: {} }),
          execute: async () => (++mutations, { success: true }),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(response.cancelled, true);
    assert.equal(releases, 1);
    assert.equal(mutations, 0);
  });

  it('returns a sanitized secret-check reply without live results or roll details', async () => {
    let posts = 0;
    let postCommitAuthorizations = 0;
    const run = { id: 'run-1', lifecycleVersion: 1, runRevision: 3, status: 'waiting' };
    const { service } = commandHarness({
      currentUserId: 'gm',
      run,
      promptCheck: async () => ({ confirmed: true }),
      postRollHandoff: async () => { posts += 1; },
      operations: {
        crafting: {
          getRun: () => run,
          describeCheck: async () => ({
            required: true,
            publicPrompt: { label: 'Unknown work' },
            privateEvaluation: { rollFormula: '1d20+9' },
          }),
          evaluateCheck: async () => ({
            engineEvaluated: true,
            secret: true,
            success: true,
            outcome: 'hidden-tier',
            value: 19,
            data: { diceGroups: [{ group: '1d20', results: [19] }] },
          }),
          execute: async () => ({
            success: true,
            message: '19 vs DC 15',
            disposition: 'hidden-tier',
            results: [{ uuid: 'Item.secret', update() {} }],
          }),
          authorizeRollHandoff: async () => (++postCommitAuthorizations, true),
        },
      },
    });
    const response = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.deepEqual(response, {
      success: true,
      runId: 'run-1',
      status: null,
      runRevision: null,
      secret: true,
      reason: null,
    });
    assert.equal(posts, 0);
    assert.equal(
      postCommitAuthorizations,
      0,
      'a check evaluated as secret stays secret even if visibility is gained during execution'
    );
  });

  it('accepts replies only from the elected GM for this recipient/session/correlation', async () => {
    const { service, emitted } = commandHarness();
    const pending = service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    const request = emitted[0];
    const base = {
      kind: JOURNAL_RUN_SOCKET_KIND.REPLY,
      recipientId: 'player',
      sessionId: request.sessionId,
      requestId: request.requestId,
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      response: { success: true },
    };
    assert.equal(service.acceptReply({ ...base, recipientId: 'other' }, 'gm'), false);
    assert.equal(service.acceptReply({ ...base, sessionId: 'late-tab' }, 'gm'), false);
    assert.equal(service.acceptReply({ ...base, requestId: 'wrong' }, 'gm'), false);
    assert.equal(service.acceptReply(base, 'other'), false);
    assert.equal(service.acceptReply(base, 'gm'), true);
    assert.deepEqual(await pending, { success: true });
    assert.equal(service.acceptReply(base, 'gm'), false, 'late duplicate reply is ignored');
  });

  it('times out visibly and a retry receives a fresh request id', async () => {
    const { service, emitted } = commandHarness({ timeoutMs: 5 });
    const first = await service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.equal(first.reason, 'command-timeout');
    void service.executeJournalRunCommand({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
      expectedRevision: 3,
      action: 'execute',
    });
    assert.notEqual(emitted[0].requestId, emitted[1].requestId);
  });

  it('uses collision-safe JSON tuple dismissal keys', () => {
    assert.equal(
      journalRunDismissalKey({ actorUuid: 'Actor.a:b', runType: 'crafting', runId: 'c:d' }),
      '["Actor.a:b","crafting","c:d"]'
    );
  });

  it('dismisses only terminal history into the user setting and never mutates the run', async () => {
    let stored = {};
    const terminal = { id: 'run-1', lifecycleVersion: 1, runRevision: 4, status: 'succeeded' };
    const { service } = commandHarness({
      run: terminal,
      getDismissals: () => stored,
      setDismissals: async (value) => (stored = value),
    });
    const result = await service.dismissJournalRun({
      actorUuid: 'Actor.a',
      runType: 'crafting',
      runId: 'run-1',
    });
    assert.equal(result.success, true);
    assert.equal(Object.keys(stored).length, 1);
    assert.equal(terminal.status, 'succeeded', 'history is untouched');
    assert.ok(service.getDismissedJournalRunKeys({ actorUuid: 'Actor.a', viewerId: 'player' }).has(result.key));

    const active = commandHarness({ run: { ...terminal, status: 'waiting' } });
    assert.equal(
      (await active.service.dismissJournalRun({
        actorUuid: 'Actor.a',
        runType: 'crafting',
        runId: 'run-1',
      })).reason,
      'active-run'
    );
  });
});

describe('journal run pause lifecycle at the real command boundary', () => {
  function loadCraftingOperations() {
    const source = readFileSync(new URL('../src/bootstrap/journalOperations.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function resolveJournalSourceActors(');
    const end = source.indexOf('export function createJournalCommandsForFabricate(', start);
    assert.ok(start >= 0 && end > start, 'the production operation factory must be present');
    return compileFunction(`${source.slice(start, end)}\nreturn createCraftingJournalOperations;`, [
      'resolveAlchemySubmissions',
      'resolvedComponentsFor',
      'createManagerMutation',
    ])(resolveAlchemySubmissions, resolvedComponentsFor, createManagerMutation);
  }

  // A merging flag write, like Foundry's: `setFlag` never removes a key deleted from a nested
  // object, which is what made a resume vanish and deadlock the next pause.
  function mergingActor() {
    const flags = {};
    return {
      id: 'crafter',
      uuid: 'Actor.crafter',
      isOwner: true,
      items: [],
      getFlag: (scope, key) => flags[scope]?.[key],
      async setFlag(scope, key, value) {
        flags[scope] ??= {};
        flags[scope][key] = mergeHistoryFlag(flags[scope][key], value);
        return this;
      },
    };
  }

  async function pauseHarness({ runCount = 1 } = {}) {
    let seq = 0;
    globalThis.foundry = { utils: { randomID: () => `rid-${(seq += 1)}` } };
    const actor = mergingActor();
    const gm = { id: 'gm', isGM: true };
    globalThis.game = { user: gm, time: { worldTime: 1000 }, actors: [actor] };
    globalThis.fromUuid = async (uuid) => (uuid === actor.uuid ? actor : null);

    const recipe = {
      id: 'recipe-pause',
      craftingSystemId: 'system',
      validate: () => ({ valid: true, errors: [] }),
      getExecutionSteps: () => [{ id: 'step-1', name: 'Wait' }],
    };
    const manager = new CraftingRunManager();
    const runs = [];
    for (let index = 0; index < runCount; index += 1) {
      const created = await manager.createRun(actor, recipe, [actor], 'gm', {
        lifecycleVersion: 1,
        completionMode: 'worldTime',
      });
      await manager.markStepWaitingForTime(actor, created, 0, { minutes: 2 });
      runs.push(created);
    }
    const run = runs[0];

    const ledger = { id: 'ledger', state: null, claim: null };
    const authority = createJournalRunAuthority({
      currentUser: () => gm,
      activeGM: () => gm,
      listLedgers: async () => [ledger],
      createLedger: async () => ledger,
      deleteLedger: async () => {},
      readState: async () => structuredClone(ledger.state),
      writeState: async (_entry, state) => {
        ledger.state = structuredClone(state);
      },
      createClaim: async (_entry, source) => {
        if (ledger.claim) throw new Error('duplicate embedded id');
        ledger.claim = { ...source };
        return ledger.claim;
      },
      readClaim: async () => ledger.claim,
      deleteClaim: async (_entry, claimId) => {
        if (ledger.claim?.claimId !== claimId) return false;
        ledger.claim = null;
        return true;
      },
      reconstructExecutions: async () => ({ success: true, reconstructed: 0 }),
      randomId: () => `claim-${(seq += 1)}`,
    });

    let service = null;
    // The REAL engine, so a cancel drives the production `cancelVersionedRun` rather than a
    // double that cannot reach the refund, the run write or the authority's settle path.
    const engine = new CraftingEngine(
      { getRecipe: (id) => (id === recipe.id ? recipe : null) },
      manager
    );
    const operations = loadCraftingOperations()(
      { craftingRunManager: manager, craftingEngine: engine, recipeManager: { getRecipe: () => recipe } },
      () => service
    );
    service = createJournalRunCommandService({
      authority,
      currentUser: () => gm,
      activeGM: () => gm,
      getUser: () => gm,
      resolveUuid: async (uuid) => (uuid === actor.uuid ? actor : null),
      emit: () => {},
      randomId: () => `request-${(seq += 1)}`,
      operations: { crafting: operations },
    });

    installCraftingJournalRunAuthority({ engine, service });

    const commandOn = (runId, action, expectedRevision) =>
      service.executeJournalRunCommand({
        actorUuid: actor.uuid,
        runType: 'crafting',
        runId,
        expectedRevision,
        action,
        payload: {},
      });
    const command = (action, expectedRevision) => commandOn(run.id, action, expectedRevision);
    return { actor, authority, command, commandOn, engine, ledger, manager, run, runs };
  }

  function withGlobals(body) {
    return async () => {
      const saved = {
        game: globalThis.game,
        foundry: globalThis.foundry,
        fromUuid: globalThis.fromUuid,
      };
      try {
        await body();
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete globalThis[key];
          else globalThis[key] = value;
        }
      }
    };
  }

  it(
    'pauses, resumes and pauses again without the resume being lost to the flag merge',
    withGlobals(async () => {
      const { command, manager, actor, run } = await pauseHarness();

      globalThis.game.time.worldTime = 1030;
      const paused = await command('pause', 1);
      assert.equal(paused.success, true);
      assert.equal(paused.runRevision, 2);

      globalThis.game.time.worldTime = 1130;
      const resumed = await command('resume', 2);
      assert.equal(resumed.success, true);
      assert.equal(resumed.runRevision, 3);
      manager.invalidateCache(actor.id);
      assert.equal(manager.getActiveRun(actor, run.id).pauseState, null);

      const repaused = await command('pause', 3);
      assert.equal(repaused.success, true, repaused.message ?? repaused.reason);
      assert.equal(repaused.runRevision, 4);
    })
  );

  it(
    'leaves the authority usable for a DIFFERENT run after a real cancel settles',
    withGlobals(async () => {
      // M25: the maintainer cancelled one of seven runs and every remaining run then reported
      // `claim-held` with NO claim page on the ledger.
      const { authority, commandOn, ledger, runs } = await pauseHarness({ runCount: 2 });
      const [first, second] = runs;
      const observed = [];
      const spy = authority.run;
      authority.run = (request, handler) =>
        spy(request, async (helpers) => {
          await authority.refreshAvailability();
          observed.push({ ...authority.availability(), claim: Boolean(ledger.claim) });
          return handler(helpers);
        });

      const cancelled = await commandOn(first.id, 'cancel', 1);

      assert.equal(cancelled.success, true, cancelled.message ?? cancelled.reason);
      assert.equal(cancelled.cancelled, true);
      assert.deepEqual(observed, [{ available: false, reason: 'claim-held', claim: true }]);
      assert.equal(ledger.claim, null, 'the cancel released the claim it held');
      assert.deepEqual(authority.availability(), { available: true, reason: null });

      const next = await commandOn(second.id, 'cancel', 1);
      assert.equal(next.success, true, next.reason ?? next.message);
      assert.equal(next.cancelled, true, 'the NEXT run is cancellable without a reload');
      assert.deepEqual(authority.availability(), { available: true, reason: null });
    })
  );

  it(
    'releases the execution claim when a pause refusal wrote nothing',
    withGlobals(async () => {
      const { command, authority, ledger } = await pauseHarness();

      globalThis.game.time.worldTime = 1030;
      assert.equal((await command('pause', 1)).success, true);

      const refused = await command('pause', 2);

      assert.equal(refused.success, false);
      assert.equal(refused.reason, 'lifecycle-refused');
      assert.equal(refused.message, 'The run is already paused');
      assert.equal(ledger.claim, null, 'a refusal that wrote nothing releases its claim');
      assert.deepEqual(authority.availability(), { available: true, reason: null });
      assert.equal(
        (await command('resume', 2)).success,
        true,
        'the run stays usable rather than needing GM recovery'
      );
    })
  );
});
