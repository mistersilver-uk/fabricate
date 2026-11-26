/**
 * The Checks rail digest's three counted rows. A count of exactly 1 reads its singular form and
 * every other count, 0 included, its plural. Each key is a complete literal so the key scans see it.
 */

const OUTCOME_TIERS = [
  ['FABRICATE.Admin.Manager.Checks.Digest.OutcomeTiersOne', '{count} outcome tier'],
  ['FABRICATE.Admin.Manager.Checks.Digest.OutcomeTiersOther', '{count} outcome tiers'],
];
const SUCCESS = [
  ['FABRICATE.Admin.Manager.Checks.Digest.SuccessOne', '{count} counts as success'],
  ['FABRICATE.Admin.Manager.Checks.Digest.SuccessOther', '{count} count as success'],
];
const TRIGGERS = [
  ['FABRICATE.Admin.Manager.Checks.Digest.TriggersOne', '{count} trigger active'],
  ['FABRICATE.Admin.Manager.Checks.Digest.TriggersOther', '{count} triggers active'],
];
const MODIFIERS = [
  ['FABRICATE.Admin.Manager.Checks.Digest.ModifiersOne', '{count} check modifier applies'],
  ['FABRICATE.Admin.Manager.Checks.Digest.ModifiersOther', '{count} check modifiers apply'],
];

function counted(text, [one, other], count) {
  const [key, fallback] = count === 1 ? one : other;
  return text(key, fallback).replace('{count}', String(count));
}

/**
 * @param {object} args
 * @param {string} args.activeTab The activity the rows open a section of.
 * @param {number|null} args.outcomeCount Authored outcome tiers; a non-number omits the row.
 * @param {number} args.successCount Tiers that count as success.
 * @param {number|null} args.triggerCount Active triggers; a non-number omits the row.
 * @param {number|null} args.modifierCount Applying check modifiers; a non-number omits the row.
 * @param {(key: string, fallback: string) => string} args.text Localizer with a fallback.
 * @returns {object[]} Digest rows, in display order.
 */
export function digestCountRows({
  activeTab,
  outcomeCount,
  successCount,
  triggerCount,
  modifierCount,
  text,
}) {
  const row = (id, icon, title) => ({ id, icon, title, target: [activeTab, id], tone: 'set' });
  const rows = [];
  if (typeof outcomeCount === 'number') {
    const title = text('FABRICATE.Admin.Manager.Checks.Digest.Outcomes', '{tiers}, {success}')
      .replace('{tiers}', counted(text, OUTCOME_TIERS, outcomeCount))
      .replace('{success}', counted(text, SUCCESS, successCount));
    rows.push(row('outcomes', 'fas fa-code-branch', title));
  }
  if (typeof triggerCount === 'number') {
    rows.push(row('triggers', 'fas fa-bolt', counted(text, TRIGGERS, triggerCount)));
  }
  if (typeof modifierCount === 'number') {
    rows.push(row('modifiers', 'fas fa-user-group', counted(text, MODIFIERS, modifierCount)));
  }
  return rows;
}
