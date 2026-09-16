/**
 * WHAT A TRIGGER SAYS ABOUT ITSELF: the summary heading each collapsed trigger card, plus the
 * one sentence under it stating its effect. A card headed by the label of its first `<select>`
 * made a list of three triggers read `When`, `When`, `When`.
 *
 * COMPOSED FROM FRAGMENTS, NOT WRITTEN PER SHAPE. Five condition types, five aggregates, five
 * operators and three independent effects is hundreds of strings as a sentence per combination,
 * so both readings are composed from a small fragment set — and the composition is PURE, so
 * `tests/check-trigger-summary.test.js` pins every shape without mounting anything. Each
 * function returns `{ key, fallback, data }` for the caller's own `text()` bridge to resolve.
 *
 * IT DESCRIBES; IT NEVER DECIDES. Nothing here reads or writes a trigger, and every value it
 * states is read straight off the same `condition` object the controls under it bind to.
 */

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Breakage.';

/** Comparison words, keyed by the operator the condition stores. */
const OPERATOR_WORDS = Object.freeze({
  '==': ['OpExactly', 'exactly'],
  '<=': ['OpAtMost', 'at most'],
  '>=': ['OpAtLeast', 'at least'],
  '<': ['OpUnder', 'under'],
  '>': ['OpOver', 'over'],
});

/** Aggregate words, keyed by the aggregate a `diceGroup` condition stores. */
const AGGREGATE_WORDS = Object.freeze({
  total: ['SummaryGroupTotal', 'Group total'],
  anyDie: ['SummaryAnyDie', 'Any die'],
  allDice: ['SummaryAllDice', 'All dice'],
  lowestDie: ['SummaryLowestDie', 'Lowest die'],
  highestDie: ['SummaryHighestDie', 'Highest die'],
});

function copy(pair) {
  return { key: `${NAMESPACE}${pair[0]}`, fallback: pair[1] };
}

/**
 * The comparison word for an operator, defaulting to `exactly` rather than the raw symbol: a
 * summary reading "Roll total is >= 15" is the control restated, not a sentence.
 *
 * @param {string} operator The stored operator.
 * @returns {{key: string, fallback: string}}
 */
export function operatorWord(operator) {
  return copy(OPERATOR_WORDS[operator] ?? OPERATOR_WORDS['==']);
}

/**
 * The aggregate word for a dice-group condition.
 *
 * @param {string} aggregate The stored aggregate.
 * @returns {{key: string, fallback: string}}
 */
export function aggregateWord(aggregate) {
  return copy(AGGREGATE_WORDS[aggregate] ?? AGGREGATE_WORDS.total);
}

/**
 * The card TITLE: what this trigger watches, as a sentence fragment.
 *
 * @param {object} condition The trigger's condition.
 * @param {object} [context]
 * @param {Array<{groupId: number, label: string}>} [context.diceGroups] Groups parsed from
 *   the roll formula, so a `diceGroup` condition names the die it watches rather than an
 *   index a GM never sees.
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @returns {{key: string, fallback: string, data: object}}
 */
export function summariseCondition(condition = {}, context = {}) {
  const { diceGroups = [], tierNames = {} } = context;
  const type = condition?.type ?? 'rollTotal';
  const comparison = operatorWord(condition?.operator);
  const value = String(condition?.value ?? 0);

  if (type === 'diceGroup') {
    const group = diceGroups.find((entry) => entry.groupId === condition.groupId);
    return {
      ...copy(['SummaryDiceGroup', '{aggregate} of {die} is {comparison} {value}']),
      data: {
        aggregate: aggregateWord(condition?.aggregate),
        die: group?.label ?? String(condition?.groupId ?? 0),
        comparison,
        value,
      },
    };
  }
  if (type === 'progressiveValue') {
    return {
      ...copy(['SummaryProgressiveValue', 'Rolled value is {comparison} {value}']),
      data: { comparison, value },
    };
  }
  if (type === 'outcomeTier') {
    const ids = Array.isArray(condition?.tierIds) ? condition.tierIds : [];
    const named = ids.map((id) => tierNames[id]).filter(Boolean);
    // A trigger whose tier list is empty matches NOTHING, and saying so is the whole value of
    // a summary; readiness raises `danglingTierStepTarget` for the same state.
    return named.length === 0
      ? { ...copy(['SummaryOutcomeTierNone', 'No outcome tier chosen']), data: {} }
      : {
          ...copy(['SummaryOutcomeTier', 'Outcome tier is {tiers}']),
          data: { tiers: named.join(', ') },
        };
  }
  return {
    ...copy(['SummaryRollTotal', 'Roll total is {comparison} {value}']),
    data: { comparison, value },
  };
}

/**
 * The sentence under the title: what happens when the condition matches. The three effects are
 * INDEPENDENT and a trigger may carry any combination, so the clauses are collected and joined
 * rather than selected — one that steps a tier AND breaks tools must say both.
 *
 * @param {object} trigger The whole trigger.
 * @param {object} [context]
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @param {boolean} [context.progressive] Whether this check awards rather than passes.
 * @param {boolean} [context.showBreakTools] Whether tool breakage is authored on this check.
 * @returns {{key: string, fallback: string, data?: object}[]} One clause per effect in force,
 *   in reading order; a single `nothing changes` clause when none is.
 */
