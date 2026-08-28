/**
 * The full-width decision — "the aside is suppressed AND the column is released" — read out of
 * the two files that express it, and asked either of ONE route or of the WHOLE set (issue 1362).
 *
 * ── WHY THIS IS A HELPER AND NOT THREE COPIES ───────────────────────────────────────────
 *
 * Three suites ask about that pairing: `tests/manager-full-width-gate.test.js` asks it of the
 * whole set against the whole stylesheet, and `recipe-edit-editor.test.js` and
 * `recipe-edit-placeholder.test.js` each ask it of `recipe-edit` beside their other
 * route-specific assertions. PRs 6a-c add more. Every parser, anchor and assertion they share
 * lives here once: SonarCloud counts `tests/**` for new-code duplication, and — the reason
 * that actually matters — two copies of an ANCHOR are two things to keep in step, which is
 * precisely what a helper exists to prevent.
 *
 * ── WHAT IT ASKS, AND WHY IT CHANGED ────────────────────────────────────────────────────
 *
 * The two recipe-edit suites used to look for a route token inside the shell's twelve-clause
 * boolean aside guard. Issue 1362 replaced that chain with ONE read of `FULL_WIDTH_VIEWS`, so
 * the question is MEMBERSHIP of that set — which is the stronger question, because the chain
 * could name a route the stylesheet never released. That is how `checks` (issue 1096) and
 * `world-currency` (issue 1311) each shipped rendering against a dead ~300px strip.
 *
 * ── THE ANCHOR IS ASSERTED, NEVER TRUSTED ───────────────────────────────────────────────
 *
 * Both suites carried a comment naming the failure this defends against and did not defend
 * against it: a stale `indexOf` returns -1, `String#slice(-1, n)` then reads from the END of
 * the file, and the assertion over that slice passes on an EMPTY string — green, and checking
 * nothing at all. Every index here is checked before it is used.
 *
 * ── AND THE STYLESHEET IS PARSED, NOT SUBSTRING-MATCHED ─────────────────────────────────
 *
 * `css.includes('<selector> .manager-body')` is satisfied by a rule declaring only `padding`,
 * and by the `.is-rail-collapsed` sibling, of which it is a strict PREFIX — so the plain-rule
 * assertion could never red on its own. Both halves resolve a real top-level rule and read its
 * `grid-template-columns` track count instead.
 */
import assert from 'node:assert/strict';

/** Any run of whitespace, so an entry's Prettier line wrapping is not read as a contract. */
const WHITESPACE_RUN = /\s+/g;

/** The literal that opens the shell's one record of the full-width decision. */
const REGISTRY_OPEN = 'const FULL_WIDTH_VIEWS = Object.freeze([';

/** The literal that closes it. */
const REGISTRY_CLOSE = '\n  ]);';

/**
 * Split on top-level separators, ignoring any inside parentheses or brackets.
 *
 * @param {string} value
 * @param {string} separator A single character.
 * @returns {string[]}
 */
export function splitTopLevel(value, separator) {
  const parts = [];
  let token = '';
  let parens = 0;
  let brackets = 0;
  for (const character of value) {
    if (character === '(') parens += 1;
    if (character === ')') parens -= 1;
    if (character === '[') brackets += 1;
    if (character === ']') brackets -= 1;
    if (character === separator && parens === 0 && brackets === 0) {
      parts.push(token);
      token = '';
      continue;
    }
    token += character;
  }
  parts.push(token);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Every TOP-LEVEL rule in a stylesheet, as `{prelude, declarations}`.
 *
 * A rule is top-level when its opening brace sits at depth 0, which is exactly what excludes
 * the `@container` re-declarations — `.manager-body` is re-declared inside
 * `@container fabricate-manager (max-width: 1120px)`, where it stacks to one column, and a
 * flat scan reads those as "every route released". Nested blocks inside a rule are dropped
 * from its declarations rather than parsed, and comments are stripped first so a selector
 * quoted in prose cannot be read as a rule.
 *
 * @param {string} css
 * @returns {Array<{prelude: string, declarations: string}>}
 */
export function topLevelRules(css) {
  const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
  const rules = [];
  let depth = 0;
  let prelude = '';
  let declarations = '';
  let ruleDepth = -1;
  for (const character of source) {
    if (character === '{') {
      if (depth === 0 && !prelude.trim().startsWith('@')) ruleDepth = 0;
      if (ruleDepth === 0 && depth === 0) {
        declarations = '';
      } else if (ruleDepth === 0) {
        // A nested block inside a top-level rule: its content is not this rule's.
        declarations += ' ';
      }
      depth += 1;
      if (depth > 1 || ruleDepth !== 0) prelude = '';
      continue;
    }
    if (character === '}') {
      depth -= 1;
      if (depth === 0 && ruleDepth === 0) {
        rules.push({ prelude: prelude.trim(), declarations });
        ruleDepth = -1;
        declarations = '';
      }
      prelude = '';
      continue;
    }
    if (depth === 1 && ruleDepth === 0) declarations += character;
    if (depth === 0) prelude += character;
  }
  return rules;
}

/**
 * The value of one declaration in a block, or `null`.
 *
 * @param {string} declarations
 * @param {string} property
 * @returns {string|null}
 */
export function declaration(declarations, property) {
  for (const entry of splitTopLevel(declarations, ';')) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    if (entry.slice(0, colon).trim() !== property) continue;
    return entry.slice(colon + 1).trim();
  }
  return null;
}

