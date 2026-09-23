/** Fixtures and rendered-geometry readers for `manager-layout-primitives.js` (issue 1670). */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLayoutContext } from '../helpers/layout-harness.js';

import { css, managerButtonClassesFor, scopedStyles } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The shared no-state and standing-statement primitives keep their CSS in their own
// scoped `<style>` blocks (issue 785), not in the global sheet, so the rules that used to
// be read out of `styles/fabricate.css` are read out of the component source instead.
const emptyStatePath = resolve(__dirname, '../../src/ui/svelte/components/EmptyState.svelte');
export const calloutPath = resolve(__dirname, '../../src/ui/svelte/components/Callout.svelte');
// The shared side-panel explainer card and icon fact row (issue 881) follow the same rule:
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

      // Reaching the bottom entry is the whole question.
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

// ── A SWITCHED-OFF manager button looks switched off.
export const DISABLED_ROLE_PROBES = ['neutral', 'primary', 'ghost', 'danger', 'dashed', 'warning'];

/**
 * Every rule prelude in a stylesheet, with comments blanked and at-rule preludes dropped.
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
  // A comma inside `:is(…)`/`:not(…)` would have been split by the caller.
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

// Named because each is a container the issue's own findings turn on.
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