export function summariseEffect(trigger = {}, context = {}) {
  const { tierNames = {}, progressive = false, showBreakTools = false } = context;
  const clauses = [];

  if (trigger?.outcome === 'success') {
    clauses.push(
      copy(
        progressive
          ? ['SummaryAwardAll', 'every result is awarded']
          : ['SummaryForceSuccess', 'the check is an automatic success']
      )
    );
  } else if (trigger?.outcome === 'failure') {
    clauses.push(
      copy(
        progressive
          ? ['SummaryAwardNone', 'no result is awarded']
          : ['SummaryForceFailure', 'the check is an automatic failure']
      )
    );
  }

  const step = trigger?.tierStep ?? {};
  const steps = Math.max(1, Number(step.steps) || 1);
  if (step.mode === 'up' || step.mode === 'down') {
    clauses.push({
      ...copy(
        step.mode === 'up'
          ? ['SummaryStepUp', 'the result steps up {steps} tier(s)']
          : ['SummaryStepDown', 'the result steps down {steps} tier(s)']
      ),
      data: { steps: String(steps) },
    });
  } else if (step.mode === 'target') {
    clauses.push({
      ...copy(['SummaryStepTarget', 'the result becomes {tier}']),
      data: {
        tier:
          tierNames[step.tierId] ??
          copy(['SummaryStepTargetUnset', 'a tier that is not set']).fallback,
      },
    });
  }

  // `showBreakTools` is the AUTHORITY gate, not the flag: under `toolSpecific` a check never
  // breaks tools whatever a persisted `breakTools` says.
  if (showBreakTools && trigger?.breakTools === true) {
    clauses.push(copy(['SummaryBreakTools', 'the required tools break']));
  }

  return clauses.length === 0 ? [{ ...copy(['SummaryNoEffect', 'nothing changes']), data: {} }] : clauses;
}

/**
 * WHAT THE COLLAPSED HEAD SHOWS. A trigger list collapses, so the head carries the effect at a
 * glance: a glyph tile and a short result chip beside the condition sentence. Every effect shape
 * gets that treatment, each taking the glyph and semantic family its own vocabulary already uses
 * elsewhere in this manager.
 *
 * ONE effect wins the head even when a trigger carries several, in this order: a tier step is
 * the most specific statement about the result, a forced outcome the next, a bare tool break the
 * last. The full combination is still stated in prose by `summariseEffect` under the title.
 *
 * @param {object} trigger The whole trigger.
 * @param {object} [context]
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @param {boolean} [context.progressive] Whether this check awards rather than passes.
 * @param {boolean} [context.showBreakTools] Whether tool breakage is authored on this check.
 * @returns {{glyph: string, tone: string, chip: ({key: string, fallback: string, data: object}|null)}}
 *   `chip` is null when nothing is in force — a trigger that changes nothing states that in its
 *   own prose line and does not need a chip repeating it.
 */
export function summariseHeadline(trigger = {}, context = {}) {
  const { tierNames = {}, progressive = false, showBreakTools = false } = context;
  const step = trigger?.tierStep ?? {};
  const steps = String(Math.max(1, Number(step.steps) || 1));

  if (step.mode === 'up' || step.mode === 'down') {
    const up = step.mode === 'up';
    return {
      glyph: up ? 'fas fa-arrow-up' : 'fas fa-arrow-down',
      tone: up ? 'info' : 'warning',
      chip: {
        ...copy(up ? ['ChipStepUp', 'Step up {steps}'] : ['ChipStepDown', 'Step down {steps}']),
        data: { steps },
      },
    };
  }
  if (step.mode === 'target') {
    return {
      glyph: 'fas fa-bullseye',
      tone: 'info',
      chip: {
        ...copy(['ChipStepTarget', 'Becomes {tier}']),
        // A nested fragment rather than a bare fallback string, so the caller's `phrase()`
        // translates the unset reading instead of pinning it to English.
        data: {
          tier: tierNames[step.tierId] ?? copy(['SummaryStepTargetUnset', 'a tier that is not set']),
        },
      },
    };
  }
  if (trigger?.outcome === 'success' || trigger?.outcome === 'failure') {
    const success = trigger.outcome === 'success';
    return {
      glyph: success ? 'fas fa-circle-check' : 'fas fa-circle-xmark',
      tone: success ? 'success' : 'danger',
      chip: {
        ...copy(
          success
            ? (progressive ? ['ChipAwardAll', 'Award all'] : ['ChipForceSuccess', 'Automatic success'])
            : (progressive ? ['ChipAwardNone', 'Award none'] : ['ChipForceFailure', 'Automatic failure'])
        ),
        data: {},
      },
    };
  }
  // The same authority gate `summariseEffect` applies.
  if (showBreakTools && trigger?.breakTools === true) {
    return {
      glyph: 'fas fa-hammer',
      tone: 'warning',
      chip: { ...copy(['ChipBreakTools', 'Tools break']), data: {} },
    };
  }
  return { glyph: 'fas fa-bolt', tone: 'neutral', chip: null };
}
