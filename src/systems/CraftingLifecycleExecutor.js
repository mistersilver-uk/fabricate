import { cloneJson } from '../utils/scalars.js';

import { getCommittedExecutionOutcome, observeExecutionJournal } from './runExecutionJournal.js';
import { getRunLifecycleContract } from './runLifecycleState.js';

export class CraftingLifecycleExecutionError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CraftingLifecycleExecutionError';
    this.code = code;
  }
}

/** A stage executes on an active run and journals into `executionJournal`. */
const STAGE_LANE = Object.freeze({
  operation: 'execute',
  journal: 'executionJournal',
  otherJournal: 'awardChoiceJournal',
  terminalAdmitted: false,
});

/** A pending award choice settles on an active or terminal run, never replacing the stage's
 *  committed journal (issue 1773). */
const AWARD_CHOICE_LANE = Object.freeze({
  operation: 'chooseAward',
  journal: 'awardChoiceJournal',
  otherJournal: 'executionJournal',
  terminalAdmitted: true,
});

/**
 * Orders caller-supplied crafting effects around a persisted versioned-run journal.
 * Invocation forbids retry: a lost acknowledgement requires recovery, never replay or rollback.
 */
export class CraftingLifecycleExecutor {
  constructor({ runManager, consumeExecutionGrant }) {
    this.runManager = runManager;
    this.consumeExecutionGrant = consumeExecutionGrant;
  }

  /** Settle a pending award choice: the `chooseAward` grant, journalled in `awardChoiceJournal`. */
  settleAwardChoice(request) {
    return this.execute({ ...request, selectionPlan: null, lane: AWARD_CHOICE_LANE });
  }

  async execute({
    actor,
    runId,
    expectedRevision,
    requestId,
    executionGrant,
    selectionPlan = null,
    operation,
    lane = STAGE_LANE,
  }) {
    const trusted = await this._consumeGrant(lane, {
      actor,
      runId,
      expectedRevision,
      requestId,
      executionGrant,
    });
    const persisted = this._currentRunAnyStatus(actor, runId);
    const journal = persisted[lane.journal];
    const committed = journal ? getCommittedExecutionOutcome(journal, requestId) : null;
    if (committed) return { run: persisted, outcome: committed, receipts: {} };
    const existingJournal = journal ? observeExecutionJournal(journal) : null;
    const resuming = existingJournal?.status === 'planned';
    const run = resuming || lane.terminalAdmitted ? persisted : this._currentRun(actor, runId);
    this._assertExecutable(lane, run, expectedRevision, resuming || lane.terminalAdmitted);

    const resolvedOperation =
      typeof operation === 'function' ? await operation({ actor, run, trusted }) : operation;
    const executable = normalizeOperation(resolvedOperation);
    await executable.validateTrusted?.(trusted);
    let current = run;
    let receipts = {};
    if (existingJournal?.status === 'planned') {
      assertResumableOperation(existingJournal, executable, trusted.operationId, requestId);
      if (existingJournal.effects.some((effect) => effect.phase === 'applying')) {
        await this._markRecoveryRequired(lane, actor, current);
        throw executionError('The crafting stage requires recovery', 'RECOVERY_REQUIRED');
      }
      receipts = Object.fromEntries(
        existingJournal.effects
          .filter((effect) => effect.phase === 'applied')
          .map((effect) => [effect.effectId, effect.receipt])
      );
    } else {
      if (selectionPlan) {
        current = await this.runManager.setStepSelectionPlan(
          actor,
          runId,
          current.currentStepIndex,
          selectionPlan,
          { expectedRevision: current.runRevision }
        );
      }

      current = await this._transition(lane, actor, current, {
        type: 'plan',
        plan: {
          operationId: trusted.operationId,
          requestId,
          baseRunRevision: current.runRevision,
          intent: executable.intent,
          effects: executable.effects.map(({ effectId, kind, planned }) => ({
            effectId,
            kind,
            planned,
          })),
        },
      });
    }
    await executable.hydrate?.({ receipts: { ...receipts }, resumed: resuming });

    for (const effect of executable.effects) {
      const persisted = observeExecutionJournal(current[lane.journal]).effects.find(
        (entry) => entry.effectId === effect.effectId
      );
      if (persisted?.phase === 'applied') continue;
      current = await this._transition(lane, actor, current, {
        type: 'effectApplying',
        effectId: effect.effectId,
      });
      let receipt;
      try {
        receipt = await effect.apply({ actor, run: current, trusted, receipts: { ...receipts } });
      } catch (error) {
        throw await this._effectFailure(lane, actor, current, effect.effectId, error);
      }
      receipts[effect.effectId] = receipt ?? null;
      current = this._currentRunAnyStatus(actor, runId);
      try {
        current = await this._transition(lane, actor, current, {
          type: 'effectApplied',
          effectId: effect.effectId,
          receipt: receipts[effect.effectId],
        });
      } catch (error) {
        await this._markRecoveryRequired(lane, actor, current);
        throw new CraftingLifecycleExecutionError(
          `Crafting effect "${effect.effectId}" receipt could not be persisted`,
          'RECOVERY_REQUIRED',
          error
        );
      }
    }

    const outcome =
      typeof executable.outcome === 'function'
        ? await executable.outcome({ actor, run: current, trusted, receipts: { ...receipts } })
        : executable.outcome;
    current = await this._transition(lane, actor, current, { type: 'commit', outcome });
    return { run: current, outcome, receipts };
  }

