/**
 * The range bar's own words (issue 2435): its default group name, the name qualified by the
 * previewed record, the default boundary name and every handle's value text. Each reads its own
 * `Common.RangeBar` lang key through `localizeOr` with its English as the fallback: with no lang
 * loaded it reads the English that `tests/fixtures/threshold-band-strip/checkCallerStrips.js` pins.
 */
import { localizeOr } from './localizeOr.js';

/** `ariaLabel`'s default: a KEY, so the name a world reads is the one its lang file carries. */
export const LABEL_KEY = 'FABRICATE.Common.RangeBar.Label';

/**
 * The group's accessible name: the default key localized, or a caller's string as it came, since a
 * caller's name is already localized; then qualified by the previewed `record` when there is one.
 */
export function groupName(ariaLabel, record) {
  const label = ariaLabel === LABEL_KEY ? localizeOr(LABEL_KEY, 'Outcome bands') : ariaLabel;
  if (!record) return label;
  return localizeOr('FABRICATE.Common.RangeBar.LabelWithRecord', '{label} — {record}', {
    label,
    record,
  });
}

/** `boundaryLabel`'s default: the two band names either side of the handle. */
export function boundaryName(band, nextBand) {
  return localizeOr('FABRICATE.Common.RangeBar.Boundary', '{from} / {to}', {
    from: band?.name || '',
    to: nextBand?.name || '',
  });
}

/**
 * A handle's `aria-valuetext`: the formatted absolute `value`, and in `relative` mode the signed DC
 * `offset` beside it, each against the previewed `record` when there is one.
 */
export function handleValueText({ binding, value, offset, record }) {
  if (binding !== 'relative') {
    return record
      ? localizeOr('FABRICATE.Common.RangeBar.ValueText', '{value} — {record}', { value, record })
      : value;
  }
  const signed = offset >= 0 ? `+${offset}` : String(offset);
  return record
    ? localizeOr(
        'FABRICATE.Common.RangeBar.RelativeValueTextAgainst',
        '{value} — DC {offset} against {record}',
        { value, offset: signed, record }
      )
    : localizeOr('FABRICATE.Common.RangeBar.RelativeValueText', '{value} — DC {offset}', {
        value,
        offset: signed,
      });
}
