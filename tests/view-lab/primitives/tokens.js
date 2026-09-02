/**
 * Sections 01–04 of the library, MEASURED rather than transcribed.
 *
 * ── WHY THESE FOUR SECTIONS ARE DERIVED AND NOT DRAWN ─────────────────────────────────────────
 *
 * Colour, Type, Space & geometry and States & targets are the only sections of `library.html` whose
 * content is not a component. They are the vocabulary the components are built out of, and the
 * library states them as hand-authored swatches and specimen rows — which is exactly the artifact
 * shape this page exists to replace. A swatch drawn in the library is a claim about
 * `styles/fabricate.css`; a swatch drawn here is a READING of it.
 *
 * The reading has three parts and each answers a different question:
 *
 *   - the NAMES come from the stylesheet's raw bytes, so a token added or deleted appears or
 *     disappears here on the next page load with no edit;
 *   - the VALUES come from `getComputedStyle` against a real `.fabricate[data-fabricate-theme]`
 *     element, so what is shown is what the cascade actually resolves — including a token a theme
 *     does not override and therefore inherits, which no reading of the file can tell you;
 *   - the STATE rules come from the browser's own parsed stylesheet, because section 04 is about
 *     selectors rather than values and there is no token whose name is `hover`.
 *
 * ── THE ONE THING HERE THAT IS A JUDGEMENT ────────────────────────────────────────────────────
 *
 * Which section a token belongs to. That is not written down anywhere, so {@link TOKEN_ROUTES} is a
 * rule per section rather than a list of names — a rule cannot go stale against a token it has
 * never heard of, and every name a rule fails to claim lands in a visible `unrouted` bucket instead
 * of vanishing. A growing `unrouted` list is the signal that a rule needs widening; a silently
 * shorter page is not a signal at all.
 */
import {
  FABRICATE_THEME_ATTRIBUTE,
  FABRICATE_THEME_CHOICES,
  FABRICATE_THEME_IDS,
} from '../../../src/ui/theme.js';

const STYLESHEET_URL = '/@fabricate-styles/fabricate.css';

/** Every `--fab-*` custom property DECLARATION in the sheet, as authored. */
const DECLARATION_PATTERN = /(--fab-[\w-]+)\s*:/g;

