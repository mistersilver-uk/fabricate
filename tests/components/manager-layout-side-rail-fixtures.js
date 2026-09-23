/**
 * Fixtures and the rendered-geometry reader for `manager-layout-side-rail.js` (issue 1976): the
 * fourteen routes that keep their side rail below the 1120px rung, each rendered with the
 * scroller chain its view component really emits.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLayoutContext } from '../helpers/layout-harness.js';
import { scopedComponentCss, withScopeHash } from '../helpers/scoped-component-css.js';

import { RAIL } from './manager-layout-browsers-fixtures.js';
import { css } from './manager-layout-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scopedDir = resolve(__dirname, '../../src/ui/svelte/apps/manager/scoped');
const managerDir = resolve(__dirname, '../../src/ui/svelte/apps/manager');

// The chain's scoped blocks: an unlayered scoped rule is part of the cascade the route renders.
const SCOPED = Object.freeze({
  frame: scopedComponentCss(resolve(scopedDir, 'EntityListInspectorFrame.svelte')),
  catalogue: scopedComponentCss(resolve(scopedDir, 'EntityCatalogueShell.svelte')),
  essencePage: scopedComponentCss(resolve(scopedDir, 'WorldEssenceCataloguePage.svelte')),
  essenceEntry: scopedComponentCss(resolve(scopedDir, 'WorldEssenceEntryPage.svelte')),
  toolEntry: scopedComponentCss(resolve(scopedDir, 'WorldToolEntryPage.svelte')),
  vocabulary: scopedComponentCss(resolve(managerDir, 'VocabularyShell.svelte')),
});

/** Stamp one component's hash on every element carrying one of the classes it renders. */
function hashed(markup, scoped, classNames) {
  return classNames.reduce(
    (result, className) => withScopeHash(result, className, scoped.hashClass),
    markup
  );
}

// Content far taller than any body in the ladder, so an unowned overflow is measurable. `flex: none`
// stands in for real cards, whose content height a flex column cannot shrink below.
const TALL = '<div style="flex:none;height:1600px">content</div>';
const TABS =
  '<div class="fabricate-tabs manager-editor-tabs"><button class="manager-editor-tab-button is-active">Tab</button></div>';

function componentEntryFrame(tag, extraClass) {
  return (
    `<${tag} class="${extraClass}manager-component-entry-page">` +
    `<div class="manager-component-entry-column">${TABS}` +
    `<div class="manager-component-entry-panel">${TALL}</div></div>` +
    `<aside class="manager-scoped-preview"><p>How players see it</p></aside></${tag}>`
  );
}

function worldLibrary(pageClass, announcement) {
  const live = announcement ? '<p class="visually-hidden" aria-live="polite"></p>' : '';
  return `<main class="manager-main">${live}<div class="${pageClass}">${TALL}</div></main>`;
}

function vocabularyShell(mainAttributes) {
  return hashed(
    `<main ${mainAttributes}><div class="manager-vocabulary-shell">` +
      `<div class="manager-vocabulary-shell-grid">${TALL}</div></div></main>`,
    SCOPED.vocabulary,
    ['manager-vocabulary-shell', 'manager-vocabulary-shell-grid']
  );
}

const LIST_ROWS = Array.from(
  { length: 30 },
  (_, index) =>
    `<li class="manager-scoped-list-row"><span class="manager-scoped-list-identity"><span class="manager-system-name">Entry ${index + 1}</span></span></li>`
).join('');

const FRAME_CLASSES = [
  'manager-scoped-list-frame',
  'manager-scoped-list-layout',
  'manager-scoped-list-column',
  'manager-scoped-list-rows',
  'manager-scoped-list',
  'manager-scoped-list-row',
  'manager-scoped-list-identity',
  'manager-scoped-list-inspector',
  'manager-scoped-list-inspector-scroll',
];

function catalogue(pageId, { essenceWrapper = false } = {}) {
  const frame = hashed(
    '<div class="manager-scoped-list-frame"><div class="manager-scoped-list-layout has-inspector">' +
      '<div class="manager-scoped-list-column"><div class="manager-scoped-list-rows">' +
      `<ul class="manager-scoped-list" role="list">${LIST_ROWS}</ul></div></div>` +
      '<aside class="manager-scoped-list-inspector"><div class="manager-scoped-list-inspector-scroll">' +
      `${TALL}</div></aside></div></div>`,
    SCOPED.frame,
    FRAME_CLASSES
  );
  const shell = hashed(`<div class="manager-scoped-catalogue">${frame}</div>`, SCOPED.catalogue, [
    'manager-scoped-catalogue',
  ]);
  const page = essenceWrapper
    ? hashed(`<div class="manager-scoped-essence-page">${shell}</div>`, SCOPED.essencePage, [
        'manager-scoped-essence-page',
      ])
    : shell;
  return `<main class="manager-main" data-scoped-page="${pageId}">${page}</main>`;
}

