/**
 * Label in name (WCAG 2.5.3) as a listener hears it: whether an accessible name holds a visible
 * label, which the published seam's M22 refuses a name for lacking and `IconPicker` composes its
 * trigger's name by. Plain JS with no Svelte import, so the seam and a component share one
 * comparison.
 */
const WORDS =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

/**
 * `text` as a listener hears it: NFKC normalised and case folded, then its words and
 * symbols in order, each a run of letters, marks and digits or one symbol; punctuation and spacing
 * are dropped. Words are split by `Intl.Segmenter`, so a word inside unspaced CJK text stands
 * alone; a runtime without it splits on spacing, so such a label is read as not held.
 */
function spokenTokens(text) {
  const folded = text.normalize('NFKC').toLowerCase();
  const pieces = WORDS
    ? Array.from(WORDS.segment(folded), ({ segment }) => segment)
    : folded.split(/\s+/u);
  return pieces.flatMap((piece) => piece.match(/[\p{L}\p{M}\p{N}]+|\p{S}/gu) ?? []);
}

/**
 * Whether `name`'s tokens hold `label`'s as one contiguous run of whole tokens; a `name` or `label`
 * that is not a string holds and is held by nothing.
 */
export function containsLabel(name, label) {
  if (typeof name !== 'string' || typeof label !== 'string') return false;
  const [heard, shown] = [spokenTokens(name), spokenTokens(label)];
  return (
    heard.some(
      (_, start) =>
        start + shown.length <= heard.length &&
        shown.every((token, offset) => heard[start + offset] === token)
    ) || shown.length === 0
  );
}
