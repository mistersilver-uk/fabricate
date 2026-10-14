/**
 * The census of a published root class over every stylesheet (issues 2451, 2452): which selectors
 * name it, which of those a published mount can match, where they sit and what they draw, the bare
 * `button` rules beside them, and the classes the published closures spell.
 * `tests/published-component-manifest.test.js` reads it.
 */
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import { PROBE_ENTRY } from '../fixtures/published-components/probeEntry.js';

import { templateOf } from './apiConvention.js';
import { walkNodes } from './moduleAst.js';
import {
  SHIPPED,
  byName,
  declarationsOf,
  everyStylesheet,
  importClosure,
  isComponent,
  isStrip,
  moduleRing,
  sameDeclarations,
  selectorsWithRules,
  writtenSelector,
} from './publishedComponentGate.js';

/** The classes under which a sheet rule redraws a bare `button`; no extension target sits in one. */
export const BARE_BUTTON_ANCESTORS = new Set([
  'fabricate-tabs',
  'manager-breadcrumbs',
  'manager-travel-inspector-actions',
  'manager-tool-editor-tabs',
  'fabricate-interactables-manager',
  'form-footer',
  'dialog-buttons',
  'manager-selected-tag-pill',
  'fabricate-pagination',
]);

export const classesOf = (compound) =>
  compound.selectors.filter((part) => part.type === 'ClassSelector').map((part) => part.name);
const typesOf = (compound) =>
  compound.selectors.filter((part) => part.type === 'TypeSelector').map((part) => part.name);

/** A complex selector's compounds in order, each `:global(…)` replaced by the compounds it wraps. */
export function compoundsOf(complex) {
  const compounds = [];
  for (const relative of complex.children) {
    let current = { combinator: relative.combinator?.name ?? null, selectors: [] };
    compounds.push(current);
    for (const part of relative.selectors) {
      const isGlobal = part.type === 'PseudoClassSelector' && part.name === 'global';
      if (!isGlobal || part.args?.children.length !== 1) {
        current.selectors.push(part);
        continue;
      }
      const [first, ...rest] = compoundsOf(part.args.children[0]);
      current.selectors.push(...first.selectors);
      compounds.push(...rest);
      current = rest.at(-1) ?? current;
    }
  }
  return compounds;
}

/**
 * Whether no element a published component draws at `shape.root` can match `complex`: its root
 * compound takes a class the published keys cannot write, or `:disabled` where the shape does not
 * say `disables`, or an earlier compound is a pinned ancestor, or a later one needs a descendant
 * the mount cannot hold. `drawsChildren` is `false` for a root whose published keys draw no
 * classed descendant, as `Chip` and `Button` are; any other root holds no descendant classed
 * `manager-*` unless a published closure spells that class. An attribute selector never makes a
 * selector safe, and anything else fails closed, a root named only inside `:has()` included.
 */
export function cannotMatchPublished(complex, shape, spelled = new Set()) {
  const { root, writable, ancestors, drawsChildren, disables = false } = shape;
  const compounds = compoundsOf(complex);
  const at = compounds.findLastIndex((compound) => classesOf(compound).includes(root));
  if (at === -1) return false;
  const own = compounds[at];
  const unwritable = classesOf(own).some((name) => name !== root && !writable.has(name));
  const disabled =
    !disables &&
    own.selectors.some((part) => part.type === 'PseudoClassSelector' && part.name === 'disabled');
  const unheld = drawsChildren
    ? (name) => name.startsWith('manager-') && !spelled.has(name)
    : () => true;
  const classedChild = compounds.slice(at + 1).some((compound) => classesOf(compound).some(unheld));
  const pinnedAncestor = compounds
    .slice(0, at)
    .some((compound) => classesOf(compound).some((name) => ancestors.has(name)));
  return unwritable || disabled || classedChild || pinnedAncestor;
}

const PART_TEXT = Object.freeze({
  ClassSelector: (part) => `.${part.name}`,
  AttributeSelector: (part) => `[${part.name}${part.matcher ?? ''}${part.value ?? ''}]`,
  TypeSelector: (part) => part.name,
  PseudoClassSelector: (part) => `:${part.name}`,
  PseudoElementSelector: (part) => `::${part.name}`,
});

/** A selector spelled from its compounds, so a `:global()` rule and a sheet rule read alike. */
function flatSelector(complex) {
  return compoundsOf(complex)
    .map(({ combinator, selectors }) => {
      const lead = combinator && combinator !== ' ' ? `${combinator} ` : '';
      return lead + selectors.map((part) => PART_TEXT[part.type]?.(part) ?? part.type).join('');
    })
    .join(' ');
}

