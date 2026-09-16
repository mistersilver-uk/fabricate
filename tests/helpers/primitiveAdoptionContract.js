/**
 * The shared spine of a primitive's ADOPTION contract (issues 1428, 1039).
 *
 * ── WHY THIS IS SHARED RATHER THAN WRITTEN THREE TIMES ──────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js` already owns one spine, and it is a DIFFERENT
 * question. That one is a text scan: it asks whether anything but the primitive mentions the
 * contract class anywhere in a component's markup, which is sound only while the class is not a
 * PREFIX of another real class and while a substring can tell a raw element from a component
 * tag. `manager-field` is a prefix of `manager-field-label`, `manager-toolbar` is a prefix of
 * `manager-toolbar-pills`, and `<Chip class="manager-toolbar-pills">` is a component tag whose
 * text contains the token either way — so `field-source-contract.test.js` declined that factory
 * and parsed the template instead. This file is what that decision generalises to.
 *
 * The question here is therefore narrower and sharper: does any RAW ELEMENT still carry the
 * class, counted per file, with the token matched on both boundaries and `<style>` blocks and
 * docblock prose excluded structurally rather than by stripping. Five components document
 * `manager-field` in prose and three more name it in a scoped rule; a text scan reports every
 * one of those as an unconverted site.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────
 * Anything true of ONE primitive stays in that primitive's own file, stated over the scan this
 * factory returns. `Field`'s closed `as` host set and its per-host floors are the live example:
 * they exist because a `<label>` field names the control it wraps and a `<div>` field does not,
 * which is an accessibility contract no bar and no search field has an equivalent of. The
 * filter bar's and the search field's own clause — that every call site passes an accessible
 * name — is the mirror image, and lives in their file for the same reason.
 *
 * ── AND THE ANTI-VACUITY HALF, WHICH IS THE REASON THIS IS A FACTORY AND NOT A MIXIN ────
 * Every clause below is "for every X, P(X)", vacuously true over zero X, and the raw-element
 * detector shipped returning zero for an entire corpus on its first run — anchored on
 * `(?:^|\s)` against text whose delimiter is a quote. The corpus cannot catch that, because the
 * whole point of a completed conversion is that the corpus contains no positive case. So each
 * caller supplies a SYNTHETIC fixture with a known count and a known lowered count, and the
 * detector is driven over it. A caller that forgets is a caller with no clauses: the fixture is
 * required, not optional.
 *
 * This file is deliberately NOT named `*.test.js`: `tests/helpers/` is outside the `npm test`
 * glob, so nothing here is collected as a suite. Its clauses run under each caller's name.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { parse } from 'svelte/compiler';

import { collectSources } from './sourceScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * `{ repoRelativePath: text }` for every `.svelte` under `src/`.
 *
 * The SHARED corpus reader, which seven suites and the `primitiveSourceContract` factory
 * already quantify over, rather than a walker of this file's own: a second recursive directory
 * walk is a copy that can silently stop recursing while every caller goes on reporting clean.
 *
 * Read ONCE at module load and shared by every caller in a process, because parsing the corpus
 * is the expensive part and three primitives asking the same question of it is three times the
 * work for one answer.
 */
export const SOURCES = collectSources(join(repoRoot, 'src'), { extensions: ['.svelte'] });

/**
 * Walk a parsed template, yielding every element and component node.
 *
 * The Svelte parser rather than a regular expression, for two reasons this corpus makes
 * concrete: a contract class appears in DOCBLOCK PROSE in several of these components and
 * inside a scoped `<style>` in several more, and a text scan reports every one of those as an
 * unconverted site. A `class` attribute on an element node is the only thing that renders.
 *
 * @param {object} node any AST node
 * @param {(node: object) => void} visit
 */
export function walkTemplate(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkTemplate(child, visit);
    return;
  }
  if (
    node.type === 'RegularElement' ||
    node.type === 'Component' ||
    node.type === 'SvelteElement'
  ) {
    visit(node);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'parent') continue;
    walkTemplate(node[key], visit);
  }
}

/**
 * A whole-token pattern for a contract class.
 *
 * BOTH boundaries are lookarounds rather than character classes. The first draft of the `Field`
 * gate anchored on `(?:^|\s)` and matched NOTHING, because the text it runs over is the whole
 * attribute — `class="manager-field"` — whose delimiter is a quote.
 *
 * The trailing lookahead is `(?![\w-])` and never `\b`, because `\b` matches BEFORE a hyphen:
 * a `\b`-terminated pattern for `manager-toolbar` counts `.manager-toolbar-pills`, and one for
 * `manager-field` counts `manager-field-error`. Both are real, different classes on real,
 * different elements in this corpus.
 *
 * @param {string} contractClass
 * @returns {RegExp} matching the class as a whole token
 */
export function classTokenPattern(contractClass) {
  return new RegExp(String.raw`(?<![\w-])${contractClass}(?![\w-])`);
}

