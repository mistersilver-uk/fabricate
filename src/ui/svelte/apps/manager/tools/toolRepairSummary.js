/**
 * WHAT MENDING A BROKEN COPY COSTS, IN A SENTENCE (issue 1373, maintainer round 5).
 *
 * `proto:4068` and `proto:4704` build this string twice — once for the Tool row's inspector
 * line and once under the repair editor itself — and both read the same way:
 *
 *   `Mending consumes ` + each requirement's alternatives joined by ` or `, the requirements
 *   themselves joined by ` + `, then `.`
 *
 * so a set of two requirements, the first with an alternative, reads
 * `Mending consumes Moonglass Shard + 10 gp or Dragonhide Scrap + all of Rare, Volatile.`
 *
 * ## Why this is a module and not four lines in the component
 *
 * It is the only part of the repair block that has to READ the persisted shape rather than
 * render it: the editor below draws whatever is authored, correct or not, while this sentence
 * has to resolve every id against a roster and decide what an UNSET row is called. That is a
 * pure transformation over data, so it is testable without mounting anything, and it is one
 * copy for the two scopes that render the block — the system Tool editor's Breakage tab and
 * the world Tool entry's — which is the same reason those two share `ToolRepairRequirements`.
 *
 * ## The sentence is assembled from LABELS the caller supplies
 *
 * Every word in it is localizable, and a module that reached for `localize` would be an
 * untestable one. The caller resolves the strings once and hands them over, exactly as the
 * component does for its own copy.
 */

/**
 * @typedef {object} RepairSummaryLabels
 * @property {string} lead the sentence's opening, with a `{list}` placeholder for the body
 * @property {string} empty what the block says when nothing is listed at all
 * @property {string} or joins the alternatives WITHIN one requirement
 * @property {string} and joins one requirement to the next
 * @property {string} anyOf leads a tag row satisfied by any one of its tags
 * @property {string} allOf leads a tag row that needs all of them
 * @property {string} essenceSuffix follows an essence's name, e.g. ` essence`
 * @property {string} unsetComponent a component row the catalogue cannot name (`proto:4700`)
 * @property {string} unsetTag a tag row carrying no tags (`proto:4703`)
 * @property {string} unsetEssence an essence row the catalogue cannot name (`proto:4701`)
 * @property {string} unsetCurrency a currency row the ladder cannot name (`proto:4064`)
 */

/**
 * @typedef {object} RepairSummaryRosters
 * @property {Array<{id: string, name?: string}>} components the world or system components
 * @property {Array<{id: string, name?: string}>} essences the essence catalogue
 * @property {Array<{id: string, label?: string, abbreviation?: string}>} currencyUnits the ladder
 */

/** A count only reads as a multiplier when there is more than one of the thing. */
function times(count) {
  const n = Number(count);
  return Number.isFinite(n) && n > 1 ? `${n}× ` : '';
}

/**
 * The roster's name for an id, or `null` when the reference resolves to nothing.
 *
 * A STORED ID IS NEVER THE ANSWER. `proto:4700`-`4702` looks every reference up in the live
 * catalogue (`CAT.find(...)||{}`) and falls back to `unset component` / `unset essence`, and
 * `proto:4064` does the same for a currency unit against the ladder. This module printed the ID
 * when the lookup missed, so a world whose components have not been lifted yet - the world every
 * GM installs Fabricate into - read `Mending consumes sm-iron-ingot + 2x sm-coal or sm-whetstone.`
 *
 * THE TWO MISSES ARE ONE CASE. An id that was never set and an id whose catalogue entry has gone
 * are indistinguishable to a reader, and the design collapses them too: its `||` sees the same
 * `undefined` for both.
 *
 * `null` RATHER THAN THE UNSET LABEL, because the caller has to know WHICH it got: a resolved
 * name takes a multiplier and, for an essence, a suffix, and an unresolved one takes neither
 * (`2x unset component` counts nothing; `unset essence essence` names nothing twice). Returning
 * the label would also make a roster entry actually called `unset component` read as a miss.
 *
 * @param {Array<{id: string, name?: string}>} roster the catalogue to resolve against
 * @param {string} id the stored reference
 * @returns {string|null}
 */
function nameIn(roster, id) {
  if (!id) return null;
  const found = (roster || []).find((entry) => entry?.id === id);
  return found?.name || null;
}

/**
 * What one currency reference reads as, or `null` when the ladder cannot name its unit.
 *
 * RESOLVED AGAINST THE LADDER, not merely non-empty. `proto:4064` checks `CURR.find(...)` before
 * it prints anything; the design's own summary at `proto:4702` gets away with printing the bare
 * reference only because THERE the reference IS the abbreviation (`10 gp`). Here it is a unit id,
 * which is as opaque to a reader as a component id.
 *
 * @param {object} match the option's `match`
 * @param {Array<{id: string, label?: string, abbreviation?: string}>} ladder the currency units
 * @returns {string|null}
 */
function currencyPhrase(match, ladder) {
  const unit = (ladder || []).find((entry) => entry?.id === match.unit);
  const name = unit?.abbreviation || unit?.label;
  if (!match.unit || !name) return null;
  const amount = Number(match.amount) > 0 ? Number(match.amount) : 1;
  return `${amount} ${name}`;
}

/**
 * One alternative, as the phrase a GM would say out loud.
 *
 * @param {object} option one entry of a requirement's `options`
 * @param {RepairSummaryRosters} rosters
 * @param {RepairSummaryLabels} labels
 * @returns {string}
 */
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
 * The whole sentence, or the empty-set line when nothing is listed.
 *
 * A requirement with NO options at all contributes nothing rather than an empty phrase: it is
 * not a state the editor can author (removing the last alternative removes the requirement),
 * so a stray one from an import should not put a bare ` + ` in the middle of the sentence.
 *
 * @param {Array<{options?: object[]}>} groups the tool's `repairRequirements`
 * @param {RepairSummaryRosters} rosters
 * @param {RepairSummaryLabels} labels
 * @returns {string}
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