const holdsGlobal = (node) =>
  [...walkNodes(node)].some(
    (part) => part.type === 'PseudoClassSelector' && part.name === 'global'
  );

/** Whether `:global` reaches `complex`: in a part of its own, in a rule that nests it, or in a rule it nests. */
function reachedByGlobal(css, complex) {
  const within = (outer) => outer.start <= complex.start && complex.end <= outer.end;
  return [...walkNodes(css)].some(
    (rule) =>
      rule.type === 'Rule' &&
      ((within(rule.block) && holdsGlobal(rule.prelude)) ||
        (within(rule.prelude) && holdsGlobal(rule)))
  );
}

/**
 * Every selector of one parsed stylesheet that names `shape.root`, as `{ selector, written, safe }`:
 * spelled flat, and as its sheet writes it, beside its `complex`, its `rule` and what that rule
 * sits `within`. A selector in a file of `own`, the entry's closure, is scoped to that component's
 * own elements, so it is skipped unless `:global` reaches it.
 */
function censusSelectors(file, css, shape, { spelled, own = new Set() } = {}) {
  const names = (part) => part.type === 'ClassSelector' && part.name === shape.root;
  return selectorsWithRules(css, names)
    .filter(({ complex }) => !own.has(file) || reachedByGlobal(css, complex))
    .map(({ complex, rule, within }) => ({
      selector: `${file}: ${flatSelector(complex)}`,
      written: `${file}: ${writtenSelector(css, complex)}`,
      safe: cannotMatchPublished(complex, shape, spelled),
      complex,
      rule,
      within,
    }));
}

/** The pinned ancestors of `shape` that keep none of `census` off a published mount, so are stale. */
export function staleAncestors(shape, census, spelled) {
  const without = (name) => new Set([...shape.ancestors].filter((other) => other !== name));
  return [...shape.ancestors].filter((name) => {
    const narrowed = { ...shape, ancestors: without(name) };
    return census.every(
      ({ complex, safe }) => !safe || cannotMatchPublished(complex, narrowed, spelled)
    );
  });
}

const carries = (complex, pseudo) =>
  [...walkNodes(complex)].some(
    (part) => part.type === 'PseudoClassSelector' && part.name === pseudo
  );
const drawsOrStripsARing = (property) =>
  property === 'all' || property === 'box-shadow' || property.startsWith('outline');

/**
 * Clause 1 of the reaching set: a selector has no compound above the root's own, and its rule sits
 * inside no other style rule and no at-rule but `@media` and `@supports`, so it draws alike under
 * any ancestor. A pinned data-hook rule is not judged.
 */
export function placementFaults(reaching, shape, hooks) {
  return reaching
    .filter(({ written }) => !hooks.includes(written))
    .flatMap(({ written, complex, within }) => {
      const compounds = compoundsOf(complex);
      const at = compounds.findLastIndex((compound) => classesOf(compound).includes(shape.root));
      const holders = within.filter((holder) => holder !== '@media' && holder !== '@supports');
      return [
        ...(at > 0 ? [`${written} has a compound above the root's own`] : []),
        ...holders.map((holder) => `${written} sits inside ${holder}`),
      ];
    });
}

/**
 * Clauses 2 and 3 of the reaching set: exactly one selector carries `:focus-visible` and declares
 * exactly the module ring, exactly one carries `:focus` and is the strip, and no other declares
 * `all`, `box-shadow` or a property whose name starts `outline`.
 */
export function ringFaults(reaching, ring = moduleRing()) {
  const marks = reaching.filter(({ complex }) => carries(complex, 'focus-visible'));
  const strips = reaching.filter(({ complex }) => carries(complex, 'focus'));
  const others = reaching.filter((row) => !marks.includes(row) && !strips.includes(row));
  const drawn = [
    ['outline', ring.outline],
    ['outline-offset', ring.offset],
  ];
  return [
    ...(marks.length === 1 ? [] : [`${marks.length} reaching selectors carry :focus-visible`]),
    ...(strips.length === 1 ? [] : [`${strips.length} reaching selectors carry :focus`]),
    ...marks
      .filter(({ rule }) => !sameDeclarations(rule, drawn))
      .map(({ written }) => `${written} does not declare exactly the module ring`),
    ...strips
      .filter(({ rule }) => !isStrip(rule))
      .map(({ written }) => `${written} is not the strip`),
    ...others.flatMap(({ written, rule }) =>
      declarationsOf(rule)
        .filter(([property]) => drawsOrStripsARing(property))
        .map(([property]) => `${written} declares ${property}`)
    ),
  ];
}

