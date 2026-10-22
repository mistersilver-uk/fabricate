/**
 * Every in-app `<EditorTabs>` caller hands the strip final text (issue 2601), because the strip
 * localizes none of a tab's copy: `tabs` is `localizeTabs(…)`, or a list the caller declares whose
 * items carry no `labelKey`, `tooltipKey` or `ariaLabelKey` and spell no `label`, `tooltip` or
 * `ariaLabel` as a bare string.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calledName, walkNodes } from '../helpers/moduleAst.js';
import { attributeExpression } from '../helpers/svelteStructureContract.js';
import { parsedTemplates, walkElements } from '../helpers/svelteTemplateScan.js';

const KEYS = new Set(['labelKey', 'tooltipKey', 'ariaLabelKey']);
const COPY = new Set(['label', 'tooltip', 'ariaLabel']);

/** Each `<EditorTabs>` in the UI templates: its file, its parsed file and its `tabs` expression. */
function callers() {
  const found = [];
  for (const { file, ast } of parsedTemplates()) {
    walkElements(ast.fragment, (element) => {
      if (element.type === 'Component' && element.name === 'EditorTabs') {
        found.push({ file, ast, tabs: attributeExpression(element, 'tabs') });
      }
    });
  }
  return found;
}

/** The init of the instance-script declarator `name`, or `undefined`. */
function declared(ast, name) {
  for (const node of walkNodes(ast.instance?.content)) {
    if (node.type === 'VariableDeclarator' && node.id?.name === name) return node.init;
  }
  return undefined;
}

const keyOf = (property) => property.key?.name ?? property.key?.value;

/** Whether a value is copy the caller spells: a string, or a branch that is one. */
function spellsCopy(node) {
  if (node.type === 'Literal') return typeof node.value === 'string';
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0;
  if (node.type === 'ConditionalExpression') {
    return spellsCopy(node.consequent) || spellsCopy(node.alternate);
  }
  if (node.type === 'LogicalExpression') return spellsCopy(node.left) || spellsCopy(node.right);
  return false;
}

/** A tab list's faults: no item declared, a key the strip never reads, or copy as a string. */
function faults(list) {
  const items = [...walkNodes(list)].filter(
    (node) =>
      node.type === 'ObjectExpression' && node.properties.some((item) => keyOf(item) === 'id')
  );
  if (items.length === 0) return ['declares no tab item'];
  return items.flatMap((item) =>
    item.properties.flatMap((property) => {
      const key = keyOf(property);
      if (KEYS.has(key)) return [`${key} is never resolved`];
      if (COPY.has(key) && spellsCopy(property.value)) return [`${key} is a bare string`];
      return [];
    })
  );
}

test('reads the in-app EditorTabs callers', () => {
  assert.ok(callers().length >= 17, 'every shipped strip is a caller here');
});

test('every in-app EditorTabs caller passes its tabs as final text', () => {
  const found = callers().flatMap(({ file, ast, tabs }) => {
    if (calledName(tabs) === 'localizeTabs') return [];
    const list = tabs?.type === 'Identifier' ? declared(ast, tabs.name) : tabs;
    if (!list) return [`${file}: tabs is not a list it declares`];
    return faults(list).map((fault) => `${file}: ${fault}`);
  });
  assert.deepEqual(found, []);
});
