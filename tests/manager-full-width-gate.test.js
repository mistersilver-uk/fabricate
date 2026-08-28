/**
 * The full-width decision, asserted as ONE thing in two files (issue 1362, epic 1357).
 *
 * Suppressing `<aside class="manager-inspector">` in `CraftingSystemManagerRoot.svelte` and
 * releasing the third grid column in `styles/fabricate.css` are one decision expressed twice.
 * Doing only the first leaves a ~300px empty box holding the strip open; doing only the second
 * wraps the (empty) aside to an implicit grid row underneath the editor. Both halves have
 * shipped alone before — `checks` (issue 1096) and `world-currency` (issue 1311) each rendered
 * against a dead strip for a release — so the pairing is checked mechanically here.
 *
 * ── WHY IT IS NOT A SET OF ROUTE TOKENS ─────────────────────────────────────────────────
 *
 * Three of the shipped exclusions are not route tokens: `checks` is a FAMILY matched by a
 * prefix selector, World > Parties is a route+SUBSTATE matched by a compound attribute
 * selector, and the world-rules clause spans three tokens. So the registry carries the
 * stylesheet SELECTOR, and this gate compares selector strings.
 *
 * ── AND WHY IT IS A THREE-STATE CLASSIFICATION ──────────────────────────────────────────
 *
 * There are THREE layout states in the sheet, not two. `tool-edit` and `knowledge` suppress
 * the aside AND keep three tracks, repurposing the third column for their own content. A gate
 * asserting "aside excluded equals column released" is therefore UNSATISFIABLE on `main`, and
 * every loosening of it is vacuous. Each rule is classified by RESOLVED TRACK COUNT into
 * `shared-3-track`, `full-width-2-track` or `self-owned-3-track`, with `tool-edit` and
 * `knowledge` NAMED as the members of the self-owned class rather than excluded from scope.
 *
 * ── IT MUST FAIL LOUD ───────────────────────────────────────────────────────────────────
 *
 * The house helper for reading a rule out of this stylesheet (`blockFor` in
 * `tests/components/manager-layout.test.js`) answers `''` on no match, so the cheapest green
 * available to a broken parse is two empty sets comparing equal. Both parsed sets are
 * therefore asserted NON-EMPTY and asserted to contain three NAMED baseline members — one per
 * exclusion shape, spanning both aside-suppressing classes — BEFORE the equality runs.
 *
 * ── AND AT-RULE AWARE ───────────────────────────────────────────────────────────────────
 *
 * `.manager-body` is re-declared inside `@container fabricate-manager (max-width: 1120px)`,
 * where it stacks to one column. A flat scan reads those as "every route released"; this
 * parser tracks brace depth and only classifies rules opened at depth 0.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const CSS_PATH = 'styles/fabricate.css';
const ROOT_COMPONENT_PATH = 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte';

const css = readFileSync(resolve(ROOT, CSS_PATH), 'utf8');
const rootSource = readFileSync(resolve(ROOT, ROOT_COMPONENT_PATH), 'utf8');

/**
 * The routes that suppress the aside AND keep three tracks. NAMED rather than inferred: the
 * track count alone cannot separate them from `tools`, which also declares three tracks and
 * keeps its inspector.
 *
 * @type {ReadonlySet<string>}
 */
const SELF_OWNED_THREE_TRACK = new Set(['tool-edit', 'knowledge']);

/**
 * The three baseline members every parsed set must contain before the equality runs. One per
 * exclusion SHAPE — a prefix-matched family, a route+substate compound, an ordinary token —
 * and spanning both aside-suppressing classes.
 *
 * @type {readonly string[]}
 */
const BASELINE_MEMBERS = Object.freeze([
  '.fabricate-manager[data-manager-view^="checks"] .manager-body::full-width-2-track',
  '.fabricate-manager[data-manager-view="world"][data-world-travel-tab="parties"] .manager-body::full-width-2-track',
  '.fabricate-manager[data-manager-view="tool-edit"] .manager-body::self-owned-3-track',
]);

/** The base rule every route shares, which proves the parser saw the unscoped declaration. */
const SHARED_BASELINE = '.fabricate-manager .manager-body::shared-3-track';

/**
 * Split on top-level separators, ignoring any inside parentheses or brackets.
 *
 * @param {string} value
 * @param {string} separator A single character.
 * @returns {string[]}
 */
