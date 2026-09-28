/** The roll prompt's target chip text, and a summed roll-under target's explanation line. */

// A function replacer, so a `$&` or `$1` in a user-authored name is inserted literally.
export function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, () => String(value)),
    template
  );
}

const signed = (value) => (value < 0 ? String(value) : `+${value}`);

/** A modifier's chip value: its prepared display, else its signed flat value. */
export function modifierValue(modifier) {
  if (typeof modifier?.display === 'string' && modifier.display) return modifier.display;
  const value = Number(modifier?.value);
  if (!Number.isFinite(value)) return '0';
  return signed(value);
}

function appliedModifiers(data, selectedIds) {
  const options = data.choicePlan.options;
  return options.length > 0
    ? options.filter((modifier) => selectedIds.includes(modifier.id))
    : (data.selectedModifiers ?? []);
}

/** The applied modifiers' flat values; a rolled one is rolled first, so it adds nothing yet. */
function flatModifierTotal(applied) {
  return applied.reduce((sum, modifier) => {
    const value = Number(modifier?.value);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

/**
 * What the player's picks and typed bonus contribute before anything rolls: the flat total a
 * typed number adds, and the formulas still to roll, which the chip names as pending.
 */
function contributions(data, selectedIds, bonus) {
  const applied = appliedModifiers(data, selectedIds);
  const pending = applied
    // A rolling modifier carries `value: null` beside its display, as the resolver builds it.
    .filter((modifier) => modifier?.value === null && modifier.display)
    .map((modifier) => modifier.display.replace(/^\+\s*/, ''));
  const typed = String(bonus ?? '')
    .replace(/^\s*\+/, '')
    .trim();
  const flat = typed !== '' && Number.isFinite(Number(typed));
  if (typed !== '' && !flat) pending.push(typed);
  const situational = flat ? Number(typed) : 0;
  return { modifiers: flatModifierTotal(applied), situational, pending };
}

function basisParts(basis, labels) {
  const parts = [fill(labels.targetValueOf, { source: basis.expression, value: basis.value })];
  const adjustment = basis.adjustment;
  if (adjustment) {
    const value =
      adjustment.kind === 'multiply' ? `×${adjustment.value}` : signed(adjustment.value);
    parts.push(
      adjustment.label
        ? fill(labels.targetAdjustment, { label: adjustment.label, value })
        : fill(labels.targetDifficulty, { value })
    );
  }
  return parts;
}

/**
 * Any other chip keeps its prepared `chipText`. A summed roll-under chip names the target after
 * its flat modifiers, Tool bonus and typed flat bonus, which raise it, so it follows the player's
 * picks and typing; a rolled contribution is named as pending, never averaged in. The line names a
 * character-value basis always, and a fixed target only when something raised it.
 */
export function rollPromptTarget(data, selectedIds, bonus = '') {
  if (data.count || data.direction !== 'under') return { chipText: data.chipText, source: '' };
  const { labels } = data;
  const comparison = data.comparison === 'exceed' ? labels.exceed : labels.meet;
  const tools = Number.isFinite(data.toolBonus) ? data.toolBonus : 0;
  const { modifiers, situational, pending } = contributions(data, selectedIds, bonus);
  const parts = data.targetBasis
    ? basisParts(data.targetBasis, labels)
    : [fill(labels.targetBase, { value: data.dc })];
  if (tools) parts.push(fill(labels.targetTools, { value: signed(tools) }));
  if (modifiers) parts.push(fill(labels.targetModifiers, { value: signed(modifiers) }));
  if (situational) parts.push(fill(labels.targetSituational, { value: signed(situational) }));
  const settled = fill(labels.targetValue, { target: data.dc + tools + modifiers + situational });
  const target =
    pending.length > 0
      ? fill(labels.targetPending, { target: settled, formula: pending.join(' + ') })
      : settled;
  return {
    chipText: `${target} · ${comparison}`,
    source: data.targetBasis || parts.length > 1 ? parts.join(' · ') : '',
  };
}