/**
 * Whether a selector names `.manager-body` as a WHOLE CLASS TOKEN.
 *
 * Anchored at both ends rather than a bare `includes`, for the reason the View Lab's hook scan
 * records: a rename to `.manager-body-outer` (or any longer name containing it) leaves a
 * substring test matching, so the parse goes on "finding" rules that no longer exist and the
 * non-empty guard can never fire.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function namesManagerBody(value) {
  return /(?<![\w-])\.manager-body(?![\w-])/.test(value);
}

/**
 * Whether ONE selector's subject is `.manager-body` itself rather than a descendant of it.
 *
 * `.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button` also declares
 * `grid-template-columns`, and it is a rule about a NAV BUTTON. Classifying it would put a
 * one-track entry into the layout sets and let a real collapsed-sibling omission hide behind a
 * hand-written exemption for it.
 *
 * @param {string} selector
 * @returns {boolean}
 */
export function isManagerBodySubject(selector) {
  return /(?<![\w-])\.manager-body(\.is-rail-collapsed)?\s*$/.test(selector);
}

/**
 * The route id a selector scopes to, or `''` for the unscoped base rule.
 *
 * @param {string} selector
 * @returns {string}
 */
export function routeIdOf(selector) {
  return /\[data-manager-view\^?="([^"]+)"\]/.exec(selector)?.[1] ?? '';
}

/**
 * The resolved track count of a `grid-template-columns` value.
 *
 * @param {string} value
 * @returns {number}
 */
export function trackCount(value) {
  return splitTopLevel(value, ' ').length;
}

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
 * Every `FULL_WIDTH_VIEWS` entry, parsed out of the root component's SOURCE.
 *
 * Parsed rather than imported, because the set lives in a `.svelte` instance scope and no
 * suite here compiles Svelte. That is also why the seven world entries are written out
 * literally in the component rather than mapped from a token list: an interpolated selector
 * would leave nothing to compare.
 *
 * `predicate` is captured as SOURCE TEXT and is the field that matters most. It is the only
 * one that decides anything at runtime — `fullWidthLayout` derives from it and nothing else —
 * so a set whose ids and selectors agree perfectly while two predicates are swapped ships the
 * defect with every id/selector assertion green.
 *
 * @param {string} rootSource
 * @returns {Array<{id: string, layoutClass: string, selector: string, predicate: string}>}
 */
export function parseFullWidthViews(rootSource) {
  const body = fullWidthViewsSource(rootSource);
  const pattern =
    /id:\s*'([^']+)',[\s\S]*?layoutClass:\s*'([^']+)',[\s\S]*?selector:\s*\n?\s*'([^']+)',[\s\S]*?predicate:\s*([^\n]+?),\s*\n/g;
  return Array.from(body.matchAll(pattern), (match) => ({
    id: match[1],
    layoutClass: match[2],
    selector: match[3],
    predicate: match[4].trim(),
  }));
}

