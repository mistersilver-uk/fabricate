/**
 * What the compiled sheet paints on a mounted chip. happy-dom computes no cascade, so the paint is
 * resolved from the stylesheet the mount injected: the rules selecting the chip root by class
 * alone, won by specificity and then by sheet order. A rule this model cannot evaluate that could
 * reach the chip's ground throws, so the model fails closed rather than reading a looser cascade.
 */
import { readFileSync } from 'node:fs';

/** The properties that decide whether a chip's ground is opaque. */
const GROUND_PROPERTIES = new Set(['background', 'background-color', 'opacity']);

/** `text` with its block and line comments removed. */
export function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

/** The stylesheet the mount injected, comments stripped. */
export function injectedCss() {
  return withoutComments(
    [...document.querySelectorAll('style')].map((node) => node.textContent).join('\n')
  );
}

/** The global sheet, whose descendant chip overrides reach a mounted chip as well. */
const GLOBAL_SHEET = withoutComments(
  readFileSync(new URL('../../styles/fabricate.css', import.meta.url), 'utf8')
);
let globalRules = null;

/**
 * Every style rule in `css`, in sheet order, with whether an at-rule wraps it.
 *
 * @returns {Array<{ head: string, body: string, conditional: boolean }>}
 */
function styleRules(css) {
  const rules = [];
  const open = [];
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === '{') {
      open.push(css.slice(start, index).trim());
      start = index + 1;
    } else if (css[index] === '}') {
      const head = open.pop() ?? '';
      if (head && !head.startsWith('@')) {
        const conditional = open.some((outer) => outer.startsWith('@'));
        rules.push({ head, body: css.slice(start, index), conditional });
      }
      start = index + 1;
    }
  }
  return rules;
}

function declarationsOf(body) {
  return new Map(
    body
      .split(';')
      .map((line) => line.split(':'))
      .filter((parts) => parts.length > 1)
      .map(([property, ...value]) => [property.trim(), value.join(':').trim()])
  );
}

/** One selector list split into its selectors, with each trailing `:is()` list expanded. */
function selectorsOf(head) {
  return head
    .replaceAll(/:where\(\.svelte-\w+\)|\.svelte-\w+/g, '')
    .split(/,(?![^(]*\))/)
    .map((selector) => selector.trim())
    .flatMap((selector) => {
      const [, stem, list] = /^(.*):is\(([^)]*)\)$/.exec(selector) ?? [];
      return list ? list.split(',').map((leg) => stem + leg.trim()) : [selector];
    });
}

/** Whether a selector's subject, its last compound, names the chip root class. */
function targetsChip(selector) {
  const subject = selector.split(/[\s>+~]+/).at(-1) ?? '';
  return /\.manager-chip(?![\w-])/.test(subject);
}

/**
 * The rules that select an element by class alone, in sheet order, and every other rule whose
 * subject is a chip and which declares a ground property.
 */
function compiledRules() {
  const modelled = [];
  const unmodelled = [];
  globalRules ??= styleRules(GLOBAL_SHEET);
  const sheets = [
    { rules: styleRules(injectedCss()), modelled: true },
    { rules: globalRules, modelled: false },
  ];
  for (const sheet of sheets) {
    for (const { head, body, conditional } of sheet.rules) {
      const declarations = declarationsOf(body);
      const grounds = [...declarations.keys()].some((name) => GROUND_PROPERTIES.has(name));
      for (const selector of selectorsOf(head)) {
        const classes = selector.split('.').slice(1);
        const classOnly =
          selector.startsWith('.') && classes.every((name) => /^[\w-]+$/.exec(name));
        if (sheet.modelled && classOnly && !conditional) {
          modelled.push({ classes, order: modelled.length, declarations });
        } else if (grounds && targetsChip(selector)) {
          unmodelled.push({ selector });
        }
      }
    }
  }
  return { modelled, unmodelled };
}

/**
 * Whether `node` could take a rule the model does not evaluate. An at-rule's condition is taken
 * to hold, and a selector the DOM cannot test is taken to match.
 */
function reaches(node, { selector }) {
  try {
    return node.matches(selector);
  } catch {
    return true;
  }
}

/**
 * @param {Element} node the mounted chip root
 * @returns {Map<string, string>} the declaration that wins each property; `background-color`
 *   carries the colour a `background` shorthand set when that won
 */
export function compiledPaint(node) {
  const held = new Set(node.classList);
  const { modelled, unmodelled } = compiledRules();
  const escaping = unmodelled.filter((rule) => reaches(node, rule));
  if (escaping.length > 0) {
    throw new Error(
      `chipPaint cannot model ${escaping.map((rule) => `"${rule.selector}"`).join(', ')}, ` +
        'which can paint this chip’s ground; extend the model rather than read past it'
    );
  }
  const painted = new Map();
  const applying = modelled
    .filter((rule) => rule.classes.every((name) => held.has(name)))
    .toSorted((a, b) => a.classes.length - b.classes.length || a.order - b.order);
  for (const rule of applying) {
    for (const [property, value] of rule.declarations) {
      painted.set(property, value);
      if (property === 'background') painted.set('background-color', value);
    }
  }
  return painted;
}

/** The token a `var(--fab-…)` declaration names, or `''` when the value is anything else. */
export function tokenOf(value) {
  return /^var\((--fab-[\w-]+)\)$/.exec(value ?? '')?.[1] ?? '';
}

/**
 * Each theme block's custom properties.
 *
 * @param {string} sheet the text of `styles/fabricate.css`, which declares them
 * @returns {Map<string, Map<string, string>>} theme name → token → declared value
 */
export function themeTokens(sheet) {
  return new Map(
    [...sheet.matchAll(/\.fabricate\[data-fabricate-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)].map(
      ([, theme, body]) => [
        theme,
        new Map(
          [...body.matchAll(/(--fab-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value])
        ),
      ]
    )
  );
}

/** The themes in which `token` is not a six-digit hex, the only opaque form the sheet declares. */
export function translucentIn(themes, token) {
  return [...themes]
    .filter(([, tokens]) => {
      const value = tokens.get(token) ?? '';
      return !(value.startsWith('#') && value.length === 7);
    })
    .map(([theme]) => theme);
}

/**
 * The alpha of a mounted chip's ground: 1 when its background colour is one theme token that is
 * opaque in every theme and nothing fades the chip, 0 otherwise.
 *
 * @param {Element} node the mounted chip root
 * @param {Map<string, Map<string, string>>} themes from `themeTokens`
 * @returns {number}
 */
export function chipGroundAlpha(node, themes) {
  const paint = compiledPaint(node);
  const ground = tokenOf(paint.get('background-color'));
  const faded = paint.has('opacity') && Number(paint.get('opacity')) !== 1;
  return themes.size > 1 && ground && !faded && translucentIn(themes, ground).length === 0 ? 1 : 0;
}
