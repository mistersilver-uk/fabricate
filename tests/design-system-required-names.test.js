/**
 * A shared primitive names its own controls, and does it in a language a world can change
 * (issue 1497).
 *
 * `openspec/specs/design-system/spec.md` makes naming a COMPONENT OBLIGATION under "Naming,
 * announcement and hit targets are component obligations": an icon-only control carries an
 * accessible name, and the primitive is what carries it rather than each of its callers. Nothing
 * checked that, and two failure modes had shipped by the time anyone looked.
 *
 * ── ONE: A NAME NO WORLD CAN TRANSLATE ──────────────────────────────────────────────────
 * A prop that exists to NAME a control and defaults to `'Percentage'` ships that English word as
 * the accessible name of every caller that does not override it. Foundry localizes through
 * `game.i18n`, and a hard-coded default never reaches it — so a French world hears "Percentage"
 * read out by its screen reader, with no setting anywhere that changes it. Ten such defaults are
 * pinned here, across six components.
 *
 * A LOCALIZATION KEY default is not this defect and is deliberately absent: `DropZone` defaults to
 * `'FABRICATE.DropZone.DefaultLabel'`, which resolves through the lang files like anything else.
 * The two are told apart by SHAPE, and the shape is asserted in both directions below.
 *
 * ── TWO: A NAME THAT SUPPRESSES THE NAME ────────────────────────────────────────────────
 * The worse one, and it looks like compliance. `aria-label={label}` on a prop defaulting to `''`
 * renders `aria-label=""`, and an EMPTY aria-label does not fall back to the element's content —
 * it overrides it. The control had a perfectly good name from its own text and the attribute took
 * it away. `aria-label={label || undefined}` omits the attribute instead, which is why the guarded
 * spelling is the rule and `IconButton` and `SelectionCheckbox` already ship it.
 *
 * Measured, of the 45 `aria-label` bindings in this corpus: ten are already guarded, and exactly
 * TWO bind a prop that defaults to the empty string. Every other unguarded binding defaults to
 * `undefined` or to a non-empty string, neither of which can render an empty attribute, so none
 * of them is a violation of this obligation and none is a row — a gate that flagged all 35 would
 * be answered by deleting it.
 *
 * The second of the two is the one worth naming. `ManagerModal` binds `aria-label={title}` on a
 * `role="dialog" aria-modal="true"` root, so a modal opened without a title announces as an
 * UNNAMED DIALOG — and a modal is the one place a screen-reader user cannot recover by reading
 * around it, because everything outside it is inert. The prop is called `title` rather than
 * anything label-shaped, which is why the binding rather than the prop NAME is what selects this
 * population.
 *
 * ── WHAT THIS GATE DOES NOT DECIDE ──────────────────────────────────────────────────────
 * Whether a given component's root control can render with no visible text. The spec's obligation
 * is about controls that can, and no static rule tells those apart from a component that always
 * has a label beside it. So the population is every NAME-BEARING PROP, on the reading that a prop
 * called `ariaLabel` or `numberLabel` exists to name something or it would not exist. That is a
 * superset, and it is the honest superset: the alternative is a hand-maintained list of which
 * components count, which is the kind of mirror that rots without anybody editing it.
 *
 * ── THE PROP PATTERN IS NARROW ON PURPOSE ───────────────────────────────────────────────
 * `/^aria[A-Z]|Label$|^label$/` rather than `/aria|label$/i`. The loose spelling matches `variant`
 * — through the `aria` in the middle of it — and `triggerAriaDisabled`, which is a boolean and has
 * no accessible name to give. Both were live false positives in the measurement that opened this
 * issue, and a gate whose first output is two rows nobody can act on is a gate that gets widened
 * to nothing.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
} from '../scripts/lib/designSystemPrimitives.js';
import {
  KNOWN_EMPTY_NAME_BINDINGS,
  KNOWN_EMPTY_NAME_BINDING_TOTAL,
  KNOWN_UNTRANSLATED_NAME_DEFAULTS,
  KNOWN_UNTRANSLATED_NAME_DEFAULT_TOTAL,
} from './components/design-system-known-debt.js';
import { assertRatchet, byCodePoint, tallyByKey } from './helpers/ratchetBaseline.js';
import { repoRoot } from './helpers/sourceScan.js';
import { attributeText, parsedTemplates, walkElements } from './helpers/svelteTemplateScan.js';

/** The flat primitive directory. */
const COMPONENTS_DIRECTORY = 'src/ui/svelte/components';

