/** Sentence multisets for the harness-document split (issue #1661, phases 3-5). */
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

/** The rule-bearing sentences of a Markdown document, normalised, in order. */
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
 * The table rows and fenced-block lines `sentencesOf` drops as structure, in order: a row is its
 * trimmed cells re-joined, a separator row is dropped, and a fenced line is trimmed.
 */
export function structuralLinesOf(markdown) {
  const lines = [];
  let inFence = false;
  for (const line of String(markdown).split('\n')) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    const trimmed = line.trim();
    if (inFence) {
      if (trimmed.length > 0) lines.push(trimmed);
      continue;
    }
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replaceAll(/^\||\|$/gu, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.some((cell) => !/^:?-+:?$/u.test(cell))) lines.push(cells.join(' | '));
  }
  return lines;
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
 * A sentence with every digit run replaced by a placeholder.
 *
 * A case-count number embedded in prose (the View Lab registry size) changes for reasons unrelated
 * to a document split, and pinning the literal replacement text the way `withoutLinkTargets` does
 * would need re-editing every time the registry grows. This lets such a change be allowed NARROWLY
 * instead: an allowlist entry must reduce to the same string as its replacement once digits are
 * ignored, so the allowance covers the count and nothing else. A reworded rule cannot pass this
 * because only digit runs are dropped — every other character must still match exactly.
 *
 * @param {string} sentence
 * @returns {string}
 */
export function withoutCounts(sentence) {
  return String(sentence).replaceAll(/\d+/gu, '#');
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
