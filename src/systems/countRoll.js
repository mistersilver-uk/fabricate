/**
 * The registered Foundry Roll a success-counting check rolls: raw `NdF` plus at most one native
 * explosion token, with each die then projected through `countEvaluation.js`. Every Foundry piece
 * arrives as an argument, so tests drive it over a core-faithful double.
 */
import { isPlainObject } from '../utils/scalars.js';

import {
  countFormulaValues,
  explodesOnEveryFace,
  extremeFace,
  MAX_COUNT_POOL,
  projectCountResults,
} from './countEvaluation.js';

/** The serialized class name `Roll.fromData` looks up in `CONFIG.Dice.rolls`. */
export const COUNT_ROLL_CLASS = 'FabricateCountRoll';

/** The replay policy version `options.fabricateCount` carries. */
export const COUNT_POLICY_VERSION = 1;

/** The reasons only the Roll raises; the rest are `COUNT_REFUSALS`. */
export const COUNT_ROLL_REFUSALS = Object.freeze(['policy-invalid', 'evaluation-mode-unsupported']);

/**
 * Raised before any RNG, except `explode-unbounded`, which Foundry raises once a recursive
 * explosion passes 1000 results.
 */
export class CountRollRefusal extends Error {
  constructor(reason, refusedInput, options) {
    super(`Fabricate count roll refused: ${reason} (${refusedInput})`, options);
    this.name = 'CountRollRefusal';
    this.reason = reason;
    this.refusedInput = refusedInput;
  }
}

/** The numeric replay policy a resolved `resolvePool` policy stores; never expressions. */
export function countReplayPolicy({ direction, comparison, threshold, explode, cancel }) {
  return {
    version: COUNT_POLICY_VERSION,
    direction,
    comparison,
    threshold,
    explode: explode ? { kind: explode.kind, value: explode.value, once: explode.once } : null,
    cancel: cancel ? { kind: cancel.kind, value: cancel.value } : null,
  };
}

/** `${dice}d${die}` plus the one explosion token; a digit never follows `x`/`xo` directly. */
export function countRollFormula({ dice, die, direction, explode }) {
  const pool = `${dice}d${die}`;
  if (!explode || beyondDie(explode, die)) return pool;
  const token = explode.once ? 'xo' : 'x';
  if (explode.kind !== 'from') return `${pool}${token}=${extremeFace(die, direction)}`;
  return `${pool}${token}${direction === 'under' ? '<=' : '>='}${explode.value}`;
}

/**
 * Builds the count Roll over `BaseRoll`, core `foundry.dice.Roll`. `i18n` is read at render time;
 * `renderTemplate` is Foundry's. The constructor and `fromData` never validate the policy.
 */
export function createCountRollClass({ BaseRoll, i18n = () => null, renderTemplate }) {
  return class FabricateCountRoll extends BaseRoll {
    static name = COUNT_ROLL_CLASS;

    /** Construct with empty roll data from a settled `resolvePool` policy. */
    static fromPolicy(policy, options = {}) {
      return new this(
        countRollFormula(policy),
        {},
        { ...options, fabricateCount: countReplayPolicy(policy) }
      );
    }

    async evaluate(options = {}) {
      if (this._evaluated) return super.evaluate(options);
      const plan = planEvaluation(this, options);
      try {
        await super.evaluate(options);
      } catch (error) {
        if (!/Maximum recursion depth/.test(error?.message)) throw error;
        throw new CountRollRefusal('explode-unbounded', 'explode', { cause: error });
      }
      const projection = projectCountResults({
        policy: plan.policy,
        results: plan.term.results,
        number: plan.term.number,
      });
      for (const entry of projection.results) markResult(plan.term.results[entry.index], entry);
      this._total = projection.net;
      return this;
    }

    evaluateSync() {
      throw new CountRollRefusal('evaluation-mode-unsupported', 'mode');
    }

    /** The per-die projection of an evaluated roll, re-derived from its faces with no RNG. */
    countProjection() {
      const read = this._evaluated ? readCountRoll(this) : null;
      if (!read?.ok) return null;
      return projectCountResults({
        policy: read.policy,
        results: read.term.results,
        number: read.term.number,
      });
    }

    async getTooltip() {
      const read = readCountRoll(this);
      if (!read.ok) return super.getTooltip();
      const formula = describeCountRoll(read, i18n());
      const parts = this.dice.map((term) => countTooltipPart(term, formula, i18n()));
      return renderTemplate(this.constructor.TOOLTIP_TEMPLATE, { parts });
    }

    async _prepareChatRenderContext(options = {}) {
      const context = await super._prepareChatRenderContext(options);
      const read = readCountRoll(this);
      if (options.isPrivate || !read.ok) return context;
      return { ...context, formula: describeCountRoll(read, i18n()) };
    }
  };
}

/** The registered count Roll, or `null`. */
export function findCountRoll(config) {
  const rolls = config?.Dice?.rolls;
  return (Array.isArray(rolls) && rolls.find((cls) => cls?.name === COUNT_ROLL_CLASS)) || null;
}

/** Appends the count Roll to `config.Dice.rolls` once, never replacing `rolls[0]`. */
export function registerCountRoll({ config, ...dependencies }) {
  const rolls = config?.Dice?.rolls;
  if (!Array.isArray(rolls)) return null;
  const existing = findCountRoll(config);
  if (existing || typeof dependencies.BaseRoll !== 'function') return existing;
  const CountRoll = createCountRollClass(dependencies);
  rolls.push(CountRoll);
  return CountRoll;
}