/** Every `--fab-*` REFERENCE inside a declaration value. */
const REFERENCE_PATTERN = /var\(\s*(--fab-[\w-]+)/g;

/**
 * The seven shipped themes, in the order `src/ui/theme.js` declares them.
 *
 * Derived from the shipped constants rather than listed, so a new theme reaches this page — and
 * the seven-wide comparison row — with nothing here to edit. The ids are what the attribute takes
 * and the labels are what the settings menu shows, which is the pairing a reader needs to connect
 * a column here to a choice in the product.
 *
 * @type {readonly {id: string, label: string}[]}
 */
export const LAB_THEMES = Object.freeze(
  Object.values(FABRICATE_THEME_IDS).map((id) =>
    Object.freeze({ id, label: FABRICATE_THEME_CHOICES[id] ?? id })
  )
);

/**
 * Which library section each token belongs to.
 *
 * Ordered, first match wins. A rule states its own reason because the boundaries are not obvious
 * from the names: `--fab-toggle-track` is geometry rather than colour, `--fab-recipe-control-font`
 * is type rather than a recipe concern, and `--fab-chance-slider-track-gradient` is a colour ramp
 * whose name says slider.
 *
 * @type {readonly {section: string, test: RegExp, why: string}[]}
 */
export const TOKEN_ROUTES = Object.freeze([
  {
    section: 'type',
    test: /(^--fab-font)|(-font$)/,
    why: 'A font family or a control text scale. `--fab-recipe-control-font` is a SIZE, so it is type rather than a recipe token.',
  },
  {
    section: 'space',
    test: /(^--fab-(space|shadow))|(-(radius|height|width|grid|cols?)$)|(^--fab-recipe-col-)/,
    why: 'A length, an elevation, or a grid template — the measured geometry section 03 states, including the per-screen column tracks that are geometry expressed as a token.',
  },
  {
    section: 'space',
    test: /^--fab-(toggle|stepper|icon-picker|chance-slider-thumb)/,
    why: 'Component geometry published as a token so a layout context can size the control without restyling it.',
  },
  {
    section: 'colour',
    test: /^--fab-/,
    why: 'Everything else. Section 01 is the fallback deliberately: an unrecognised token is far more often a colour than anything else, and a wrong guess here is visible as a swatch that is not a colour rather than as a missing row.',
  },
]);

/**
 * The eight states the design system requires every interactive primitive to declare.
 *
 * Taken from the library's own state set (`04 States & targets`). `rest` carries no selector: it is
 * the base rule, so it is listed for completeness and reported as such rather than being given a
 * pseudo-class it does not have.
 *
 * @type {readonly {state: string, selectors: readonly string[]}[]}
 */
export const SPEC_STATES = Object.freeze([
  { state: 'rest', selectors: Object.freeze([]) },
  { state: 'hover', selectors: Object.freeze([':hover']) },
  { state: 'focus-visible', selectors: Object.freeze([':focus-visible']) },
  {
    state: 'disabled',
    selectors: Object.freeze([':disabled', '[disabled]', '[aria-disabled="true"]', '.is-disabled']),
  },
  { state: 'loading', selectors: Object.freeze(['[aria-busy="true"]', '.is-loading']) },
  {
    state: 'invalid',
    selectors: Object.freeze([':invalid', '[aria-invalid="true"]', '.is-invalid', '.is-error']),
  },
  {
    state: 'readonly',
    selectors: Object.freeze([':read-only', '[readonly]', '.is-readonly']),
  },
  { state: 'empty', selectors: Object.freeze([':empty', '.manager-empty']) },
]);

/**
 * The `--fab-*` names the stylesheet declares, read from its bytes.
 *
 * Deliberately NOT read out of the CSSOM. `CSSStyleDeclaration` serialises what it holds, and a
 * serialised value is not guaranteed to be the authored one — this project has already recorded a
 * nested `var()` disappearing through exactly that route. Names are matched against the file the
 * browser was handed, and only the VALUES go through the cascade, where being resolved is the
 * point.
 *
 * @returns {Promise<string[]>} Unique names in declaration order.
 */
export async function readTokenNames() {
  const response = await fetch(STYLESHEET_URL);
  if (!response.ok) throw new Error(`could not read the stylesheet (${response.status})`);
  const source = await response.text();
  return [...new Set([...source.matchAll(DECLARATION_PATTERN)].map((match) => match[1]))];
}

/**
 * Route one token name to a library section.
 *
 * @param {string} name A `--fab-*` name.
 * @returns {string} A section id, or `'unrouted'` when no rule claims it.
 */
export function sectionForToken(name) {
  return TOKEN_ROUTES.find((route) => route.test.test(name))?.section ?? 'unrouted';
}

/**
 * Resolve every token, in every theme, through the real cascade.
 *
 * The probe is a bare `.fabricate[data-fabricate-theme]` element appended to `host` and removed
 * before this returns. Bare and temporary for the same reason the plinths are siblings of the
 * harness rather than descendants of it: an element inside a `.fabricate-manager` is reached by
 * 2821 descendant rules that a themed root in production is not, and any one of them could set a
 * token. What is measured here has to be what the theme declares, and nothing else.
 *
 * `applyFabricateTheme()` is not used, and must not be: it broadcasts the attribute to
 * `documentElement` and to EVERY `.fabricate` in the document, which would repaint the harness and
 * every other plinth on the page with whichever theme was measured last.
 *
 * @param {Element} host Where the probes are appended. Must not be inside a Fabricate app root.
 * @returns {Promise<{names: string[], themes: {id: string, label: string,
 *   values: Record<string, string>}[]}>} The measured table.
 */
export async function readThemeTokenTable(host) {
  const names = await readTokenNames();
  const themes = LAB_THEMES.map((theme) => {
    const probe = host.ownerDocument.createElement('div');
    probe.className = 'fabricate';
    probe.setAttribute(FABRICATE_THEME_ATTRIBUTE, theme.id);
    // Out of flow and unpainted: a probe that took layout space would move the page it is
    // measuring, and one that painted would be seven stripes of nothing above the catalogue.
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    host.append(probe);
    const computed = globalThis.getComputedStyle(probe);
    const values = Object.fromEntries(
      names.map((name) => [name, computed.getPropertyValue(name).trim()])
    );
    probe.remove();
    return { ...theme, values };
  });
  return { names, themes };
}

/**
 * What the stylesheet says about each of the eight states.
 *
 * Read from the browser's parsed sheets rather than the text, because a state is a SELECTOR and
 * selector matching is the one part of this a regex over source cannot do honestly: `:hover` inside
 * a comment, inside a `@container` prelude, and inside a real selector are the same characters.
 *
 * Scoped to Fabricate's own rules. Foundry's sheet has thousands of `:hover` rules and none of them
 * is evidence about this design system.
 *
 * @param {Document} [document_] The document to read.
 * @returns {{state: string, selectors: readonly string[], rules: number, tokens: string[]}[]}
 */
export function readStateRules(document_ = globalThis.document) {
  const rules = collectFabricateStyleRules(document_);
  return SPEC_STATES.map(({ state, selectors }) => {
    const matched =
      selectors.length === 0
        ? rules.filter((rule) => !hasAnyStateSelector(rule.selectorText))
        : rules.filter((rule) =>
            selectors.some((selector) => rule.selectorText.includes(selector))
          );
    const tokens = new Set();
    for (const rule of matched) {
      for (const match of rule.cssText.matchAll(REFERENCE_PATTERN)) tokens.add(match[1]);
    }
    return {
      state,
      selectors,
      rules: matched.length,
      tokens: [...tokens].sort((left, right) => left.localeCompare(right)),
    };
  });
}

/** Every state selector fragment, for the `rest` bucket's negative test. */
const EVERY_STATE_SELECTOR = SPEC_STATES.flatMap((entry) => entry.selectors);

function hasAnyStateSelector(selectorText) {
  return EVERY_STATE_SELECTOR.some((selector) => selectorText.includes(selector));
}

/**
 * Every style rule Fabricate declares: `styles/fabricate.css` plus the component `<style>` blocks
 * Svelte injects.
 *
 * A cross-origin sheet throws on `cssRules` access. Nothing here is cross-origin, but a sheet that
 * threw would take the whole section out, so the read is guarded per sheet and a sheet that cannot
 * be read is skipped rather than fatal — this is a reference panel, not a gate.
 *
 * ── A STYLE RULE IS ALSO A GROUPING RULE, AND WRITING THIS AS AN `else if` CHAIN RETURNED ZERO ──
 *
 * CSS nesting made `CSSStyleRule` extend `CSSGroupingRule`, so EVERY style rule now carries a
 * `cssRules` list — usually empty, and an empty `CSSRuleList` is truthy. An
 * `if (rule.cssRules) … else if (rule.selectorText) …` therefore descended into each style rule's
 * empty child list and collected nothing at all, from anywhere. The section rendered eight states,
 * each reading "0 rules · 0 tokens", which looks like a finding about the stylesheet rather than a
 * bug in the reader — the exact failure this project has recorded as a vacuous mechanical check.
 *
 * So a rule is COLLECTED when it has a selector and DESCENDED INTO when it has children, and those
 * are not alternatives.
 *
 * @param {Document} document_ The document to read.
 * @returns {{selectorText: string, cssText: string}[]}
 */
function collectFabricateStyleRules(document_) {
  const collected = [];
  const visit = (container) => {
    let rules;
    try {
      rules = container.cssRules;
    } catch {
      return;
    }
    for (const rule of rules ?? []) {
      if (rule.styleSheet) {
        visit(rule.styleSheet);
        continue;
      }
      if (rule.selectorText) {
        collected.push({ selectorText: rule.selectorText, cssText: rule.cssText });
      }
      if (rule.cssRules) visit(rule);
    }
  };
  for (const sheet of document_.styleSheets) {
    const href = sheet.href ?? '';
    // A Svelte-injected component sheet has no href; the module stylesheet is served from the raw
    // mount. Foundry's own sheet is excluded by both tests, which is the intent.
    if (href && !href.includes('fabricate.css') && !href.includes('/@view-lab/')) continue;
    visit(sheet);
  }
  return collected;
}
