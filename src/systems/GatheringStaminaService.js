import {
  cloneJson,
  durationToSeconds,
  nonNegativeNumber,
  normalizeList,
  numberOrNullStrict,
  readState,
  writeState,
} from './gatheringRichStateInternals.js';

/**
 * Owns the per-actor stamina subsystem extracted from
 * {@link GatheringRichStateService}: seeding pools from system expression
 * templates, GM set/adjust, and world-time regeneration. Behaviour and
 * persisted shapes are identical to the prior in-place implementation; the
 * parent delegates its public stamina methods here.
 *
 * All Foundry/calendar/economy coupling is injected, so this collaborator never
 * reaches for globals: the economy block is read through `getSystemEconomy`
 * (the parent's single normalized read path), expressions resolve through the
 * same `evaluateExpression` seam d100 uses, regen interval lengths come from the
 * calendar-aware `secondsPerUnit`, history ids/world-time come from the parent's
 * `historyEvent`/`now`, and hooks fire through `callHook`.
 */
export class GatheringStaminaService {
  /**
   * @param {object} options
   * @param {Function} options.getSystemEconomy Normalized economy block reader
   *   keyed by system id (the parent's `_systemEconomy`).
   * @param {Function} [options.evaluateExpression] Async expression evaluator.
   * @param {Function} [options.secondsPerUnit] Seam resolving one regen unit to
   *   seconds (calendar-aware day/week lengths).
   * @param {Function} [options.now] Current world-time getter.
   * @param {Function} [options.callHook] Hook dispatcher.
   * @param {Function} [options.historyEvent] History-event factory (id + worldTime).
   */
  constructor({
    getSystemEconomy,
    evaluateExpression = null,
    secondsPerUnit = null,
    now = () => 0,
    callHook = () => {},
    historyEvent = null,
  } = {}) {
    this.getSystemEconomy = getSystemEconomy;
    this.evaluateExpression = evaluateExpression;
    this.secondsPerUnit = typeof secondsPerUnit === 'function' ? secondsPerUnit : () => 3600;
    this.now = typeof now === 'function' ? now : () => 0;
    this.callHook = typeof callHook === 'function' ? callHook : () => {};
    this.historyEvent =
      typeof historyEvent === 'function'
        ? historyEvent
        : (type, data = {}) => ({ type, ...cloneJson(data) });
  }

  getActorStamina(actor, systemId = null) {
    const state = readState(actor);
    const key = systemId || 'default';
    const stamina = state.stamina?.[key] || {};
    // Pools are materialized per character at seed time (the system max/start
    // expressions are rolled once into numbers), so this stays synchronous and
    // simply reads the stored values. A character with no pool reads `null`.
    // `max` is the rolled value; an optional GM `maxOverride` layers over it.
    const rolledMax = numberOrNullStrict(stamina.max);
    const maxOverride = numberOrNullStrict(stamina.maxOverride);
    const max = maxOverride ?? rolledMax; // effective cap
    const storedCurrent = numberOrNullStrict(stamina.current);
    const current = storedCurrent ?? max;
    return {
      current,
      max,
      rolledMax,
      maxOverride,
      // Read-time compatibility: a never-rewritten legacy pool persisted with
      // `provider: 'external'` reads back as a read-only max.
      maxReadOnly: stamina.maxReadOnly === true || stamina.provider === 'external',
      regenerationMode: stamina.regenerationMode || 'manual',
    };
  }

