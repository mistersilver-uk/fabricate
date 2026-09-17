/**
 * Fixtures and rendered-geometry readers for `manager-layout-primitives.js` (issue 1670).
 *
 * App shell, rail, titlebar, empty state, callout, card and chip layout: the markup, the component sources and the
 * page readers that surface's tests measure through. Nothing here asserts.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLayoutContext } from '../helpers/layout-harness.js';

import { css, managerButtonClassesFor, scopedStyles } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The shared no-state and standing-statement primitives keep their CSS in their own
// scoped `<style>` blocks (issue 785), not in the global sheet, so the rules that used to
// be read out of `styles/fabricate.css` are read out of the component source instead.
const emptyStatePath = resolve(__dirname, '../../src/ui/svelte/apps/manager/EmptyState.svelte');
export const calloutPath = resolve(__dirname, '../../src/ui/svelte/apps/manager/Callout.svelte');
// The shared side-panel explainer card and icon fact row (issue 881) follow the same rule:
// their appearance is in their own scoped block, so it is read out of the component.
const explainerCardPath = resolve(
  __dirname,
  '../../src/ui/svelte/apps/manager/ExplainerCard.svelte'
);
const iconFactRowPath = resolve(__dirname, '../../src/ui/svelte/apps/manager/IconFactRow.svelte');
const emptyStateSource = readFileSync(emptyStatePath, 'utf8');
const calloutSource = readFileSync(calloutPath, 'utf8');
export const explainerCardSource = readFileSync(explainerCardPath, 'utf8');
const iconFactRowSource = readFileSync(iconFactRowPath, 'utf8');

export const emptyStateStyles = scopedStyles(emptyStateSource);
export const calloutStyles = scopedStyles(calloutSource);
export const explainerCardStyles = scopedStyles(explainerCardSource);
export const iconFactRowStyles = scopedStyles(iconFactRowSource);

// The stacked body rule, read out of the 1120px container query rather than off the base
// `.manager-body` block (`blockFor` returns the FIRST match, which is the base rule).
export function stackedBodyRule() {
  const query = css.slice(css.indexOf('@container fabricate-manager (max-width: 1120px)'));
  const selector =
    '.fabricate-manager .manager-body,\n  .fabricate-manager .manager-body.is-rail-collapsed {';
  const start = query.indexOf(selector);
  if (start < 0) return '';
  const rule = query.slice(start);
  return rule.slice(0, rule.indexOf('}') + 1);
}

// The rail nav was unreachable in a SHORT window.
//
// Every rule that ever gave the rail a scroller lived in an `inline-size` container query — the
// 1120px stacked block above and the per-view 831px ones — so a window that stayed WIDE and only
// lost height never reached one. The rail's height is definite (the shell's `1fr` row) and it
// carries `overflow: hidden` from the grouped region rule, so the bottom of the section list was
// clipped: Tools, Checks, Gathering and the placeholders sat in the DOM and could not be reached
// with a pointer. `assertManagerLayoutStable` cannot see this either — a CLIPPED rail does not
// overflow, the same blind spot the issue-643 note above records.
//
// The fixture is the real shell shape on purpose: two `auto` header rows ABOVE the body, so
// `.manager-body` lands in the `1fr` row and the rail inherits a window-bound height. Rendering
// the body alone would put it in an implicit `auto` row, size it to its content, and the bug
// would be unreproducible.
function shortWindowRailMarkup(navItems) {
  const items = Array.from({ length: navItems }, (item, index) => {
    const last = index === navItems - 1 ? ' data-last-nav' : '';
    return `<button class="manager-nav-button"${last}><span class="manager-nav-icon"><i class="fas fa-gem"></i></span><span class="manager-nav-label">Section ${index + 1}</span><span class="manager-nav-count">${index}</span></button>`;
  }).join('');
  return `<div class="fabricate-manager" data-manager-view="systems">
      <div class="manager-titlebar" data-manager-titlebar><span>Fabricate</span></div>
      <header class="manager-header"><h1>Crafting systems</h1></header>
      <div class="manager-body">
        <aside class="manager-rail">
          <p class="manager-rail-title" data-manager-rail-section>GM management</p>
          <section class="manager-rail-block">
            <div class="manager-scope-card" data-scope-card>
              <div class="manager-scope-card-head"><p class="manager-kicker">Crafting system</p><button class="manager-rail-toggle manager-scope-collapse" data-manager-rail-toggle>&lsaquo;</button></div>
              <select class="manager-scope-select"><option>Lab Smithing</option></select>
              <button class="manager-scope-return">All crafting systems</button>
            </div>
          </section>
          <nav class="manager-nav">${items}</nav>
        </aside>
        <main class="manager-main"><div class="manager-table-scroll">Rows</div></main>
        <aside class="manager-inspector"><section class="fabricate-card manager-inspector-card">Inspector</section></aside>
      </div>
    </div>`;
}

export async function readShortWindowRailGeometry({ width = 1280, height = 560, navItems = 14 } = {}) {
  const context = await openLayoutContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style><style>html,body{margin:0}</style><div style="width:${width}px;height:${height}px">${shortWindowRailMarkup(navItems)}</div>`
    );
    return await page.evaluate(() => {
      const rail = document.querySelector('.manager-rail');
      const nav = document.querySelector('.manager-nav');
      const scope = document.querySelector('[data-scope-card]');
      const last = document.querySelector('[data-last-nav]');
      const scopeTopBefore = scope.getBoundingClientRect().top;
      const navScrollable = nav.scrollHeight - nav.clientHeight;

      // Reaching the bottom entry is the whole question, so drive the scroller rather than
      // measuring its resting position: a clipped box reports a bottom entry that is simply
      // off the end of the rail and stays there.
      nav.scrollTop = nav.scrollHeight;

      const navRect = nav.getBoundingClientRect();
      const scopeRect = scope.getBoundingClientRect();
      return {
        navOverflowY: getComputedStyle(nav).overflowY,
        navScrollable,
        navScrolledBy: nav.scrollTop,
        navTop: navRect.top,
        navBottom: navRect.bottom,
        lastItemBottom: last.getBoundingClientRect().bottom,
        railBottom: rail.getBoundingClientRect().bottom,
        railScrollable: rail.scrollHeight - rail.clientHeight,
        scopeTopBefore,
        scopeTopAfter: scopeRect.top,
        scopeBottom: scopeRect.bottom,
      };
    });
  } finally {
    await context.close();
  }
}

// ── A SWITCHED-OFF manager button looks switched off, in every role AND every container ───
//
// The reported state of the sheet was that it did not. `.manager-button:disabled` is (0,3,0);
// `.manager-button.is-primary`, `.is-danger` and `.is-warning-action` are (0,3,0) too and
// stand LATER in the file, and the primitive's `is-ghost` and `is-dashed` companions are
// (0,4,0) and beat it outright. Every one of those declares border-color, colour and
// background with no `:disabled` requirement, so a disabled button kept its enabled paint in
// every role. `opacity: 0.62` and `cursor: default` still applied — which is why it read as a
// dimmed LIVE control rather than a dead one, and why three rounds of plan review walked past
// it. It was already shipping on the screen this conversion designates as the authority:
// `ToolEditView` renders `role="ghost"` with `disabled={saving}`, so the Back button looked
// available for the whole of a tool save.
//
// The repair qualifies every resting-paint rule with `:not(:disabled)` rather than chaining
// the disabled rule above them, because that selector also serves `.manager-icon-button` and
// every hand-written button the sweep does not convert; chaining it would have taken the
// disabled paint from exactly the controls with no other. So this measures the INVARIANT the
// repair states — the disabled paint is role-independent — rather than re-deriving the
// arithmetic that made it false.
//
// ── WHY IT PROBES EVERY CONTAINER, AND WHY THE CONTAINER LIST IS DERIVED ─────────────────
// The first version of this gate mounted its six probes inside `.manager-edit-card` and
// nothing else, so it measured the invariant against the ROLE rules alone. It was green while
// `.fabricate-manager .manager-tool-edit-actions .manager-button.is-ghost` — (0,4,0),
// unqualified, three colour declarations — still beat the disabled rule outright in the one
// container the Tool Studio's Back button actually sits in. The defect this whole section is
// named for was live, in the exact control the issue cites, underneath a passing test.
//
// A hand-written container list would have repeated that failure one container later, so the
// list is DERIVED from the sheet: every rule whose key compound is a `.manager-button` and
// which names an ancestor between `.fabricate-manager` and that compound contributes its
// ancestor chain, materialized as real elements. Add an ancestor-context rule to the sheet
// and the probe follows it there on the next run, with no edit here. `ANCESTOR_CONTEXT_FLOOR`
// and the named-context assertion below are what stop a parse break from emptying the list
// and reporting green over nothing.
//
// Ancestors are materialized as nested elements, so a `>` combinator is honoured and a `+`
// or `~` one is not: a sibling context is collected as UNMATERIALIZABLE and reds the gate
// rather than being silently dropped. The sheet has none today.
export const DISABLED_ROLE_PROBES = ['neutral', 'primary', 'ghost', 'danger', 'dashed', 'warning'];

/**
 * Every rule prelude in a stylesheet, with comments blanked and at-rule preludes dropped.
 *
 * Rules nested inside an `@media`/`@container` block are included: a container is a container
 * whatever guards it, and a probe that skipped them would be blind to exactly the responsive
 * overrides this sheet uses to re-type a header cluster at narrow widths.
 *
 * @param {string} sheet stylesheet text
 * @returns {Array<string>} one prelude per rule
 */
