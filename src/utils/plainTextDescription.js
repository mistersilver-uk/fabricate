/**
 * Normalizes an already-resolved description and must never resolve: enrichment happens at write
 * time (issue 800 pins RESOLVE, NORMALIZE and FLATTEN). Synchronous and idempotent, touching only
 * `globalThis.document` and `globalThis.game?.i18n`.
 */

// The `/r` and `/roll` families that lead a `[[…]]` expression.
const ROLL_COMMAND_TOKEN = /^\/(?:gmr|br|pr|r|roll)\b\s*/i;

// Gated and secret markup that must never reach a stored description or its readers.
const VISIBILITY_GATED_SELECTOR =
  '[data-visibility="gm"], [data-visibility="none"], [data-visibility="owner"], section.secret:not(.revealed)';

const SEPARATOR_CLASS = ',;·•–—';
const EDGE_SEPARATOR_CLASS = `${SEPARATOR_CLASS}:：`;

/** Reduce a label-less inline-roll expression to its bare dice formula. */
function bareRollFormula(inner) {
  let formula = String(inner).trim().replace(ROLL_COMMAND_TOKEN, '');
  const hashIndex = formula.indexOf('#');
  if (hashIndex !== -1) formula = formula.slice(0, hashIndex);
  return formula.trim();
}

export function flattenRollExpressions(text) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return text.replaceAll(
    /\[\[([^\]]{0,2048})\]\](?:\{([^}]{0,2048})\})?/g,
    (match, inner, label) => {
      const trimmedLabel = typeof label === 'string' ? label.trim() : '';
      if (trimmedLabel) return trimmedLabel;
      return bareRollFormula(inner);
    }
  );
}

/** Post-resolution label mop-up for directive text that survived enrichment. */
function flattenLabelledDirectives(text) {
  return text
    .replaceAll(
      /@[A-Za-z]{1,32}\[[^\]]{0,2048}\]\{([^}]{0,2048})\}/g,
      (match, label) => label ?? ''
    )
    .replaceAll(
      /&[A-Za-z]{1,32}\[[^\]]{0,2048}\]\{([^}]{0,2048})\}/g,
      (match, label) => label ?? ''
    );
}

/** Whether a directive in the text is visibly broken to a reader. */
export function hasUnresolvedDirectives(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return /[@&][A-Za-z]{1,32}\[[^\]]{0,2048}\](?!\{[^}]{1,2048}\})/.test(text);
}

/** The best textual candidate from `{ value, enriched, html }` objects, arrays or primitives. */
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

/** Step 1: the privacy scrub, first and unconditionally, on the pristine tree. */
function scrubVisibilityGatedContent(root) {
  // `querySelectorAll` is static in Foundry and happy-dom, so removing while iterating is safe.
  for (const element of root.querySelectorAll(VISIBILITY_GATED_SELECTOR)) {
    element.remove();
  }
}

// Core's broken-link placeholder key MOVED between generations: `COMMON.Unknown` in V14, a bare
// `Unknown` in V13 (whose `en.json` carries a top-level "Unknown" and has no COMMON namespace at
// all).
const BROKEN_LINK_PLACEHOLDER_KEYS = Object.freeze(['COMMON.Unknown', 'Unknown']);

/** Every string this Foundry generation might use for a broken link with no name. */
function brokenLinkPlaceholders() {
  const placeholders = new Set();

  try {
    const impl =
      globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
      globalThis.foundry?.applications?.ux?.TextEditor;
    const probe = impl?.createAnchor?.({});
    const text = String(probe?.textContent ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    if (text) placeholders.add(text);
  } catch {
    // Fall through to the key list.
  }

  for (const key of BROKEN_LINK_PLACEHOLDER_KEYS) {
    const value = String(globalThis.game?.i18n?.localize?.(key) ?? '').trim();
    if (!value) continue;
    if (value === key && key.includes('.')) continue;
    placeholders.add(value);
  }

  return placeholders;
}

/** Step 2: the broken-reference decision over what the scrub left. */
function resolveBrokenAnchors(root) {
  // Not memoized: a language change would stale it, and it would leak across mocked tests.
  const placeholders = brokenLinkPlaceholders();
  for (const anchor of root.querySelectorAll('a.broken')) {
    const parent = anchor.parentNode;
    if (!parent) continue;
    const label = String(anchor.textContent ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim();
    if (!placeholders.has(label)) {
      // Unwrap: promote the authored label into the anchor's own parent chain, so a gated ancestor
      // stays an ancestor and the privacy scrub can never be escaped.
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
    }
    anchor.remove();
  }
}

/** After the scrub and broken-anchor pass over the parsed tree. */
function stripHtml(raw) {
  if (globalThis.document?.createElement) {
    const template = globalThis.document.createElement('template');
    template.innerHTML = raw;
    const content = template.content;
    if (content) {
      scrubVisibilityGatedContent(content);
      resolveBrokenAnchors(content);
    }
    return String(content?.textContent || '');
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

function tidySeparators(text) {
  return text
    .replaceAll(new RegExp(`([${SEPARATOR_CLASS}])(?: ?[${SEPARATOR_CLASS}])+`, 'g'), '$1')
    .replaceAll(new RegExp(`([:：]) ?[${SEPARATOR_CLASS}] ?`, 'g'), '$1 ')
    .replaceAll(new RegExp(String.raw`[${EDGE_SEPARATOR_CLASS}]+\s*([.!?])`, 'g'), '$1')
    .replaceAll(/\(\s*\)\s?/g, '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replace(new RegExp(String.raw`^[\s${EDGE_SEPARATOR_CLASS}]+`), '')
    .replace(new RegExp(String.raw`[\s${EDGE_SEPARATOR_CLASS}]+$`), '');
}

export function plainTextDescription(value) {
  const raw = descriptionTextCandidate(value);
  if (!raw) return '';

  const stripped = stripHtml(flattenRollExpressions(raw));
  const collapsed = flattenLabelledDirectives(stripped).replaceAll(/\s+/g, ' ');
  return tidySeparators(collapsed)
    .replaceAll(/\s+([,.;:!?])/g, '$1')
    .trim();
}
