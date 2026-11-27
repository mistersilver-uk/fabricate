/**
 * The described step's results in authored order: each group a success line routes to, "Step N
 * starts" on a step with a later one, then what failure leaves. While the step is worked, the tier
 * the rules select now is the reached one; once it has ended, none is.
 */
import { stateFacts } from '../../../systems/iterative/attemptLibrary.js';
import { selectProducedGroup } from '../../../systems/iterative/routing.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { ruleText } from './iterativeRuleText.js';

const K = Object.freeze({
  nextStep: 'FABRICATE.App.Journal.Iterative.Route.NextStep',
  nothing: 'FABRICATE.App.Journal.Iterative.Route.Nothing',
  onSuccessWhen: 'FABRICATE.App.Journal.Iterative.Route.OnSuccessWhen',
  onSuccess: 'FABRICATE.App.Journal.Iterative.Route.OnSuccess',
  onFailure: 'FABRICATE.App.Journal.Iterative.Route.OnFailure',
  now: 'FABRICATE.App.Journal.Iterative.Route.Now',
});

export const NEXT_STEP_TIER = 'iterative-next-step';
export const NOTHING_TIER = 'iterative-nothing';

const successLine = (group) =>
  arrayOrEmpty(group?.producedWhen).find((line) => line?.end === 'success');

/** A group's yields: its results, each named through the run's own result mapper. */
const yieldsOf = (group, mapResult) =>
  arrayOrEmpty(group?.results).map((result, index) => ({
    id: `${group.id}-${index}`,
    ...mapResult(result),
  }));

function successTier(group, { labels, localize, mapResult }) {
  // A band states the line's first rule; an empty line, or one on a hidden counter, has none.
  const [first] = arrayOrEmpty(successLine(group)?.rules);
  const band = (first && ruleText(first, labels, localize)) || '';
  const rule = band ? first : null;
  return {
    id: group.id,
    name: group.name ?? '',
    band,
    fail: false,
    rule: rule ? { counterId: rule.counterId ?? null, op: rule.op, value: rule.value } : null,
    title: band ? localize(K.onSuccessWhen, { rule: band }) : localize(K.onSuccess),
    yields: yieldsOf(group, mapResult),
  };
}

function failureTier(groups, facts, { localize, mapResult }) {
  const group = selectProducedGroup(groups, 'failure', facts);
  return {
    id: group?.id ?? NOTHING_TIER,
    name: group?.name ?? localize(K.nothing),
    band: '',
    fail: true,
    rule: null,
    title: localize(K.onFailure),
    yields: group ? yieldsOf(group, mapResult) : [],
  };
}

/** The tier the rules would select if the step ended in success now. */
function reachedTier(groups, facts, nextStep) {
  const group = selectProducedGroup(groups, 'success', facts);
  if (group) return group.id;
  return nextStep ? NEXT_STEP_TIER : null;
}

/**
 * `{ tiers, reachedId }` for the described step's raw `groups`, or `null` where routes are not
 * shown. `nextIndex` is the later step's index, `null` on the final step, and `ended` leaves no
 * tier reached; the reached tier's title says what it would give now.
 */
export function routeViews({ groups, state, nextIndex, ended, labels, localize, mapResult }) {
  const facts = stateFacts(state);
  const routed = arrayOrEmpty(groups).filter(successLine);
  const tiers = routed.map((group) => successTier(group, { labels, localize, mapResult }));
  if (nextIndex !== null) {
    tiers.push({
      id: NEXT_STEP_TIER,
      name: localize(K.nextStep, { index: nextIndex + 1 }),
      band: '',
      fail: false,
      rule: null,
      title: localize(K.onSuccess),
      yields: [],
    });
  }
  tiers.push(failureTier(groups, facts, { localize, mapResult }));
  const reachedId = ended ? null : reachedTier(groups, facts, nextIndex !== null);
  for (const tier of tiers) {
    if (tier.id === reachedId) tier.title = localize(K.now, { title: tier.title });
  }
  return { tiers, reachedId };
}
