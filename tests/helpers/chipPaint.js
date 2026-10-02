/**
 * What the compiled sheet paints on a mounted chip. happy-dom computes no cascade, so the paint is
 * resolved from the stylesheet the mount injected: the rules selecting the chip root by class
 * alone, won by specificity and then by sheet order.
 */
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

/**
 * The compiled rules that select an element by class alone, in sheet order.
 *
 * @returns {Array<{ classes: string[], order: number, declarations: Map<string, string> }>}
 */
function compiledRootRules() {
  const rules = [];
  for (const [, head, body] of injectedCss().matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const declarations = new Map(
      body
        .split(';')
        .map((line) => line.split(':'))
        .filter((parts) => parts.length > 1)
        .map(([property, ...value]) => [property.trim(), value.join(':').trim()])
    );
    for (const selector of selectorsOf(head)) {
      const classes = selector.split('.').slice(1);
      if (selector.startsWith('.') && classes.every((name) => /^[\w-]+$/.exec(name))) {
        rules.push({ classes, order: rules.length, declarations });
      }
    }
  }
  return rules;
}

/**
 * @param {Element} node the mounted chip root
 * @returns {Map<string, string>} the declaration that wins each property
 */
export function compiledPaint(node) {
  const held = new Set(node.classList);
  const painted = new Map();
  const applying = compiledRootRules()
    .filter((rule) => rule.classes.every((name) => held.has(name)))
    .toSorted((a, b) => a.classes.length - b.classes.length || a.order - b.order);
  for (const rule of applying) {
    for (const [property, value] of rule.declarations) painted.set(property, value);
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
 * The alpha of a mounted chip's ground: 1 when its background is one theme token that is opaque
 * in every theme, 0 otherwise.
 *
 * @param {Element} node the mounted chip root
 * @param {Map<string, Map<string, string>>} themes from `themeTokens`
 * @returns {number}
 */
export function chipGroundAlpha(node, themes) {
  const ground = tokenOf(compiledPaint(node).get('background'));
  return themes.size > 1 && ground && translucentIn(themes, ground).length === 0 ? 1 : 0;
}
