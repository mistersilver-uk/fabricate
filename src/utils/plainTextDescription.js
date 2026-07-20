/**
 * Foundry-free plain-text description helpers.
 *
 * Item descriptions imported from Foundry carry enricher directives —
 * `@UUID[…]{Label}`, `@Compendium[…]{Label}`, `@Check[…]`, `@Damage[…]`,
 * `&Reference[…]{Label}`, `[[/roll …]]` — that Foundry resolves at render time
 * through the async `TextEditor.enrichHTML`. Fabricate's plain-text description
 * surfaces never enrich, so the raw directive text used to leak through the
 * HTML-stripping pass verbatim (issue 800). This module flattens the directives
 * to their human-readable label text with a synchronous, unit-testable regex
 * pre-pass, then reuses the existing HTML-strip + whitespace normalization.
 *
 * The logic is Foundry-free: it touches only `globalThis.document` (a DOM global
 * present in both Foundry and happy-dom), never a Foundry runtime global, so a
 * store, a domain service, and a builder can all import it.
 */

// Inline-roll command tokens (`/r`, `/roll`, and the gm/blind/private variants)
// that lead a `[[…]]` expression; stripped when we fall back to the bare formula.
const ROLL_COMMAND_TOKEN = /^\/(?:gmr|br|pr|r|roll)\b\s*/i;

/**
 * Reduce a label-less inline-roll expression to its bare dice formula.
 * Strips the leading command token and any trailing inline `#flavor` token.
 *
 * @param {string} inner - the text between the `[[` and `]]` delimiters
 * @returns {string} the bare formula
 */
function bareRollFormula(inner) {
  let formula = String(inner).trim().replace(ROLL_COMMAND_TOKEN, '');
  const hashIndex = formula.indexOf('#');
  if (hashIndex !== -1) formula = formula.slice(0, hashIndex);
  return formula.trim();
}

/**
 * Flatten Foundry enricher directives to human-readable text.
 *
 * Grammar (bounded, linear, required closing bracket — no `.*`, ReDoS-safe per
 * Sonar S5852):
 * - `@Word[…]{Label}` / `&Word[…]{Label}` → `Label`; label-less → dropped.
 * - `[[…]]{Label}` → `Label`; label-less → the bare dice formula.
 *
 * The bracket / brace inner classes are length-bounded (`{0,2048}`) so the pass
 * stays LINEAR: an unterminated run of directives cannot force a re-scan to the
 * end of the string at every anchor (an unbounded `[^\]]*` is O(n²) here, and a
 * future swap back to one must fail the adversarial-length test). Real UUIDs,
 * pack paths, roll formulas, and labels are far shorter than 2048 characters.
 *
 * A malformed (unterminated) directive is left verbatim because each pattern
 * requires its closing `]` / `]]` and the inner class never crosses it.
 * The pass is idempotent: after one run no `@Word[`, `&Word[`, or `[[` sequence
 * remains, so a second run is a no-op.
 *
 * @param {string} text
 * @returns {string}
 */
export function flattenEnricherSyntax(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text
    .replaceAll(/\[\[([^\]]{0,2048})\]\](?:\{([^}]{0,2048})\})?/g, (match, inner, label) => {
      const trimmedLabel = typeof label === 'string' ? label.trim() : '';
      if (trimmedLabel) return trimmedLabel;
      return bareRollFormula(inner);
    })
    .replaceAll(/@[A-Za-z]{1,32}\[[^\]]{0,2048}\](?:\{([^}]{0,2048})\})?/g, (match, label) =>
      typeof label === 'string' ? label : ''
    )
    .replaceAll(/&[A-Za-z]{1,32}\[[^\]]{0,2048}\](?:\{([^}]{0,2048})\})?/g, (match, label) =>
      typeof label === 'string' ? label : ''
    );
}

/**
 * Recursively extract the best textual candidate from a Foundry-style
 * description value ({ value, enriched, html, … } objects, arrays, primitives).
 *
 * @param {unknown} value
 * @param {Set<object>} [seen] - cycle guard
 * @returns {string}
 */
export function descriptionTextCandidate(value, seen = new Set()) {
  if (value == null) return '';

  const valueType = typeof value;
  if (valueType === 'string') return value.trim();
  if (['number', 'boolean', 'bigint'].includes(valueType)) {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => descriptionTextCandidate(entry, seen))
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  if (valueType !== 'object') return '';
  if (seen.has(value)) return '';
  seen.add(value);

  for (const key of [
    'value',
    'enriched',
    'html',
    'text',
    'content',
    'short',
    'long',
    'unidentified',
    'chat',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = descriptionTextCandidate(value[key], seen);
    if (candidate) return candidate;
  }

  return '';
}

/**
 * Strip HTML markup and decode entities. Uses a `<template>` element when a DOM
 * is available (Foundry / happy-dom), and a bounded regex fallback otherwise.
 * The tag regex is length-bounded (`{1,2048}`) to stay ReDoS-safe.
 *
 * @param {string} raw
 * @returns {string}
 */
function stripHtml(raw) {
  if (globalThis.document?.createElement) {
    const template = globalThis.document.createElement('template');
    template.innerHTML = raw;
    return String(template.content?.textContent || '');
  }

  return raw
    .replaceAll(/<br\s*\/?>/gi, ' ')
    .replaceAll(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, ' ')
    .replaceAll(/<[^>]{1,2048}>/g, ' ')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/&lt;/gi, '<')
    .replaceAll(/&gt;/gi, '>')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;|&apos;/gi, "'");
}

/**
 * Tidy separators orphaned by a dropped label-less directive. Whitespace is
 * expected to be single-spaced already (the caller collapses runs first), so
 * every quantifier here is bounded and linear.
 *
 * - collapses a run of separators into a single separator;
 * - strips a dangling separator immediately after a `:` label lead-in;
 * - trims separators / space at the string edges.
 *
 * Legitimately author-adjacent punctuation in prose is untouched: a lone
 * separator between two words is not a run, follows no colon, and sits at no
 * edge.
 *
 * @param {string} text
 * @returns {string}
 */
function tidySeparators(text) {
  return text
    .replaceAll(/([,;·•])(?: ?[,;·•])+/g, '$1')
    .replaceAll(/([:：]) ?[,;·•] ?/g, '$1 ')
    .replace(/^[\s,;·•]+/, '')
    .replace(/[\s,;·•]+$/, '');
}

/**
 * Produce a display-safe plain-text description from any Foundry-style value.
 *
 * Pipeline: candidate extraction → enricher flatten → HTML strip → separator
 * tidy → whitespace / punctuation normalization. Idempotent.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function plainTextDescription(value) {
  const raw = descriptionTextCandidate(value);
  if (!raw) return '';

  const stripped = stripHtml(flattenEnricherSyntax(raw));
  const collapsed = stripped.replaceAll(/\s+/g, ' ');
  return tidySeparators(collapsed)
    .replaceAll(/\s+([,.;:!?])/g, '$1')
    .trim();
}
