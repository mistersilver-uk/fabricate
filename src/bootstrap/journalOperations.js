/**
 * The Journal run-command authority edge: source-actor resolution, the crafting operation table and
 * the service the composition root hangs on the facade. The pure halves are in `src/systems/`.
 */

import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { evaluatePreparedCraftingCheck, postCheckRollHandoff } from '../systems/checkRoll.js';
import { EVENT_SCENE_SOCKET } from '../systems/eventSceneCoordinator.js';
import { createFoundryJournalRunAuthority } from '../systems/journalRunAuthority.js';
import {
  createGatheringJournalRunOperations,
  createJournalExecutionReconstructor,
  createJournalRunCommandService,
  createManagerMutation,
  installCraftingJournalRunAuthority,
} from '../systems/journalRunCommands.js';
import { resolvedComponentsFor } from '../systems/scopedEntityReads.js';
import { promptCheckRoll } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { resolveAlchemySubmissions } from '../utils/alchemySubmissions.js';

import { getGatheringEngine } from './gatheringRuntime.js';

/** The entitled Journal descriptor's named display fields are the prompt's only input. */
export function promptJournalStageCheck(descriptor, prompt = promptCheckRoll) {
  return prompt({
    name: descriptor?.subject ?? descriptor?.label,
    actorName: descriptor?.actorName,
    activity: descriptor?.activity,
    img: descriptor?.img,
    formula: descriptor?.formula,
    resolvedFormula: descriptor?.resolvedFormula,
    dc: descriptor?.target,
    comparison: descriptor?.comparison,
    thresholdMode: descriptor?.comparison === 'exceed' ? 'exceed' : null,
    selectedModifiers: descriptor?.selectedModifiers,
    allowAdvantage: descriptor?.allowAdvantage === true,
    modifierChoice: descriptor?.modifierChoice ?? null,
  });
}

async function resolveJournalSourceActors(run, payload = {}, fallbackActor = null) {
  const supplied = Array.isArray(payload.sourceActorUuids) ? payload.sourceActorUuids : null;
  const persisted = Array.isArray(run?.componentSourceActorUuids)
    ? run.componentSourceActorUuids
    : null;
  const uuids = persisted ?? supplied ?? [];
  const actors = [];
  for (const uuid of uuids) {
    try {
      const actor = await globalThis.fromUuid?.(uuid);
      if (actor) actors.push(actor);
    } catch {
      return null;
    }
  }
  if (actors.length > 0) return actors;
  return fallbackActor ? [fallbackActor] : [];
}

function journalSourcesOwnedBy(sender, actors) {
  return (
    sender?.isGM === true ||
    actors.every((actor) => actor?.testUserPermission?.(sender, 'OWNER') === true)
  );
}

function consumeJournalGrant(service, grant, context) {
  return service?.consumeExecutionGrant?.(grant, context) ?? null;
}

/** Look the run up and answer whether this sender owns every source actor it names. */
function buildRunLookupOperations(fabricate) {
  return {
    getRun: ({ actor, runId }) => {
      fabricate.craftingRunManager?.invalidateCache?.(actor?.id);
      return (
        fabricate.craftingRunManager?.getRun?.(actor, runId) ??
        fabricate.craftingRunManager?.getActiveRun?.(actor, runId) ??
        null
      );
    },
    authorize: async ({ actor, run, payload, sender }) => {
      const sourceActors = await resolveJournalSourceActors(run, payload, actor);
      return Boolean(sourceActors && journalSourcesOwnedBy(sender, sourceActors));
    },
  };
}

