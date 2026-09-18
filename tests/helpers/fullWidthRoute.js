/**
 * The full-width decision — "the aside is suppressed AND the column is released" — read out of the
 * two files that express it, and asked either of ONE route or of the WHOLE set (issue 1362).
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
 * @param {string} separator A single character.
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

/** Every TOP-LEVEL rule in a stylesheet, as `{prelude, declarations}`. */
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

/** The value of one declaration in a block, or `null`. */
export function declaration(declarations, property) {
  for (const entry of splitTopLevel(declarations, ';')) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    if (entry.slice(0, colon).trim() !== property) continue;
    return entry.slice(colon + 1).trim();
  }
  return null;
}

/** Whether a selector names `.manager-body` as a WHOLE CLASS TOKEN. */
export function namesManagerBody(value) {
  return /(?<![\w-])\.manager-body(?![\w-])/.test(value);
}

/** Whether ONE selector's subject is `.manager-body` itself rather than a descendant of it. */
export function isManagerBodySubject(selector) {
  return /(?<![\w-])\.manager-body(\.is-rail-collapsed)?\s*$/.test(selector);
}

/** The route id a selector scopes to, or `''` for the unscoped base rule. */
export function routeIdOf(selector) {
  return /\[data-manager-view\^?="([^"]+)"\]/.exec(selector)?.[1] ?? '';
}

/** The resolved track count of a `grid-template-columns` value. */
export function trackCount(value) {
  return splitTopLevel(value, ' ').length;
}

/**
 * The `FULL_WIDTH_VIEWS` literal, as source text.
 *
 * @param {string} rootSource `CraftingSystemManagerRoot.svelte`'s source.
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

/** Every `FULL_WIDTH_VIEWS` entry, parsed out of the root component's SOURCE. */
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
 */
export const NON_TOKEN_PREDICATES = Object.freeze({
  // A FAMILY, not a token: `checks` became four child routes plus a retained redirect (issue
  // 1096), which is why the stylesheet matches it by prefix and this predicate delegates.
  checks: '(view) => isChecksView(view)',
  // ROUTE + SUBSTATE: World owns the whole content column only on its Parties tab, so the
  // stylesheet matches a compound of two attributes and this predicate reads both.
  'world-parties': "(view, context) => view === 'world' && context.travelTab === 'parties'",
  // ROUTE + EDITOR MODE: d100 keeps its drop inspector; Direct and Check author result groups
  // in the main pane and release the unused inspector track.
  'gathering-task-edit':
    'isGatheringTaskFullWidth',
});

/** Assert that every entry's PREDICATE agrees with its own id. */
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

/** Assert the aside is BUILT from the set rather than from a restated chain. */
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
 */
export function releasedTrackCount(css, selector) {
  const normalizedSelector = selector.replaceAll(WHITESPACE_RUN, ' ');
  for (const rule of topLevelRules(css)) {
    if (!namesManagerBody(rule.prelude)) continue;
    const selectors = splitTopLevel(rule.prelude, ',').map((entry) =>
      entry.replaceAll(WHITESPACE_RUN, ' ')
    );
    if (!selectors.includes(normalizedSelector)) continue;
    const columns = declaration(rule.declarations, 'grid-template-columns');
    if (columns) return trackCount(columns);
  }
  return null;
}

/**
 * Assert that one route suppresses the shared inspector aside AND has its grid column released —
 * the two halves of ONE decision, which is wrong in its own way when done alone.
 *
 * @param {string} options.rootSource `CraftingSystemManagerRoot.svelte`'s source.
 * @param {string} options.css `styles/fabricate.css`'s source.
 * @param {string} options.routeId The `data-manager-view` token.
 * @param {string} [options.layoutClass] `full-width-2-track` (the aside goes and the column is
 * released to two tracks) or `self-owned-3-track` (the aside goes and the route keeps three,
 * repurposing the third column for its own content).
 */
export function assertFullWidthRoute({
  rootSource,
  css,
  routeId,
  layoutClass = 'full-width-2-track',
}) {
  const registry = fullWidthViewsSource(rootSource);
  // Whitespace-normalised rather than a regex over the authored line breaks.
  const normalized = registry.replaceAll(WHITESPACE_RUN, ' ');
  assert.ok(
    normalized.includes(`id: '${routeId}', layoutClass: '${layoutClass}',`),
    `${routeId} must be a ${layoutClass} member of FULL_WIDTH_VIEWS, which is the ONE place ` +
      `the aside/column decision is recorded. Saw: ${normalized}`
  );
  assertPredicatesMatchTheirIds(rootSource);
  assertAsideBuiltFromSet(rootSource);

  if (layoutClass !== 'full-width-2-track') return;

  // The other half of the one decision, PARSED rather than substring-matched.
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
