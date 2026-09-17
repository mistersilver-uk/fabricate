/**
 * What EVERY manager-layout surface reads: the shipped sheet, the component sources whose scoped
 * blocks beat it, and the rule lookup they all state their claims through (issue 1670).
 *
 * Split out of the single 13,915-line `manager-layout.test.js`. Nothing here asserts — every
 * declaration is one that file made at module scope and more than one surface now needs.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../../styles/fabricate.css');
// The shared chip (issue 883) owns its appearance in its own scoped block for the same
// reason, so its scale is read out of the component rather than the global sheet.
const chipPath = resolve(__dirname, '../../src/ui/svelte/components/Chip.svelte');
export const managerComponentDir = resolve(__dirname, '../../src/ui/svelte/apps/manager');
export const css = readFileSync(cssPath, 'utf8');
const chipSource = readFileSync(chipPath, 'utf8');

// Only the scoped `<style>` block, with CSS comments stripped. Both primitives document the
// global layout-context rules they deliberately left behind, and those doc comments quote
// selectors (and the words `<style>`) — matching prose instead of a rule would assert
// nothing, so the block is located by its column-0 delimiters rather than by a loose match.
const STYLE_OPEN = '\n<style>\n';

export function scopedStyles(componentSource) {
  const start = componentSource.lastIndexOf(STYLE_OPEN);
  const end = componentSource.lastIndexOf('\n</style>');
  if (start < 0 || end <= start) return '';
  return componentSource.slice(start + STYLE_OPEN.length, end).replace(/\/\*[\s\S]*?\*\//g, '');
}
export const chipStyles = scopedStyles(chipSource);

// "This name must not survive" assertions read component SOURCE, and this repo's components
// carry long doc comments that name the very thing they replaced — which is the point of
// them. Stripping HTML and block comments keeps such a guard pointed at markup and code.
// `//` line comments are deliberately left in place: a URL contains `//`, so removing to
// end-of-line would delete real code (`https://…/fabricate` in the checks rail, for one).
export function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const CHAINED_MANAGER_BUTTON = String.raw`\.manager-button(?:\.fab-manager-button)?`;
const OPTIONAL_ENABLED_STATE = String.raw`(?::not\(:disabled\))?`;

function selectorPattern(selector) {
  return selector
    .split(',\n')
    .map(
      (one) =>
        one
          .trim()
          .replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
          .replaceAll(/\s+/g, String.raw`\s+`)
          .replaceAll(String.raw`\.manager-button`, CHAINED_MANAGER_BUTTON) + OPTIONAL_ENABLED_STATE
    )
    .join(String.raw`,\s+`);
}

export function blockIn(source, selector) {
  const match = source.match(new RegExp(`${selectorPattern(selector)}\\s*\\{[\\s\\S]*?\\}`));
  return match?.[0] || '';
}

export function blockFor(selector) {
  return blockIn(css, selector);
}

// The global sheet no longer styles a chip at all — the base rule and its eight tone rules
// were deleted with the last conversion (issue 883), because a surviving base is what the
// next hand-rolled chip would land on. So a real-browser fixture that renders a chip and
// loads only `styles/fabricate.css` now measures an UNSTYLED chip: no border, no padding,
// no min-height. Every geometry assertion downstream of one would still pass, and would be
// measuring something the app never renders.
//
// These two restore the truth by reproducing what Svelte actually ships: `chipCss` is the
// component's real compiled CSS, which each fixture places AFTER the global sheet exactly
// as `css: 'injected'` injects it, and `withChipHash` stamps the real scoping hash onto the
// fixture's chips so the specificity matches too. Both halves are needed — the CSS without
// the hash matches nothing, and the hash without the ordering proves the wrong winner.
// `withScopeHash` matches the whole `manager-chip` token only, so a `manager-chip-row`
// container is left alone.
export const chipScoped = scopedComponentCss(chipPath);
export const chipCss = chipScoped.css;

export function withChipHash(markup) {
  return withScopeHash(markup, 'manager-chip', chipScoped.hashClass);
}

// ── The Checks Studio restacks at the declared floor, MEASURED (issue 1096) ──────────────
//
// This replaces two source-text assertions, and the replacement is the whole point. Both of
// the rules below were asserted by `css.includes(...)` and both passed while broken:
//
//  - the workspace's `@container … (max-width: 1120px)` override tied with the base rule on
//    specificity (a container query adds none) and LOST on source order, so between 1120 and
//    961 — a band that contains the declared 1024x640 floor — `.manager-body` restacked while
//    the workspace stayed a 300px side column. The acceptance frame that exists to show a
//    stacked studio at the floor showed a side rail.
//  - `[data-manager-view^="checks"]` is a PREFIX match because `checks` became four child
//    routes. Narrowing it to `=` matched nothing, and an `includes('…checks…')` assertion
//    cannot see the difference between the two.
//
// A rendered measurement can see both. `chromium` is already this file's tool for exactly
// this reason: happy-dom applies no stylesheet and computes no cascade, so nothing in a
// mounted suite could ever have caught either.
export async function readWorkspaceGrid(width, view, worldTravelTab = '') {
  const context = await openLayoutContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(
      `<style>${css}</style>` +
        `<div style="width:${width}px;height:640px">` +
        `<div class="fabricate-manager" data-manager-view="${view}" data-world-travel-tab="${worldTravelTab}">` +
        `<div class="manager-body"><aside class="manager-rail">Rail</aside>` +
        `<main class="manager-main"><div class="manager-environment-edit-view">` +
        `<div class="manager-environment-workspace">` +
        `<div class="manager-environment-tab-panel">Panel</div>` +
        `<aside class="manager-inspector manager-environment-inspector">Rail</aside>` +
        `</div></div></main></div></div></div>`
    );
    return await page.evaluate(() => {
      const columns = (selector) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).gridTemplateColumns.split(' ').length : 0;
      };
      const workspace = document.querySelector('.manager-environment-workspace');
      return {
        bodyColumns: columns('.manager-body'),
        workspaceColumns: columns('.manager-environment-workspace'),
        workspaceWidth: workspace ? workspace.getBoundingClientRect().width : 0,
        panelWidth: document
          .querySelector('.manager-environment-tab-panel')
          ?.getBoundingClientRect().width,
        inspectorWidth: document
          .querySelector('.manager-environment-inspector')
          ?.getBoundingClientRect().width,
      };
    });
  } finally {
    await context.close();
  }
}

// ── The tool studio is the AUTHORITY for a manager button (issue 1096) ─────────────────────
//
// The reported defect was that the Modifiers card's buttons did not look like the Tool
// Studio's: a bare `manager-button` for a destructive verb, and a visibly different label
// scale. The cause is structural rather than a typo. The Tool Studio's refined treatment
// comes from ANCESTOR-CONTEXT rules — `.manager-header-actions .manager-button` and
// `.manager-tool-edit-actions .manager-button` — so a card that is inside neither could
// never match them however carefully its class string was written.
//
// A shared component that merely emits the same class names would not have caught this and
// will not catch the next one: the drift lives in the SHEET, not in the markup. So the
// equivalence is measured, in a real browser, on the two roles the maintainer's screenshot
// shows drifting. `ManagerButton.svelte`'s own class list is read out of the component
// rather than restated here, so a fixture that stopped matching what the component emits
// fails instead of quietly measuring markup the product no longer renders.
const managerButtonPath = resolve(__dirname, '../../src/ui/svelte/components/ManagerButton.svelte');
const managerButtonSource = readFileSync(managerButtonPath, 'utf8');

// The role modifier is read from the component's NAMED mapping rather than rebuilt here as
// `is-${role}`. `warning` emits `is-warning-action` — the sheet declares no
// `.manager-button.is-warning` at all — so a template would hand this harness a class string
// the product never renders, and the probe would measure a selector that matches nothing
// while reporting green (issue 1118).
const managerButtonRoleClasses = (() => {
  const mapping = managerButtonSource.match(/const ROLE_CLASSES = \{([\s\S]*?)\};/);
  assert.ok(mapping, 'ManagerButton declares its role-to-class mapping as one named object');
  return Object.fromEntries(
    [...mapping[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map(([, role, className]) => [role, className])
  );
})();

// The three unconditional classes, likewise read out of the component rather than restated.
// The family ROOT leads them since issue 1502: every re-rooted rule in the sheet is a compound
// keyed on it, so a probe built without it measures an unstyled control while naming the
// primitive. Reading the array is what keeps that automatic — the root arrives here with no
// edit to this harness, exactly as `manager-button` and `fab-manager-button` do.
const managerButtonBaseClasses = (() => {
  const literal = managerButtonSource.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, 'ManagerButton declares its emitted classes as one array literal');
  const base = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(
    base.includes('fabricate-button') &&
      base.includes('manager-button') &&
      base.includes('fab-manager-button'),
    'ManagerButton must emit the family root, the convention class and the primitive class, ' +
      `got ${base.join(' ')}`
  );
  return base;
})();

export function managerButtonClassesFor(role) {
  // `neutral` is the EMPTY modifier — the primitive emits the three base classes and nothing
  // more — so it is the one role that cannot be probed by looking a class name up, and the
  // one role a mutation cannot flip by deleting a prop.
  if (role === 'neutral') return managerButtonBaseClasses.join(' ');
  const modifier = managerButtonRoleClasses[role];
  assert.ok(
    modifier,
    `ManagerButton must declare a class for the '${role}' role, got ${Object.keys(managerButtonRoleClasses).join(' ')}`
  );
  return `${managerButtonBaseClasses.join(' ')} ${modifier}`;
}

// `Stepper` owns its chrome in a scoped `<style>`, and the whole measurement turns on ONE of
// its rules: `.fab-stepper.is-fill … .fab-stepper-input { flex: 1 1 0; width: auto;
// min-width: 0 }` is what makes the input obey the track it is given. Without the compiled
// CSS the fixture renders a UA-default `<input>` — 181px wide and happily overflowing an
// 80px stepper — so every width would "fit" and the gate would prove nothing. It is stamped
// with the real scoping hash and appended after the global sheet, exactly as `css: 'injected'`
// ships it.
export const stepperScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
);

/**
 * THE PAGER'S PER-PAGE CONTROL, exactly as `Pagination.svelte` renders it after issue 1504.
 *
 * It writes the primitive's ROOT element with the trigger nested INSIDE it, because that is the
 * shape the real control has: `SearchablePopover` owns the root and `Select` reaches it through
 * `pickerClass`. A trigger-only fixture would carry `fabricate-select-trigger` with no
 * `fabricate-picker manager-travel-picker fabricate-select` above it — so it would measure none
 * of the inherited picker paint, and none of the `.manager-pagination-size .fabricate-select-trigger`
 * per-site rules that hang off the surviving wrapper class would resolve either.
 *
 * The `data-pagination-size` hook is on the TRIGGER, not on the wrapper: it rides across on
 * `triggerData`, which is what keeps every capture step, mounted test and smoke step that drives
 * this control by that hook pointing at the control rather than at a box around it.
 *
 * @param {string} value The rendered value on the trigger.
 * @returns {string} The fixture markup.
 */
