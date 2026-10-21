/** What EVERY manager-layout surface reads: the shipped sheet. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';
import { openLayoutContext } from '../helpers/layout-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The shared chip (issue 883) owns its appearance in its own scoped block for the same
// reason, so its scale is read out of the component rather than the global sheet.
const chipPath = resolve(__dirname, '../../src/ui/svelte/components/Chip.svelte');
export const managerComponentDir = resolve(__dirname, '../../src/ui/svelte/apps/manager');
export const css = readStylesheet();
const chipSource = readFileSync(chipPath, 'utf8');

// Only the scoped `<style>` block.
const STYLE_OPEN = '\n<style>\n';

export function scopedStyles(componentSource) {
  const start = componentSource.lastIndexOf(STYLE_OPEN);
  const end = componentSource.lastIndexOf('\n</style>');
  if (start < 0 || end <= start) return '';
  return componentSource.slice(start + STYLE_OPEN.length, end).replace(/\/\*[\s\S]*?\*\//g, '');
}
export const chipStyles = scopedStyles(chipSource);

// "This name must not survive" assertions read component SOURCE.
export function withoutComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const CHAINED_MANAGER_BUTTON = String.raw`\.fabricate-button(?:\.fabricate-button)*`;
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
          .replaceAll(String.raw`\.fabricate-button`, CHAINED_MANAGER_BUTTON) +
        OPTIONAL_ENABLED_STATE
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

// The global sheet no longer styles a chip at all.
export const chipScoped = scopedComponentCss(chipPath);
export const chipCss = chipScoped.css;

export function withChipHash(markup) {
  return withScopeHash(markup, 'manager-chip', chipScoped.hashClass);
}

// ── The Checks Studio restacks at the declared floor.
//  - the workspace's `@container … (max-width: 1120px)` override tied with the base rule on
//    specificity (a container query adds none) and LOST on source order, so between 1120 and
//    961 — a band that contains the declared 1024x640 floor — `.manager-body` restacked while
//    the workspace stayed a 300px side column. The acceptance frame that exists to show a
//    stacked studio at the floor showed a side rail.
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
const managerButtonPath = resolve(__dirname, '../../src/ui/svelte/components/Button.svelte');
const managerButtonSource = readFileSync(managerButtonPath, 'utf8');

// The role modifier is read from the component's NAMED mapping rather than rebuilt here as
// `is-${role}`. `warning` emits `is-warning-action` — the sheet declares no
// `.fabricate-button.is-warning` at all — so a template would hand this harness a class string
// the product never renders, and the probe would measure a selector that matches nothing
// while reporting green (issue 1118).
const managerButtonRoleClasses = (() => {
  const mapping = managerButtonSource.match(/const ROLE_CLASSES = \{([\s\S]*?)\};/);
  assert.ok(mapping, 'Button declares its role-to-class mapping as one named object');
  return Object.fromEntries(
    [...mapping[1].matchAll(/(\w+):\s*'([\w-]+)'/g)].map(([, role, className]) => [role, className])
  );
})();

// The unconditional root, likewise read out of the component rather than restated.
const managerButtonBaseClasses = (() => {
  const literal = managerButtonSource.match(/const classes = \$derived\(\s*\[([\s\S]*?)\]/);
  assert.ok(literal, 'Button declares its emitted classes as one array literal');
  const base = [...literal[1].matchAll(/'([a-z][\w-]*)'/g)].map(([, token]) => token);
  assert.ok(
    base.includes('fabricate-button'),
    `Button must emit the family root, got ${base.join(' ')}`
  );
  return base;
})();

export function managerButtonClassesFor(role) {
  // `neutral` is the EMPTY modifier.
  if (role === 'neutral') return managerButtonBaseClasses.join(' ');
  const modifier = managerButtonRoleClasses[role];
  assert.ok(
    modifier,
    `Button must declare a class for the '${role}' role, got ${Object.keys(managerButtonRoleClasses).join(' ')}`
  );
  return `${managerButtonBaseClasses.join(' ')} ${modifier}`;
}

// `Stepper` owns its chrome in a scoped `<style>`.
export const stepperScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/components/Stepper.svelte')
);

// `SegmentedControl` owns its chrome in a scoped `<style>`: the pager's page-size control.
export const segmentedScoped = scopedComponentCss(
  resolve(__dirname, '../../src/ui/svelte/components/SegmentedControl.svelte')
);

/**
 * A pager bar as `Pagination.svelte` renders it: the summary, an optional nav and, past one option,
 * the caption and the segmented page-size control. `compact` takes the compact bar and the
 * control's `inline` rung. The control's scoped block, `segmentedScoped.css`, goes beside the sheet.
 *
 * @returns {string} The fixture markup.
 */
export function pagerBarFixture({
  probe,
  sizes = [4, 6, 12],
  value = sizes[0],
  arrows = false,
  compact = false,
  edge = false,
  summary = 'Showing 1-4 of 8',
}) {
  const hash = segmentedScoped.hashClass;
  const arrow = (side, marked) => `<button
        type="button"
        class="fabricate-icon-button"
        data-keyboard-focus="true"
        ${marked ? `data-probe="arrow-${probe}"` : ''}
      ><i class="fas fa-chevron-${side}" aria-hidden="true"></i></button>`;
  const segment = (size) => `<label
          class="manager-segment ${hash}${size === value ? ' is-active' : ''}"
          data-pagination-size-option="${size}"
        ><input type="radio" class="manager-segment-input ${hash}" name="size-${probe}"
          value="${size}" ${size === value ? 'checked' : ''}
        /><span class="manager-segment-label ${hash}">${size}</span></label>`;
  const modifiers = [compact && 'is-compact', compact && edge && 'is-edge']
    .filter(Boolean)
    .join(' ');
  return `<div class="fabricate-pagination ${modifiers}">
    <span class="manager-pagination-summary">${summary}</span>
    ${
      arrows
        ? `<nav class="manager-pagination-nav">
      ${arrow('left', true)}
      <span class="manager-pagination-page${compact ? ' manager-pagination-hidden' : ''}">Page 1 of 2</span>
      ${arrow('right', false)}
    </nav>`
        : ''
    }
    ${
      sizes.length > 1
        ? `<span class="manager-pagination-size"
      ><span id="caption-${probe}">Per page</span
      ><div class="manager-segmented ${hash}${compact ? ' is-inline' : ''}" role="radiogroup"
        aria-labelledby="caption-${probe}" data-pagination-size="" data-probe="pager-${probe}"
        >${sizes.map(segment).join('')}</div
    ></span>`
        : ''
    }
  </div>`;
}
/**
 * Order string lists deterministically. The default `sort()` coerces to string and compares UTF-16
 * units, which is exactly what these class and selector lists want, but leaving it implicit reads
 * as an oversight and trips the bug rule that cannot tell a string array from a numeric one.
 */
export function compareStrings(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
