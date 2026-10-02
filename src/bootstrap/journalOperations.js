/**
 * The Journal run-command authority edge: source-actor resolution, the crafting operation table and
 * the service the composition root hangs on the facade. The pure halves are in `src/systems/`.
 */

import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { publicAdditionalDiceOffer } from '../systems/additionalDiceReach.js';
import { publicAdvantageOffer } from '../systems/checkAdvantage.js';
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
import { localizeWith } from '../utils/localizeWithFallback.js';

import { getGatheringEngine } from './gatheringRuntime.js';

/** What a player reads when a re-prepared check differs from the one they answered. */
function checkChangedNotice() {
  return localizeWith(
    (key) => globalThis.game?.i18n?.localize?.(key),
    'FABRICATE.App.Journal.CheckChanged',
    undefined,
    "This roll's details changed while you were deciding. Check them and roll again."
  );
}

/** Formula flavour such as `[Modifiers]` labels a term for the chat card, not for the prompt. */
function displayFormula(formula) {
  if (typeof formula !== 'string') return formula;
  return formula
    .replaceAll(/\[[^\]]*\]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/** The entitled Journal descriptor's named display fields are the prompt's only input. */
export function promptJournalStageCheck(descriptor, prompt = promptCheckRoll) {
  return prompt({
    name: descriptor?.subject ?? descriptor?.label,
    actorName: descriptor?.actorName,
    activity: descriptor?.activity,
    img: descriptor?.img,
    formula: displayFormula(descriptor?.formula),
    resolvedFormula: displayFormula(descriptor?.resolvedFormula),
    displayFormula: displayFormula(descriptor?.displayFormula),
    dc: descriptor?.target,
    direction: descriptor?.direction,
    ...(descriptor?.targetSource === 'attribute' && { targetSource: 'attribute' }),
    targetBasis: descriptor?.targetBasis,
    toolBonus: descriptor?.toolBonus,
    comparison: descriptor?.comparison,
    thresholdMode: descriptor?.comparison === 'exceed' ? 'exceed' : null,
    selectedModifiers: descriptor?.selectedModifiers,
    allowAdvantage: descriptor?.allowAdvantage === true,
    advantageOffer: publicAdvantageOffer(descriptor?.advantageOffer),
    offerSituationalBonus: descriptor?.offerSituationalBonus !== false,
    modifierChoice: descriptor?.modifierChoice ?? null,
    ...(descriptor?.product === 'count' && {
      product: 'count',
      pool: descriptor.pool,
      threshold: descriptor.threshold,
      thresholdAnchor: descriptor.thresholdAnchor,
      thresholdSource: descriptor.thresholdSource,
      die: descriptor.die,
      explode: descriptor.explode,
      cancel: descriptor.cancel,
      zeroPoolFails: descriptor.zeroPoolFails,
      required: descriptor.required,
      modifierDestination: descriptor.modifierDestination,
      pendingTools: descriptor.pendingTools,
    }),
    ...(descriptor?.additionalDiceOffer && {
      additionalDiceOffer: publicAdditionalDiceOffer(descriptor.additionalDiceOffer),
    }),
  });
}

/**
 * A named gathering prompt carries its activity, as a crafting one already does; a descriptor
 * without a `label` is a hidden check and keeps the prompt's generic title.
 */
export function withPromptActivity(operations, activity) {
  const describeCheck = operations.describeCheck;
  if (typeof describeCheck !== 'function') return operations;
  return {
    ...operations,
    describeCheck: async (request) => {
      const descriptor = await describeCheck(request);
      const prompt = descriptor?.publicPrompt;
      if (!prompt?.label || prompt.activity) return descriptor;
      return { ...descriptor, publicPrompt: { ...prompt, activity: activity() } };
    },
  };
}

/**
 * A check that cannot roll refuses at describe as it does at evaluate, `roll-unavailable` with its
 * sentence (issue 2139), so the client clears a stale result as for any misconfigured check. Any
 * other describe failure still throws.
 */
export function withUnrollableCheckRefusal(operations) {
  const describeCheck = operations.describeCheck;
  if (typeof describeCheck !== 'function') return operations;
  return {
    ...operations,
    describeCheck: async (request) => {
      try {
        return await describeCheck(request);
      } catch (error) {
        if (error?.code !== 'CHECK_TARGET_INVALID') throw error;
        return { required: false, blocked: 'roll-unavailable', detail: { message: error.message } };
      }
    },
  };
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

/**
 * A count check's wording keys, which choose the bonus help and modifier note; its pool,
 * threshold, die, face rules and required count stay out of a redacted prompt.
 */
function countPromptWording(prompt) {
  if (prompt?.product !== 'count') return {};
  return {
    product: 'count',
    direction: prompt.direction === 'under' ? 'under' : 'over',
    comparison: prompt.comparison === 'exceed' ? 'exceed' : 'meet',
    modifierDestination: prompt.modifierDestination === 'threshold' ? 'threshold' : 'pool',
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
          advantageOffer: publicAdvantageOffer(descriptor.publicPrompt?.advantageOffer),
          offerSituationalBonus: descriptor.publicPrompt?.offerSituationalBonus !== false,
          ...countPromptWording(descriptor.publicPrompt),
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
        user: sender,
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

export function createJournalCommandsForFabricate(
  fabricate,
  authority = createJournalAuthorityForFabricate(fabricate)
) {
  let service = null;
  service = createJournalRunCommandService({
    authority,
    operations: {
      crafting: withUnrollableCheckRefusal(
        createCraftingJournalOperations(fabricate, () => service)
      ),
      gathering: withPromptActivity(
        withUnrollableCheckRefusal(
          createGatheringJournalRunOperations({
            getEngine: () => getGatheringEngine(),
            runManager: fabricate.gatheringRunManager,
            getService: () => service,
            getUser: (userId) => game.users?.get(userId) ?? null,
          })
        ),
        () =>
          localizeWith(
            (key) => globalThis.game?.i18n?.localize?.(key),
            'FABRICATE.App.Nav.Gathering',
            undefined,
            'Gathering'
          )
      ),
    },
    currentUser: () => game.user,
    activeGM: () => game.users?.activeGM ?? null,
    getUser: (userId) => game.users?.get(userId) ?? null,
    resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    emit: (message, options) => game.socket?.emit(EVENT_SCENE_SOCKET, message, options ?? {}),
    randomId: () => foundry.utils.randomID(),
    promptCheck: (descriptor) => promptJournalStageCheck(descriptor),
    postRollHandoff: (handoff) => postCheckRollHandoff(handoff),
    onCheckChanged: () => globalThis.ui?.notifications?.info?.(checkChangedNotice()),
    getDismissals: () => getSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS),
    setDismissals: (value) => setSetting(SETTING_KEYS.JOURNAL_RUN_DISMISSALS, value),
    onDismissalsChanged: (payload) => Hooks.callAll('fabricate.journalDismissalsChanged', payload),
  });
  installCraftingJournalRunAuthority({ engine: fabricate.craftingEngine, service });
  return service;
}

/**
 * The world's one Journal run authority. The run commands and the companion operations share this
 * instance, so both queue on one local chain and contend on one claim page.
 */
export function createJournalAuthorityForFabricate(fabricate) {
  return createFoundryJournalRunAuthority({
    reconstructExecutions: createJournalExecutionReconstructor({
      getCraftingRunManager: () => fabricate.craftingRunManager,
      getGatheringRunManager: () => fabricate.gatheringRunManager,
    }),
    // A refusal that has LIFTED invalidates every surface that captured it, the Journal having read
    // availability when it built its listing (issue 1648, M25). Broadcast the LIFT, never the
    // refusal: a refusal is true while it holds, and announcing it repaints mid-command.
    onAvailabilityRestored: () => Hooks.callAll('fabricate.journalRunAuthorityRestored'),
  });
}