/** The four module rules a bare `button` compound reaches a published button through, as written. */
export const BARE_BUTTON_RULES = Object.freeze([
  'styles/fabricate-base.css: .fabricate button:focus',
  'styles/fabricate-base.css: .fabricate button:focus-visible',
  'styles/fabricate-base.css: .fabricate button[data-validation-focused]',
  'styles/fabricate-manager-shell.css: .fabricate-manager button',
]);
/** What `.fabricate-manager button` declares, which the family's floor rule also declares. */
export const MANAGER_BUTTON_FLOOR = Object.freeze([['font', 'inherit']]);

/** Whether a compound is a `button` that names no class a published button lacks. */
const isBareButton = (compound, shape) =>
  typesOf(compound).includes('button') &&
  classesOf(compound).every((name) => shape.writable.has(name));

/**
 * Every selector of one parsed stylesheet with a bare `button` compound, as
 * `{ written, safe, under, rule, complex }`: safe under a class of `ancestors` above that compound. A
 * component's selector is read only where `:global` reaches it, and one that names `button` in no
 * compound of its own, so only inside a pseudo-class, fails closed.
 */
export function bareButtonSelectors(file, css, shape, ancestors) {
  const names = (part) => part.type === 'TypeSelector' && part.name === 'button';
  return selectorsWithRules(css, names)
    .filter(({ complex }) => !isComponent(file) || reachedByGlobal(css, complex))
    .flatMap(({ complex, rule }) => {
      const compounds = compoundsOf(complex);
      const written = `${file}: ${writtenSelector(css, complex)}`;
      const types = compounds.flatMap((compound) => typesOf(compound));
      if (!types.includes('button')) return [{ written, safe: false, under: [], rule, complex }];
      const at = compounds.findLastIndex((compound) => isBareButton(compound, shape));
      if (at === -1) return [];
      const above = compounds.slice(0, at).flatMap((compound) => classesOf(compound));
      const under = above.filter((name) => ancestors.has(name));
      return [{ written, safe: under.length > 0, under, rule, complex }];
    });
}

/** Every `data-*` attribute name the selectors of `census` hold, wherever in the selector. */
export function dataHooksOf(census) {
  const names = census.flatMap(({ complex }) =>
    [...walkNodes(complex)]
      .filter((part) => part.type === 'AttributeSelector' && part.name.startsWith('data-'))
      .map((part) => part.name)
  );
  return [...new Set(names)].sort(byName);
}

/** The static class names one template node writes, by attribute or directive. */
export function classNames(node) {
  if (node.type === 'ClassDirective') return [node.name];
  if (node.type !== 'Attribute' || node.name !== 'class' || !Array.isArray(node.value)) return [];
  return node.value.flatMap((part) => (part.type === 'Text' ? part.data.split(/\s+/) : []));
}

/**
 * Every string one closure file spells where a class may be written: each string literal and
 * template-literal chunk of its scripts and template expressions, its class attribute text and its
 * `class:` directive names.
 */
export function spelledStrings(file, reader) {
  const component = isComponent(file) ? reader.component(file) : null;
  const roots = component
    ? [component.module, component.instance, component.fragment]
    : [reader.module(file).ast];
  const strings = [];
  for (const node of roots.flatMap((root) => [...walkNodes(root)])) {
    if (node.type === 'Literal' && typeof node.value === 'string') strings.push(node.value);
    if (node.type === 'TemplateElement') strings.push(node.value.cooked ?? node.value.raw);
    strings.push(...classNames(node));
  }
  return strings;
}

/** Every `manager-` class token a published closure spells, the probe's included. */
export function publishedManagerClasses() {
  const tokens = [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]
    .flatMap((entry) => [...importClosure(entry.path, SHIPPED)])
    .flatMap((file) => spelledStrings(file, SHIPPED))
    .flatMap((text) => text.split(/\s+/));
  return new Set(tokens.filter((token) => token.startsWith('manager-')));
}

/** One census over `css`, read as a stylesheet named `sheet.css`. */
export const syntheticCensus = (shape, css, options = {}) =>
  censusSelectors(
    'sheet.css',
    templateOf('sheet.css', `<style>${css}</style>`).ast.css,
    shape,
    options
  );

export const entryNamed = (name) =>
  PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name);
export const ownFilesOf = (name) => importClosure(entryNamed(name).path, SHIPPED);

/** The census of `shape` over every stylesheet, for the published entry `name` that draws its root. */
export function shippedCensus(shape, name, sheets = everyStylesheet()) {
  const options = { spelled: publishedManagerClasses(), own: ownFilesOf(name) };
  return sheets.flatMap(([file, css]) => censusSelectors(file, css, shape, options));
}