/**
 * The two entries whose predicate is deliberately NOT a plain token comparison, with the exact
 * predicate each must carry.
 *
 * NAMED rather than excluded from scope, mirroring how the gate names `tool-edit` and
 * `knowledge` as the members of its self-owned layout class. An exemption that merely skipped
 * these two would let either be rewritten into anything at all.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NON_TOKEN_PREDICATES = Object.freeze({
  // A FAMILY, not a token: `checks` became four child routes plus a retained redirect (issue
  // 1096), which is why the stylesheet matches it by prefix and this predicate delegates.
  checks: '(view) => isChecksView(view)',
  // ROUTE + SUBSTATE: World owns the whole content column only on its Parties tab, so the
  // stylesheet matches a compound of two attributes and this predicate reads both.
  'world-parties': "(view, context) => view === 'world' && context.travelTab === 'parties'",
});

/**
 * Assert that every entry's PREDICATE agrees with its own id.
 *
 * THIS IS THE FIELD THAT SHIPS THE DEFECT. `fullWidthLayout` is derived by running each
 * entry's predicate against the current view; the id and the selector are read by nothing at
 * runtime. A gate that checked only selector-to-id equality stayed green through a swap of two
 * routes' predicates — the aside suppressed on the wrong screen — while every other assertion
 * in every other suite also stayed green.
 *
 * @param {string} rootSource
 */
export function assertPredicatesMatchTheirIds(rootSource) {
  const entries = parseFullWidthViews(rootSource);
  // NON-VACUITY. A parse that silently matched nothing would satisfy the loop below over an
  // empty list, which is the failure this whole assertion exists to convert into a loud one.
  assert.ok(
    entries.length >= 20,
    `the registry parse found ${entries.length} entries with a predicate; the scan is probably ` +
      'matching nothing'
  );
  const wrong = [];
  for (const entry of entries) {
    const expected = NON_TOKEN_PREDICATES[entry.id] ?? `(view) => view === '${entry.id}'`;
    if (entry.predicate !== expected) {
      wrong.push(`${entry.id}: expected \`${expected}\`, got \`${entry.predicate}\``);
    }
  }
  assert.deepEqual(
    wrong,
    [],
    'these entries carry a predicate that does not answer for their own id. The predicate is ' +
      'the ONLY field `fullWidthLayout` reads, so a mismatch suppresses the inspector on the ' +
      'wrong screen while every id and selector assertion stays green:\n  ' +
      wrong.join('\n  ')
  );
  // And the two non-token entries are still IN the set, so the exemption table above cannot
  // outlive the entries it excuses.
  for (const id of Object.keys(NON_TOKEN_PREDICATES)) {
    assert.ok(
      entries.some((entry) => entry.id === id),
      `NON_TOKEN_PREDICATES names "${id}", which is no longer a FULL_WIDTH_VIEWS entry`
    );
  }
}

/**
 * Assert the aside is BUILT from the set rather than from a restated chain.
 *
 * A restated condition satisfies every membership assertion and still renders the wrong strip,
 * which is how the two halves drifted twice before the set existed.
 *
 * @param {string} rootSource
 */
export function assertAsideBuiltFromSet(rootSource) {
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
}

/**
 * The resolved track count of the top-level rule whose selector list carries `selector` as a
 * COMPLETE entry, or `null` when no such rule declares `grid-template-columns`.
 *
 * A complete comma-delimited entry rather than a substring, because `… .manager-body` is a
 * strict PREFIX of `… .manager-body.is-rail-collapsed`: a substring test for the plain rule is
 * satisfied by the collapsed one, so it could never red on its own.
 *
 * @param {string} css
 * @param {string} selector
 * @returns {number|null}
 */
export function releasedTrackCount(css, selector) {
  for (const rule of topLevelRules(css)) {
    if (!namesManagerBody(rule.prelude)) continue;
    if (!splitTopLevel(rule.prelude, ',').includes(selector)) continue;
    const columns = declaration(rule.declarations, 'grid-template-columns');
    if (columns) return trackCount(columns);
  }
  return null;
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
  assertPredicatesMatchTheirIds(rootSource);
  assertAsideBuiltFromSet(rootSource);

  if (layoutClass !== 'full-width-2-track') return;

  // The other half of the one decision, PARSED rather than substring-matched. Both rules,
  // because `.manager-body.is-rail-collapsed` out-specifies a single-class rule: a released
  // column with no collapsed sibling silently snaps back to three tracks the moment the GM
  // collapses the rail.
  const scoped = `.fabricate-manager[data-manager-view="${routeId}"] .manager-body`;
  assert.equal(
    releasedTrackCount(css, scoped),
    2,
    `${routeId} must resolve to two grid tracks in a top-level rule, or the suppressed aside ` +
      'leaves a dead ~300px strip. A rule that merely names the selector is not enough — it ' +
      'has to declare the released columns.'
  );
  assert.equal(
    releasedTrackCount(css, `${scoped}.is-rail-collapsed`),
    2,
    `${routeId}'s collapsed-rail variant must release the same two tracks, at equal specificity`
  );
}