export function pagerBarFixture({ probe, value = '4', arrows = false }) {
  const arrow = (side, marked) => `<button
        type="button"
        class="fabricate-icon-button manager-icon-button"
        data-keyboard-focus="true"
        ${marked ? `data-probe="arrow-${probe}"` : ''}
      ><i class="fas fa-chevron-${side}" aria-hidden="true"></i></button>`;
  return `<div class="fabricate-pagination manager-pagination">
    <span class="manager-pagination-summary">Showing 1-4 of 8</span>
    ${
      arrows
        ? `<nav class="manager-pagination-nav">
      ${arrow('left', true)}
      <span class="manager-pagination-page">Page 1 of 2</span>
      ${arrow('right', false)}
    </nav>`
        : ''
    }
    <span class="manager-pagination-size"
      ><span id="caption-${probe}">Per page</span
      ><div class="fabricate-picker manager-travel-picker fabricate-select"
        ><button
          type="button"
          class="fabricate-select-trigger fabricate-select-trigger-inline"
          data-pagination-size=""
          data-select-size="inline"
          data-probe="pager-${probe}"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-labelledby="caption-${probe}"
        ><span class="manager-travel-picker-value fabricate-select-value">${value}</span><i
          class="fas fa-chevron-down" aria-hidden="true"></i></button
      ></div
    ></span>
  </div>`;
}