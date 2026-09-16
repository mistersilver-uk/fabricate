/**
 * WHAT MENDING A BROKEN COPY COSTS, IN A SENTENCE: a lead, then each requirement's alternatives
 * joined by ` or ` and the requirements themselves joined by ` + `.
 *
 * A module rather than four lines in the component, because it is the only part of the repair
 * block that READS the persisted shape rather than rendering it — resolving every id against a
 * roster and deciding what an UNSET row is called — so it is testable without mounting, and it is
 * one copy for the two scopes that render the block. The sentence is assembled from LABELS the
 * caller supplies, because a module reaching for `localize` would be an untestable one.
 */

/**
 * @typedef {object} RepairSummaryLabels Every word of the sentence, already localized: `lead` (with
 * a `{list}` placeholder) and `empty`; the `or` / `and` joins within and between requirements; the
 * `anyOf` / `allOf` leads for a tag row; `essenceSuffix`; and the four `unset*` names for a row
 * whose reference no roster can resolve.
 */

/**
 * @typedef {object} RepairSummaryRosters The three catalogues a reference resolves against:
 * `components`, `essences` and `currencyUnits`.
 */

/** A count only reads as a multiplier when there is more than one of the thing. */
function times(count) {
  const n = Number(count);
  return Number.isFinite(n) && n > 1 ? `${n}× ` : '';
}

/**
 * The roster's name for an id, or `null` when the reference resolves to nothing. A STORED ID IS
 * NEVER THE ANSWER: printing it made a world whose components have not been lifted yet — the world
 * every GM installs Fabricate into — read `Mending consumes sm-iron-ingot + 2x sm-coal`. THE TWO
 * MISSES ARE ONE CASE, because an id never set and an id whose entry has gone are indistinguishable
 * to a reader. `null` RATHER THAN THE UNSET LABEL, because the caller has to know WHICH it got: a
 * resolved name takes a multiplier and, for an essence, a suffix, and an unresolved one takes
 * neither — and the label would make a roster entry actually called that read as a miss.
 */
function nameIn(roster, id) {
  if (!id) return null;
  const found = (roster || []).find((entry) => entry?.id === id);
  return found?.name || null;
}

/**
 * What one currency reference reads as, or `null` when the ladder cannot name its unit. RESOLVED
 * AGAINST THE LADDER rather than merely non-empty: the stored reference is a unit id, which is as
 * opaque to a reader as a component id.
 */
function currencyPhrase(match, ladder) {
  const unit = (ladder || []).find((entry) => entry?.id === match.unit);
  const name = unit?.abbreviation || unit?.label;
  if (!match.unit || !name) return null;
  const amount = Number(match.amount) > 0 ? Number(match.amount) : 1;
  return `${amount} ${name}`;
}

/** One alternative, as the phrase a GM would say out loud. */
function phraseFor(option, rosters, labels) {
  const match = option?.match ?? {};
  if (match.type === 'tags') {
    const tags = Array.isArray(match.tags) ? match.tags.filter(Boolean) : [];
    if (tags.length === 0) return labels.unsetTag;
    const lead = match.tagMatch === 'all' ? labels.allOf : labels.anyOf;
    return `${times(option?.quantity)}${lead}${tags.join(', ')}`;
  }
  if (match.type === 'essence') {
    const name = nameIn(rosters.essences, match.essenceId);
    if (name === null) return labels.unsetEssence;
    return `${times(match.amount)}${name}${labels.essenceSuffix}`;
  }
  if (match.type === 'currency') {
    return currencyPhrase(match, rosters.currencyUnits) ?? labels.unsetCurrency;
  }
  const name = nameIn(rosters.components, match.componentId);
  if (name === null) return labels.unsetComponent;
  return `${times(option?.quantity)}${name}`;
}

/**
 * The whole sentence, or the empty-set line when nothing is listed. A requirement with NO options
 * contributes nothing rather than an empty phrase: the editor cannot author that state, so a stray
 * one from an import must not put a bare ` + ` in the middle of the sentence.
 */
export function repairSummarySentence(groups, rosters, labels) {
  const requirements = (Array.isArray(groups) ? groups : [])
    .map((group) => (Array.isArray(group?.options) ? group.options : []))
    .filter((options) => options.length > 0);
  if (requirements.length === 0) return labels.empty;
  const list = requirements
    .map((options) => options.map((option) => phraseFor(option, rosters, labels)).join(labels.or))
    .join(labels.and);
  return labels.lead.replace('{list}', list);
}
