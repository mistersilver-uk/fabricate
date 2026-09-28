/** The roll prompt's target chip text, and a summed roll-under target's explanation line. */

// A function replacer, so a `$&` or `$1` in a user-authored name is inserted literally.
export function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, () => String(value)),
    template
  );
}

const signed = (value) => (value < 0 ? String(value) : `+${value}`);

/** The applied modifiers' flat values; a rolled one is rolled first, so it adds nothing yet. */
function flatModifierTotal(data, selectedIds) {
  const options = data.choicePlan.options;
  const applied =
    options.length > 0
      ? options.filter((modifier) => selectedIds.includes(modifier.id))
      : (data.selectedModifiers ?? []);
  return applied.reduce((sum, modifier) => {
    const value = Number(modifier?.value);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
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
 * its flat modifiers and Tool bonus, which raise it, so it follows the player's picks; the
 * situational bonus is applied only once rolled. The line names a character-value basis always,
 * and a fixed target only when something raised it.
 */
export function rollPromptTarget(data, selectedIds) {
  if (data.count || data.direction !== 'under') return { chipText: data.chipText, source: '' };
  const { labels } = data;
  const comparison = data.comparison === 'exceed' ? labels.exceed : labels.meet;
  const tools = Number.isFinite(data.toolBonus) ? data.toolBonus : 0;
  const modifiers = flatModifierTotal(data, selectedIds);
  const parts = data.targetBasis
    ? basisParts(data.targetBasis, labels)
    : [fill(labels.targetBase, { value: data.dc })];
  if (tools) parts.push(fill(labels.targetTools, { value: signed(tools) }));
  if (modifiers) parts.push(fill(labels.targetModifiers, { value: signed(modifiers) }));
  const target = fill(labels.targetValue, { target: data.dc + tools + modifiers });
  return {
    chipText: `${target} · ${comparison}`,
    source: data.targetBasis || parts.length > 1 ? parts.join(' · ') : '',
  };
}