function splitTopLevel(value, separator) {
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
 * Every TOP-LEVEL rule in the stylesheet, as `{prelude, declarations}`.
 *
 * A rule is top-level when its opening brace sits at depth 0, which is exactly what excludes
 * the `@container` re-declarations. Nested blocks inside a rule are dropped from its
 * declarations rather than parsed, and comments are stripped first so a selector quoted in
 * prose cannot be read as a rule.
 *
 * @returns {Array<{prelude: string, declarations: string}>}
 */
function topLevelRules() {
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
function declaration(declarations, property) {
  for (const entry of splitTopLevel(declarations, ';')) {
    const colon = entry.indexOf(':');
    if (colon === -1) continue;
    if (entry.slice(0, colon).trim() !== property) continue;
    return entry.slice(colon + 1).trim();
  }
  return null;
}

/**
 * The route id a selector scopes to, or `''` for the unscoped base rule.
 *
 * @param {string} selector
 * @returns {string}
 */
function routeIdOf(selector) {
  return /\[data-manager-view\^?="([^"]+)"\]/.exec(selector)?.[1] ?? '';
}

/**
 * Whether a selector names `.manager-body` as a WHOLE CLASS TOKEN.
 *
 * Anchored at both ends rather than a bare `includes`, for the reason the View Lab's hook
 * scan records: a rename to `.manager-body-outer` (or any longer name containing it) leaves a
 * substring test matching, so the parse goes on "finding" rules that no longer exist and the
 * non-empty guard below can never fire.
 *
 * @param {string} value
 * @returns {boolean}
 */
function namesManagerBody(value) {
  return /(?<![\w-])\.manager-body(?![\w-])/.test(value);
}

/**
 * Whether ONE selector's subject is `.manager-body` itself rather than a descendant of it.
 *
 * `.fabricate-manager .manager-body.is-rail-collapsed .manager-nav-button` also declares
 * `grid-template-columns`, and it is a rule about a NAV BUTTON. Classifying it would put a
 * one-track entry into the layout sets and let a real collapsed-sibling omission hide behind
 * a hand-written exemption for it.
 *
 * @param {string} selector
 * @returns {boolean}
 */
function isManagerBodySubject(selector) {
  return /(?<![\w-])\.manager-body(\.is-rail-collapsed)?\s*$/.test(selector);
}

/**
 * The stylesheet's own classification of every top-level `.manager-body` grid rule.
 *
 * @returns {Map<string, {layoutClass: string, plain: boolean, collapsed: boolean}>} Keyed by
 *   the BASE selector — the collapsed sibling folded onto it.
 */
function classifyStylesheet() {
  const bases = new Map();
  for (const rule of topLevelRules()) {
    if (!namesManagerBody(rule.prelude)) continue;
    const columns = declaration(rule.declarations, 'grid-template-columns');
    if (!columns) continue;
    const tracks = splitTopLevel(columns, ' ').length;
    for (const selector of splitTopLevel(rule.prelude, ',')) {
      if (!isManagerBodySubject(selector)) continue;
      const collapsed = selector.includes('.is-rail-collapsed');
      const base = selector.replaceAll('.is-rail-collapsed', '');
      const routeId = routeIdOf(base);
      let layoutClass = 'shared-3-track';
      if (tracks === 2) layoutClass = 'full-width-2-track';
      else if (SELF_OWNED_THREE_TRACK.has(routeId)) layoutClass = 'self-owned-3-track';
      const record = bases.get(base) ?? { layoutClass, plain: false, collapsed: false };
      record.layoutClass = layoutClass;
      if (collapsed) record.collapsed = true;
      else record.plain = true;
      bases.set(base, record);
    }
  }
  return bases;
}

/**
 * The registry's own set, parsed out of the root component's SOURCE.
 *
 * Parsed rather than imported, because `FULL_WIDTH_VIEWS` lives in a `.svelte` instance scope
 * and this file compiles no Svelte. That is also why the seven world entries are written out
 * literally there rather than mapped: an interpolated selector would leave nothing here to
 * compare.
 *
 * @returns {Array<{id: string, layoutClass: string, selector: string}>}
 */
function parseRegistry() {
  const start = rootSource.indexOf('const FULL_WIDTH_VIEWS = Object.freeze([');
  assert.ok(start >= 0, 'FULL_WIDTH_VIEWS is no longer declared in the manager root');
  const end = rootSource.indexOf('\n  ]);', start);
  assert.ok(end > start, 'FULL_WIDTH_VIEWS is not terminated as expected');
  const body = rootSource.slice(start, end);
  const entries = [];
  const pattern =
    /id:\s*'([^']+)',[\s\S]*?layoutClass:\s*'([^']+)',[\s\S]*?selector:\s*\n?\s*'([^']+)',/g;
  for (const match of body.matchAll(pattern)) {
    entries.push({ id: match[1], layoutClass: match[2], selector: match[3] });
  }
  return entries;
}