  async _consumeGrant(lane, { actor, runId, expectedRevision, requestId, executionGrant }) {
    if (typeof this.consumeExecutionGrant !== 'function') {
      throw executionError('Versioned crafting authority is unavailable', 'AUTHORITY_UNAVAILABLE');
    }
    const trusted = await this.consumeExecutionGrant(executionGrant, {
      operation: lane.operation,
      actor,
      runId,
      expectedRevision,
      requestId,
    });
    if (!trusted || typeof trusted !== 'object' || !stringValue(trusted.operationId)) {
      throw executionError('Versioned crafting authority is unavailable', 'AUTHORITY_UNAVAILABLE');
    }
    return { ...trusted, operationId: stringValue(trusted.operationId) };
  }

  _currentRun(actor, runId) {
    this.runManager?.invalidateCache?.(actor?.id);
    const run = this.runManager?.getActiveRun?.(actor, runId) ?? null;
    if (!run) throw executionError('The crafting run is not active', 'RUN_NOT_FOUND');
    return run;
  }

  _currentRunAnyStatus(actor, runId) {
    this.runManager?.invalidateCache?.(actor?.id);
    const run = this.runManager?.getRun?.(actor, runId) ?? null;
    if (!run)
      throw executionError('The crafting run disappeared during execution', 'RUN_NOT_FOUND');
    return run;
  }

  _assertExecutable(lane, run, expectedRevision, resuming = false) {
    const contract = getRunLifecycleContract(run);
    if (contract !== 'current') {
      throw executionError(
        contract === 'unsupported'
          ? 'The crafting run lifecycle version is unsupported'
          : 'The crafting run is not versioned',
        contract === 'unsupported' ? 'UNSUPPORTED_RUN' : 'LEGACY_RUN'
      );
    }
    if (run.pauseState) throw executionError('The crafting run is paused', 'RUN_PAUSED');
    if (
      run.executionJournal?.status === 'recoveryRequired' ||
      run[lane.journal]?.status === 'recoveryRequired'
    ) {
      throw executionError('The crafting run requires recovery', 'RECOVERY_REQUIRED');
    }
    // The two lanes exclude each other: neither plans while the other's plan is unfinished.
    if (run[lane.journal]?.status !== 'planned' && run[lane.otherJournal]?.status === 'planned') {
      throw executionError('The run already has an execution in progress', 'EXECUTION_IN_PROGRESS');
    }
    if (Number(expectedRevision) !== Number(run.runRevision)) {
      throw executionError('The crafting run revision is stale', 'STALE_RUN_REVISION');
    }
    if (!resuming && !Number.isSafeInteger(Number(run.currentStepIndex))) {
      throw executionError('The crafting run has no executable stage', 'STALE_RUN_STAGE');
    }
  }

