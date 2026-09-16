// Shared presentation helpers for the player gathering UI and the two manager gathering browser
// views that mirror its chip and percentage idioms. `localize` is INJECTED, never imported here, so
// the module stays pure and unit-testable without the Foundry bridge, as `dropRateTier.js` does.

// A value outside this set is treated as a free-form label: shown verbatim, with no risk-tier class.
export const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);

export function riskClass(value) {
  return KNOWN_RISKS.has(value) ? `risk-${value}` : '';
}

// The empty-string arm is preserved: an empty value yields `''`, so no danger pip renders.
export function riskLabel(value, localize) {
  if (value === '') return '';
  return KNOWN_RISKS.has(value) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${value}`) : value;
}

// A valid 6-digit hex `customColor` wins; otherwise the themed token, defaulting to `sage`.
export function biomeChipStyle(tag) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(tag?.customColor || '') ? tag.customColor : '';
  const token = String(tag?.colorToken || 'sage').replace(/^--fab-tag-/, '');
  return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
}

// `Number(value) || 0` runs BEFORE the clamp so a non-numeric value lands on 0 — do not reorder.
export function toPercent(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
}

export function descriptionOrDefault(text, fallbackKey, localize) {
  const description = String(text ?? '');
  return description !== '' ? description : localize(fallbackKey);
}