const STYLESHEET_BASES = classifyStylesheet();
const REGISTRY = parseRegistry();

const stylesheetSet = new Set(
  [...STYLESHEET_BASES]
    .filter(([, record]) => record.layoutClass !== 'shared-3-track')
    .map(([base, record]) => `${base}::${record.layoutClass}`)
);
const registrySet = new Set(REGISTRY.map((entry) => `${entry.selector}::${entry.layoutClass}`));

test('both parsed sets are non-empty and carry the three named baseline members', () => {
  // THE CHEAPEST GREEN AVAILABLE TO A BROKEN PARSE IS TWO EMPTY SETS COMPARING EQUAL, so
  // this runs BEFORE the equality and is what a broken selector prefix reds on.
  assert.ok(
    stylesheetSet.size >= 15,
    `the stylesheet parse found ${stylesheetSet.size} aside-suppressing rules; the parser is ` +
      'probably matching nothing'
  );
  assert.ok(
    registrySet.size >= 15,
    `the registry parse found ${registrySet.size} entries; the FULL_WIDTH_VIEWS scan is probably ` +
      'matching nothing'
  );
  for (const member of BASELINE_MEMBERS) {
    assert.ok(stylesheetSet.has(member), `the stylesheet parse lost the baseline member ${member}`);
    assert.ok(registrySet.has(member), `the registry parse lost the baseline member ${member}`);
  }
  // And the THIRD class is present too, which is what proves the parser read the unscoped base
  // rule rather than only the route-scoped ones.
  const shared = [...STYLESHEET_BASES]
    .filter(([, record]) => record.layoutClass === 'shared-3-track')
    .map(([base, record]) => `${base}::${record.layoutClass}`);
  assert.ok(shared.includes(SHARED_BASELINE), `the parse lost the shared base rule`);
  assert.ok(
    shared.some((entry) => entry.includes('[data-manager-view="tools"]')),
    'the Tool Studio library is a route-scoped shared-3-track: it re-widths the third column ' +
      'and KEEPS its inspector, so it must be classified shared rather than self-owned'
  );
});

test('the aside-suppressing routes and the released columns are the same set', () => {
  assert.deepEqual(
    [...stylesheetSet].sort(),
    [...registrySet].sort(),
    'a route released in `styles/fabricate.css` but not declared in `FULL_WIDTH_VIEWS` wraps an ' +
      'empty aside to a new grid row; one declared but not released renders against a ~300px ' +
      'dead strip. Fix both halves together.'
  );
});

test('every released route declares its collapsed sibling at equal specificity', () => {
  const missing = [];
  for (const [base, record] of STYLESHEET_BASES) {
    if (!record.plain) missing.push(`${base} declares only its .is-rail-collapsed form`);
    if (!record.collapsed) missing.push(`${base} declares no .is-rail-collapsed sibling`);
  }
  assert.ok(STYLESHEET_BASES.size >= 8, 'the base scan found almost nothing');
  assert.deepEqual(
    missing,
    [],
    '`.manager-body.is-rail-collapsed` out-specifies a single-class rule, so a released column ' +
      'with no collapsed sibling silently snaps back to three tracks the moment the GM ' +
      'collapses the rail:\n  ' + missing.join('\n  ')
  );
});

test('the aside chain is BUILT from the set rather than restating it', () => {
  // The twelve-clause chain this replaced is how the two halves drifted twice. A restated
  // condition would satisfy every assertion above and still render the wrong strip.
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
  // Needles from the RETIRED chain specifically, not fragments that also occur in the
  // header-actions chain a few hundred lines above: a needle that matched both would have
  // failed on a correct conversion, which is how a guard gets loosened until it proves nothing.
  for (const dead of [
    "currentView !== 'component-edit' && currentView !== 'recipe-edit'",
    "currentView !== 'tool-edit' && currentView !== 'knowledge'",
    '!isWorldPartiesRoute && !isWorldDowntimeRoute',
  ]) {
    assert.equal(
      rootSource.includes(dead),
      false,
      `the old aside chain clause ${JSON.stringify(dead)} is still restated in the root`
    );
  }
});

test('every registry entry names a route the router can actually reach', () => {
  // A registry entry whose selector names a `data-manager-view` value no route ever sets is a
  // rule that can never match — green here, invisible in the browser.
  const ids = REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'FULL_WIDTH_VIEWS carries a duplicate id');
  for (const entry of REGISTRY) {
    assert.equal(
      routeIdOf(entry.selector) === '' ? entry.id : routeIdOf(entry.selector),
      entry.id === 'world-parties' ? 'world' : entry.id,
      `${entry.id}: the entry's selector scopes to a different route than its id names`
    );
  }
});
