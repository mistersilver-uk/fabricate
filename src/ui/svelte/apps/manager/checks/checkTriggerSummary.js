/**
 * WHAT A TRIGGER SAYS ABOUT ITSELF: the summary heading each collapsed trigger card, plus the
 * sentence under it stating its effect. A card headed by the label of its first `<select>` made
 * a list of three triggers read `When`, `When`, `When`.
 *
 * COMPOSED FROM FRAGMENTS, NOT WRITTEN PER SHAPE — a sentence per combination of five condition
 * types, five aggregates, five operators and three effects is hundreds of strings — and PURE, so
 * `tests/check-trigger-summary.test.js` pins every shape without mounting. IT DESCRIBES AND
 * NEVER DECIDES: every value it states is read off the same `condition` the controls bind to. */

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
  total: ['SummaryGroupTotal', 'Group total', 'group total'],
  anyDie: ['SummaryAnyDie', 'Any die', 'any die'],
  allDice: ['SummaryAllDice', 'All dice', 'all dice'],
  lowestDie: ['SummaryLowestDie', 'Lowest die', 'lowest die'],
  highestDie: ['SummaryHighestDie', 'Highest die', 'highest die'],
});

/** The key mid-sentence copy takes: casing is the translator's, never `toLowerCase()`. */
const IN_SENTENCE = 'InSentence';

/** A `[suffix, fallback, inSentenceFallback?]` entry as a fragment, standalone or mid-sentence. */
function copy(entry, inSentence = false) {
  return inSentence
    ? { key: `${NAMESPACE}${entry[0]}${IN_SENTENCE}`, fallback: entry[2] }
    : { key: `${NAMESPACE}${entry[0]}`, fallback: entry[1] };
}

/** The join between the tier names an outcome-tier condition lists, resolved by the caller. */
export const TIER_LIST_JOIN = Object.freeze(copy(['SummaryTierListJoin', ', ']));

/**
 * The comparison word for an operator, defaulting to `exactly` rather than the raw symbol: a
 * summary reading "Roll total is >= 15" is the control restated, not a sentence.
 * @param {string} operator The stored operator. @returns {{key: string, fallback: string}} */
export function operatorWord(operator) {
  return copy(OPERATOR_WORDS[operator] ?? OPERATOR_WORDS['==']);
}

/** The aggregate word for a dice-group condition.
 *  @param {string} aggregate The stored aggregate.
 *  @param {boolean} [inSentence] Whether the word sits mid-sentence.
 *  @returns {{key: string, fallback: string}} */
export function aggregateWord(aggregate, inSentence = false) {
  return copy(AGGREGATE_WORDS[aggregate] ?? AGGREGATE_WORDS.total, inSentence);
}

/**
 * The card TITLE: what this trigger watches, as a sentence fragment.
 * @param {object} condition The trigger's condition.
 * @param {object} [context]
 * @param {Array<{groupId: number, label: string}>} [context.diceGroups] Groups parsed from the
 *   roll formula, so a `diceGroup` condition names the die rather than an index a GM never sees.
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @param {boolean} [context.counting] Whether the check counts successes, so its total is the net.
 * @param {string} [context.tierJoin] `TIER_LIST_JOIN` translated, joining the tiers listed.
 * @param {boolean} [context.inSentence] Whether the fragment sits mid-sentence, keyed accordingly.
 * @returns {{key: string, fallback: string, data: object}}
 */
