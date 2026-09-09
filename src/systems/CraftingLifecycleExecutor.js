import { getCommittedExecutionOutcome, observeExecutionJournal } from './runExecutionJournal.js';
import { getRunLifecycleContract } from './runLifecycleState.js';

export class CraftingLifecycleExecutionError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CraftingLifecycleExecutionError';
    this.code = code;
  }
}

/**
 * Executes one versioned crafting stage as a durable, forward-only operation.
 *
 * The caller supplies crafting-specific effect seams. This collaborator owns their
 * ordering around the persisted journal and never retries an effect after invocation
 * starts. It deliberately provides no rollback abstraction: a lost acknowledgement is
 * recovery-required evidence, not permission to replay or compensate automatically.
 */
export class CraftingLifecycleExecutor {
  constructor({ runManager, consumeExecutionGrant }) {
    this.runManager = runManager;
    this.consumeExecutionGrant = consumeExecutionGrant;
  }

  async execute({
    actor,
    runId,
    expectedRevision,
    requestId,
    executionGrant,
    selectionPlan = null,
    operation,
  }) {
    const trusted = await this._consumeGrant({
      actor,
      runId,
      expectedRevision,
      requestId,
      executionGrant,
    });
    const persisted = this._currentRunAnyStatus(actor, runId);
    const committed = persisted.executionJournal
      ? getCommittedExecutionOutcome(persisted.executionJournal, requestId)
      : null;
    if (committed) return { run: persisted, outcome: committed, receipts: {} };
    const run = this._currentRun(actor, runId);
    this._assertExecutable(run, expectedRevision);

    const resolvedOperation =
      typeof operation === 'function' ? await operation({ actor, run, trusted }) : operation;
    const executable = normalizeOperation(resolvedOperation);
    await executable.validateTrusted?.(trusted);
    let current = run;
    const existingJournal = current.executionJournal
      ? observeExecutionJournal(current.executionJournal)
      : null;
    let receipts = {};
    if (existingJournal?.status === 'planned') {
      assertResumableOperation(existingJournal, executable, trusted.operationId, requestId);
      if (existingJournal.effects.some((effect) => effect.phase === 'applying')) {
        await this._markRecoveryRequired(actor, current);
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

      current = await this._transition(actor, current, {
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

    for (const effect of executable.effects) {
      const persisted = observeExecutionJournal(current.executionJournal).effects.find(
        (entry) => entry.effectId === effect.effectId
      );
      if (persisted?.phase === 'applied') continue;
      current = await this._transition(actor, current, {
        type: 'effectApplying',
        effectId: effect.effectId,
      });
      let receipt;
      try {
        receipt = await effect.apply({ actor, run: current, trusted, receipts: { ...receipts } });
      } catch (error) {
        await this._markRecoveryRequired(actor, current);
        throw new CraftingLifecycleExecutionError(
          `Crafting effect "${effect.effectId}" requires recovery`,
          'RECOVERY_REQUIRED',
          error
        );
      }
      receipts[effect.effectId] = receipt ?? null;
      current = this._currentRunAnyStatus(actor, runId);
      try {
        current = await this._transition(actor, current, {
          type: 'effectApplied',
          effectId: effect.effectId,
          receipt: receipts[effect.effectId],
        });
      } catch (error) {
        await this._markRecoveryRequired(actor, current);
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
    current = await this._transition(actor, current, { type: 'commit', outcome });
    return { run: current, outcome, receipts };
  }

  async _consumeGrant({ actor, runId, expectedRevision, requestId, executionGrant }) {
    if (typeof this.consumeExecutionGrant !== 'function') {
      throw executionError('Versioned crafting authority is unavailable', 'AUTHORITY_UNAVAILABLE');
    }
    const trusted = await this.consumeExecutionGrant(executionGrant, {
      operation: 'execute',
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

  _assertExecutable(run, expectedRevision) {
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
    if (run.executionJournal?.status === 'recoveryRequired') {
      throw executionError('The crafting run requires recovery', 'RECOVERY_REQUIRED');
    }
    if (Number(expectedRevision) !== Number(run.runRevision)) {
      throw executionError('The crafting run revision is stale', 'STALE_RUN_REVISION');
    }
    if (!Number.isSafeInteger(Number(run.currentStepIndex))) {
      throw executionError('The crafting run has no executable stage', 'STALE_RUN_STAGE');
    }
  }

  _transition(actor, run, transition) {
    return this.runManager.updateExecutionJournal(actor, run.id, transition, {
      expectedRevision: run.runRevision,
    });
  }

  async _markRecoveryRequired(actor, run) {
    try {
      const current = this._currentRunAnyStatus(actor, run.id);
      await this._transition(actor, current, { type: 'recoveryRequired' });
    } catch {
      // The applying record already makes replay unsafe. A second persistence failure
      // cannot be repaired here and must not obscure the original ambiguous effect.
    }
  }
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

function cloneJson(value) {
  if (value === undefined) return;
  return JSON.parse(JSON.stringify(value));
}
