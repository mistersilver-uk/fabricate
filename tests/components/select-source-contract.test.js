/** What a `<Select>` CALL SITE may and may not do (issue 1510). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';

import { parse } from 'svelte/compiler';

import { SOURCES } from '../helpers/primitiveAdoptionContract.js';
import { repoRoot } from '../helpers/sourceScan.js';

const TAG = 'Select';

/** The floor the two clauses quantify over. Raised by measurement at every conversion boundary. */
const CALL_SITE_FLOOR = 85;

/**
 * A caller-rendered `<label>` around a control, in either spelling.
 *
 * @param {object} node
 * @returns {boolean}
 */
function isCallerLabel(node) {
  if (node.type === 'RegularElement') return node.name === 'label';
  if (node.type !== 'Component' || node.name !== 'Field') return false;
  const host = (node.attributes ?? []).find(
    (attribute) => attribute.type === 'Attribute' && attribute.name === 'as'
  );
  const value = Array.isArray(host?.value) ? host.value[0] : null;
  return value?.type === 'Text' && value.data === 'label';
}

/**
 * Every `<Select>` in the corpus, with the nearest enclosing element the caller rendered.
 *
 * @returns {Array<{file: string, attributes: string[], wrapper: string|null}>}
 */
function callSites() {
  const sites = [];

  /**
   * @param {object} node
   * @param {string} file
   * @param {string|null} wrapper The nearest enclosing caller-rendered label, if any.
   * @returns {void}
   */
  function visit(node, file, wrapper) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, file, wrapper);
      return;
    }
    let nested = wrapper;
    if (node.type === 'Component' && node.name === TAG) {
      const attributes = (node.attributes ?? []).filter(
        (attribute) => attribute.type === 'Attribute'
      );
      sites.push({
        file,
        attributes: attributes.map((attribute) => attribute.name),
        attributeNamed: (name) => attributes.find((attribute) => attribute.name === name),
        source: SOURCES[file],
        wrapper,
      });
    }
    if (isCallerLabel(node)) nested = node.type === 'Component' ? 'Field as="label"' : 'label';
    else if (node.type === 'RegularElement') nested = null;

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'parent') continue;
      visit(node[key], file, nested);
    }
  }

  for (const [file, source] of Object.entries(SOURCES)) {
    visit(parse(source, { modern: true, filename: join(repoRoot, file) }).fragment, file, null);
  }
  return sites;
}

/**
 * The `ConditionalExpression` an attribute's value is, or `null` when it is anything else.
 *
 * @param {object|undefined} attribute
 * @returns {object|null}
 */
function conditionalValue(attribute) {
  // `Attribute.value` is `true` for a valueless attribute, a SINGLE `ExpressionTag` for
  // `prop={…}`, and an ARRAY only for a quoted value with interpolations in it. A reader that
  // assumes the array shape sees no `prop={…}` at all — and reports every exclusive pair as a
  // duplicate, which is the direction that bans a correct idiom.
  const value = attribute?.value;
  const tag = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  if (tag?.type !== 'ExpressionTag') return null;
  return tag.expression?.type === 'ConditionalExpression' ? tag.expression : null;
}

/** Whether a ternary BRANCH resolves to no name at all. */
function isEmptyBranch(node) {
  if (node?.type === 'Literal') return node.value === '';
  return node?.type === 'Identifier' && node.name === 'undefined';
}

/**
 * Whether two name attributes are the SHIPPED exclusive pair rather than a duplicate.
 *
 * @param {{source: string, attributeNamed: (name: string) => object|undefined}} site
 * @returns {boolean}
 */
function namesAreExclusive(site) {
  const labelled = conditionalValue(site.attributeNamed('ariaLabelledBy'));
  const label = conditionalValue(site.attributeNamed('ariaLabel'));
  if (!labelled || !label) return false;
  const testOf = (node) => site.source.slice(node.test.start, node.test.end);
  if (testOf(labelled) !== testOf(label)) return false;
  return (
    (isEmptyBranch(labelled.alternate) && isEmptyBranch(label.consequent)) ||
    (isEmptyBranch(labelled.consequent) && isEmptyBranch(label.alternate))
  );
}

const SITES = callSites();

test('the <Select> call-site walk is alive, so the clauses below are not vacuous', () => {
  assert.ok(
    Object.keys(SOURCES).length > 100,
    `the component corpus holds ${Object.keys(SOURCES).length} files, so it is not being walked`
  );
  assert.ok(
    SITES.length >= CALL_SITE_FLOOR,
    `only ${SITES.length} \`<${TAG}>\` call sites found, below the floor of ${CALL_SITE_FLOOR} — ` +
      'the parser has stopped recognising the tag and both clauses below would pass on nothing'
  );
  assert.ok(
    new Set(SITES.map((site) => site.file)).size > 5,
    `\`<${TAG}>\` reports from too few files for a per-file regression to be visible here`
  );
});

test('no <Select> call site passes both ariaLabel and ariaLabelledBy', () => {
  const both = SITES.filter(
    (site) => site.attributes.includes('ariaLabel') && site.attributes.includes('ariaLabelledBy')
  );
  const offenders = [
    ...new Set(both.filter((site) => !namesAreExclusive(site)).map((site) => site.file)),
  ].sort((a, b) => a.localeCompare(b));

  assert.deepEqual(
    offenders,
    [],
    'these call sites pass an `ariaLabel` beside an `ariaLabelledBy` and both can resolve at ' +
      'once. A labelledby WINS wherever both are present, so the string is dead text sitting ' +
      'next to the caption it duplicates, free to drift from it — and the primitive drops it ' +
      'silently, so nothing renders wrong. Keep the pointer and delete the string, or make the ' +
      'two exclusive on one condition the way the journal list and the lane filters do:\n  ' +
      offenders.join('\n  ')
  );

  // THE EXCLUSIVE PAIR IS THE ONLY PERMITTED SHAPE.
  assert.ok(
    both.length > 0 && both.every((site) => namesAreExclusive(site)),
    `${both.length} call site(s) pass both name props and ${
      both.filter((site) => namesAreExclusive(site)).length
    } of them are the exclusive pair — if none is, the exclusivity branch above has stopped ` +
      'being exercised and this clause is no longer the check it reads as'
  );
});

test('no <Select> call site is wrapped in a <label> the caller renders', () => {
  const offenders = SITES.filter((site) => site.wrapper !== null).map(
    (site) => `${site.file} (inside a caller-rendered \`${site.wrapper}\`)`
  );

  assert.deepEqual(
    offenders,
    [],
    'a `<label>` FORWARDS a caption click into the control it wraps, and this control is a ' +
      "button toggling a portaled panel dismissed on `mousedown` while open — so from open the " +
      'caption dismisses the list and the forwarded click re-opens it, and the list can never be ' +
      'closed from its own caption. Demote the wrapper to `Field as="div"` and name the trigger ' +
      'with `ariaLabelledBy={captionId}`, or adopt the primitive`s own `label=` form:\n  ' +
      offenders.join('\n  ')
  );
});