/** Where the manifest's manager-side rows live. */
const MANAGER_DIRECTORY = 'src/ui/svelte/apps/manager/';

/**
 * A prop that exists to give a control its accessible name.
 *
 * Three alternations, each earning its place: `ariaLabel` and `ariaDescription` (camel-cased
 * `aria-*`), anything ending `Label`, and the bare `label`. See the header for the two live false
 * positives the loose spelling produced.
 */
const NAME_BEARING_PROP = /^aria[A-Z]|Label$|^label$/u;

/**
 * A Foundry localization key, which is a translatable default rather than untranslated text.
 *
 * Dotted, and starting with a capital — `FABRICATE.DropZone.DefaultLabel`. Deliberately not "any
 * string containing a dot": a default of `'Item.'` is a sentence, and a default of `'%'` is a
 * unit. This has to be tight in the direction that matters, which is not calling untranslated
 * English a key.
 */
const LOCALIZATION_KEY = /^[A-Z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/u;

/**
 * `aria-label={someProp}` and nothing else — no `||`, no `?:`, no call.
 *
 * THE QUOTES ARE OPTIONAL BECAUSE SVELTE'S ARE. `aria-label="{label}"` is the same binding written
 * with the quotes left on, and it is a spelling authors reach for by habit from plain HTML — so
 * requiring the unquoted form put every quoted one OUTSIDE the population rather than in it, which
 * is a gate that a defect can leave by adding two characters. No file in this corpus writes the
 * quoted form today, which is precisely why nothing noticed.
 */
const BARE_PROP_BINDING = /^aria-label=["']?\{([A-Za-z_$][\w$]*)\}["']?$/u;

/**
 * The corpus: the flat primitive directory plus every manifest row under `apps/manager/`.
 *
 * BOTH HALVES, because the obligation is about SHARED components and the manifest is what decides
 * which those are. The flat directory alone would miss `ManagerModal` and `EditorValidationSurface`
 * — which between them carry three of the twelve rows below — and the manifest alone would miss the
 * components under `components/` that carry no manifest row at all.
 *
 * Recorded non-members are included with members. A row on `NOT_A_PRIMITIVE` is a component the
 * register has ADJUDICATED, which makes it exactly as shared as one that passed: the judgement was
 * about membership of the vocabulary, not about whether the thing renders in the product.
 */
function corpusFiles() {
  const flat = readdirSync(path.join(repoRoot, COMPONENTS_DIRECTORY))
    .filter((name) => name.endsWith('.svelte'))
    .map((name) => `${COMPONENTS_DIRECTORY}/${name}`);
  const manifest = [...DESIGN_SYSTEM_PRIMITIVES, ...NOT_A_PRIMITIVE]
    .map((row) => row.path)
    .filter((file) => file.startsWith(MANAGER_DIRECTORY));
  return [...new Set([...flat, ...manifest])].filter((file) =>
    existsSync(path.join(repoRoot, file))
  );
}

/**
 * The corpus, parsed once.
 *
 * Lazily, so a walk failure is a failing test rather than an unattributed module-load throw that
 * escapes the `# fail` count entirely.
 */
let cached = null;
function corpus() {
  if (cached === null) {
    const wanted = new Set(corpusFiles());
    cached = {
      wanted,
      templates: parsedTemplates().filter((template) => wanted.has(template.file)),
    };
  }
  return cached;
}

/**
 * Every prop destructured from `$props()` in one template, with what its default IS.
 *
 * Read from the SCRIPT AST rather than by matching braces in the text. The brace-matching version
 * of this scan was written first and has two failure modes that both under-report: a default
 * holding an object literal or an arrow function contains commas and braces of its own, and a
 * `//` comment inside the destructuring is not a prop. Neither errors — each simply drops props
 * on the floor, and this gate's whole job is to find props.
 *
 * A `RestElement` is skipped: `...rest` names no prop, and there is nothing about its contents a
 * template scanner can decide.
 *
 * THE TWO DEFAULT FIELDS ARE SEPARATE ON PURPOSE, because the two clauses ask different questions
 * of them and `null` would be ambiguous across both. `defaultsToString` says the default is a
 * string LITERAL — as opposed to absent, or `undefined`, or an expression — and `stringDefault`
 * carries its value, which may legitimately be the empty string. A single field could not tell
 * "defaults to `''`" from "has no string default", and the empty-string case is precisely the
 * defect the second clause exists to find.
 *
 * @param {{ast: object}} template
 * @returns {Array<{name: string, defaultsToString: boolean, stringDefault: string|null}>}
 */
function propsOf({ ast }) {
  const props = [];
  const visit = (node) => {
    if (
      node.type !== 'VariableDeclarator' ||
      node.init?.type !== 'CallExpression' ||
      node.init.callee?.name !== '$props' ||
      node.id?.type !== 'ObjectPattern'
    ) {
      return;
    }
    for (const property of node.id.properties) {
      if (property.type === 'RestElement') continue;
      const value = property.value;
      const defaulted = value.type === 'AssignmentPattern';
      props.push({
        name: property.key.name ?? property.key.value,
        defaultsToString:
          defaulted && value.right.type === 'Literal' && typeof value.right.value === 'string',
        stringDefault: defaulted && value.right.type === 'Literal' ? value.right.value : null,
      });
    }
  };
  const walk = (node, seen = new Set()) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, seen);
      return;
    }
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      walk(node[key], seen);
    }
  };
  walk(ast.instance);
  return props;
}

