/**
 * The executed display input of a success-counting check (issue 2006): assembled from the roll's
 * own execution values for a caller that reports its visibility, handed to the result card and
 * box beside that visibility, and never persisted or re-derived from the live check or actor.
 */
import { benefitSign, destinationFor } from './checkModifierRouter.js';
import { countThresholdSource } from './countCheck.js';

const SOURCES = Object.freeze(['tool', 'library', 'situational', 'advantage']);

/**
 * Each source's settled benefit on the pool and on the threshold, `{ pool, threshold }` lists of
 * nonzero `{ source, value }` in source order, signed as they moved it. Scalars come from the
 * placed `contributions` and rolled benefits from the settled `preRolls`, each counted once.
 */
export function countPlacementTerms(evaluation, contributions = [], preRolls = []) {
  const totals = { pool: new Map(), threshold: new Map() };
  const add = (destination, source, value) => {
    const bySource = totals[destination];
    if (!bySource || !Number.isFinite(value)) return;
    const moved = benefitSign(destination, evaluation.direction) * value;
    bySource.set(source, (bySource.get(source) ?? 0) + moved);
  };
  for (const contribution of Array.isArray(contributions) ? contributions : []) {
    if (contribution?.form !== 'scalar' || contribution.preRoll) continue;
    add(destinationFor(evaluation, contribution.source), contribution.source, contribution.value);
  }
  for (const entry of Array.isArray(preRolls) ? preRolls : []) {
    add(entry?.destination, entry?.source, entry?.total);
  }
  const listed = (bySource) =>
    SOURCES.filter((source) => (bySource.get(source) ?? 0) !== 0).map((source) => ({
      source,
      value: bySource.get(source),
    }));
  return { pool: listed(totals.pool), threshold: listed(totals.threshold) };
}

/**
 * What an evaluated count roll reports when `options.reportVisibility` asks: the executed roll
 * mode, each source's settled terms and the threshold's source. Empty otherwise, so a caller that
 * persists its result whole never receives display evidence.
 */
export function countRollReport(options, { decision, evaluation, placement }) {
  if (options?.reportVisibility !== true) return {};
  return {
    rollMode: decision.rollMode ?? null,
    countTerms: countPlacementTerms(evaluation, decision.contributions, placement?.preRolls),
    thresholdSource: options.thresholdSource ?? countThresholdSource(evaluation),
  };
}

/**
 * `{ countDisplay }` for a graded count roll that reported its visibility, else nothing: the
 * projected dice, the totals, the required count it was graded against (null where none applies)
 * and the resolved pool and threshold with their settled terms.
 */
export function reportedCountDisplay(rolled, required) {
  if (!rolled || !Object.hasOwn(rolled, 'rollMode')) return {};
  const { policy, countProjection } = rolled;
  const terms = rolled.countTerms ?? { pool: [], threshold: [] };
  const net = rolled.zeroPool ? null : rolled.total;
  const needed = Number.isFinite(required) ? required : null;
  return {
    countDisplay: {
      die: policy.die,
      results: countProjection?.results ?? [],
      qualified: countProjection?.successes ?? null,
      cancelled: countProjection?.cancelled ?? null,
      net,
      required: needed,
      margin: needed !== null && Number.isFinite(net) ? net - needed : null,
      zeroPool: rolled.zeroPool === true,
      pool: { base: policy.resolved.base, terms: terms.pool, rolled: policy.dice },
      threshold: {
        anchor: policy.resolved.threshold,
        source: rolled.thresholdSource === 'character' ? 'character' : 'fixed',
        terms: terms.threshold,
        effective: policy.threshold,
      },
    },
  };
}