  /**
   * Materialize a character's stamina pool from the system `max`/`start`
   * expression templates, rolling them once and persisting the resulting
   * numbers. Idempotent: a character that already has a pool keeps it unless
   * `force` is set (the GM Roll/Reset path). No-ops when stamina is disabled or
   * when the max template is blank/non-finite (⇒ no pool, stamina unenforced).
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The materialized pool, or null on no-op.
   */
  async seedActorStaminaIfNeeded({
    actor,
    systemId,
    system = null,
    environment = null,
    force = false,
  } = {}) {
    const key = systemId || 'default';
    const econ = this.getSystemEconomy(key);
    if (econ.stamina?.enabled !== true) return null;

    const state = readState(actor);
    const existing = state.stamina?.[key];
    if (!force && existing && numberOrNullStrict(existing.max) != null) {
      return cloneJson(existing);
    }

    const maxValue = await this._evaluateStaminaExpression({
      expression: econ.stamina?.max,
      actor,
      system,
      environment,
      kind: 'staminaMax',
    });
    if (maxValue == null) return null; // no max configured ⇒ leave unseeded (stamina unenforced)
    const max = Math.max(0, Math.round(maxValue));

    const startRaw = await this._evaluateStaminaExpression({
      expression: econ.stamina?.start,
      actor,
      system,
      environment,
      kind: 'staminaStart',
    });
    const start = startRaw == null ? max : Math.max(0, Math.round(startRaw)); // blank start ⇒ full

    const entry = {
      maxReadOnly: false,
      regenerationMode: econ.stamina?.regen?.policy === 'overTime' ? 'auto' : 'manual',
      current: Math.min(start, max),
      max,
      lastRegenWorldTime: this.now(),
    };
    state.stamina = { ...state.stamina, [key]: entry };
    state.history = [
      this.historyEvent('stamina.seed', { systemId: key, current: entry.current, max }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this.callHook('fabricate.gathering.staminaSeeded', {
      actor,
      systemId: key,
      stamina: cloneJson(entry),
    });
    return cloneJson(entry);
  }

  /**
   * Evaluate a stamina expression template against an actor, returning a finite
   * number or null when the template is blank/unresolvable. Reuses the same
   * Roll-backed `evaluateExpression` seam regen uses.
   */
  async _evaluateStaminaExpression({
    expression,
    actor,
    system = null,
    environment = null,
    kind = 'stamina',
  } = {}) {
    if (expression == null || expression === '') return null;
    const value =
      typeof this.evaluateExpression === 'function'
        ? await this.evaluateExpression({
            expression: String(expression),
            provider: null,
            actor,
            kind,
            system,
            environment,
          })
        : Number(expression);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async setActorStamina(
    actor,
    {
      systemId = 'default',
      current = null,
      max = null,
      maxOverride,
      maxReadOnly,
      // Legacy API back-compat: a `provider: 'external'` argument maps to a
      // read-only max. Any other legacy provider value is treated as writable.
      provider,
      regenerationMode = 'manual',
    } = {}
  ) {
    const state = readState(actor);
    const key = systemId || 'default';
    const previous = state.stamina?.[key] || {};
    // Resolve the read-only-max flag from the incoming arg (preferring the new
    // boolean, falling back to a legacy `provider: 'external'`) and, when the
    // arg is silent, from the prior entry (including its own legacy provider).
    const argMaxReadOnly =
      maxReadOnly === undefined
        ? provider === undefined
          ? undefined
          : provider === 'external'
        : maxReadOnly === true;
    const priorMaxReadOnly = previous.maxReadOnly === true || previous.provider === 'external';
    const effectiveMaxReadOnly = argMaxReadOnly === undefined ? priorMaxReadOnly : argMaxReadOnly;
    const priorMax = numberOrNullStrict(previous.max);
    const providedMax = numberOrNullStrict(max);
    // `max` is the rolled cap. When omitted, the prior rolled max is preserved
    // (the panel only edits current + override). When provided: writable pools
    // accept it freely; a read-only-max pool's maximum is fixed once
    // established, but an as-yet unset pool may still be initialized.
    const rolledMax =
      providedMax != null && (!effectiveMaxReadOnly || priorMax == null) ? providedMax : priorMax;
    // `maxOverride`: undefined preserves the prior override; a finite number
    // sets it; null/'' clears it. The effective cap is the override, else rolled.
    const override =
      maxOverride === undefined
        ? numberOrNullStrict(previous.maxOverride)
        : maxOverride === null || maxOverride === ''
          ? null
          : nonNegativeNumber(maxOverride, 0);
    const effectiveMax = override ?? rolledMax;
    let currentValue = nonNegativeNumber(current, previous.current ?? 0);
    if (Number.isFinite(Number(effectiveMax)))
      currentValue = Math.min(currentValue, Number(effectiveMax));
    const next = {
      maxReadOnly: effectiveMaxReadOnly,
      regenerationMode: regenerationMode || previous.regenerationMode || 'manual',
      current: currentValue,
      max: rolledMax,
      ...(!(override == null) && { maxOverride: override }),
      // Preserve the regen anchor so a manual GM set does not reset the clock.
      ...(!(previous.lastRegenWorldTime === undefined) && {
        lastRegenWorldTime: previous.lastRegenWorldTime,
      }),
    };
    state.stamina = { ...state.stamina, [key]: next };
    state.history = [
      this.historyEvent('stamina.set', {
        systemId: key,
        current: next.current,
        max: next.max,
        maxOverride: override,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this.callHook('fabricate.gathering.staminaAdjusted', {
      actor,
      systemId: key,
      stamina: cloneJson(next),
    });
    return cloneJson(next);
  }

  async adjustActorStamina(actor, { systemId = 'default', delta = 0 } = {}) {
    const key = systemId || 'default';
    const effective = this.getActorStamina(actor, key);
    const next = Math.max(0, Number(effective.current || 0) + Number(delta || 0));
    const clamped = effective.max === null ? next : Math.min(next, effective.max);
    const state = readState(actor);
    const previous = state.stamina?.[key] || {};
    // Preserve the stored max verbatim (null stays null) so the system default
    // max stays authoritative when no per-actor override exists.
    const previousOverride = numberOrNullStrict(previous.maxOverride);
    const entry = {
      maxReadOnly: previous.maxReadOnly === true || previous.provider === 'external',
      regenerationMode: previous.regenerationMode || effective.regenerationMode || 'manual',
      current: clamped,
      max: numberOrNullStrict(previous.max),
      ...(!(previousOverride == null) && { maxOverride: previousOverride }),
      ...(!(previous.lastRegenWorldTime === undefined) && {
        lastRegenWorldTime: previous.lastRegenWorldTime,
      }),
    };
    state.stamina = { ...state.stamina, [key]: entry };
    state.history = [
      this.historyEvent('stamina.adjust', {
        systemId: key,
        delta: Number(delta || 0),
        current: clamped,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this.callHook('fabricate.gathering.staminaAdjusted', {
      actor,
      systemId: key,
      stamina: cloneJson(entry),
    });
    return cloneJson(entry);
  }

  /**
   * Regenerate one actor's stamina for a stamina-mode system as world time
   * passes. Adds the configured per-interval amount once for each whole
   * `regen.unit` elapsed since the last evaluation, clamps to the pool max, and
   * advances the persisted anchor by exactly the consumed intervals so the
   * fractional remainder accrues toward the next tick. No-ops when the system
   * does not have stamina enabled, regen is off, the pool has no max, or world time
   * has not advanced a full interval (re-anchoring on backwards jumps).
   *
   * @param {object} payload
   * @returns {Promise<object|null>} The updated stamina entry, or null on no-op.
   */
  async regenerateActorStamina({
    actor,
    systemId,
    system = null,
    environment = null,
    worldTime,
  } = {}) {
    const key = systemId || 'default';
    const econ = this.getSystemEconomy(key);
    if (econ.stamina?.enabled !== true) return null;
    const regen = econ.stamina?.regen || {};
    if (regen.policy !== 'overTime') return null;
    const interval = durationToSeconds(this.secondsPerUnit, 1, regen.unit);
    if (!(interval > 0)) return null;

    const state = readState(actor);
    const entry = state.stamina?.[key];
    if (!entry) return null; // regen only tops up materialized pools, never creates them
    // Effective cap: the GM override if set, else the rolled max.
    const max = numberOrNullStrict(entry.maxOverride) ?? numberOrNullStrict(entry.max);
    if (max == null) return null;
    const now = Number(worldTime);
    if (!Number.isFinite(now)) return null;
    const last = Number.isFinite(Number(entry.lastRegenWorldTime))
      ? Number(entry.lastRegenWorldTime)
      : now;

    // World time stood still or ran backwards: re-anchor, never regenerate.
    if (now <= last) {
      if (entry.lastRegenWorldTime !== now) {
        state.stamina = { ...state.stamina, [key]: { ...entry, lastRegenWorldTime: now } };
        await writeState(actor, state);
      }
      return null;
    }

    const intervals = Math.floor((now - last) / interval);
    if (intervals <= 0) return null; // keep the anchor so the remainder accrues

    const before = Number(entry.current || 0);
    const advancedAnchor = last + intervals * interval;
    if (before >= max) {
      state.stamina = { ...state.stamina, [key]: { ...entry, lastRegenWorldTime: advancedAnchor } };
      await writeState(actor, state);
      return null;
    }

    const perInterval = await this._regenAmountPerInterval({
      actor,
      systemId: key,
      system,
      environment,
      regen,
    });
    const nextCurrent = perInterval > 0 ? Math.min(max, before + perInterval * intervals) : before;
    const next = { ...entry, current: nextCurrent, lastRegenWorldTime: advancedAnchor };
    state.stamina = { ...state.stamina, [key]: next };
    state.history = [
      this.historyEvent('stamina.regen', {
        systemId: key,
        amount: nextCurrent - before,
        current: nextCurrent,
        max,
      }),
      ...normalizeList(state.history),
    ].slice(0, 50);
    await writeState(actor, state);
    this.callHook('fabricate.gathering.staminaRegenerated', {
      actor,
      systemId: key,
      amount: nextCurrent - before,
      stamina: cloneJson(next),
    });
    return cloneJson(next);
  }

  /**
   * The stamina an actor regenerates per elapsed `regen.unit`: `regen.amount`
   * evaluated per actor as a single expression (a plain number or a formula
   * with character references, e.g. "1 + @abilities.con.mod"). Floored at 0 and
   * rounded to an integer so multi-interval catch-up is deterministic.
   *
   * @param {object} payload
   * @returns {Promise<number>} Non-negative integer amount per interval.
   */
  async _regenAmountPerInterval({
    actor,
    systemId: _systemId,
    system = null,
    environment = null,
    regen,
  } = {}) {
    const expression = regen?.amount;
    if (expression == null || expression === '') return 0;
    const value =
      typeof this.evaluateExpression === 'function'
        ? await this.evaluateExpression({
            expression: String(expression),
            provider: null,
            actor,
            kind: 'staminaRegen',
            system,
            environment,
          })
        : // No Roll available (e.g. headless): a plain number still resolves.
          Number(expression);
    const numeric = Number(value);
    return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
  }
}