/** Every `aria-label` attribute in one template, with its verbatim source text. */
function ariaLabelsOf({ source, ast }) {
  const found = [];
  walkElements(ast.fragment, (element) => {
    const text = attributeText(source, element, 'aria-label');
    if (text !== null) found.push(text);
  });
  return found;
}

/** Every name-bearing prop in the corpus, with the file it belongs to. */
function nameBearingProps() {
  return corpus().templates.flatMap((template) =>
    propsOf(template)
      .filter((prop) => NAME_BEARING_PROP.test(prop.name))
      .map((prop) => ({ ...prop, file: template.file }))
  );
}

test('the corpus reaches both halves of the shared component set', () => {
  // A ratchet over an empty corpus passes forever, and this one has TWO ways to empty: the flat
  // directory read and the manifest filter. Floored separately for that reason — a manifest that
  // stopped yielding manager rows would leave 26 files scanned, which any single floor generous
  // enough for the total would accept.
  const files = corpusFiles();
  const flat = files.filter((file) => file.startsWith(`${COMPONENTS_DIRECTORY}/`)).length;

  assert.ok(
    files.length >= 50,
    `only ${files.length} files reached the scan, against the 57 this tree holds. Both the flat ` +
      'component directory and the manifest rows under apps/manager/ have to arrive for this ' +
      'gate to be about the shared set rather than about one directory.'
  );
  assert.ok(
    flat >= 20,
    `only ${flat} files came from ${COMPONENTS_DIRECTORY}, against the 26 there. This is the half ` +
      'that would silently vanish on a directory rename, and every finding below would go with it.'
  );
  assert.equal(
    corpus().templates.length,
    files.length,
    'a file in the corpus did not come back from the template walk, so it is being scanned by ' +
      'nothing. The likeliest cause is a manifest path that no longer resolves under the UI root.'
  );
});

