/**
 * What a `<Select>` CALL SITE may and may not do (issue 1510).
 *
 * ── WHY A SOURCE READ, WHEN A MOUNTED SUITE RENDERS THE THING ───────────────────────────────
 * Both clauses below are about what a caller PASSES, and neither survives the render.
 *
 * `Select.svelte` writes at most one of `aria-label` / `aria-labelledby` onto the trigger by
 * construction — `labelTarget` is `''` whenever `labelledByTarget` is set — so a DOM-level "never
 * both" assertion could never red, however many call sites passed both. What passing both
 * actually costs is a string nobody reads, sitting beside the caption it duplicates and free to
 * drift from it; the artifact that can see it is the call site's text.
 *
 * The `<label>` clause is the same shape from the other end. A caller that wraps the primitive in
 * its own `<label>` produces a control whose caption forwards a click into a trigger whose panel
 * is dismissed on `mousedown` while open, so the list can never be closed from its own caption —
 * measured in `tests/components/manager-select-conversion-rendered.test.js`. That defect is
 * invisible in the DOM: the markup renders, every attribute is correct, and the only symptom is a
 * pointer sequence. This clause is what stops a new caller reintroducing it.
 *
 * ── AND WHY IT IS THE CALLER'S `<label>`, NEVER THE PRIMITIVE'S OWN FORM ────────────────────
 * `Select label=` renders its own labelled column, and its host has been `<Field as="div">` since
 * this change repaired it. A `Field` component node is not a `<label>` element node and cannot be
 * mistaken for one by a template walk, which is the second reason this reads the AST rather than
 * the text: `<Field as="label">` around a `<Select>` is a caller-rendered label in every sense
 * that matters, and the parse is what makes "the nearest enclosing element" answerable at all.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';

import { parse } from 'svelte/compiler';

import { SOURCES } from '../helpers/primitiveAdoptionContract.js';
import { repoRoot } from '../helpers/sourceScan.js';

const TAG = 'Select';

/**
 * The floor the two clauses quantify over.
 *
 * Both are "for every call site, P", which is vacuously true over zero call sites — and a parser
 * that stops recognising the component tag reports exactly zero. Written as a floor rather than
 * an exact count so a new caller does not have to touch this file, and set below the population
 * this change leaves behind so the second and third phases of the conversion raise it rather than
 * red it.
 */
const CALL_SITE_FLOOR = 20;

/**
 * A caller-rendered `<label>` around a control, in either spelling.
 *
 * `Field as="label"` renders a `<label>` element from a component node, so a walk that looked only
 * for `RegularElement` named `label` would miss the shape 56 fields in this corpus use.
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
 * The enclosure is tracked on the way DOWN rather than looked up afterwards, because the modern
 * Svelte AST carries no parent pointers — a post-hoc lookup would have to re-walk the tree for
 * every call site and re-derive what this walk already knows.
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
 * `ariaLabelledBy={captioned ? id : ''}` beside `ariaLabel={captioned ? '' : fallback}` is one
 * name written twice for two states, and it is the idiom a caller with a CONDITIONAL caption has
 * to use — the journal list's sort caption is rendered only when the caller supplies one, and the
 * scoped catalogue's lane filters draw a micro-label for some facets and not others. Exactly one
 * of the two is non-empty at any render, which is the property this clause is about; what it must
 * refuse is a site where both resolve, because then one of them is text the accessibility tree
 * never reads.
 *
 * The test is compared as SOURCE TEXT so the two ternaries must turn on the same thing, and each
 * must go empty on the branch where the other speaks.
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

  // THE EXCLUSIVE PAIR IS THE ONLY PERMITTED SHAPE, and it has to be REACHED or the clause above
  // is a plain "never both" wearing an exemption it never applies. Two sites ship it today.
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