/** The alchemy start legs: the canonical-submission preparation and the fizzle execution. */
function buildAlchemyOperations(fabricate) {
  return {
    prepareStart: async ({ actor, payload, preparationGrant, requestId }) => {
      if (payload.activityKind !== 'alchemy') return { success: true, payload };
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const system = fabricate.craftingSystemManager?.getSystem?.(payload.craftingSystemId) ?? null;
      if (!system || system.resolutionMode !== 'alchemy') {
        return { success: false, reason: 'alchemy-system-not-found' };
      }
      const submitted = Array.isArray(payload.submittedItems) ? payload.submittedItems : [];
      const componentIds = submitted.map((record) => record?.componentId);
      if (componentIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const canonicalSubmissions = resolveAlchemySubmissions(
        sourceActors,
        resolvedComponentsFor(system),
        componentIds,
        payload.craftingSystemId
      );
      if (
        canonicalSubmissions.length !== submitted.length ||
        canonicalSubmissions.some(
          (record, index) => record.item?.uuid !== submitted[index]?.itemUuid
        )
      ) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const prepare = fabricate.craftingEngine?.prepareVersionedAlchemyStart;
      if (typeof prepare !== 'function') return { success: false, reason: 'unsupported-operation' };
      const prepared = await prepare.call(fabricate.craftingEngine, {
        actor,
        sourceActors,
        craftingSystemId: payload.craftingSystemId,
        submittedItems: canonicalSubmissions,
        executionGrant: preparationGrant,
        requestId,
      });
      if (!prepared?.matched) {
        return {
          success: true,
          executionOperation: 'executeAlchemyFizzle',
          payload,
          trustedContext: {
            ...prepared,
            alchemySubmittedItems: canonicalSubmissions,
          },
        };
      }
      return {
        success: true,
        payload: {
          ...payload,
          recipeId: prepared.recipeId,
          selectionPlan: prepared.selectionPlan,
        },
        trustedContext: {
          ...prepared,
          alchemySubmittedItems: canonicalSubmissions,
        },
      };
    },
    executeAlchemyFizzle: async ({ actor, payload, executionGrant, requestId, sender }) => {
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const system = fabricate.craftingSystemManager?.getSystem?.(payload.craftingSystemId) ?? null;
      const submitted = Array.isArray(payload.submittedItems) ? payload.submittedItems : [];
      const submittedItems = resolveAlchemySubmissions(
        sourceActors,
        resolvedComponentsFor(system),
        submitted.map((record) => record?.componentId),
        payload.craftingSystemId
      );
      if (
        submittedItems.length !== submitted.length ||
        submittedItems.some((record, index) => record.item?.uuid !== submitted[index]?.itemUuid)
      ) {
        return { success: false, reason: 'alchemy-submission-invalid' };
      }
      const execute = fabricate.craftingEngine?.executeVersionedAlchemyFizzle;
      if (typeof execute !== 'function') return { success: false, reason: 'unsupported-operation' };
      return execute.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        sourceActors,
        craftingSystemId: payload.craftingSystemId,
        submittedItems,
        executionGrant,
        requestId,
      });
    },
  };
}

/** The versioned run start. */
function buildRunStartOperations(fabricate) {
  return {
    start: async ({ actor, payload, executionGrant, requestId, sender }) => {
      const sourceActors = await resolveJournalSourceActors(null, payload, actor);
      if (!sourceActors) return { success: false, reason: 'source-actor-not-found' };
      const start = fabricate.craftingEngine?.startVersionedRun;
      if (typeof start !== 'function') return { success: false, reason: 'unsupported-operation' };
      return start.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        sourceActors,
        recipeId: payload.recipeId,
        selectionPlan: payload.selectionPlan,
        completionMode: payload.completionMode,
        executionGrant,
        requestId,
      });
    },
  };
}

