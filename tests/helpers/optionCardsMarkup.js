/** The classes `RadioCardGroup` writes, read from its template's AST, so a static copy of its DOM can be held to them (issue 2467). */
import { componentAstOf } from './parsedSource.js';

/** What the chip's `Medallion` writes at `size={30}`, chosen (`tone`) or at rest (`ink`). */
const MEDALLION_CHIP_CLASSES = Object.freeze([
  'fab-medallion',
  'is-glyph-chip',
  'is-corner-7',
  'is-tone-accent',
  'is-ink-neutral',
]);

/** Every string a template subtree spells: text, string literals and template quasis. */
function stringsIn(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) stringsIn(child, out);
  } else if (node && typeof node === 'object') {
    if (node.type === 'Text') out.push(node.data);
    if (node.type === 'Literal' && typeof node.value === 'string') out.push(node.value);
    if (node.type === 'TemplateElement') out.push(node.value.cooked);
    for (const [key, value] of Object.entries(node)) if (key !== 'parent') stringsIn(value, out);
  }
  return out;
}

/** Every `class` attribute value and `class:` directive name in a template subtree. */
function classTokensIn(node, out = new Set()) {
  if (Array.isArray(node)) {
    for (const child of node) classTokensIn(child, out);
  } else if (node && typeof node === 'object') {
    if (node.type === 'Attribute' && node.name === 'class') {
      for (const token of stringsIn(node.value).join(' ').split(/\s+/)) if (token) out.add(token);
    }
    if (node.type === 'ClassDirective') out.add(node.name);
    for (const [key, value] of Object.entries(node))
      if (key !== 'parent') classTokensIn(value, out);
  }
  return out;
}

/** Every class token the component's markup can write, with `Field`'s root and the chip's classes. */
export function optionCardsClassesWritten() {
  const ast = componentAstOf('src/ui/svelte/components/RadioCardGroup.svelte');
  return new Set(['fabricate-field', ...MEDALLION_CHIP_CLASSES, ...classTokensIn(ast.fragment)]);
}

/** The class tokens a fixture's markup carries that the component never writes; an option's icon is data. */
export function classesNotWritten(fixture) {
  const written = optionCardsClassesWritten();
  const carried = [...fixture.matchAll(/class="([^"]*)"/g)].flatMap(([, value]) =>
    value.split(/\s+/)
  );
  const icon = /^(?:fa[srb]?|fa-[\w-]+)$/;
  return [...new Set(carried.filter((token) => token && !icon.test(token) && !written.has(token)))];
}
