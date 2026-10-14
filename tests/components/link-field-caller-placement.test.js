/**
 * The link field paints itself (issue 2466): a caller places the zone and declares nothing else on
 * it. The family is matched by a pattern on each rule's raw selector, because `compoundClasses`
 * answers nothing for a `:global(…:not(…))` selector.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { compoundsOf } from '../../scripts/lib/stylesheetLiveClasses.js';
import {
  STYLE_CORPUS,
  TEMPLATE_CORPUS,
  styleCorpusOf,
  templatesOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { declarationsIn, splitSelectorList } from '../helpers/styleBlockScan.js';
import { attributeNamed, walkElements } from '../helpers/svelteTemplateScan.js';

const ZONE = 'src/ui/svelte/components/ItemDropZone.svelte';
const ZONE_TAG = 'ItemDropZone';

/** Any class of the family: the root's two, and every `manager-item-drop-zone-*` part. */
const FAMILY = /\.(?:manager-item-drop-zone[\w-]*|fabricate-link-field)(?![\w-])/u;

/** The root's own two classes, and no part's. */
const ROOT = /\.(?:manager-item-drop-zone|fabricate-link-field)(?![\w-])/u;

/** What a caller may declare on the zone: where it sits and how wide, never how it looks. */
const PLACEMENT =
  /^(?:flex(?:-grow|-shrink|-basis)?|(?:min-|max-)?width|align-self|justify-self|order|margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|grid-(?:area|column|row))$/u;

/** What the component's own scoped block may not declare on its root: the sheet's faces own it. */
const ROOT_PAINT = /^(?:border(?:-[\w-]+)?|background(?:-[\w-]+)?|color)$/u;

/** The root every sheet selector of the family begins at. */
const FAMILY_ROOT = '.fabricate-link-field';

const isScoped = (rule) => rule.file.endsWith('.svelte');

function styleRules() {
  const tree = workingTree(STYLE_CORPUS);
  return styleCorpusOf(tree.readFile, tree.listFiles()).rules;
}

function templates() {
  const tree = workingTree(TEMPLATE_CORPUS);
  return templatesOf(tree.readFile, tree.listFiles());
}

/** One selector with each `:global(…)` wrapper removed, its argument kept. */
function unwrapGlobal(selector) {
  let out = '';
  const open = [];
  let depth = 0;
  for (let index = 0; index < selector.length; index += 1) {
    if (selector.startsWith(':global(', index)) {
      open.push(depth);
      index += ':global('.length - 1;
      continue;
    }
    const character = selector[index];
    if (character === ')' && open.at(-1) === depth) {
      open.pop();
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    out += character;
  }
  return out;
}

/** The compound each selector of a rule's list ends in: what the rule's declarations land on. */
const subjectsOf = (rule) =>
  splitSelectorList(rule.selector).map(
    (selector) => compoundsOf(unwrapGlobal(selector)).at(-1) ?? ''
  );

/** The properties of `rule` that `allowed` does not admit, as failure lines. */
const strayDeclarations = (rule, allowed) =>
  declarationsIn(rule.file, rule.body)
    .filter(({ property }) => !allowed(property.toLowerCase()))
    .map(({ property }) => `${rule.file}:${rule.line} ${rule.selector} declares ${property}`);

const onlyPlacement = (property) => PLACEMENT.test(property);

const propertiesOf = (node) => (node?.type === 'ObjectExpression' ? node.properties : []);
const keyOf = (property) => property.key?.name ?? String(property.key?.value ?? '');

/** The expression a component attribute carries, or `undefined`. */
function expressionOf(node, name) {
  const attribute = attributeNamed(node, name);
  const value = Array.isArray(attribute?.value) ? attribute.value[0] : attribute?.value;
  return value?.expression;
}

/** Each attribute name a call site writes as a literal key of its `hookAttrs` root region. */
function literalRootHooks() {
  const names = new Set();
  for (const { ast } of templates()) {
    walkElements(ast.fragment, (node) => {
      if (node.type !== 'Component' || node.name !== ZONE_TAG) return;
      const root = propertiesOf(expressionOf(node, 'hookAttrs')).find(
        (property) => keyOf(property) === 'root'
      );
      for (const property of propertiesOf(root?.value)) {
        if (!property.computed) names.add(keyOf(property));
      }
    });
  }
  return names;
}

/** The `data-` attributes the zone writes on its own root element. */
function ownRootAttributes() {
  const names = [];
  const zone = templates().find(({ file }) => file === ZONE);
  walkElements(zone?.ast.fragment, (node) => {
    if (node.type !== 'RegularElement' || names.length > 0) return;
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === 'Attribute' && attribute.name.startsWith('data-')) {
        names.push(attribute.name);
      }
    }
  });
  return names;
}

