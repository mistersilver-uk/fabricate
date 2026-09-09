import { CraftingLifecycleExecutionError } from './CraftingLifecycleExecutor.js';
import { getCommittedExecutionOutcome, observeExecutionJournal } from './runExecutionJournal.js';

/**
 * Persists and executes the recipe-less effects of an alchemy no-match.
 *
 * A fizzle has no active recipe run, so it is planned directly into history before
 * its dead-end and optional consumption effects begin. Applied receipts may resume as
 * a prefix; an applying effect is always recovery-required and is never invoked again.
 */
export class CraftingFizzleExecutor {
  constructor({ runManager, consumeExecutionGrant }) {
    this.runManager = runManager;
    this.consumeExecutionGrant = consumeExecutionGrant;
  }

  async execute({
    actor,
    requestId,
    executionGrant,
    details,
    effects,
    outcome,
    validateTrusted = null,
  }) {
    const trusted = await this._consumeGrant(actor, requestId, executionGrant);
    this.runManager.invalidateCache?.(actor?.id);
    const existing = this.runManager
      .getRunHistory(actor)
      .find(
        (run) =>
          run?.isFizzle === true &&
          run?.executionJournal?.requestId === String(requestId ?? '').trim()
      );
    if (existing) {
      const committed = getCommittedExecutionOutcome(existing.executionJournal, requestId);
      if (committed) return { run: existing, outcome: committed };
    } else {
      await validateTrusted?.(trusted);
    }
    const resolvedEffects = typeof effects === 'function' ? await effects({ trusted }) : effects;
    const normalized = normalizeEffects(resolvedEffects);
    let run = await this.runManager.planVersionedFizzle(actor, {
      ...details,
      operationId: trusted.operationId,
      requestId,
      effects: normalized.map(({ effectId, kind, planned }) => ({ effectId, kind, planned })),
    });
    const committed = getCommittedExecutionOutcome(run.executionJournal, requestId);
    if (committed) return { run, outcome: committed };
    const observed = observeExecutionJournal(run.executionJournal);
    if (observed.operationId !== trusted.operationId) {
      throw executionError(
        'The fizzle operation does not own this history record',
        'OPERATION_MISMATCH'
      );
    }
    if (
      observed.status === 'recoveryRequired' ||
      observed.effects.some((effect) => effect.phase === 'applying')
    ) {
      await this._recover(actor, run);
      throw executionError('The alchemy fizzle requires recovery', 'RECOVERY_REQUIRED');
    }

    const receipts = Object.fromEntries(
      observed.effects
        .filter((effect) => effect.phase === 'applied')
        .map((effect) => [effect.effectId, effect.receipt])
    );
    for (const effect of normalized) {
      const persisted = observeExecutionJournal(run.executionJournal).effects.find(
        (entry) => entry.effectId === effect.effectId
      );
      if (persisted?.phase === 'applied') continue;
      run = await this._transition(actor, run, {
        type: 'effectApplying',
        effectId: effect.effectId,
      });
      let receipt;
      try {
        receipt = await effect.apply({ actor, trusted, receipts: { ...receipts } });
      } catch (error) {
        await this._recover(actor, run);
        throw new CraftingLifecycleExecutionError(
          `Alchemy fizzle effect "${effect.effectId}" requires recovery`,
          'RECOVERY_REQUIRED',
          error
        );
      }
      receipts[effect.effectId] = receipt ?? null;
      run = this._current(actor, run.id);
      try {
        run = await this._transition(actor, run, {
          type: 'effectApplied',
          effectId: effect.effectId,
          receipt: receipts[effect.effectId],
        });
      } catch (error) {
        await this._recover(actor, run);
        throw new CraftingLifecycleExecutionError(
          `Alchemy fizzle effect "${effect.effectId}" receipt could not be persisted`,
          'RECOVERY_REQUIRED',
          error
        );
      }
    }
    const result = typeof outcome === 'function' ? await outcome({ receipts }) : outcome;
    run = await this._transition(actor, run, { type: 'commit', outcome: result });
    return { run, outcome: result };
  }

  async _consumeGrant(actor, requestId, executionGrant) {
    if (typeof this.consumeExecutionGrant !== 'function') {
      throw executionError('Versioned crafting authority is unavailable', 'AUTHORITY_UNAVAILABLE');
    }
    const trusted = await this.consumeExecutionGrant(executionGrant, {
      operation: 'executeAlchemyFizzle',
      actor,
      runId: null,
      expectedRevision: null,
      requestId,
    });
    const operationId = String(trusted?.operationId ?? '').trim();
    if (!operationId) {
      throw executionError('Versioned crafting authority is unavailable', 'AUTHORITY_UNAVAILABLE');
    }
    return { ...trusted, operationId };
  }

  _current(actor, runId) {
    this.runManager.invalidateCache?.(actor?.id);
    const run = this.runManager.getRun?.(actor, runId) ?? null;
    if (!run) throw executionError('The fizzle history record disappeared', 'RUN_NOT_FOUND');
    return run;
  }

  _transition(actor, run, transition) {
    return this.runManager.updateExecutionJournal(actor, run.id, transition, {
      expectedRevision: run.runRevision,
    });
  }

  async _recover(actor, run) {
    try {
      const current = this._current(actor, run.id);
      await this._transition(actor, current, { type: 'recoveryRequired' });
    } catch {
      // The persisted applying phase still proves ambiguity when recovery persistence fails.
    }
  }
}

function normalizeEffects(effects) {
  const normalized = (effects || []).map((effect) => ({
    effectId: requiredString(effect?.effectId, 'effectId'),
    kind: requiredString(effect?.kind, 'kind'),
    planned: cloneJson(effect?.planned) ?? null,
    apply:
      typeof effect?.apply === 'function'
        ? effect.apply
        : () => {
            throw executionError('A fizzle effect has no implementation', 'INVALID_OPERATION');
          },
  }));
  if (new Set(normalized.map((effect) => effect.effectId)).size !== normalized.length) {
    throw executionError('Fizzle effect ids must be unique', 'INVALID_OPERATION');
  }
  return normalized;
}

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized)
    throw executionError(`Fizzle operation ${label} is required`, 'INVALID_OPERATION');
  return normalized;
}

function executionError(message, code) {
  return new CraftingLifecycleExecutionError(message, code);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
