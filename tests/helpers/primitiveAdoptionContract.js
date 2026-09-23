/**
 * The shared spine of a primitive's ADOPTION contract (issues 1428, 1039). WHY THIS IS SHARED
 * RATHER THAN WRITTEN THREE TIMES ──────────────────────────────────
 * `tests/helpers/primitiveSourceContract.js` already owns one spine, and it is a DIFFERENT
 * question.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { parse } from 'svelte/compiler';

import { collectSources } from './sourceScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** `{ repoRelativePath: text }` for every `.svelte` under `src/`. */
export const SOURCES = collectSources(join(repoRoot, 'src'), { extensions: ['.svelte'] });

/**
 * Walk a parsed template, yielding every element and component node.
 *
 * @param {object} node any AST node
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
 * @returns {RegExp} matching the class as a whole token
 */
export function classTokenPattern(contractClass) {
  return new RegExp(String.raw`(?<![\w-])${contractClass}(?![\w-])`);
}

/**
 * Count raw (non-component) elements whose `class` attribute carries the contract token.
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
 * Register the five shared clauses for one primitive, and hand back the scan they are stated over
 * so the caller can add clauses of its own.
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
        // THE NODE ITSELF, AND ITS SNIPPET CHILDREN (issue 1503).
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
    // THE ANTI-VACUITY ANCHOR. The corpus cannot supply one: the whole point of the clause below is
    // that the corpus contains (almost) no positive case, and once the deferred allowlist converts
    // it will contain none at all — at which point a broken detector and a converted tree are
    // indistinguishable.
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
    // A rendering trap that belongs to the rest spread rather than to any one primitive, and it is
    // invisible in the source diff: `<div data-x>` sets `data-x=""`, while the same `data-x`
    // written on a component arrives in `...rest` as boolean `true` and `set_attribute` writes
    // `data-x="true"`.
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
