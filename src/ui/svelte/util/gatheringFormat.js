// Shared presentation helpers for the player gathering UI (and the two manager
// gathering browser views that mirror the same chip/percentage idioms).
//
// These helpers were copy-pasted across EnvironmentCard, GatheringDetail,
// GatheringEventDetail, GatheringEventRow, the success/event chance bars, the
// task drops list, the task/event rows + detail panes, and two manager browser
// views. Each is lifted verbatim from one existing copy so rendered output is
// byte-identical; the components now route through this single module.
//
// `localize` is INJECTED (never imported here) so the module stays pure and
// unit-testable without the Foundry bridge, mirroring `dropRateTier.js` and
// `gatheringBlockedReasons.js`.

/**
 * The risk/danger tiers the gathering UI knows how to localize and colour. A
 * value outside this set is treated as a free-form label (shown verbatim) with
 * no risk-tier class.
 *
 * @type {Set<string>}
 */
export const KNOWN_RISKS = new Set(['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme']);

/**
 * Map a risk value to its tier class (`risk-<value>`), or `''` for any value
 * outside {@link KNOWN_RISKS}. Identical contract across every call site.
 *
 * @param {string} value
 * @returns {string}
 */
export function riskClass(value) {
  return KNOWN_RISKS.has(value) ? `risk-${value}` : '';
}

/**
 * Localize a risk value to the GM editor's risk label (Safe, Hazardous, …) when
 * it is a known tier; an unknown value is returned verbatim. The empty-string
 * arm is preserved: an empty value yields `''` (no danger pip rendered).
 *
 * @param {string} value
 * @param {(key: string, data?: object) => string} localize
 * @returns {string}
 */
export function riskLabel(value, localize) {
  if (value === '') return '';
  return KNOWN_RISKS.has(value) ? localize(`FABRICATE.App.Gathering.Detail.Risk.${value}`) : value;
}

/**
 * Build the inline `--fab-chip-color` style declaration for a biome tag/option.
 * A valid 6-digit hex `customColor` wins; otherwise the `colorToken` (with any
 * `--fab-tag-` prefix stripped) selects a themed `var(--fab-tag-<token>)`,
 * defaulting to `sage`.
 *
 * @param {{customColor?: string, colorToken?: string}|null|undefined} tag
 * @returns {string}
 */
export function biomeChipStyle(tag) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(tag?.customColor || '') ? tag.customColor : '';
  const token = String(tag?.colorToken || 'sage').replace(/^--fab-tag-/, '');
  return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
}

/**
 * Clamp a 0–1 fraction to an integer percent in [0, 100]. Non-numeric input
 * falls back to 0 (NaN handling depends on the `Number(value) || 0` guard
 * BEFORE the clamp — do not reorder).
 *
 * @param {unknown} value
 * @returns {number}
 */
export function toPercent(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
}

/**
 * Return the description text when present, else the localized fallback for the
 * given key. "Present" matches the components' `description !== ''` check after
 * coercing to a string.
 *
 * @param {unknown} text
 * @param {string} fallbackKey
 * @param {(key: string, data?: object) => string} localize
 * @returns {string}
 */
export function descriptionOrDefault(text, fallbackKey, localize) {
  const description = String(text ?? '');
  return description !== '' ? description : localize(fallbackKey);
}