/** The check legs: what the GM describes to the initiator, and how a decision is graded. */
function buildCheckOperations(fabricate, authorizeRollHandoff) {
  return {
    describeCheck: async ({ actor, run, payload, sender, preparationGrant, requestId }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { required: false, blocked: 'source-actor-not-found' };
      const describe = fabricate.craftingEngine?.describeVersionedStageCheck;
      if (typeof describe !== 'function') {
        return { required: false, blocked: 'unsupported-operation' };
      }
      const descriptor = await describe.call(fabricate.craftingEngine, {
        actor,
        componentSourceActors,
        runId: run.id,
        selectionPlan: payload.selectionPlan,
        preparationGrant,
        requestId,
      });
      if (!descriptor?.required) return descriptor;
      const visible = await authorizeRollHandoff({
        actor,
        run,
        payload,
        sender,
        privateEvaluation: descriptor.privateEvaluation,
      });
      if (visible) return descriptor;
      // The engine describes the check on the GM. Only the attested initiator's
      // entitlement permits its subject or modifiers to enter the initial reply.
      // An unnamed descriptor uses the local prompt's generic check title.
      return {
        ...descriptor,
        publicPrompt: {
          allowsSituationalModifier: descriptor.publicPrompt?.allowsSituationalModifier === true,
          allowAdvantage: descriptor.publicPrompt?.allowAdvantage === true,
        },
      };
    },
    evaluateCheck: async ({ actor, privateEvaluation, decision, sender }) => {
      const componentSourceActors =
        (await resolveJournalSourceActors(
          null,
          {
            sourceActorUuids: privateEvaluation?.componentSourceActorUuids,
          },
          actor
        )) ?? [];
      const recipe = fabricate.recipeManager?.getRecipe?.(privateEvaluation?.recipeId) ?? null;
      const visible =
        sender?.isGM === true ||
        Boolean(
          recipe &&
          fabricate.recipeVisibilityService
            ?.getVisibleRecipes?.({
              viewer: sender,
              craftingActor: actor,
              componentSourceActors,
              craftingSystemId: recipe.craftingSystemId,
            })
            ?.some?.((candidate) => candidate?.recipe?.id === recipe.id)
        );
      return evaluatePreparedCraftingCheck(privateEvaluation, actor, decision, {
        secret: !visible,
      });
    },
    authorizeRollHandoff,
  };
}

/** The stage legs: execute, begin and cancel, each re-resolving its own source actors. */
function buildStageOperations(fabricate) {
  return {
    execute: async ({
      actor,
      run,
      payload,
      executionGrant,
      requestId,
      expectedRevision,
      sender,
    }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const execute = fabricate.craftingEngine?.executeVersionedStage;
      if (typeof execute !== 'function') return { success: false, reason: 'unsupported-operation' };
      return execute.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        componentSourceActors,
        runId: run.id,
        expectedRevision,
        selectionPlan: payload.selectionPlan,
        trigger: payload.trigger === 'worldTime' ? 'worldTime' : 'manual',
        executionGrant,
        requestId,
      });
    },
    beginStep: async ({
      actor,
      run,
      payload,
      executionGrant,
      requestId,
      expectedRevision,
      sender,
    }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const begin = fabricate.craftingEngine?.beginVersionedStage;
      if (typeof begin !== 'function') return { success: false, reason: 'unsupported-operation' };
      return begin.call(fabricate.craftingEngine, {
        viewer: sender,
        actor,
        componentSourceActors,
        runId: run.id,
        expectedRevision,
        selectionPlan: payload.selectionPlan,
        executionGrant,
        requestId,
      });
    },
    cancel: async ({ actor, run, payload, executionGrant, requestId, expectedRevision }) => {
      const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
      if (!componentSourceActors) return { success: false, reason: 'source-actor-not-found' };
      const cancel = fabricate.craftingEngine?.cancelVersionedRun;
      if (typeof cancel !== 'function') return { success: false, reason: 'unsupported-operation' };
      return cancel.call(fabricate.craftingEngine, {
        actor,
        runId: run.id,
        expectedRevision,
        executionGrant,
        requestId,
      });
    },
  };
}

/** The run-manager mutations, each taken inside the authority claim. */
function buildRunMutationOperations(fabricate, managerMutation) {
  return {
    pause: (args) =>
      managerMutation(args, 'pause', () =>
        fabricate.craftingRunManager?.pauseRun?.(args.actor, args.runId, {
          expectedRevision: args.expectedRevision,
        })
      ),
    resume: (args) =>
      managerMutation(args, 'resume', () =>
        fabricate.craftingRunManager?.resumeRun?.(args.actor, args.runId, {
          expectedRevision: args.expectedRevision,
        })
      ),
    setCompletionMode: (args) =>
      managerMutation(args, 'setCompletionMode', () =>
        fabricate.craftingRunManager?.setCompletionMode?.(
          args.actor,
          args.runId,
          args.payload.completionMode,
          { expectedRevision: args.expectedRevision }
        )
      ),
    setSelection: (args) => {
      const recipe = fabricate.recipeManager?.getRecipe?.(args.run.recipeId);
      const step = recipe?.getExecutionSteps?.()?.[args.payload.stepIndex];
      const selection = args.payload.selectionPlan ?? {};
      const selectedId = String(selection.selectedIngredientSetId ?? '').trim();
      const selectedSet = step?.ingredientSets?.find((set) => set.id === selectedId);
      if (!selectedSet) return { success: false, reason: 'ingredient-set-not-found' };
      // This callback runs inside the authority claim, after actor/source ownership
      // and revision checks. Snapshot the authored route here, never client evidence.
      return managerMutation(args, 'setSelection', () =>
        fabricate.craftingRunManager?.setStepSelectionPlan?.(
          args.actor,
          args.runId,
          args.payload.stepIndex,
          {
            ...selection,
            selectedIngredientSetId: selectedSet.id,
            selectedRequirementSnapshot: selectedSet.toJSON?.() ?? selectedSet,
          },
          { expectedRevision: args.expectedRevision }
        )
      );
    },
  };
}