  _transition(lane, actor, run, transition) {
    return this.runManager.updateExecutionJournal(actor, run.id, transition, {
      expectedRevision: run.runRevision,
      journal: lane.journal,
    });
  }

  /**
   * Settle a failed effect. A DEFINITE refusal that has written nothing at all discards the plan
   * instead of demanding recovery, so a run no effect touched stays ordinary and retryable rather
   * than becoming permanently unclearable (issue 1648, F1).
   */
  async _effectFailure(lane, actor, run, effectId, error) {
    const applied = observeExecutionJournal(run[lane.journal]).effects.some(
      (entry) => entry.phase === 'applied'
    );
    if (!applied && isDefiniteRefusal(error)) {
      await this._abandonPlan(lane, actor, run);
      return error;
    }
    await this._markRecoveryRequired(lane, actor, run);
    return new CraftingLifecycleExecutionError(
      `Crafting effect "${effectId}" requires recovery`,
      'RECOVERY_REQUIRED',
      error
    );
  }

  async _abandonPlan(lane, actor, run) {
    try {
      const current = this._currentRunAnyStatus(actor, run.id);
      await this._transition(lane, actor, current, { type: 'abandonPlan' });
    } catch {
      // The plan is evidence of an operation that changed nothing; failing to discard it leaves
      // a stale plan, which the next attempt reports rather than silently replaying.
    }
  }

  async _markRecoveryRequired(lane, actor, run) {
    try {
      const current = this._currentRunAnyStatus(actor, run.id);
      await this._transition(lane, actor, current, { type: 'recoveryRequired' });
    } catch {
      // The applying record already makes replay unsafe. A second persistence failure
      // cannot be repaired here and must not obscure the original ambiguous effect.
    }
  }
}

/**
 * Whether an effect's failure established that NOTHING reached the database. Only the stack-path
 * guard answers this today: it refuses before dispatching, which is the distinction
 * `StackQuantityPathRefusal` exists to carry and which recovery must not swallow.
 */
function isDefiniteRefusal(error) {
  return error?.code === 'STACK_QUANTITY_PATH_REFUSED';
}

function assertResumableOperation(journal, executable, operationId, requestId) {
  const expected = {
    operationId: String(operationId ?? '').trim(),
    requestId: String(requestId ?? '').trim(),
    intent: executable.intent,
    effects: executable.effects.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
  };
  const persisted = {
    operationId: journal.operationId,
    requestId: journal.requestId,
    intent: journal.intent,
    effects: journal.effects.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
  };
  if (JSON.stringify(persisted) !== JSON.stringify(expected)) {
    throw executionError(
      'The persisted crafting plan does not match this operation',
      'PLAN_MISMATCH'
    );
  }
}

function normalizeOperation(operation) {
  if (!operation || typeof operation !== 'object') {
    throw executionError('A crafting stage operation is required', 'INVALID_OPERATION');
  }
  const effects = Array.isArray(operation.effects)
    ? operation.effects.map((effect) => ({
        effectId: requiredString(effect?.effectId, 'effectId'),
        kind: requiredString(effect?.kind, 'kind'),
        planned: cloneJson(effect?.planned) ?? null,
        apply:
          typeof effect?.apply === 'function'
            ? effect.apply
            : () => {
                throw executionError(
                  'A crafting effect has no implementation',
                  'INVALID_OPERATION'
                );
              },
      }))
    : [];
  if (new Set(effects.map((effect) => effect.effectId)).size !== effects.length) {
    throw executionError('Crafting effect ids must be unique', 'INVALID_OPERATION');
  }
  return {
    intent: cloneJson(operation.intent) ?? null,
    effects,
    outcome: operation.outcome ?? null,
    hydrate: typeof operation.hydrate === 'function' ? operation.hydrate : null,
    validateTrusted:
      typeof operation.validateTrusted === 'function' ? operation.validateTrusted : null,
  };
}

function requiredString(value, label) {
  const text = stringValue(value);
  if (!text) throw executionError(`Crafting operation ${label} is required`, 'INVALID_OPERATION');
  return text;
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function executionError(message, code) {
  return new CraftingLifecycleExecutionError(message, code);
}
