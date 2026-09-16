// The one map from the retired pill and badge status vocabularies onto `Chip`'s tones (issue
// 1506). It decides the NAME, never the paint, and is TOTAL over that domain: anything outside it
// resolves to `subtle`, which is what the retired pill rendered, because `Chip` drops an unknown
// tone silently — no class, no throw, no failing test. Membership is `Object.hasOwn`, so a
// prototype key (`constructor`, `toString`) is a miss like any other rather than a function.

const STATUS_CHIP_TONES = Object.freeze({
  subtle: 'subtle',
  success: 'positive',
  accent: 'accent',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  neutral: 'neutral',
});

const FALLBACK_TONE = 'subtle';

export function statusChipTone(tone) {
  return Object.hasOwn(STATUS_CHIP_TONES, tone) ? STATUS_CHIP_TONES[tone] : FALLBACK_TONE;
}

export { STATUS_CHIP_TONES, FALLBACK_TONE as STATUS_CHIP_TONE_FALLBACK };