test('the prop pattern selects names and rejects the two shapes that are not names', () => {
  // BOTH POLARITIES, and the negative half is the one that matters: this pattern was TIGHTENED
  // from `/aria|label$/i`, which matched `variant` on the `aria` inside it and `triggerAriaDisabled`
  // on nothing meaningful at all. A widened pattern here does not fail — it adds rows nobody can
  // act on, which is how a gate gets deleted.
  for (const name of ['label', 'ariaLabel', 'ariaDescription', 'numberLabel', 'rangeLabel']) {
    assert.ok(
      NAME_BEARING_PROP.test(name),
      `${name} names a control and must be in the population`
    );
  }
  for (const name of ['variant', 'triggerAriaDisabled', 'labelled', 'disabled', 'onLabelChange']) {
    assert.ok(!NAME_BEARING_PROP.test(name), `${name} is not an accessible name and must be out`);
  }

  // The live population, so a pattern that matched nothing is a failure rather than a clean tree.
  const props = nameBearingProps();
  assert.ok(
    props.length >= 20,
    `only ${props.length} name-bearing props found across ${corpus().templates.length} shared ` +
      'components. The pattern has stopped matching, and both ratchets below are now empty.'
  );
});

test('a localization key is a translatable default, and English text is not', () => {
  // The distinction the first ratchet turns on, in both directions and against the live tree. Get
  // it wrong one way and `DropZone` arrives as a ninth row for doing the right thing; get it wrong
  // the other and every English default is excused as a key.
  for (const key of ['FABRICATE.DropZone.DefaultLabel', 'FABRICATE.Manager.Close']) {
    assert.ok(LOCALIZATION_KEY.test(key), `${key} is a localization key`);
  }
  for (const text of ['Percentage', 'Colour presets', 'Close', 'Outcome bands', '%', 'View']) {
    assert.ok(!LOCALIZATION_KEY.test(text), `"${text}" is untranslated text, not a key`);
  }

  const keys = nameBearingProps().filter(
    (prop) => prop.defaultsToString && LOCALIZATION_KEY.test(prop.stringDefault)
  );
  assert.ok(
    keys.length > 0,
    'no name-bearing prop defaults to a localization key any more, so the exemption this gate ' +
      'grants is granted to nothing and could be widened without a row moving. `DropZone` is the ' +
      'component that has shipped one.'
  );
});

test('no shared component defaults an accessible name to untranslated text', () => {
  const props = nameBearingProps();
  const untranslated = props.filter(
    (prop) =>
      prop.defaultsToString &&
      prop.stringDefault.length > 0 &&
      !LOCALIZATION_KEY.test(prop.stringDefault)
  );

  assertRatchet({
    label: 'untranslated accessible-name defaults',
    baseline: KNOWN_UNTRANSLATED_NAME_DEFAULTS,
    pinnedTotal: KNOWN_UNTRANSLATED_NAME_DEFAULT_TOTAL,
    observed: tallyByKey(
      untranslated,
      (prop) => `${prop.file} | ${prop.name} | ${prop.stringDefault}`
    ),
    scanned: corpus().templates.length,
    floor: 50,
    guidance:
      'Naming is a component obligation, and a hard-coded English default is a name no world can ' +
      'change — `game.i18n` never sees it. Default the prop to a localization KEY and let the ' +
      'lang files carry the words, as `DropZone` does; or, where the caller always has a better ' +
      'name than the primitive could invent, default to `undefined` and require it.',
  });
});