function rulePreludes(sheet) {
  const text = sheet.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
  const preludes = [];
  let depth = 0;
  let start = 0;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char !== '{' && char !== '}' && !(char === ';' && depth <= 1)) continue;
    if (char === '{' && depth <= 1) preludes.push(text.slice(start, cursor).trim());
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    start = cursor + 1;
  }
  return preludes.filter((prelude) => prelude !== '' && !prelude.startsWith('@'));
}

const CLASS_TOKEN = /\.([\w-]+)/g;
const ATTRIBUTE_TOKEN = /\[([\w-]+)="([^"]*)"]/g;

/**
 * A compound selector as a renderable element, or `null` when it cannot be one.
 *
 * Classes and quoted attribute selectors are materialized; anything else left in the compound
 * — a pseudo-class, a type selector, a universal — means the caller must not pretend it can
 * render this context, so it says so instead of rendering an approximation.
 *
 * @param {string} compound one compound selector, e.g. `.fabricate-manager[data-x="y"]`
 * @returns {{classes: Array<string>, attributes: string}|null} the element, or null
 */
function elementForCompound(compound) {
  const classes = [...compound.matchAll(CLASS_TOKEN)].map(([, name]) => name);
  const attributes = [...compound.matchAll(ATTRIBUTE_TOKEN)]
    .map(([, name, value]) => ` ${name}="${value}"`)
    .join('');
  const residue = compound.replaceAll(CLASS_TOKEN, '').replaceAll(ATTRIBUTE_TOKEN, '');
  if (residue !== '' || classes.length === 0) return null;
  return { classes, attributes };
}