const CATALOGUE_OWNER = Object.freeze({
  wide: '.manager-scoped-list-rows',
  stacked: '.manager-scoped-list-layout',
  stackSubject: '.manager-scoped-list-layout',
});

/**
 * The fourteen side-rail routes, each as the root attributes it renders under and the scroller
 * chain its view emits. `owner.stacked` names the scroller once `owner.stackSubject` resolves to
 * one column track; a route with no such frame has one owner at every width.
 */
export const SIDE_RAIL_ROUTES = Object.freeze([
  {
    // ComponentEditView.svelte: the main IS the world entry's frame, the form its column.
    id: 'component-edit',
    rootAttributes: 'data-manager-view="component-edit"',
    main:
      '<main class="manager-main manager-component-edit-main manager-component-entry-page">' +
      `<form class="manager-component-edit-view manager-component-entry-column">${TABS}` +
      `<div class="manager-component-entry-panel">${TALL}</div></form>` +
      '<aside class="manager-scoped-preview"><p>How players see it</p></aside></main>',
    owner: {
      wide: '.manager-component-entry-panel',
      stacked: 'main.manager-component-entry-page',
      stackSubject: '.manager-component-entry-page',
    },
  },
  {
    // WorldComponentEntryPage.svelte: the frame is main's one child.
    id: 'world-component-entry',
    rootAttributes: 'data-manager-view="world-component-entry"',
    main: `<main class="manager-main" data-scoped-page="world-component-entry">${componentEntryFrame('div', '')}</main>`,
    owner: {
      wide: '.manager-component-entry-panel',
      stacked: 'div.manager-component-entry-page',
      stackSubject: '.manager-component-entry-page',
    },
  },
  {
    id: 'recipe-edit',
    rootAttributes: 'data-manager-view="recipe-edit"',
    main:
      '<main class="manager-main manager-recipe-edit-main"><div class="visually-hidden" role="status"></div>' +
      `<div class="fab-stack" data-gap="3" data-recipe-editor>${TALL}</div></main>`,
    owner: { wide: 'main.manager-recipe-edit-main' },
  },
  {
    id: 'gathering-task-edit',
    rootAttributes: 'data-manager-view="gathering-task-edit" data-gathering-task-layout="results"',
    main:
      '<main class="manager-main manager-gathering-task-edit-view" data-gathering-task-editor>' +
      `<section class="manager-task-core-card">${TALL}</section>` +
      '<section class="manager-task-core-card">Results</section></main>',
    owner: { wide: 'main.manager-gathering-task-edit-view' },
  },
  {
    id: 'world-currency',
    rootAttributes: 'data-manager-view="world-currency"',
    main: worldLibrary('manager-world-currency', false),
    owner: { wide: '.manager-world-currency' },
  },
  {
    id: 'world-prerequisites',
    rootAttributes: 'data-manager-view="world-prerequisites"',
    main: worldLibrary('manager-world-prerequisites', true),
    owner: { wide: '.manager-world-prerequisites' },
  },
  {
    id: 'world-modifiers',
    rootAttributes: 'data-manager-view="world-modifiers"',
    main: worldLibrary('manager-world-modifiers', true),
    owner: { wide: '.manager-world-modifiers' },
  },
  {
    id: 'tags',
    rootAttributes: 'data-manager-view="tags"',
    main: vocabularyShell('class="manager-main manager-tags-categories"'),
    owner: { wide: 'main.manager-tags-categories' },
  },
  {
    id: 'world-vocabulary',
    rootAttributes: 'data-manager-view="world-vocabulary"',
    main: vocabularyShell('class="manager-main" data-scoped-page="world-vocabulary"'),
    owner: { wide: '.manager-main' },
  },
  {
    id: 'world-components',
    rootAttributes: 'data-manager-view="world-components"',
    main: catalogue('world-components'),
    owner: CATALOGUE_OWNER,
    catalogue: true,
  },
  {
    id: 'world-essences',
    rootAttributes: 'data-manager-view="world-essences"',
    main: catalogue('world-essences', { essenceWrapper: true }),
    owner: CATALOGUE_OWNER,
    catalogue: true,
  },
  {
    id: 'world-tools',
    rootAttributes: 'data-manager-view="world-tools"',
    main: catalogue('world-tools'),
    owner: CATALOGUE_OWNER,
    catalogue: true,
  },
  {
    id: 'world-essence-entry',
    rootAttributes: 'data-manager-view="world-essence-entry"',
    main: hashed(
      '<main class="manager-main" data-scoped-page="world-essence-entry"><div class="manager-scoped-entry-page">' +
        `${TABS}<div class="manager-scoped-entry-panel"><div class="manager-scoped-entry-body">` +
        `<div class="manager-scoped-entry-main">${TALL}</div></div></div></div></main>`,
      SCOPED.essenceEntry,
      [
        'manager-scoped-entry-page',
        'manager-scoped-entry-panel',
        'manager-scoped-entry-body',
        'manager-scoped-entry-main',
      ]
    ),
    owner: { wide: '.manager-scoped-entry-panel' },
  },
  {
    id: 'world-tool-entry',
    rootAttributes: 'data-manager-view="world-tool-entry"',
    main: hashed(
      '<main class="manager-main" data-scoped-page="world-tool-entry"><div class="manager-world-tool-entry-columns">' +
        `<div class="manager-world-tool-entry-body">${TABS}` +
        `<div class="manager-world-tool-entry-panel">${TALL}</div></div>` +
        '<aside class="manager-scoped-preview"><p>Preview</p></aside></div></main>',
      SCOPED.toolEntry,
      [
        'manager-main',
        'manager-world-tool-entry-columns',
        'manager-world-tool-entry-body',
        'manager-world-tool-entry-panel',
      ]
    ),
    owner: { wide: '.manager-world-tool-entry-panel' },
  },
]);