test('the binding pattern reads the quoted spelling of a prop binding too', () => {
  // SYNTHETIC AND BOTH POLARITIES. Svelte accepts `aria-label={label}` and `aria-label="{label}"`
  // as the same binding, and this corpus happens to write only the first — so the live rows cannot
  // tell a pattern that reads both from one that reads one. The clause below reports the bindings
  // that can render EMPTY, and a spelling it does not match is a site it silently does not police.
  const bound = (text) => (BARE_PROP_BINDING.exec(text) ?? [])[1] ?? null;

  assert.equal(bound('aria-label={label}'), 'label', 'the unquoted spelling is the live one');
  assert.equal(bound('aria-label="{label}"'), 'label', 'quotes around an expression change nothing');
  assert.equal(bound("aria-label='{label}'"), 'label', 'and Svelte accepts either quote');

  // The exclusions, which are what keeps this population down to the bindings that can render
  // empty: a guarded binding omits the attribute instead, and neither a literal nor a call is a
  // prop this gate can resolve a default for.
  assert.equal(bound('aria-label={label || undefined}'), null, 'the guarded shape is compliant');
  assert.equal(bound('aria-label="{label || undefined}"'), null, 'guarded, quotes or not');
  assert.equal(bound('aria-label="Delete"'), null, 'a literal is not a prop binding');
  assert.equal(bound('aria-label={localize(key)}'), null, 'a call has no prop default to read');
  assert.equal(bound('aria-label={a ? b : c}'), null, 'nor has a conditional');
});

test('no aria-label can render empty and suppress the name the content already gives', () => {
  // THE SHAPE, NOT THE COUNT. An empty `aria-label` does not fall back to the element's text — it
  // REPLACES it with nothing, so a button reading "Delete" announces as an unnamed button. That is
  // strictly worse than having written no attribute at all, which is why the fix is `|| undefined`
  // rather than a better default.
  const bindings = [];
  const findings = [];
  for (const template of corpus().templates) {
    const props = new Map(propsOf(template).map((prop) => [prop.name, prop]));
    for (const text of ariaLabelsOf(template)) {
      bindings.push({ file: template.file, text });
      const match = BARE_PROP_BINDING.exec(text);
      if (match === null) continue;
      const prop = props.get(match[1]);
      if (prop?.defaultsToString && prop.stringDefault === '') {
        findings.push({ file: template.file, expression: match[1] });
      }
    }
  }

  // Non-vacuity on the population, and on the GUARDED shape specifically. If nothing in the corpus
  // were written `{x || undefined}` any more, this gate would be demanding a spelling the product
  // no longer uses, and the reader of a failure would have no example to copy.
  assert.ok(
    bindings.length >= 30,
    `only ${bindings.length} \`aria-label\` attributes reached the scan, against the 45 this ` +
      'corpus holds. An absence check over an empty set passes forever.'
  );
  assert.ok(
    bindings.some((binding) => /\|\|\s*undefined/u.test(binding.text)),
    'no `aria-label` in the corpus is written `{x || undefined}` any more, so the shape this gate ' +
      'requires has no live example. `IconButton` and `SelectionCheckbox` are the two that have ' +
      'shipped it.'
  );

  assertRatchet({
    label: 'aria-labels that can render empty',
    baseline: KNOWN_EMPTY_NAME_BINDINGS,
    pinnedTotal: KNOWN_EMPTY_NAME_BINDING_TOTAL,
    observed: tallyByKey(findings, (finding) => `${finding.file} | ${finding.expression}`),
    scanned: bindings.length,
    floor: 30,
    guidance:
      'Write `aria-label={name || undefined}`. An empty string is not "no label" — it is a label ' +
      'of nothing, and it overrides the accessible name the element would otherwise take from its ' +
      'own content. `IconButton` and `SelectionCheckbox` already ship the guarded spelling.',
  });
});

test('every finding cites a file the corpus actually holds', () => {
  // The mirror guard. Both baselines key on a path, and a path that no longer exists is a row that
  // can never be observed — which `assertRatchet` reports as VANISHED, correctly but late. This
  // says it in the language of the mistake: the file was renamed and the row was not.
  const wanted = corpus().wanted;
  const stale = [...KNOWN_UNTRANSLATED_NAME_DEFAULTS, ...KNOWN_EMPTY_NAME_BINDINGS]
    .map((row) => row.key.split(' | ')[0])
    .filter((file) => !wanted.has(file))
    .sort(byCodePoint);

  assert.deepEqual(
    [...new Set(stale)],
    [],
    'a baseline row names a file that is not in this gate’s corpus. Either the component was ' +
      'renamed and the row was not, or it left the shared set — in which case the row belongs in ' +
      'the change that moved it, not in a later reader’s way.'
  );
});
