/**
 * Plain-text NORMALIZATION of an already-resolved description.
 *
 * **This module does not, and must not, RESOLVE anything.** Foundry's enricher
 * turns a directive such as `@UUID[…]` into an anchor carrying the referenced
 * document's real name; that happens at WRITE time, asynchronously, through the
 * `enrichToHtml` seam (`src/ui/svelte/util/foundryBridge.js`), at the ingestion
 * boundaries in `CraftingSystemManager`. By the time text reaches this module the
 * references are already anchors, so everything here is synchronous, Foundry-free,
 * and safe to call from a store, a domain service, and a builder alike.
 *
 * Vocabulary (pinned by the issue 800 delta):
 * - **RESOLVE** — enricher turns a directive into its referent's text (write time).
 * - **NORMALIZE** — enriched HTML becomes display-safe plain text (this module).
 * - **FLATTEN** — reserved for the roll-expression pass and the post-resolution
 *   label mop-up below, which are deterministic text rewrites, not resolution.
 *
 * Pipeline: candidate walk → `flattenRollExpressions` → HTML strip (with the
 * privacy scrub and the broken-anchor pass) → label mop-up → separator tidy →
 * whitespace normalization. Idempotent.
 *
 * The logic touches only `globalThis.document` (a DOM global present in both
 * Foundry and happy-dom) and `globalThis.game?.i18n` for the one localized
 * placeholder comparison — never a bare Foundry runtime global.
 */

// Inline-roll command tokens (`/r`, `/roll`, and the gm/blind/private variants)
// that lead a `[[…]]` expression; stripped when we fall back to the bare formula.
const ROLL_COMMAND_TOKEN = /^\/(?:gmr|br|pr|r|roll)\b\s*/i;

// Visibility-gated and secret markup that must never reach a stored description
// or any reader of one. Scrubbed by ATTRIBUTE rather than by asking the enricher
// to filter, because an enricher option filters relative to the user DOING the
// enrichment (we enrich as GM) while a stored description is displayed to a
// broader, less-privileged audience. `owner` is removed too: a stored string is
// one value shown to everybody, so "owner-only" content cannot be safely kept.
const VISIBILITY_GATED_SELECTOR =
  '[data-visibility="gm"], [data-visibility="none"], [data-visibility="owner"], section.secret:not(.revealed)';

// Separator characters orphaned when a reference is dropped. The trailing-edge
// class additionally carries `:` and the en/em dashes so `"Contains: <dropped>"`
// does not render a dangling lead-in.
const SEPARATOR_CLASS = ',;·•–—';
const EDGE_SEPARATOR_CLASS = `${SEPARATOR_CLASS}:：`;

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
 * Flatten inline roll expressions to text.
 *
 * Rolls are NEVER resolved: the enricher is called with `rolls: false` because a
 * command-less `[[1d6]]` is EAGERLY evaluated and would freeze into a literal
 * `"4"` forever. Both forms are flattened here instead, deterministically, so
 * re-ingesting the same source twice is byte-identical:
 *
 * - `[[…]]{Label}` → `Label`
 * - `[[…]]` → the bare dice formula (command token and `#flavor` removed)
 *
 * Grammar note (Sonar S5852): the inner classes are length-bounded (`{0,2048}`)
 * so the pass stays LINEAR — an unterminated run of `[[` cannot force a re-scan
 * to the end of the string at every anchor (an unbounded `[^\]]*` is O(n²) here,
 * and a future swap back to one must fail the adversarial-length test). A
 * malformed (unterminated) expression is left verbatim because the pattern
 * requires its closing `]]` and the inner class never crosses it.
 *
 * @param {string} text
 * @returns {string}
 */
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

/**
 * Post-resolution label mop-up for directive text that survived enrichment.
 *
 * Applied STRICTLY AFTER resolution, so nothing reaching it still has a referent
 * to lose: every resolvable `@UUID` is already an anchor and every unresolvable
 * one is a broken anchor handled by {@link stripHtml}. What is left is a
 * directive belonging to a system or module that registers NO enricher for it —
 * `@Check[…]{DC 15 Athletics}` on a world without that system, `&Reference[…]{…}`
 * outside dnd5e, `@Embed[…]{Overview}` (we pass `embeds: false` deliberately).
 * Rendering the author's label beats rendering the raw directive.
 *
 * A directive with NO label is left **verbatim** — dropping it was the rejected
 * approach, because a label-less reference is the one case where the label
 * carries no information and the text is all the reader has.
 *
 * @param {string} text
 * @returns {string}
 */
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