const SCOPED_CSS = Object.values(SCOPED)
  .map((entry) => `<style>${entry.css}</style>`)
  .join('');

function sideRailMarkup(route, { width, height, collapsed }) {
  const bodyClass = collapsed ? 'manager-body is-rail-collapsed' : 'manager-body';
  // `.fabricate` is the application window's own class, which `.visually-hidden` is keyed on.
  return (
    `<style>${css}</style>${SCOPED_CSS}` +
    `<div class="fabricate" style="width:${width}px;height:${height}px">` +
    `<div class="fabricate-manager" ${route.rootAttributes}>` +
    '<div class="manager-titlebar">titlebar</div><div class="manager-header">header</div>' +
    `<div class="${bodyClass}">${RAIL}${route.main}</div></div></div>`
  );
}

/**
 * Render one side-rail route inside a real Manager root and read its geometry.
 *
 * @param {object} route One {@link SIDE_RAIL_ROUTES} entry.
 * @param {{ width: number, height?: number, collapsed?: boolean }} options `height` is the
 * Manager's own, so a 720px window is 686.
 * @returns {Promise<object>} boxes, scroll state and rail borders, and the catalogue list's state
 */
export async function readSideRailGeometry(route, { width, height = 686, collapsed = false }) {
  const context = await openLayoutContext({
    viewport: { width: width + 40, height: Math.max(720, height + 34) },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(sideRailMarkup(route, { width, height, collapsed }));
    return await page.evaluate(
      ({ owner, catalogue }) => {
        const at = (selector) => document.querySelector(selector);
        const box = (selector) => {
          const value = at(selector)?.getBoundingClientRect();
          return value
            ? { top: value.top, bottom: value.bottom, width: value.width, height: value.height }
            : null;
        };
        const scroll = (selector) => {
          const node = at(selector);
          return {
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
            overflowY: getComputedStyle(node).overflowY,
          };
        };
        const tracks = (selector) =>
          getComputedStyle(at(selector)).gridTemplateColumns.trim().split(/\s+/).length;
        const stacked = Boolean(owner.stackSubject) && tracks(owner.stackSubject) === 1;
        const ownerSelector = stacked ? owner.stacked : owner.wide;
        const railStyle = getComputedStyle(at('.manager-rail'));
        return {
          stacked,
          ownerSelector,
          bodyTracks: tracks('.manager-body'),
          rail: box('.manager-rail'),
          body: box('.manager-body'),
          main: box('.manager-body > main'),
          owner: box(ownerSelector),
          bodyScroll: scroll('.manager-body'),
          ownerScroll: scroll(ownerSelector),
          railScroll: scroll('.manager-rail'),
          railBorder: { right: railStyle.borderRightWidth, bottom: railStyle.borderBottomWidth },
          list: catalogue
            ? {
                layout: box('.manager-scoped-list-layout'),
                layoutScroll: scroll('.manager-scoped-list-layout'),
                rows: box('.manager-scoped-list-rows'),
              }
            : null,
        };
      },
      { owner: route.owner, catalogue: Boolean(route.catalogue) }
    );
  } finally {
    await context.close();
  }
}
