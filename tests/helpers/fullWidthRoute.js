/**
 * "The aside is suppressed AND the column is released", asked of one route (issue 1362).
 *
 * ── WHY THIS IS A HELPER AND NOT TWO COPIES ─────────────────────────────────────────────
 *
 * Two test files pin that pairing for `recipe-edit` — `recipe-edit-editor.test.js` and
 * `recipe-edit-placeholder.test.js` — and both said so as a ~25-line block of their own. A
 * third and fourth arrive with PRs 6a-c, and SonarCloud counts `tests/**` for new-code
 * duplication, so the block lives here once.
 *
 * ── WHAT IT ASKS, AND WHY IT CHANGED ────────────────────────────────────────────────────
 *
 * Both files used to look for a route token inside the shell's twelve-clause boolean aside
 * guard. Issue 1362 replaced that chain with ONE read of `FULL_WIDTH_VIEWS`, so the question
 * is MEMBERSHIP of that set — which is the stronger question, because the chain could name a
 * route the stylesheet never released. That is how `checks` (issue 1096) and `world-currency`
 * (issue 1311) each shipped rendering against a dead ~300px strip.
 *
 * ── THE ANCHOR IS ASSERTED, NEVER TRUSTED ───────────────────────────────────────────────
 *
 * Both files carried a comment naming the failure this defends against and did not defend
 * against it: a stale `indexOf` returns -1, `String#slice(-1, n)` then reads from the END of
 * the file, and the assertion over that slice passes on an EMPTY string — green, and checking
 * nothing at all. Every index here is checked before it is used, so the guard cannot go
 * vacuous the next time the shell is refactored.
 *
 * ── IT IS NOT A SUBSTITUTE FOR THE SET-EQUALITY GATE ────────────────────────────────────
 *
 * `tests/manager-full-width-gate.test.js` asserts the WHOLE set against the whole stylesheet,
 * at-rule-aware and from a non-empty parse. This answers the narrower per-route question the
 * two recipe-edit suites own, beside their other route-specific assertions.
 */
import assert from 'node:assert/strict';

/** Any run of whitespace, so an entry's Prettier line wrapping is not read as a contract. */
const WHITESPACE_RUN = /\s+/g;

/** The literal that opens the shell's one record of the full-width decision. */
const REGISTRY_OPEN = 'const FULL_WIDTH_VIEWS = Object.freeze([';

/** The literal that closes it. */
const REGISTRY_CLOSE = '\n  ]);';

/**
 * The `FULL_WIDTH_VIEWS` literal, as source text.
 *
 * @param {string} rootSource `CraftingSystemManagerRoot.svelte`'s source.
 * @returns {string}
 */
export function fullWidthViewsSource(rootSource) {
  const start = rootSource.indexOf(REGISTRY_OPEN);
  assert.ok(
    start !== -1,
    'the manager root no longer declares FULL_WIDTH_VIEWS, so nothing below is measuring the ' +
      'full-width decision at all'
  );
  const end = rootSource.indexOf(REGISTRY_CLOSE, start);
  assert.ok(end > start, 'FULL_WIDTH_VIEWS is declared but not terminated as expected');
  return rootSource.slice(start, end);
}

/**
 * Assert that one route suppresses the shared inspector aside AND has its grid column
 * released — the two halves of ONE decision, which is wrong in its own way when done alone.
 *
 * Suppress without releasing and a ~300px empty box still holds the strip open; release
 * without suppressing and the (empty) aside wraps to an implicit grid row BELOW the editor.
 *
 * @param {object} options
 * @param {string} options.rootSource `CraftingSystemManagerRoot.svelte`'s source.
 * @param {string} options.css `styles/fabricate.css`'s source.
 * @param {string} options.routeId The `data-manager-view` token.
 * @param {string} [options.layoutClass] `full-width-2-track` (the aside goes and the column is
 *   released to two tracks) or `self-owned-3-track` (the aside goes and the route keeps three,
 *   repurposing the third column for its own content).
 */
export function assertFullWidthRoute({
  rootSource,
  css,
  routeId,
  layoutClass = 'full-width-2-track',
}) {
  const registry = fullWidthViewsSource(rootSource);
  // Whitespace-normalised rather than a regex over the authored line breaks. The entry is
  // Prettier-formatted and its wrapping is not a contract; what IS one is the ADJACENCY of a
  // route id and its own layout class — two independent substring checks would be satisfied
  // by an entry naming one route's id beside another route's class.
  const normalized = registry.replaceAll(WHITESPACE_RUN, ' ');
  assert.ok(
    normalized.includes(`id: '${routeId}', layoutClass: '${layoutClass}',`),
    `${routeId} must be a ${layoutClass} member of FULL_WIDTH_VIEWS, which is the ONE place ` +
      `the aside/column decision is recorded. Saw: ${normalized}`
  );

  // And the aside really is BUILT from that set rather than from a restated chain. A restated
  // condition would satisfy the membership assertion above and still render the wrong strip.
  assert.match(
    rootSource,
    /\{#if !fullWidthLayout\}\s*\n\s*<aside\s+class="manager-inspector"/,
    'the inspector aside must render on `!fullWidthLayout`, not on a hand-restated chain'
  );
  assert.match(
    rootSource,
    /const fullWidthLayout = \$derived\(\s*\n?\s*FULL_WIDTH_VIEWS\.find\(/,
    '`fullWidthLayout` must be derived from FULL_WIDTH_VIEWS'
  );

  if (layoutClass !== 'full-width-2-track') return;

  // The other half of the one decision. BOTH stylesheet rules, because
  // `.manager-body.is-rail-collapsed` out-specifies a single-class rule: a released column
  // with no collapsed sibling silently snaps back to three tracks the moment the GM collapses
  // the rail.
  assert.ok(
    css.includes(`.fabricate-manager[data-manager-view="${routeId}"] .manager-body`),
    `${routeId} must be in the two-column override list, or the suppressed aside leaves a ` +
      'dead ~300px strip'
  );
  assert.ok(
    css.includes(
      `.fabricate-manager[data-manager-view="${routeId}"] .manager-body.is-rail-collapsed`
    ),
    `${routeId}'s collapsed-rail variant must be released too, at equal specificity`
  );
}