const DIRECTIONS = new Set(['over', 'under']);
const COMPARISONS = new Set(['meet', 'exceed']);
const INVALID = (reason, refusedInput) => ({ ok: false, reason, refusedInput });

function planEvaluation(roll, options) {
  if (options.minimize || options.maximize) {
    throw new CountRollRefusal('evaluation-mode-unsupported', 'mode');
  }
  const read = readCountRoll(roll);
  if (!read.ok) throw new CountRollRefusal(read.reason, read.refusedInput);
  return read;
}

// The policy and the single raw die term it replays, with the formula rebuilt from both.
function readCountRoll(roll) {
  const replay = readReplayPolicy(roll.options?.fabricateCount);
  if (!replay.ok) return replay;
  const [term] = roll.dice;
  if (roll.terms.length !== 1 || roll.dice.length !== 1 || term !== roll.terms[0]) {
    return INVALID('policy-invalid', 'policy');
  }
  const { number, faces } = term;
  if (!Number.isInteger(faces) || faces < 2) return INVALID('die-invalid', 'die');
  if (!Number.isInteger(number) || number < 1) return INVALID('policy-invalid', 'pool');
  if (number > MAX_COUNT_POOL) return INVALID('pool-too-large', 'pool');
  const policy = { ...replay.policy, die: faces, dice: number };
  if (explodesOnEveryFace(policy)) return INVALID('explode-unbounded', 'explode');
  if (roll._formula !== countRollFormula(policy)) return INVALID('policy-invalid', 'policy');
  return { ok: true, policy, term };
}

function readReplayPolicy(value) {
  if (!isPlainObject(value) || value.version !== COUNT_POLICY_VERSION) {
    return INVALID('policy-invalid', 'policy');
  }
  const { direction, comparison, threshold } = value;
  if (!DIRECTIONS.has(direction) || !COMPARISONS.has(comparison) || !Number.isFinite(threshold)) {
    return INVALID('policy-invalid', 'policy');
  }
  const explode = readFaceRule(value.explode, 'best', 'explode');
  if (explode?.ok === false) return explode;
  const cancel = readFaceRule(value.cancel, 'worst', 'cancel');
  if (cancel?.ok === false) return cancel;
  return { ok: true, policy: { direction, comparison, threshold, explode, cancel } };
}

function readFaceRule(rule, extremeKind, input) {
  if (rule === null || rule === undefined) return null;
  const once = input === 'explode' ? rule?.once : false;
  if (!isPlainObject(rule) || typeof once !== 'boolean') return INVALID('policy-invalid', 'policy');
  const settled = input === 'explode' ? { once } : {};
  if (rule.kind === extremeKind) return { kind: extremeKind, value: null, ...settled };
  if (rule.kind !== 'from') return INVALID('policy-invalid', 'policy');
  if (!Number.isInteger(rule.value) || rule.value < 1) return INVALID('faces-invalid', input);
  return { kind: 'from', value: rule.value, ...settled };
}

// `success` on every result and `failure` only when cancelled; an overlap keeps both marks.
function markResult(result, { qualified, cancelled, contribution }) {
  result.success = qualified;
  if (cancelled) result.failure = true;
  else delete result.failure;
  result.count = contribution;
}

function describeCountRoll({ policy }, i18n) {
  const { die, direction, explode, cancel } = policy;
  const clauses = [format(i18n, 'FABRICATE.Check.CountRoll.Pool', countFormulaValues(policy))];
  if (explode && !beyondDie(explode, die)) {
    const key = explode.once
      ? 'FABRICATE.Check.CountRoll.ExplodeOnce'
      : 'FABRICATE.Check.CountRoll.Explode';
    clauses.push(format(i18n, key, { faces: faceLabel(explode, die, direction) }));
  }
  // A `from` cancel face beyond the die cancels every face over and none under.
  if (cancel && !(direction === 'under' && beyondDie(cancel, die))) {
    const faces = faceLabel(cancel, die, direction === 'under' ? 'over' : 'under');
    clauses.push(format(i18n, 'FABRICATE.Check.CountRoll.Cancel', { faces }));
  }
  return clauses.join(' · ');
}

function beyondDie({ kind, value }, die) {
  return kind === 'from' && value > die;
}

function faceLabel({ kind, value }, die, direction) {
  if (kind !== 'from') return String(extremeFace(die, direction));
  return `${direction === 'under' ? '≤' : '≥'} ${value}`;
}

// Core pairs `success failure` on an overlap, and its CSS lets `.failure` win; name both instead.
function countTooltipPart(term, formula, i18n) {
  const data = term.getTooltipData();
  const rolls = data.rolls.map((entry, index) => {
    const result = term.results[index];
    if (!(result?.success && result.failure)) return entry;
    const label = format(i18n, 'FABRICATE.Check.CountRoll.Overlap', { face: result.result });
    const classes = entry.classes
      .split(' ')
      .filter((name) => name !== 'success' && name !== 'failure')
      .concat('fabricate-count-overlap')
      .join(' ');
    return {
      classes,
      result: `<span role="img" aria-label="${escapeAttribute(label)}" data-tooltip>${entry.result}</span>`,
    };
  });
  return { ...data, formula, rolls };
}

function format(i18n, key, data) {
  return i18n?.format?.(key, data) ?? key;
}

function escapeAttribute(value) {
  return String(value).replaceAll(/[&<>"]/g, (character) => `&#${character.codePointAt(0)};`);
}
