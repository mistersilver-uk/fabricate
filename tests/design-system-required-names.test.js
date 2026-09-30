/**
 * A shared primitive names its own controls, and does it in a language a world can change (issue
 * 1497).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  MANIFEST_CORPUS,
  MANIFEST_PATH,
  TEMPLATE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  gateOver,
  manifestRows,
  templatesOf,
  workingTree,
} from './helpers/designSystemRatchet.js';
import {
  attributeNamed,
  attributeText,
  lineOf,
  walkElements,
} from './helpers/svelteTemplateScan.js';

/** The flat primitive directory. */
const COMPONENTS_DIRECTORY = 'src/ui/svelte/components';

/** Where the manifest's manager-side rows live. */
const MANAGER_DIRECTORY = 'src/ui/svelte/apps/manager/';

/** A prop that exists to give a control its accessible name. */
const NAME_BEARING_PROP = /^aria[A-Z]|Label$|^label$/u;

/** A Foundry localization key, which is a translatable default rather than untranslated text. */
const LOCALIZATION_KEY = /^[A-Z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/u;

/** `aria-label={someProp}` and nothing else — no `||`, no `?:`, no call. */
const BARE_PROP_BINDING = /^aria-label=["']?\{([A-Za-z_$][\w$]*)\}["']?$/u;

/** Every file this gate measures reads: the templates and the manifest naming the manager rows. */
const CORPORA = [TEMPLATE_CORPUS, MANIFEST_CORPUS];

/**
 * One side's corpus: the flat primitive directory plus every manifest row under `apps/manager/`
 * that exists on that side, parsed.
 */
function sharedComponents(readFile, files) {
  const present = new Set(files);
  const flat = files.filter(
    (file) => path.posix.dirname(file) === COMPONENTS_DIRECTORY && file.endsWith('.svelte')
  );
  const rows = manifestRows(readFile)
    .map((row) => row.path)
    .filter((file) => file.startsWith(MANAGER_DIRECTORY));
  const wanted = [...new Set([...flat, ...rows])].filter((file) => present.has(file));
  return { wanted, templates: templatesOf(readFile, wanted) };
}

/** The working tree's corpus. */
function corpus() {
  const tree = workingTree(...CORPORA);
  return sharedComponents(tree.readFile, tree.listFiles());
}

/** Every prop destructured from `$props()` in one template, with what its default IS. */
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
        start: property.start,
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

/** Every `aria-label` attribute in one template, with its verbatim source text and line. */
function ariaLabelsOf({ source, ast }) {
  const found = [];
  walkElements(ast.fragment, (element) => {
    const text = attributeText(source, element, 'aria-label');
    if (text === null) return;
    found.push({ text, line: lineOf(source, attributeNamed(element, 'aria-label').start) });
  });
  return found;
}

/** Every name-bearing prop in `templates`, with the file and line it belongs to. */
function nameBearingProps(templates = corpus().templates) {
  return templates.flatMap((template) =>
    propsOf(template)
      .filter((prop) => NAME_BEARING_PROP.test(prop.name))
      .map((prop) => ({ ...prop, file: template.file, line: lineOf(template.source, prop.start) }))
  );
}

/** A gate over one side's shared components, whose `find(templates)` gives its offending sites. */
const sharedComponentGate = (find) =>
  gateOver(CORPORA, (readFile, files) => find(sharedComponents(readFile, files).templates));

/** A name-bearing prop defaulting to text that is not a localization key. */
const untranslatedDefaults = (templates) =>
  nameBearingProps(templates).filter(
    (prop) =>
      prop.defaultsToString &&
      prop.stringDefault.length > 0 &&
      !LOCALIZATION_KEY.test(prop.stringDefault)
  );

const UNTRANSLATED_DEFAULT_GATE = sharedComponentGate((templates) =>
  untranslatedDefaults(templates).map((prop) => ({
    file: prop.file,
    line: prop.line,
    id: `untranslated name default ${prop.name} = ${prop.stringDefault}`,
    value: prop.stringDefault,
  }))
);

/** Every bare `aria-label={prop}` whose prop defaults to the empty string. */
function emptyNameBindings(templates) {
  const findings = [];
  for (const template of templates) {
    const props = new Map(propsOf(template).map((prop) => [prop.name, prop]));
    for (const { text, line } of ariaLabelsOf(template)) {
      const match = BARE_PROP_BINDING.exec(text);
      const prop = match === null ? undefined : props.get(match[1]);
      if (prop?.defaultsToString && prop.stringDefault === '') {
        findings.push({ file: template.file, line, id: `empty aria-label {${match[1]}}` });
      }
    }
  }
  return findings;
}

const EMPTY_BINDING_GATE = sharedComponentGate(emptyNameBindings);

test('the corpus reaches both halves of the shared component set', () => {
  // A ratchet over an empty corpus passes forever, and this one has TWO ways to empty: the flat
  // directory read and the manifest filter.
  const files = corpus().wanted;
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
    corpus().wanted.length,
    'a file in the corpus did not come back from the template walk, so it is being scanned by ' +
      'nothing. The likeliest cause is a manifest path that no longer resolves under the UI root.'
  );
});

test('the prop pattern selects names and rejects the two shapes that are not names', () => {
  // BOTH POLARITIES, and the negative half is the one that matters: this pattern was TIGHTENED from
  // `/aria|label$/i`, which matched `variant` on the `aria` inside it and `triggerAriaDisabled` on
  // nothing meaningful at all.
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
  // The distinction the first ratchet turns on, in both directions and against the live tree.
  for (const key of ['FABRICATE.Admin.Manager.Validation.View', 'FABRICATE.Manager.Close']) {
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
      'grants is granted to nothing and could be widened without a row moving. ' +
      '`EditorValidationSurface` is the component that has shipped one.'
  );
});

test('no shared component defaults an accessible name to untranslated text', (t) => {
  assertFloor('untranslated accessible-name defaults', corpus().templates.length, 50);
  checkGate(
    t,
    UNTRANSLATED_DEFAULT_GATE,
    'Naming is a component obligation, and a hard-coded English default is a name no world can ' +
      'change — `game.i18n` never sees it. Default the prop to a localization KEY and let the ' +
      'lang files carry the words, as `EditorValidationSurface` does; or, where the caller always ' +
      'has a better name than the primitive could invent, default to `undefined` and require it.'
  );
});

test('the binding pattern reads the quoted spelling of a prop binding too', () => {
  // SYNTHETIC AND BOTH POLARITIES.
  const bound = (text) => (BARE_PROP_BINDING.exec(text) ?? [])[1] ?? null;

  assert.equal(bound('aria-label={label}'), 'label', 'the unquoted spelling is the live one');
  assert.equal(
    bound('aria-label="{label}"'),
    'label',
    'quotes around an expression change nothing'
  );
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

test('no aria-label can render empty and suppress the name the content already gives', (t) => {
  // THE SHAPE, NOT THE COUNT. An empty `aria-label` does not fall back to the element's text — it
  // REPLACES it with nothing, so a button reading "Delete" announces as an unnamed button.
  const bindings = corpus().templates.flatMap((template) => ariaLabelsOf(template));

  // Non-vacuity on the population, and on the GUARDED shape specifically.
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
  checkGate(
    t,
    EMPTY_BINDING_GATE,
    'Write `aria-label={name || undefined}`. An empty string is not "no label" — it is a label ' +
      'of nothing, and it overrides the accessible name the element would otherwise take from its ' +
      'own content. `IconButton` and `SelectionCheckbox` already ship the guarded spelling.'
  );
});

test('the naming gates fail a new or grown offender, and read the manifest as an input', (t) => {
  const PROBE = `${COMPONENTS_DIRECTORY}/Probe.svelte`;
  const ROW = `${MANAGER_DIRECTORY}Row.svelte`;
  const component = (...props) =>
    [
      `<script>let { ${props.join(', ')} } = $props();</script>`,
      '<button aria-label={label}>x</button>',
      '',
    ].join('\n');
  const manifest = (...paths) =>
    `${JSON.stringify({ designSystemPrimitives: paths.map((file) => ({ path: file })), notAPrimitive: [] })}\n`;
  const base = {
    [PROBE]: component("label = 'Close'"),
    [ROW]: component("label = 'Open'"),
    [MANIFEST_PATH]: manifest(),
    'README.md': 'x\n',
  };
  const untranslated = (file, what) => `${file}: untranslated name default ${what}`;
  assertGateCases(t, UNTRANSLATED_DEFAULT_GATE, base, [
    {
      head: { [PROBE]: component("label = 'Close'", "ariaLabel = 'Shut'") },
      failures: [`${untranslated(PROBE, 'ariaLabel = Shut')} is new (1)`],
    },
    {
      head: { [MANIFEST_PATH]: manifest(ROW) },
      failures: [`${untranslated(ROW, 'label = Open')} is new (1)`],
    },
    { head: { [PROBE]: component("title = 'Close'") }, failures: [] },
    { head: { 'README.md': 'y\n' }, skipped: 'corpus-unchanged' },
  ]);
  const twice = component("label = ''").replace(
    '</button>',
    '</button><a aria-label={label}>y</a>'
  );
  const binding = '{label}';
  assertGateCases(t, EMPTY_BINDING_GATE, { ...base, [PROBE]: component("label = ''") }, [
    {
      head: { [PROBE]: twice },
      failures: [`${PROBE}: empty aria-label ${binding} rose from 1 to 2`],
    },
  ]);
});