export function summariseCondition(condition = {}, context = {}) {
  const { diceGroups = [], tierNames = {}, counting = false, inSentence = false } = context;
  const tierJoin = context.tierJoin ?? TIER_LIST_JOIN.fallback;
  const type = condition?.type ?? 'rollTotal';
  const comparison = operatorWord(condition?.operator);
  const value = String(condition?.value ?? 0);
  const phrase = (entry) => copy(entry, inSentence);

  if (type === 'diceGroup') {
    const group = diceGroups.find((entry) => entry.groupId === condition.groupId);
    return {
      ...phrase([
        'SummaryDiceGroup',
        '{aggregate} of {die} is {comparison} {value}',
        '{aggregate} of {die} is {comparison} {value}',
      ]),
      data: {
        aggregate: aggregateWord(condition?.aggregate, inSentence),
        die: group?.label ?? String(condition?.groupId ?? 0),
        comparison,
        value,
      },
    };
  }
  if (type === 'progressiveValue') {
    return {
      ...phrase([
        'SummaryProgressiveValue',
        'Rolled value is {comparison} {value}',
        'rolled value is {comparison} {value}',
      ]),
      data: { comparison, value },
    };
  }
  if (type === 'outcomeTier') {
    const ids = Array.isArray(condition?.tierIds) ? condition.tierIds : [];
    const named = ids.map((id) => tierNames[id]).filter(Boolean);
    // A trigger whose tier list is empty matches NOTHING, and saying so is the whole value of
    // a summary; readiness raises `danglingTierStepTarget` for the same state.
    return named.length === 0
      ? {
          ...phrase(['SummaryOutcomeTierNone', 'No outcome tier chosen', 'no outcome tier chosen']),
          data: {},
        }
      : {
          ...phrase(['SummaryOutcomeTier', 'Outcome tier is {tiers}', 'outcome tier is {tiers}']),
          data: { tiers: named.join(tierJoin) },
        };
  }
  if (counting) {
    return inSentence
      ? {
          key: 'FABRICATE.Admin.Manager.Checks.Count.Triggers.SummaryNetSuccessesInSentence',
          fallback: 'net successes is {comparison} {value}',
          data: { comparison, value },
        }
      : {
          key: 'FABRICATE.Admin.Manager.Checks.Count.Triggers.SummaryNetSuccesses',
          fallback: 'Net successes is {comparison} {value}',
          data: { comparison, value },
        };
  }
  return {
    ...phrase([
      'SummaryRollTotal',
      'Roll total is {comparison} {value}',
      'roll total is {comparison} {value}',
    ]),
    data: { comparison, value },
  };
}

/**
 * The sentence under the title: what happens when the condition matches. The three effects are
 * INDEPENDENT and a trigger may carry any combination, so the clauses are collected and joined
 * rather than selected — one that steps a tier AND breaks tools must say both.
 * @param {object} trigger The whole trigger.
 * @param {object} [context]
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @param {boolean} [context.progressive] Whether this check awards rather than passes.
 * @param {boolean} [context.showBreakTools] Whether tool breakage is authored on this check.
 * @returns {{key: string, fallback: string, data?: object}[]} One clause per effect in force, in
 *   reading order; a single `nothing changes` clause when none is.
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
        tier: tierNames[step.tierId] ?? copy(['SummaryStepTargetUnset', 'a tier that is not set']),
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

/** A fragment as `RuleSentence` reads it, `{ key, params }`, its nested fragments converted too. */
function sentenceFragment(fragment) {
  const params = Object.entries(fragment.data ?? {}).map(([name, entry]) => [
    name,
    entry && typeof entry === 'object' ? sentenceFragment(entry) : entry,
  ]);
  return { key: fragment.key, params: Object.fromEntries(params) };
}

/**
 * The whole trigger as one `RuleSentence` sentence: "When {condition}, {clauses}." over the
 * mid-sentence condition and every effect clause in force.
 * @param {object} trigger The whole trigger.
 * @param {object} [context] `summariseCondition`'s context and `summariseEffect`'s, merged.
 * @returns {{frameKey: string, clauseKeys: string[], joinKey: string, params: object}}
 */
export function summariseRule(trigger = {}, context = {}) {
  const frameKey = `${NAMESPACE}SummarySentence`;
  const condition = summariseCondition(trigger?.condition ?? {}, { ...context, inSentence: true });
  const clauses = summariseEffect(trigger, context).map(sentenceFragment);
  return {
    frameKey,
    clauseKeys: clauses.map((clause) => clause.key),
    joinKey: `${NAMESPACE}SummaryJoin`,
    params: {
      [frameKey]: { condition: sentenceFragment(condition) },
      ...Object.fromEntries(clauses.map((clause) => [clause.key, clause.params])),
    },
  };
}

/**
 * WHAT THE COLLAPSED HEAD SHOWS: a glyph tile and a short result chip beside the condition
 * sentence, each effect shape taking the glyph and family its own vocabulary uses. ONE effect
 * wins the head — a tier step is the most specific statement about the result, a forced outcome
 * next, a bare tool break last — and the combination is still in `summariseEffect`'s prose.
 * @param {object} trigger The whole trigger.
 * @param {object} [context]
 * @param {Record<string, string>} [context.tierNames] Outcome tier names by id.
 * @param {boolean} [context.progressive] Whether this check awards rather than passes.
 * @param {boolean} [context.showBreakTools] Whether tool breakage is authored on this check.
 * @returns {{glyph: string, tone: string, chip: (object|null)}} `chip` is null when nothing is
 *   in force, such a trigger stating that in its own prose line. */
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
