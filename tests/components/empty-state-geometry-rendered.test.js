/**
 * `EmptyState`'s specimen geometry and the party travel-actor tile's mirror of it, measured in
 * Chromium (issue 2550): the linked tile hand-copies the compact panel, so linking an actor must
 * not change the tile's height, and the `filtered` panel draws the hero's padding and edge.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { openLayoutContext } from '../helpers/layout-harness.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { attributeValue, passesProp } from '../helpers/svelteStructureContract.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const EMPTY_STATE = 'src/ui/svelte/components/EmptyState.svelte';
const ACTOR_PANEL = 'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte';

const foundryCss = readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8');
const fabricateCss = readStylesheet();
const emptyScoped = scopedComponentCss(resolve(repoRoot, EMPTY_STATE));
const panelScoped = scopedComponentCss(resolve(repoRoot, ACTOR_PANEL));

/** Add a component's scope hash to every element of its own fragment, as Svelte renders it. */
function scoped(markup, { hashClass }) {
  return markup.replaceAll(/<([a-z][\w-]*)([^>]*)>/g, (_whole, tag, attributes) =>
    /\bclass="/.test(attributes)
      ? `<${tag}${attributes.replace(/\bclass="([^"]*)"/, `class="$1 ${hashClass}"`)}>`
      : `<${tag} class="${hashClass}"${attributes}>`
  );
}

const TRAVEL_ACTOR_STRINGS = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'))
  .FABRICATE.Admin.Manager.World.Parties.TravelActor;

const emptyPanel = (classes, inner) =>
  scoped(`<div class="manager-empty ${classes}"><div>${inner}</div></div>`, emptyScoped);

const UNLINKED_TILE = `${scoped('<button type="button" class="manager-party-actor-tile">', panelScoped)}${emptyPanel(
  'is-compact',
  `<i class="fa-regular fa-circle-dot"></i><h3>${TRAVEL_ACTOR_STRINGS.None}</h3>` +
    `<p>${TRAVEL_ACTOR_STRINGS.UnlinkedNote}</p>`
)}</button>`;

const LINKED_TILE = scoped(
  `<button type="button" class="manager-party-actor-tile is-linked">
    <span class="manager-party-actor-portrait"><i class="fas fa-user"></i></span>
    <span class="manager-party-actor-name">Aldric the Wayfarer</span>
    <span class="manager-party-actor-note">${TRAVEL_ACTOR_STRINGS.LinkedNote}</span>
  </button>`,
  panelScoped
);

const FILTERED_PANEL = emptyPanel(
  'is-filtered',
  '<p>No parties match your search.</p><button type="button">Clear filters</button>'
);

/** The fixture's own classes, each of which the component's template must still draw. */
const FIXTURE_CLASSES = {
  [EMPTY_STATE]: ['manager-empty', 'is-compact', 'is-filtered'],
  [ACTOR_PANEL]: [
    'manager-party-actor-panel',
    'manager-party-actor-tile',
    'is-linked',
    'manager-party-actor-portrait',
    'manager-party-actor-name',
    'manager-party-actor-note',
  ],
};

/** Every class a template writes: static `class` tokens and `class:` directive names. */
function templateClasses(ast) {
  const classes = new Set();
  for (const node of walkNodes(ast.fragment ?? ast)) {
    if (node.type === 'ClassDirective') classes.add(node.name);
    if (node.type !== 'RegularElement') continue;
    for (const token of (attributeValue(node, 'class') ?? '').split(/\s+/)) {
      if (token) classes.add(token);
    }
  }
  return classes;
}

/** Render one tile in a `width`-wide travel-actor column and read the border-box height. */
async function renderAt(context, width, markup, selector, inks = {}) {
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <style>${foundryCss}</style><style>${fabricateCss}</style>
    <style>${emptyScoped.css}</style><style>${panelScoped.css}</style>
    <style>:root { --font-primary: Arial, sans-serif; } body { font-family: var(--font-primary); }</style>
    </head><body><div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">
    <div class="manager-party-actor-panel ${panelScoped.hashClass}" style="width:${width}px">
    ${markup}</div></div></body></html>`);
  const read = await page.$eval(selector, (element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      padding: style.padding,
      borderTopWidth: style.borderTopWidth,
    };
  });
  read.computed = {};
  for (const [name, [inkSelector, properties]] of Object.entries(inks)) {
    read.computed[name] = await page.$eval(
      inkSelector,
      (element, wanted) => {
        const style = getComputedStyle(element);
        // The tile writes `min(100%, 34ch)` where the panel writes `34ch`: same cap, so compare the cap.
        return Object.fromEntries(
          wanted.map((property) => [property, style[property].replace(/^min\(100%, (.+)\)$/, '$1')])
        );
      },
      properties
    );
  }
  await page.close();
  return read;
}

test('each fixture class is drawn by its component, so the fixtures cannot drift', () => {
  for (const [path, classes] of Object.entries(FIXTURE_CLASSES)) {
    const drawn = templateClasses(componentAstOf(path));
    assert.deepEqual(
      classes.filter((name) => !drawn.has(name)),
      [],
      `${path} no longer draws every class its fixture uses`
    );
  }
  assert.ok(passesProp(componentAstOf(ACTOR_PANEL), 'EmptyState', 'compact'));
});

test('the linked travel-actor tile matches the unlinked compact panel in height and inks', async () => {
  const tile = '.manager-party-actor-tile';
  const unlinkedInks = {
    edge: ['.manager-empty.is-compact', ['borderTopWidth']],
    portrait: ['.manager-empty.is-compact > div > i', ['color', 'backgroundColor']],
    name: ['.manager-empty h3', ['color']],
    note: ['.manager-empty p', ['color', 'fontSize', 'maxWidth']],
  };
  const linkedInks = {
    edge: [tile, ['borderTopWidth']],
    portrait: ['.manager-party-actor-portrait', ['color', 'backgroundColor']],
    name: ['.manager-party-actor-name', ['color']],
    note: ['.manager-party-actor-note', ['color', 'fontSize', 'maxWidth']],
  };
  for (const deviceScaleFactor of [1, 2]) {
    const context = await openLayoutContext({ deviceScaleFactor });
    try {
      for (const width of [220, 300]) {
        const label = `at ${width}px, scale ${deviceScaleFactor}`;
        const unlinked = await renderAt(context, width, UNLINKED_TILE, tile, unlinkedInks);
        const linked = await renderAt(context, width, LINKED_TILE, tile, linkedInks);
        assert.ok(
          Math.abs(unlinked.height - linked.height) <= 0.5,
          `${label} the linked tile is ${linked.height}px against ${unlinked.height}px unlinked`
        );
        for (const name of Object.keys(unlinkedInks)) {
          assert.deepEqual(
            linked.computed[name],
            unlinked.computed[name],
            `${label} the linked tile's ${name} differs from the unlinked panel's`
          );
        }
      }
    } finally {
      await context.close();
    }
  }
});

test('the filtered panel pads 16px on the hero edge', async () => {
  const context = await openLayoutContext({ deviceScaleFactor: 1 });
  try {
    const filtered = await renderAt(context, 300, FILTERED_PANEL, '.manager-empty.is-filtered');
    assert.equal(filtered.padding, '16px');
    assert.equal(filtered.borderTopWidth, '1px');
  } finally {
    await context.close();
  }
});