/**
 * The ancestor chain a manager-button selector names, or `null` when it names none.
 *
 * @param {string} selector one selector from a rule's prelude
 * @returns {{id: string, root: object, chain: Array<object>}|null|'unmaterializable'}
 */
function ancestorContextIn(selector) {
  const one = selector.trim().replaceAll(/\s+/g, ' ');
  if (!one.includes('.manager-button')) return null;
  // A comma inside `:is(…)`/`:not(…)` would have been split by the caller, leaving a fragment
  // with unbalanced parentheses. Such a fragment is not a selector and is not reasoned about.
  if ((one.match(/\(/g) || []).length !== (one.match(/\)/g) || []).length) return null;
  const compounds = one.split(/\s*>\s*|\s+/).filter(Boolean);
  if (!compounds.at(-1).includes('.manager-button')) return null;
  const ancestors = compounds.slice(1, -1);
  if (ancestors.length === 0) return null;
  if (/[+~]/.test(one)) return 'unmaterializable';
  const root = elementForCompound(compounds[0]);
  const chain = ancestors.map((compound) => elementForCompound(compound));
  if (!root || !root.classes.includes('fabricate-manager') || chain.includes(null)) {
    return 'unmaterializable';
  }
  return { id: [compounds[0], ...ancestors].join(' '), root, chain };
}

// The Modifiers card, kept as the first context because it is the one the reported defect was
// first measured in and the only one that is NOT an ancestor-context rule of its own — a
// manager button with no container opinion at all is the base case the roles are ruled for.
const BASE_DISABLED_CONTEXT = {
  id: '.fabricate-manager .manager-edit-card',
  root: { classes: ['fabricate-manager'], attributes: '' },
  chain: [{ classes: ['manager-edit-card'], attributes: '' }],
};

// A floor, not a count: the exact number moves whenever the sheet gains or retires a container
// rule, and pinning it would turn every such edit into a failure here. What must never happen
// is the list going empty or near-empty through a parse break, which is the failure mode that
// would make this whole gate vacuous while reporting green.
export const ANCESTOR_CONTEXT_FLOOR = 10;

// Named because each is a container the issue's own findings turn on: the Tool Studio's Back
// button cluster, the 27-site editor header, the knowledge rows, the drop inspector's stack
// and the Checks Studio preset row, whose `background` was the SECOND rule found beating the
// disabled invariant from a container.
export const REQUIRED_DISABLED_CONTEXTS = [
  '.manager-tool-edit-actions',
  '.manager-header-actions',
  '.manager-knowledge-row-actions',
  '.manager-drop-inspector-stack',
  '.manager-checks-trigger-presets',
];

export const { contexts: DISABLED_CONTEXTS, unmaterializable: UNMATERIALIZABLE_CONTEXTS } = (() => {
  const found = new Map([[BASE_DISABLED_CONTEXT.id, BASE_DISABLED_CONTEXT]]);
  const rejected = new Set();
  for (const prelude of rulePreludes(css)) {
    for (const selector of prelude.split(',')) {
      const context = ancestorContextIn(selector);
      if (context === null) continue;
      if (context === 'unmaterializable') rejected.add(selector.trim());
      else if (!found.has(context.id)) found.set(context.id, context);
    }
  }
  return { contexts: [...found.values()], unmaterializable: [...rejected] };
})();

export function disabledProbeMarkup(context, index) {
  const probes = DISABLED_ROLE_PROBES.map(
    (role) =>
      `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="on-${index}-${role}"><span>Save</span></button>` +
      `<button type="button" class="${managerButtonClassesFor(role)}" data-probe="off-${index}-${role}" disabled><span>Save</span></button>`
  ).join('');
  const open = context.chain
    .map((element) => `<div class="${element.classes.join(' ')}"${element.attributes}>`)
    .join('');
  const close = context.chain.map(() => '</div>').join('');
  return `<main class="${context.root.classes.join(' ')}"${context.root.attributes}>${open}${probes}${close}</main>`;
}