/**
 * Count raw (non-component) elements whose `class` attribute carries the contract token.
 *
 * Exported so each caller's discrimination clause can drive it over a synthetic source. That
 * clause is not decoration: the first version of this detector returned zero for every file in
 * the corpus, and both clauses built on it went green.
 *
 * @param {string} source component source text
 * @param {string} filename a filename for the parser's error messages
 * @param {RegExp} classPattern from {@link classTokenPattern}
 * @returns {number} raw elements carrying the class
 */
export function rawSitesIn(source, filename, classPattern) {
  let count = 0;
  const ast = parse(source, { modern: true, filename });
  walkTemplate(ast.fragment, (node) => {
    if (node.type === 'Component') return;
    const classAttribute = (node.attributes ?? []).find(
      (attribute) => attribute.type === 'Attribute' && attribute.name === 'class'
    );
    if (!classAttribute) return;
    if (classPattern.test(source.slice(classAttribute.start, classAttribute.end))) count += 1;
  });
  return count;
}

/**
 * @typedef {object} AdoptionCallSite
 * @property {string} file repo-relative path of the component rendering the primitive
 * @property {import('svelte/compiler').AST.Component} node the call site's own AST node
 * @property {(name: string) => string|null} attribute the attribute's verbatim source, or null
 * @property {(name: string) => string|null} snippetSource the verbatim source of a named snippet
 *   child, or null when the site passes no snippet of that name
 * @property {string[]} valueless names of attributes written with no value at all
 */

/**
 * @typedef {object} AdoptionContractSpec
 * @property {string} label names the clauses, e.g. `manager-toolbar`
 * @property {string} tag the primitive's tag name, e.g. `ManagerToolbar`
 * @property {string} primitive repo-relative POSIX path to the primitive itself
 * @property {string} contractClass the class only the primitive may write on a rendered element
 * @property {ReadonlyArray<{path: string, sites: number, why: string}>} allowlist components
 *   that may still write the class on a raw element, each with its EXACT site count
 * @property {number} callSiteFloor the non-vacuity floor, in call SITES
 * @property {number} fileFloor the non-vacuity floor, in call-site FILES
 * @property {{source: string, expected: number, lowered: [string, string],
 *   loweredExpected: number}} detectorFixture a synthetic source with a known raw-site count,
 *   plus a substitution that must LOWER it
 * @property {ReadonlyArray<string>} [booleanProps] props the primitive declares with a `false`
 *   default, which a bare attribute correctly sets to `true`
 * @property {string} rawRemedy prose for the raw-element clause's failure
 * @property {string} valuelessRemedy prose for the valueless-attribute clause's failure
 */

/**
 * Register the five shared clauses for one primitive, and hand back the scan they are stated
 * over so the caller can add clauses of its own.
 *
 * @param {AdoptionContractSpec} spec
 * @returns {{rawSites: Map<string, number>, callSites: AdoptionCallSite[]}}
 */