test('every sheet selector naming the family begins at the family root', () => {
  const sheet = styleRules().filter((rule) => !isScoped(rule));
  const family = sheet
    .flatMap((rule) => splitSelectorList(rule.selector).map((selector) => ({ selector, rule })))
    .filter(({ selector }) => FAMILY.test(selector));
  assert.ok(
    family.length >= 20,
    `only ${family.length} sheet selectors name the link field's family, so the clause below holds ` +
      'over a family the reader has stopped finding'
  );
  assert.deepEqual(
    family
      .filter(({ selector }) => !selector.startsWith(FAMILY_ROOT))
      .map(({ selector, rule }) => `${rule.file}:${rule.line} ${selector}`),
    [],
    'a sheet rule reaches the link field from outside its family. A rule rooted at an application ' +
      'or a caller`s card is a caller painting the zone: move what it declares into the family.'
  );
});

test('a scoped rule outside the link field that names its family declares only placement', () => {
  const callers = styleRules().filter(
    (rule) => isScoped(rule) && rule.file !== ZONE && FAMILY.test(rule.selector)
  );
  assert.ok(
    callers.length > 0,
    'no scoped block outside the link field names its family, so the clause below holds over nothing'
  );
  assert.deepEqual(
    callers.flatMap((rule) => strayDeclarations(rule, onlyPlacement)),
    [],
    'a caller paints the link field. The zone owns its box, grounds, borders, type and actions: ' +
      'state what differs as a prop, or change the family in the sheet.'
  );
});

test('a rule reaching the zone by a root attribute declares only placement', () => {
  const hooks = literalRootHooks();
  const own = ownRootAttributes();
  assert.ok(hooks.size >= 3, `only ${hooks.size} literal root hooks were read from the call sites`);
  assert.equal(
    own.length,
    3,
    `the zone writes three attributes on its root; read ${own.join(', ')}`
  );

  const attributes = new Set([...hooks, ...own]);
  const reaching = styleRules().filter((rule) =>
    subjectsOf(rule).some((subject) =>
      [...subject.matchAll(/\[\s*(data-[\w-]+)/gu)].some(([, name]) => attributes.has(name))
    )
  );
  assert.ok(
    reaching.length > 0,
    'no rule reaches the zone by a root attribute, so the clause below holds over nothing'
  );
  assert.deepEqual(
    reaching.flatMap((rule) => strayDeclarations(rule, onlyPlacement)),
    [],
    'a rule keyed on one of the zone`s root attributes paints it; a hook places the zone only'
  );
});

test('the link field`s scoped block declares no border, ground or colour on its root', () => {
  const own = styleRules().filter((rule) => rule.file === ZONE);
  assert.ok(own.length > 0, `${ZONE} contributed no scoped rule, so nothing was read`);
  const onRoot = own.filter((rule) => subjectsOf(rule).some((subject) => ROOT.test(subject)));
  assert.deepEqual(
    onRoot.flatMap((rule) => strayDeclarations(rule, (property) => !ROOT_PAINT.test(property))),
    [],
    'a scoped declaration is unlayered and beats the sheet, so a root face written here keeps the ' +
      'zone from taking the sheet`s dragover and state faces'
  );
});
