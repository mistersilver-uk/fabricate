/**
 * The progressive check's preview sandbox (issue 1097): a difficulty order the GM types on the
 * check, spent through `resolveProgressiveAward` so the Checks Studio buckets it by award count.
 * It is scratch: the engine never reads it, readiness never validates it, export strips it.
 * Absent `preview` and `{ difficulties: [] }` both survive, and order is the datum. A non-finite
 * token is dropped because `NaN` reloads from JSON as `0`; that is a shape rule, not validation.
 */

/** Commas and/or whitespace, so `4 6 9` and `4, 6, 9` are one order typed two ways. */
const SEPARATOR = /[\s,]+/;

const JOIN = ', ';

function finiteInOrder(values) {
  const list = Array.isArray(values) ? values : [];
  const kept = [];
  for (const value of list) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) kept.push(numeric);
  }
  return kept;
}

export function parsePreviewDifficulties(text) {
  return finiteInOrder(
    String(text ?? '')
      .split(SEPARATOR)
      .filter((token) => token !== '')
  );
}

export function formatPreviewDifficulties(difficulties) {
  return finiteInOrder(difficulties).join(JOIN);
}

/** Absence-preserving. The progressive check normalizer and the manager's check-draft clone
 *  both rebuild by allowlist and call this, so neither drops the key on the next save. */
export function normalizePreviewSandbox(preview) {
  if (!preview || typeof preview !== 'object') return null;
  if (!Array.isArray(preview.difficulties)) return null;
  return { difficulties: finiteInOrder(preview.difficulties) };
}