function createCraftingJournalOperations(fabricate, getService) {
  const authorizeRollHandoff = async ({ actor, run, payload, sender, privateEvaluation }) => {
    const componentSourceActors = await resolveJournalSourceActors(run, payload, actor);
    if (!componentSourceActors) return false;
    const recipeId = privateEvaluation?.recipeId ?? run?.recipeId;
    const recipe = fabricate.recipeManager?.getRecipe?.(recipeId) ?? null;
    if (!recipe) return false;
    if (sender?.isGM === true) return true;
    if (!sender) return false;
    return Boolean(
      fabricate.recipeVisibilityService
        ?.getVisibleRecipes?.({
          viewer: sender,
          craftingActor: actor,
          componentSourceActors,
          craftingSystemId: recipe.craftingSystemId,
        })
        ?.some?.((candidate) => candidate?.recipe?.id === recipe.id)
    );
  };
  const managerMutation = createManagerMutation((grant, context) =>
    consumeJournalGrant(getService(), grant, context)
  );
  return {
    ...buildRunLookupOperations(fabricate),
    ...buildAlchemyOperations(fabricate),
    ...buildRunStartOperations(fabricate),
    ...buildCheckOperations(fabricate, authorizeRollHandoff),
    ...buildStageOperations(fabricate),
    ...buildRunMutationOperations(fabricate, managerMutation),
    authorizeRollHandoff,
  };
}

export function createJournalCommandsForFabricate(fabricate) {
  const authority = createFoundryJournalRunAuthority({
    reconstructExecutions: createJournalExecutionReconstructor({
      getCraftingRunManager: () => fabricate.craftingRunManager,
      getGatheringRunManager: () => fabricate.gatheringRunManager,
    }),
    // A refusal that has LIFTED invalidates every surface that captured it, the Journal having read
    // availability when it built its listing (issue 1648, M25). Broadcast the LIFT, never the
    // refusal: a refusal is true while it holds, and announcing it repaints mid-command.
    onAvailabilityRestored: () => Hooks.callAll('fabricate.journalRunAuthorityRestored'),
  });
  let service = null;
  service = createJournalRunCommandService({
    authority,
    operations: {
      crafting: createCraftingJournalOperations(fabricate, () => service),
      gathering: createGatheringJournalRunOperations({
        getEngine: () => getGatheringEngine(),
        runManager: fabricate.gatheringRunManager,
        getService: () => service,
        getUser: (userId) => game.users?.get(userId) ?? null,
      }),
    },
    currentUser: () => game.user,
    activeGM: () => game.users?.activeGM ?? null,
    getUser: (userId) => game.users?.get(userId) ?? null,
    resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    emit: (message, options) => game.socket?.emit(EVENT_SCENE_SOCKET, message, options ?? {}),
    randomId: () => foundry.utils.randomID(),
    promptCheck: (descriptor) => promptJournalStageCheck(descriptor),
    postRollHandoff: (handoff) => postCheckRollHandoff(handoff),
    getDismissals: () => getSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS),
    setDismissals: (value) => setSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS, value),
    onDismissalsChanged: (payload) => Hooks.callAll('fabricate.journalDismissalsChanged', payload),
  });
  installCraftingJournalRunAuthority({ engine: fabricate.craftingEngine, service });
  return service;
}
