/**
 * Sentence multisets for the harness-document split (issue #1661, phases 3-5).
 *
 * `AGENTS.md`, `CLAUDE.md` and `CONTRIBUTING.md` are being split into a short rulebook plus
 * reference files loaded on demand. The issue's acceptance was "a diff review confirms no rule
 * sentence was lost", and a human diff review of a 1,100-line move is precisely where a lost
 * sentence hides. This is the mechanical replacement.
 *
 * The unit is a sentence, and `joinWraps` is what makes it one. `AGENTS.md` requires one sentence
 * per line, but `markdownlint-sentences-per-line` only caps sentences per line: it permits a
 * sentence wrapped across several lines, so nothing enforces the rule. Both sides of every
 * comparison below are wrap-normalised here rather than assumed to be normalised already.
 *
 * WHAT NORMALISATION DELIBERATELY DOES NOT DO. It strips list markers, blockquote markers and
 * heading hashes, and collapses internal whitespace — the things a move legitimately changes when
 * a bullet becomes a paragraph or a heading level shifts. It does NOT touch punctuation, case, or
 * wording. A reworded rule must fail this: "the same rule, said differently" is exactly the edit a
 * reviewer cannot catch by eye across a 1,100-line diff, and the whole point of the checker is to
 * catch it.
 *
 * Structural lines carry no rule and are dropped: fences, table rows, horizontal rules, HTML
 * comments (including the markdownlint disable/enable pairs), and link-reference definitions.
 * FENCED CONTENT IS OUT OF SCOPE, and that is a stated limit rather than a claim of safety. A
 * fence holds commands, config and file listings, not prose rules, and normalising it as prose
 * would report whitespace changes inside a code block as lost sentences. The one fence that
 * carries a rule — the `HIGH_RISK_PATHS` list in `AGENTS.md` — has a stronger guard already:
 * `tests/agent-model-tiers.test.js` pins its entries AND their order against
 * `scripts/lib/agentModelTiers.js`. Every other fence moves or does not move as a visible unit in
 * the diff, and this checker will not tell you which.
 */
import { joinWraps } from './markdownWraps.js';

/** Lines that carry no rule text and are dropped before comparison. */
const STRUCTURAL = [
  /^\s*$/u,
  /^\s*\|/u, // table row
  /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u, // horizontal rule
  /^\s*<!--/u, // HTML comment, including markdownlint disable/enable
  /^\s*\[[^\]]+\]:\s/u, // link-reference definition
];

/** The list, blockquote and heading markers a move may legitimately add or remove. */
const LEADING_MARKER = /^\s*(?:>+\s*)?(?:[-*+]\s+|\d+\.\s+|#{1,6}\s+)?/u;

/**
 * The rule-bearing sentences of a Markdown document, normalised, in order.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function sentencesOf(markdown) {
  const sentences = [];
  let inFence = false;
  for (const line of joinWraps(String(markdown)).split('\n')) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (STRUCTURAL.some((pattern) => pattern.test(line))) continue;
    const normalised = line.replace(LEADING_MARKER, '').replaceAll(/\s+/gu, ' ').trim();
    if (normalised.length > 0) sentences.push(normalised);
  }
  return sentences;
}

/**
 * A sentence with every Markdown link TARGET removed, its text kept.
 *
 * A move can force a link to be retargeted — an in-file `(#anchor)` becomes `(path/to.md#anchor)`
 * once the anchor's heading lives in another file — and that is a changed sentence, so the subset
 * assertion reports it, correctly. This is what lets such a change be allowed NARROWLY: an entry
 * in the retarget allowlist must reduce to the same string as the sentence it replaces, so the
 * allowance covers the target and nothing else. A reworded rule cannot be smuggled through it.
 *
 * @param {string} sentence
 * @returns {string}
 */
export function withoutLinkTargets(sentence) {
  return String(sentence).replaceAll(/\]\([^)]*\)/gu, ']()');
}

/**
 * A multiset of sentences: sentence -> how many times it appears.
 *
 * A MULTISET AND NOT A SET, because a set hides the failure this exists to catch. If a rule
 * appears twice in the old documents and once in the new, a set comparison is satisfied — and one
 * of the two places that stated the rule has silently stopped stating it.
 *
 * @param {string[]} sentences
 * @returns {Map<string, number>}
 */
export function multiset(sentences) {
  const counts = new Map();
  for (const sentence of sentences) counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  return counts;
}

/**
 * Sentences the OLD documents carry more often than the NEW ones do.
 *
 * @param {Map<string, number>} before
 * @param {Map<string, number>} after
 * @returns {{sentence: string, before: number, after: number}[]} sorted by sentence
 */
export function missingSentences(before, after) {
  const missing = [];
  for (const [sentence, count] of before) {
    const survived = after.get(sentence) ?? 0;
    if (survived < count) missing.push({ sentence, before: count, after: survived });
  }
  return missing.sort((left, right) => (left.sentence < right.sentence ? -1 : 1));
}