export function definePrimitiveAdoptionContract(spec) {
  const {
    label,
    tag,
    primitive,
    contractClass,
    allowlist,
    callSiteFloor,
    fileFloor,
    detectorFixture,
    booleanProps = [],
    rawRemedy,
    valuelessRemedy,
  } = spec;

  const classPattern = classTokenPattern(contractClass);
  const rawSites = new Map();
  const callSites = [];

  for (const [file, source] of Object.entries(SOURCES)) {
    const filename = join(repoRoot, file);
    const rawCount = rawSitesIn(source, filename, classPattern);
    if (rawCount > 0) rawSites.set(file, rawCount);
    walkTemplate(parse(source, { modern: true, filename }).fragment, (node) => {
      if (node.type !== 'Component' || node.name !== tag) return;
      const attributes = (node.attributes ?? []).filter(
        (attribute) => attribute.type === 'Attribute'
      );
      callSites.push({
        file,
        // THE NODE ITSELF, AND ITS SNIPPET CHILDREN (issue 1503). A caller that hands the
        // primitive a `trigger` snippet renders its own button, so everything a naming clause
        // needs — the `aria-label`, the element the primitive's attributes are spread onto — is
        // INSIDE the snippet and reachable only from the component node. Keeping only the
        // attributes discarded it, and a clause written against attributes alone would have to
        // accept the snippet's mere presence as a name, which is not a name.
        node,
        snippetSource: (name) => {
          const snippet = (node.fragment?.nodes ?? []).find(
            (child) => child.type === 'SnippetBlock' && child.expression?.name === name
          );
          return snippet ? source.slice(snippet.start, snippet.end) : null;
        },
        attribute: (name) => {
          const found = attributes.find((attribute) => attribute.name === name);
          return found ? source.slice(found.start, found.end) : null;
        },
        // `value === true` is the AST's marker for a VALUELESS attribute — `data-x` rather
        // than `data-x=""` or the shorthand `{x}`, both of which carry a value node.
        valueless: attributes
          .filter((attribute) => attribute.value === true)
          .map((attribute) => attribute.name),
      });
    });
  }

  test(`the corpus the ${label} clauses quantify over is alive`, () => {
    const files = Object.keys(SOURCES);
    assert.ok(
      files.length > 100,
      `the component walk found ${files.length} files, so it is not walking`
    );
    assert.ok(files.includes(primitive), `${primitive} is not on disk; every clause below is moot`);
    assert.ok(
      callSites.length >= callSiteFloor,
      `only ${callSites.length} <${tag}> call sites found, so the parser stopped seeing them`
    );
    assert.ok(
      new Set(callSites.map((site) => site.file)).size >= fileFloor,
      `<${tag}> is no longer spread across ${fileFloor} components, so a per-file regression ` +
        'would hide behind the ones that still convert'
    );
  });

  test(`the ${label} raw-element detector discriminates, so its clause is not vacuous`, () => {
    // THE ANTI-VACUITY ANCHOR. The corpus cannot supply one: the whole point of the clause
    // below is that the corpus contains (almost) no positive case, and once the deferred
    // allowlist converts it will contain none at all — at which point a broken detector and a
    // converted tree are indistinguishable. A synthetic source keeps a positive case that
    // survives the debt being paid.
    assert.equal(
      rawSitesIn(detectorFixture.source, 'fixture.svelte', classPattern),
      detectorFixture.expected,
      `the ${label} detector must count RAW elements and nothing else: not a docblock, not a ` +
        'scoped rule, not a longer class the token is a PREFIX of, and not a component tag'
    );
    const [from, to] = detectorFixture.lowered;
    assert.notEqual(from, to, 'the lowering substitution must actually change the fixture');
    assert.ok(
      detectorFixture.source.includes(from),
      `the lowering substitution matches nothing in the ${label} fixture, so the clause below ` +
        'compares two identical sources and can never fail'
    );
    assert.equal(
      rawSitesIn(detectorFixture.source.replaceAll(from, to), 'fixture.svelte', classPattern),
      detectorFixture.loweredExpected,
      'converting a site must LOWER the count, or the allowlist pin can never come down'
    );
  });

  test(`no component outside the ${label} allowlist writes a raw element carrying the class`, () => {
    const allowed = new Set(allowlist.map((entry) => entry.path));
    const offenders = [...rawSites.entries()]
      .filter(([file]) => !allowed.has(file))
      .map(([file, count]) => `${file} (${count} site${count === 1 ? '' : 's'})`)
      .sort((a, b) => a.localeCompare(b));
    assert.deepEqual(offenders, [], `${rawRemedy}:\n  ${offenders.join('\n  ')}`);
  });

  test(`the ${label} allowlist is pinned by exact count and cleans itself up`, () => {
    for (const entry of allowlist) {
      assert.ok(entry.why.length > 40, `${entry.path} is allowlisted with no stated reason`);
      // Above zero, so the last conversion in a file DELETES its entry rather than leaving a
      // spent allowlist row behind that silently re-permits the next hand-rolled site.
      assert.ok(
        entry.sites > 0,
        `${entry.path} is allowlisted for 0 sites. An entry at zero is spent: DELETE it, or ` +
          'the allowlist keeps granting a permission nothing needs.'
      );
      assert.equal(
        rawSites.get(entry.path) ?? 0,
        entry.sites,
        `${entry.path} is allowlisted for exactly ${entry.sites} raw \`.${contractClass}\` ` +
          'element(s). Converting one lowers this pin; adding one is a new hand-rolled site ' +
          `and is what the pin exists to refuse. Reason on record: ${entry.why}`
      );
    }
  });

  test(`no <${tag}> carries a VALUELESS attribute, because a component renders one differently`, () => {
    // A rendering trap that belongs to the rest spread rather than to any one primitive, and it
    // is invisible in the source diff: `<div data-x>` sets `data-x=""`, while the same `data-x`
    // written on a component arrives in `...rest` as boolean `true` and `set_attribute` writes
    // `data-x="true"`. Presence selectors — which is what every suite and every smoke step uses
    // — resolve either way, so the DOM changes and nothing reports it.
    //
    // A BOOLEAN PROP the primitive declares is the one exception, and it is a real one rather
    // than a loophole: `<ManagerSearchField compact>` sets a prop whose default is `false` to
    // `true`, which is exactly what it means and is this codebase's idiom (`<EmptyState
    // compact>`). The exemption is CHECKED rather than trusted — the loop below reads the
    // primitive's own source and refuses a name it does not declare with a `false` default — so
    // a `data-*` hook cannot be smuggled through the list.
    const primitiveSource = SOURCES[primitive] ?? '';
    for (const name of booleanProps) {
      assert.ok(
        new RegExp(String.raw`(?<![\w-])${name} = false(?![\w-])`).test(primitiveSource),
        `${primitive} does not declare \`${name} = false\`, so exempting it from the ` +
          'valueless-attribute clause exempts something that is not a boolean prop'
      );
    }
    const exempt = new Set(booleanProps);
    const offenders = callSites
      .map((site) => ({ site, names: site.valueless.filter((name) => !exempt.has(name)) }))
      .filter((entry) => entry.names.length > 0)
      .map((entry) => `${entry.site.file}: ${entry.names.join(', ')}`)
      .sort((a, b) => a.localeCompare(b));
    assert.deepEqual(offenders, [], `${valuelessRemedy}:\n  ${offenders.join('\n  ')}`);
  });

  return { rawSites, callSites };
}