/**
 * Predicate: does this text still carry an unresolved enricher directive?
 *
 * Pure and synchronous — no Foundry calls, no document resolution. Backs the
 * GM-only startup DETECTOR that points at the Repair Item Data action for worlds
 * whose descriptions were captured before write-time resolution existed. It never
 * rewrites anything.
 *
 * Roll expressions are excluded on purpose: they are flattened deterministically
 * at every read, so their presence in stored text is not a repairable defect.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function hasUnresolvedDirectives(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return /[@&][A-Za-z]{1,32}\[[^\]]{0,2048}\]/.test(text);
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
 * STEP 1 of the post-enrichment DOM pass — the privacy scrub, run FIRST on the
 * pristine tree, unconditionally.
 *
 * Ordering is fail-safety rather than correctness: removal of a gated ancestor
 * already subsumes any unwrap inside it, and the broken-anchor unwrap promotes
 * children within the same parent chain so it can never move a node OUT of a
 * gated ancestor. Scrubbing the privacy-critical thing first means a future
 * refactor of the unwrap cannot open a window where gated text escapes. The
 * consequence is deliberate: a broken anchor carrying an authored label inside a
 * gated block is removed ENTIRELY — privacy wins over label preservation.
 *
 * `section.secret` is scrubbed here even though the enricher is also called with
 * `secrets: false`, because core strips secret markup from the INPUT before the
 * enrichers run — secret markup PRODUCED BY an enricher is only reachable at the
 * end of the pipeline. Neither half subsumes the other.
 *
 * @param {ParentNode} root
 */
function scrubVisibilityGatedContent(root) {
  // `querySelectorAll` returns a STATIC list in both Foundry and happy-dom, so
  // removing as we iterate is safe.
  for (const element of root.querySelectorAll(VISIBILITY_GATED_SELECTOR)) {
    element.remove();
  }
}

/**
 * STEP 2 of the post-enrichment DOM pass — the broken-reference decision, run on
 * whatever the privacy scrub left behind.
 *
 * `_createContentLink` sets the anchor's name from the match BEFORE deciding
 * brokenness, so `@UUID[bad]{Alchemist's Fire}` emits an anchor whose text is the
 * AUTHOR'S label while `@UUID[bad]` emits the localized `COMMON.Unknown`
 * placeholder. Removing both would delete author-supplied text; keeping both
 * would render the word "Unknown" as if it were prose. So:
 *
 * - text equal to the localized placeholder → the anchor is REMOVED;
 * - anything else → the anchor is UNWRAPPED and its authored label kept.
 *
 * The placeholder is resolved at RUNTIME through `game.i18n`, never compared
 * against a hardcoded English string. The `a.` selector prefix is load-bearing:
 * `_embedContent` also emits `p.broken.content-embed`, which must not be touched.
 *
 * @param {ParentNode} root
 */
function resolveBrokenAnchors(root) {
  const unknown = globalThis.game?.i18n?.localize?.('COMMON.Unknown') ?? '';
  for (const anchor of root.querySelectorAll('a.broken')) {
    const parent = anchor.parentNode;
    if (!parent) continue;
    if (!unknown || String(anchor.textContent ?? '').trim() !== unknown) {
      // Unwrap: promote the authored label into the anchor's own parent chain, so a
      // gated ancestor stays an ancestor and the privacy scrub can never be escaped.
      while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
    }
    anchor.remove();
  }
}

/**
 * Strip HTML markup and decode entities, running the privacy scrub and the
 * broken-anchor pass over the parsed tree first.
 *
 * The DOM path is the production path: enrichment output only ever reaches this
 * module inside Foundry, where `document` exists. The regex fallback below is for
 * headless normalization of ALREADY-STORED (already scrubbed, already resolved)
 * text, so it does not attempt to reproduce either DOM pass; it simply keeps an
 * anchor's text, which is the right answer for an authored label.
 *
 * The tag regex is length-bounded (`{1,2048}`) to stay ReDoS-safe.
 *
 * @param {string} raw
 * @returns {string}
 */
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

/**
 * Tidy separators and brackets orphaned by a removed reference. Whitespace is
 * expected to be single-spaced already (the caller collapses runs first), so
 * every quantifier here is bounded and linear.
 *
 * - collapses a run of separators into a single separator;
 * - strips a dangling separator immediately after a `:` label lead-in;
 * - drops a parenthetical emptied by a removal, and tidies the space a removal
 *   leaves against a bracket, so `"(see <dropped>)"` never renders as `"(see )"`;
 * - trims separators, a trailing `:`, and space at the string edges, so
 *   `"Contains: <dropped>"` never renders as `"Contains:"`.
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
    .replaceAll(new RegExp(`([${SEPARATOR_CLASS}])(?: ?[${SEPARATOR_CLASS}])+`, 'g'), '$1')
    .replaceAll(new RegExp(`([:：]) ?[${SEPARATOR_CLASS}] ?`, 'g'), '$1 ')
    .replaceAll(/\(\s*\)\s?/g, '')
    .replaceAll(/\(\s+/g, '(')
    .replaceAll(/\s+\)/g, ')')
    .replace(new RegExp(String.raw`^[\s${EDGE_SEPARATOR_CLASS}]+`), '')
    .replace(new RegExp(String.raw`[\s${EDGE_SEPARATOR_CLASS}]+$`), '');
}

/**
 * Produce a display-safe plain-text description from any Foundry-style value.
 *
 * NORMALIZES; does not resolve. See the module header.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function plainTextDescription(value) {
  const raw = descriptionTextCandidate(value);
  if (!raw) return '';

  const stripped = stripHtml(flattenRollExpressions(raw));
  const collapsed = flattenLabelledDirectives(stripped).replaceAll(/\s+/g, ' ');
  return tidySeparators(collapsed)
    .replaceAll(/\s+([,.;:!?])/g, '$1')
    .trim();
}
