/**
 * What the standalone style root's rendered clause measures, shared by the shard files that each
 * run it over a disjoint share of the specimen table (see `published-standalone-root-rendered.test.js`
 * for the clause and its table checks). A shard mounts its specimens through the real seam in
 * happy-dom into both hosts, draws them in one Chromium page per palette over the core-min sheets
 * and, where Foundry's chrome is harvested, over that too, and holds every state the clause names.
 * The table is dealt by entry: heaviest first, each to the shard holding the fewest specimens.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_PSEUDO_COMPARED,
  STANDALONE_SPECIMENS,
} from '../fixtures/published-components/standaloneSpecimens.js';

import { byCodePoint } from './codePointOrder.js';
import {
  harvestedFoundryChromeCss,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from './harvestedFoundryChrome.js';
import { componentAstOf } from './parsedSource.js';
import { SHIPPED, byName, importClosure, isComponent } from './publishedComponentGate.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  settle,
  shippedSeam,
} from './publishedComponentModules.js';
import { renderedPageHead } from './renderedPageHead.js';
import { scopedComponentCss } from './scoped-component-css.js';
import { createMountedComponentHarness } from './svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEME = 'data-fabricate-theme';
export const PALETTES = Object.freeze(['fabricate', 'foundry-native']);
const HOSTS = Object.freeze(['window', 'bare']);
/** The widened entries another file measures, by name, which keeps each shard inside its timeout. */
export const MEASURED_ELSEWHERE = Object.freeze({
  SelectionCheckbox: 'tests/components/published-standalone-root-rendered-checkbox.test.js',
  Disclosure: 'tests/components/published-standalone-root-rendered-disclosure.test.js',
  Typeahead: 'tests/components/published-standalone-root-rendered-typeahead.test.js',
  Popover: 'tests/components/published-standalone-root-rendered-popover.test.js',
});
export const WIDENED = PUBLISHED_COMPONENT_MANIFEST.filter(
  (entry) => entry.standaloneRoot === true && !Object.hasOwn(MEASURED_ELSEWHERE, entry.name)
);
/** The components with a `<style>` in the widened entries' import closures, by path. */
const SCOPED_PATHS = [...new Set(WIDENED.flatMap(({ path }) => [...importClosure(path, SHIPPED)]))]
  .filter((path) => isComponent(path) && Boolean(componentAstOf(path).css))
  .sort(byName);
export const SCOPED = SCOPED_PATHS.map((path) => basename(path, '.svelte'));
/** The hash class each of those components' rules carry, in the same order. */
export const scopedHashes = () =>
  SCOPED_PATHS.map((path) => scopedComponentCss(resolve(repoRoot, path)).hashClass);

/**
 * The entries whose specimens draw an element with a resting transition under the root, in table
 * order; a `Modal` keeps one empty element there, and its dialog is on the layer.
 */
export const MOVERS = Object.freeze([
  'Button',
  'StatusToggle',
  'Stepper',
  'SearchField',
  'Select',
  'Field',
  'IconButton',
  'EditorTabs',
  'Pagination',
  'IconPicker',
  'ActionMenu',
  'ToggleCard',
]);
/**
 * What the harness writes on both targets; ink is left to each host. The width is the companion's
 * own, because core pads a bare `.window-content` and the player window's sheet does not.
 */
const targetFace = (width) =>
  `width: ${width}px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px`;
const DEFAULT_WIDTH = 280;
const fixture = (name) => readFileSync(resolve(repoRoot, `tests/fixtures/${name}`), 'utf8');
const CORE_MIN_SHEETS = Object.freeze([
  fixture('foundry-core-button-min.css'),
  fixture('foundry-core-input-min.css'),
]);
/**
 * The bare inputs read to hold the core sheets' order and the input fixture's geometry, outline
 * and transition, and what is read on them. Colours and `outline-color` are left out: core
 * transitions `outline-color` over 0.5s and the probe reads straight after `focus()`.
 */
const PROBED_TYPES = Object.freeze(['text', 'number', 'search']);
const PROBED = Object.freeze([
  'height',
  'line-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-radius',
  'outline-style',
  'outline-width',
  'outline-offset',
  'transition-duration',
]);

export const SPECIMENS = Object.entries(STANDALONE_SPECIMENS).flatMap(([name, specimens]) =>
  Object.entries(specimens).map(([id, specimen]) => ({
    name,
    id,
    ...specimen,
    width: specimen.width ?? DEFAULT_WIDTH,
  }))
);

/** The entries whose own tests run only in the shard holding them. */
export const ENTRY_OF = Object.freeze({
  toggleCard: 'ToggleCard',
  pager: 'Pagination',
  footer: 'Modal',
});

export const SHARD_COUNT = 4;

/** The shard file that measures shard `index`, repo-relative, as the chrome step of the workflow names it. */
export const shardFile = (index, count = SHARD_COUNT) =>
  `tests/components/published-standalone-root-rendered-${index + 1}-of-${count}.test.js`;

/**
 * The names of `table`'s entries dealt to `count` shards, each in table order: the heaviest entry
 * first, each to the shard holding the fewest specimens so far, ties to the lowest index.
 */
export function partitionEntries(table, count) {
  const weight = (name) => Object.keys(table[name]).length;
  const shards = Array.from({ length: count }, () => ({ names: [], held: 0 }));
  const heaviest = Object.keys(table).sort((a, b) => weight(b) - weight(a) || byCodePoint(a, b));
  for (const name of heaviest) {
    const lightest = shards.reduce(
      (least, each) => (each.held < least.held ? each : least),
      shards[0]
    );
    lightest.names.push(name);
    lightest.held += weight(name);
  }
  return shards.map(({ names }) => Object.keys(table).filter((name) => names.includes(name)));
}

/** Fails, naming each id, unless `measuredBy` (one list of ids per shard) holds every `expected` id once. */
export function assertMeasuredOnce(measuredBy, expected, label) {
  const counts = new Map(expected.map((id) => [id, 0]));
  const strangers = [];
  for (const id of measuredBy.flat()) {
    if (counts.has(id)) counts.set(id, counts.get(id) + 1);
    else strangers.push(id);
  }
  const wrong = [...counts]
    .filter(([, count]) => count !== 1)
    .map(([id, count]) => `${id} x${count}`);
  assert.deepEqual({ wrong, strangers }, { wrong: [], strangers: [] }, label);
}

/** The specimens shard `index` measures, and the subsets of them each state is read on. */
export function standaloneShard(index, count = SHARD_COUNT) {
  const entries = partitionEntries(STANDALONE_SPECIMENS, count)[index];
  const specimens = SPECIMENS.filter(({ name }) => entries.includes(name));
  return {
    index,
    entries,
    specimens,
    focused: specimens.filter(({ reach }) => reach.focus !== null),
    hovered: specimens.filter(({ reach }) => reach.hover !== null),
    switches: specimens.filter(({ name }) => name === 'StatusToggle'),
    /** The specimens drawn with a panel open: each with opening steps, and every `Modal`. */
    opened: specimens.filter(({ name, open }) => Boolean(open) || name === 'Modal'),
  };
}

/** Writes each field's live value and checked state, which Svelte sets as properties, as attributes. */
function writeFieldState(target) {
  for (const field of target?.querySelectorAll('input, textarea') ?? []) {
    if (field.type === 'radio' || field.type === 'checkbox') {
      field.toggleAttribute('checked', field.checked);
    } else if (field.localName === 'textarea') field.textContent = field.value;
    else field.setAttribute('value', field.value);
  }
}

/**
 * happy-dom lays nothing out, so the window's frame measures as the viewport the standalone layer
 * measures as, and a panel's private placement is computed from the same host box in both. In
 * Chromium the frame is no containing block in either arm, as core-min positions no
 * `.application` and `HOSTS_IN_FLOW` lays it static, so its panel too is placed from the page's
 * origin, where the viewport starts.
 */
function viewportOf() {
  const { innerWidth: width, innerHeight: height } = document.defaultView;
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 };
}

/** Runs a specimen's opening steps on the trigger in `target` and the panel they open. */
async function openPanel(target, steps) {
  const trigger = target.querySelector('button');
  for (const step of steps) {
    if (step.key) {
      trigger.focus();
      const { KeyboardEvent } = target.ownerDocument.defaultView;
      const init = { key: step.key, bubbles: true, cancelable: true };
      trigger.dispatchEvent(new KeyboardEvent('keydown', init));
    }
    if (step.click) trigger.click();
    if (step.query !== undefined) {
      const field = target.ownerDocument.querySelector('[role="dialog"]').querySelector('input');
      field.value = step.query;
      field.dispatchEvent(new target.ownerDocument.defaultView.Event('input', { bubbles: true }));
    }
    flushSync();
    await settle();
  }
}

/**
 * Where the seam drew a specimen's open panel: the container it holds in the window's frame, or
 * the standalone layer on `<body>` with its container; `null` where nothing is open.
 */
function drawnPanel(frame, content) {
  const containers = [...frame.children].filter((child) => child !== content);
  assert.ok(containers.length <= 1, 'at most one panel container in the frame');
  const layers = document.body.querySelectorAll(':scope > .fabricate-standalone-overlay');
  assert.ok(layers.length <= 1, 'at most one standalone layer');
  return containers[0] ?? layers[0] ?? null;
}

/**
 * One specimen's target and open panel as drawn under a frame classed `classes`, with companion
 * content in its slots and a panel opened by its steps.
 */
async function drawnMarkup(ui, specimen, { host, classes, palette }) {
  const { name, props, width, slot, slots, nest, open } = specimen;
  const frame = document.createElement('div');
  frame.className = classes;
  if (palette) frame.setAttribute(THEME, palette);
  if (host === 'window') frame.getBoundingClientRect = viewportOf;
  const content = document.createElement('div');
  content.className = 'window-content';
  const target = document.createElement('div');
  target.setAttribute('data-target', '');
  target.setAttribute('style', targetFace(width));
  content.append(target);
  frame.append(content);
  document.body.append(frame);
  const handle = ui.mount(name, { target, props });
  const children = handle.slot('children');
  let nested = null;
  if (children) {
    children.innerHTML = slot ?? '<p>Moonpetal</p>';
    if (nest) {
      const holder = document.createElement('div');
      children.append(holder);
      nested = ui.mount(nest.name, { target: holder, props: nest.props });
    }
  }
  for (const [key, html] of Object.entries(slots ?? {})) handle.slot(key).innerHTML = html;
  flushSync();
  if (open) await openPanel(target, open);
  const panel = drawnPanel(frame, content);
  writeFieldState(target);
  writeFieldState(panel);
  const html = { target: target.outerHTML, panel: panel?.outerHTML ?? null };
  nested?.destroy();
  handle.destroy();
  frame.remove();
  await settle();
  assert.ok(!drawnPanel(frame, content), `${specimen.id} leaves no panel once destroyed`);
  return html;
}

/** Each palette's markup per specimen and host, mounted through the shipped seam in happy-dom. */
export async function mountSpecimens(specimens) {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-standalone-root-rendered-',
    rawModules: PUBLISHED_RAW_MODULES,
    runeModules: PUBLISHED_RUNE_MODULES,
    compiledModules: PUBLISHED_COMPILED_MODULES,
    componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
  });
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report: assert.fail });
    const markup = {};
    for (const palette of PALETTES) {
      document.documentElement.setAttribute(THEME, palette);
      markup[palette] = {};
      for (const specimen of specimens) {
        markup[palette][specimen.id] = {
          window: await drawnMarkup(ui, specimen, {
            host: 'window',
            classes: 'application fabricate fabricate-app',
            palette,
          }),
          bare: await drawnMarkup(ui, specimen, { host: 'bare', classes: 'application' }),
        };
      }
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/**
 * Layout only, on the page's own hooks: a panel's wrapper draws no box, and every panel but the one
 * whose host is being read draws nothing, so no two panels overlap.
 */
const PANELS_SHOWN_ONE_AT_A_TIME = `<style>[data-panel] { display: contents; }
[data-panel]:not([data-shown]) { display: none; }</style>`;

/**
 * What the page's own functions share: a host's target, what the seam drew in it, and the
 * container its open panel sits in, inside the frame or on the standalone layer.
 */
const PARTS_SCRIPT = `<script>
window.standaloneParts = (id, host) => {
  const target = document.querySelector('[data-host="' + id + '-' + host + '"] [data-target]');
  const holder = document.querySelector('[data-panel="' + id + '-' + host + '"]')?.lastElementChild;
  const container = (host === 'bare' ? holder?.firstElementChild : holder) ?? null;
  return { target, drawnIn: host === 'bare' ? target.firstElementChild : target, container };
};
</script>`;

/** A host's open panel, after a sentinel of its own that Tab into the panel starts from. */
const panelWrapper = (id, host, panel) =>
  panel
    ? `<div data-panel="${id}-${host}"><button type="button" data-sentinel="${id}-${host}-panel">Before</button>${panel}</div>`
    : '';

/**
 * The page: `sheets` laid down first, then core-min, the module sheet and the scoped styles. The
 * body states the typeface the player window draws in, so the bare host's target, the window's
 * frame and a panel on the standalone layer all start from one face.
 */
function pageFor(specimens, markup, palette, sheets) {
  const head = renderedPageHead(SCOPED);
  const meta = '<meta charset="utf-8">';
  assert.equal(head.split(meta).length, 2, 'one charset tag to lay the core sheets after');
  const laid = head.replace(
    meta,
    () =>
      `${meta}${sheets.map((css) => `<style>${css}</style>`).join('')}${PANELS_SHOWN_ONE_AT_A_TIME}`
  );
  const probes = `<div data-probe-inputs>${PROBED_TYPES.map((type) => `<input type="${type}">`).join('')}<div data-probe-height style="height: var(--input-height)"></div></div>`;
  const sections = specimens.map(({ id, width }) => {
    const frames = HOSTS.map((host) => {
      const classes =
        host === 'window'
          ? `application fabricate fabricate-app" ${THEME}="${palette}`
          : 'application';
      const { target, panel } = markup[id][host];
      const framed = host === 'window' ? panelWrapper(id, host, panel) : '';
      return `<button type="button" data-sentinel="${id}-${host}">Before</button>
<div class="${classes}" data-host="${id}-${host}" style="width:${width + 60}px"><div class="window-content">${target}</div>${framed}</div>`;
    });
    return `<section data-specimen="${id}" style="display:flex;gap:24px;align-items:flex-start;padding:8px 0">${frames.join('')}</section>`;
  });
  const layered = specimens.map(({ id }) => panelWrapper(id, 'bare', markup[id].bare.panel));
  return `${laid}<body class="game" style="margin:0;padding:48px 24px;font-family:Arial, sans-serif">${PARTS_SCRIPT}${probes}\n${sections.join('\n')}${layered.join('')}</body></html>`;
}

/**
 * Each element the specimen draws in `host`, in tree order, its target's and then its open
 * panel's: its tag, properties, pseudo elements and border box, a panel's measured from the panel.
 */
function readHost({ id, host, properties, pseudo }) {
  const { target, drawnIn, container } = globalThis.standaloneParts(id, host);
  const origin = target.getBoundingClientRect();
  const panelOrigin = container?.firstElementChild?.getBoundingClientRect();
  const pick = (style, names) =>
    Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  const drawn = [
    ...[...drawnIn.querySelectorAll('*')].map((element) => ({ element, origin })),
    ...[...(container?.querySelectorAll('*') ?? [])].map((element) => ({
      element,
      origin: panelOrigin,
      scope: 'panel',
    })),
  ];
  return drawn.map(({ element, origin, scope }) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const field = element.localName === 'input' || element.localName === 'textarea';
    const pseudos = field ? ['::before', '::after', '::placeholder'] : ['::before', '::after'];
    return {
      tag: element.localName,
      properties: pick(style, properties),
      pseudo: Object.fromEntries(
        pseudos.map((which) => [which, pick(getComputedStyle(element, which), pseudo)])
      ),
      // A `display: contents` or `display: none` element makes no box, so it has no offset to compare.
      box:
        style.display === 'contents' || style.display === 'none'
          ? null
          : [box.width, box.height, box.left - origin.left, box.top - origin.top].map(Math.round),
      ...(scope && { scope }),
    };
  });
}

/**
 * The tree-order span, among what `readHost` reads, of the first element `selector` names in
 * `host`'s target or open panel, as `scope` says, and its descendants, as `[first, end)`; `first`
 * is -1 where nothing matches.
 */
function spanIn({ id, host, scope, selector }) {
  const { target, drawnIn, container } = globalThis.standaloneParts(id, host);
  const named = (scope === 'panel' ? container : target)?.querySelector(selector) ?? null;
  const read = [...drawnIn.querySelectorAll('*'), ...(container?.querySelectorAll('*') ?? [])];
  const first = read.indexOf(named);
  return [first, first + 1 + (named?.querySelectorAll('*').length ?? 0)];
}

/** What the specimen in `host` answers: the focus its reach names, keyboard focus, hover, reduced motion. */
function reachOf({ id, host, focus, hover }) {
  const frame = document.querySelector(`[data-host="${id}-${host}"]`);
  const panel = document.querySelector(`[data-panel="${id}-${host}"]`);
  const { target, container } = globalThis.standaloneParts(id, host);
  const find = (at) =>
    at ? ((at.scope === 'panel' ? container : target)?.querySelector(at.selector) ?? null) : null;
  const focused = find(focus);
  const hovered = find(hover);
  const inside = (node) => frame.contains(node) || Boolean(panel?.contains(node));
  return {
    active: focus ? document.activeElement === focused : !inside(document.activeElement),
    focusVisible: focused ? focused.matches(':focus-visible') : null,
    hovered: hovered ? hovered.matches(':hover') : null,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** The bare inputs at rest and under `:focus`, and the height `--input-height` resolves to. */
function probeInputs({ properties }) {
  const pick = (element) =>
    Object.fromEntries(
      properties.map((name) => [name, getComputedStyle(element).getPropertyValue(name)])
    );
  const inputs = [...document.querySelectorAll('[data-probe-inputs] input')];
  return {
    inputHeight: getComputedStyle(document.querySelector('[data-probe-height]')).height,
    inputs: inputs.map((input) => {
      const rest = pick(input);
      input.focus();
      const focused = pick(input);
      input.blur();
      return { type: input.type, rest, focus: focused };
    }),
  };
}

/** For each scoped hash class: whether a rule names it, and how many elements of the page carry it. */
function scopedPresence({ hashes }) {
  const named = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      for (const hash of hashes) if (rule.selectorText?.includes(`.${hash}`)) named.add(hash);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) walk(sheet.cssRules);
  return hashes.map((hash) => ({
    named: named.has(hash),
    anywhere: document.querySelectorAll(`.${hash}`).length,
  }));
}

/** Whether the pager in each host lays its parts on more than one row. */
function pagerWraps({ id }) {
  return ['window', 'bare'].map((host) => {
    const pager = document.querySelector(`[data-host="${id}-${host}"] .fabricate-pagination`);
    const parts = [...pager.children].map((part) => part.getBoundingClientRect());
    return parts.some((one) => parts.some((other) => other.top >= one.bottom - 0.5));
  });
}

/** The open dialog's footer in `host`: its buttons' widths, its column gap and its content width. */
function equalFooter({ id, host }) {
  const { container } = globalThis.standaloneParts(id, host);
  const footer = container.querySelector('.manager-modal-footer');
  const style = getComputedStyle(footer);
  const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  return {
    widths: [...footer.querySelectorAll('button')].map((b) => b.getBoundingClientRect().width),
    gap: Number.parseFloat(style.columnGap),
    content: footer.clientWidth - padding,
  };
}

/**
 * Past the fonts and every running animation and transition on an element in `scopes`, selectors,
 * or in the whole page; transitions stay on, so a read never lands mid-transition.
 */
async function settled(tab, scopes = null) {
  await tab.evaluate(async (selectors) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    await frame();
    await frame();
    await document.fonts.ready;
    const within = selectors
      ? selectors.map((selector) => document.querySelector(selector)).filter(Boolean)
      : [document.documentElement];
    const running = document
      .getAnimations()
      .filter((animation) =>
        within.some((node) => node.contains(animation.effect?.target ?? null))
      );
    await Promise.all(running.map((animation) => animation.finished.catch(() => {})));
    await frame();
  }, scopes);
}

const hostOf = (id, host) => `[data-host="${id}-${host}"]`;
const panelOf = (id, host) => `[data-panel="${id}-${host}"]`;
const scopesOf = (id, host) => [hostOf(id, host), panelOf(id, host)];

/**
 * A reach selector as `{ scope, selector }`: inside the target, or inside the open panel where it
 * is written `{ panel }`.
 */
const scoped = (selector) => {
  if (selector === null) return null;
  if (typeof selector === 'string') return { scope: 'target', selector };
  return { scope: 'panel', selector: selector.panel };
};

/** Shows the open panel of `id` in `host` alone, and settles where that changed what is drawn. */
async function showPanel(tab, id, host) {
  const changed = await tab.evaluate((shown) => {
    let toggled = false;
    for (const wrapper of document.querySelectorAll('[data-panel]')) {
      const show = wrapper.dataset.panel === shown;
      if (wrapper.hasAttribute('data-shown') !== show) toggled = true;
      wrapper.toggleAttribute('data-shown', show);
    }
    return toggled;
  }, `${id}-${host}`);
  if (changed) await settled(tab, scopesOf(id, host));
}

const read = async (tab, id, host) => {
  await showPanel(tab, id, host);
  return tab.evaluate(readHost, {
    id,
    host,
    properties: STANDALONE_COMPARED,
    pseudo: STANDALONE_PSEUDO_COMPARED,
  });
};
const reach = (tab, { id, reach: { focus, hover } }, host) =>
  tab.evaluate(reachOf, { id, host, focus: scoped(focus), hover: scoped(hover) });
const spanOf = (tab, id, host, selector) => tab.evaluate(spanIn, { id, host, ...scoped(selector) });

async function bothHosts(readOne) {
  const reads = {};
  for (const host of HOSTS) reads[host] = await readOne(host);
  return reads;
}

/**
 * Sizes the viewport to the whole page, so no host needs a scroll to be hovered or focused, and
 * fails by name where a host still lies outside it.
 */
async function fitViewport(tab) {
  const extent = () =>
    tab.evaluate(() => {
      const hosts = [...document.querySelectorAll('[data-host]')].map((host) =>
        host.getBoundingClientRect()
      );
      return {
        width: Math.ceil(
          Math.max(document.documentElement.scrollWidth, ...hosts.map((r) => r.right))
        ),
        height: Math.ceil(
          Math.max(document.documentElement.scrollHeight, ...hosts.map((r) => r.bottom))
        ),
      };
    });
  for (let pass = 0; pass < 2; pass += 1) {
    const { width, height } = await extent();
    await tab.setViewportSize({
      width: Math.max(1280, width + 24),
      height: Math.max(900, height + 24),
    });
  }
  const outside = await tab.evaluate(() =>
    [...document.querySelectorAll('[data-host]')]
      .filter((host) => {
        const box = host.getBoundingClientRect();
        return box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight;
      })
      .map((host) => host.dataset.host)
  );
  assert.deepEqual(outside, [], 'every host lies inside the viewport');
}

/** Tab from each sentinel: where it lands, and for a reachable specimen the reads under keyboard focus. */
async function measureFocus(tab, reads, specimens) {
  for (const specimen of specimens) {
    const { id, reach: specimenReach } = specimen;
    reads.reach[id] = { focus: {}, hover: {}, mark: {} };
    const focused = await bothHosts(async (host) => {
      await showPanel(tab, id, host);
      const fromPanel = scoped(specimenReach.focus)?.scope === 'panel';
      await tab.focus(`[data-sentinel="${id}-${host}${fromPanel ? '-panel' : ''}"]`);
      await tab.keyboard.press('Tab');
      await settled(tab, scopesOf(id, host));
      reads.reach[id].focus[host] = await reach(tab, specimen, host);
      if (specimenReach.focus === null) return null;
      const [markIndex] = await spanOf(tab, id, host, specimenReach.mark.selector);
      reads.reach[id].mark[host] = markIndex;
      const drawn = await read(tab, id, host);
      await tab.evaluate(() => document.activeElement?.blur());
      return drawn;
    });
    if (specimenReach.focus !== null) reads.focus[id] = focused;
  }
  await tab.evaluate(() => document.activeElement?.blur());
  await settled(tab);
}

/** Each hover target under one real pointer move, parked at (0,0) before and after. */
async function measureHover(tab, reads, hovered) {
  for (const specimen of hovered) {
    const { id, reach: specimenReach } = specimen;
    reads.hover[id] = await bothHosts(async (host) => {
      await showPanel(tab, id, host);
      await tab.mouse.move(0, 0);
      await settled(tab, scopesOf(id, host));
      reads.reach[id].hoverSpan ??= {};
      reads.reach[id].hoverSpan[host] = await spanOf(tab, id, host, specimenReach.hover);
      const { scope, selector } = scoped(specimenReach.hover);
      const within = scope === 'panel' ? panelOf(id, host) : `${hostOf(id, host)} [data-target]`;
      await tab.hover(`${within} ${selector}`);
      await settled(tab, scopesOf(id, host));
      reads.reach[id].hover[host] = await reach(tab, specimen, host);
      const hovered = await read(tab, id, host);
      await tab.mouse.move(0, 0);
      return hovered;
    });
  }
}

/** A page for `palette` over `sheets`, and every read the clause compares, state by state. */
async function measure(browser, { specimens, hovered, switches }, markup, palette, sheets) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(pageFor(specimens, markup[palette], palette, sheets), { waitUntil: 'load' });
  await fitViewport(tab);
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  await settled(tab);
  const reads = { rest: {}, focus: {}, hover: {}, reduced: {}, forced: {}, reach: {} };
  for (const { id } of specimens) {
    reads.rest[id] = await bothHosts((host) => read(tab, id, host));
  }
  reads.probes = await tab.evaluate(probeInputs, { properties: PROBED });
  await measureFocus(tab, reads, specimens);
  await measureHover(tab, reads, hovered);
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  await settled(tab);
  reads.reducedQuery = (await reach(tab, specimens[0], 'bare')).reduced;
  for (const { id } of specimens) {
    reads.reduced[id] = await bothHosts((host) => read(tab, id, host));
  }
  await tab.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await settled(tab);
  for (const { id } of switches) {
    reads.forced[id] = await bothHosts((host) => read(tab, id, host));
  }
  await tab.emulateMedia({ forcedColors: 'none' });
  await settled(tab);
  return { tab, reads };
}

/**
 * The bare host's elements' colours at rest and transition durations under reduced motion, with
 * the standalone style root's classes stripped and then restored.
 */
async function rootedReads(tab, id) {
  const bareTarget = `${hostOf(id, 'bare')} [data-target]`;
  const classes = await tab.evaluate(
    (selector) => document.querySelector(selector).firstElementChild.className,
    bareTarget
  );
  const probe = ({ selector, className }) => {
    document.querySelector(selector).firstElementChild.className = className;
  };
  const sample = async (className) => {
    await tab.evaluate(probe, { selector: bareTarget, className });
    await settled(tab, [hostOf(id, 'bare')]);
    const [first] = await read(tab, id, 'bare');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await read(tab, id, 'bare');
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    return {
      color: first.properties.color,
      durations: reduced.map(({ properties }) => properties['transition-duration']),
    };
  };
  const stripped = await sample('');
  const rooted = await sample(classes);
  await settled(tab);
  return { stripped, rooted, classes };
}

/** Each open panel, shown alone, lies inside the viewport in both hosts. */
async function assertPanelsInViewport(tab, opened) {
  for (const { id } of opened) {
    for (const host of HOSTS) {
      await showPanel(tab, id, host);
      const inside = await tab.evaluate(
        (shown) => {
          const { container } = globalThis.standaloneParts(shown.id, shown.host);
          const box = container.firstElementChild.getBoundingClientRect();
          const { innerWidth, innerHeight } = globalThis;
          return (
            box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
          );
        },
        { id, host }
      );
      assert.ok(inside, `${id}'s panel in the ${host} host lies inside the viewport`);
    }
  }
}

/**
 * What the pointer hits at the centre of an element of the page beside an open bare panel, and at
 * the panel's own centre: whether each hit lies on the standalone layer, and in the panel.
 */
function layerHits({ id }) {
  const { container } = globalThis.standaloneParts(id, 'bare');
  const panel = container.firstElementChild.getBoundingClientRect();
  const centre = (box) => [box.left + box.width / 2, box.top + box.height / 2];
  const outsidePanel = ([x, y]) =>
    x < panel.left || x > panel.right || y < panel.top || y > panel.bottom;
  const beside = [`[data-sentinel="${id}-bare"]`, `[data-host="${id}-bare"]`, '[data-probe-inputs]']
    .map((selector) => centre(document.querySelector(selector).getBoundingClientRect()))
    .find(outsidePanel);
  const hit = (point) => (point ? document.elementFromPoint(point[0], point[1]) : null);
  const onLayer = (node) => Boolean(node?.closest('.fabricate-standalone-overlay'));
  const besideHit = hit(beside);
  const panelHit = hit(centre(panel));
  return {
    beside: Boolean(beside),
    besideOnLayer: onLayer(besideHit),
    panelInPanel: Boolean(panelHit && container.contains(panelHit)),
  };
}

/** The standalone layer takes no pointer beside an open panel, and the panel takes it. */
async function assertLayerPassesPointer(tab, opened) {
  for (const { id } of opened) {
    await showPanel(tab, id, 'bare');
    const hits = await tab.evaluate(layerHits, { id });
    assert.deepEqual(
      hits,
      { beside: true, besideOnLayer: false, panelInPanel: true },
      `${id}: a press beside the panel reaches the page, and one on it the panel`
    );
  }
}

const STATES = Object.freeze(['rest', 'focus', 'hover', 'reduced', 'forced']);

/** Each state's reads, both hosts equal, element by element. */
function assertHostsAlike(reads, label) {
  for (const state of STATES) {
    for (const [id, { window, bare }] of Object.entries(reads[state])) {
      assert.ok(window.length > 0, `${id} draws an element in the window (${label})`);
      for (const element of [...window, ...bare]) {
        const empty = Object.entries(element.properties).filter(([, value]) => value === '');
        assert.deepEqual(empty, [], `${id} computes every compared property (${label})`);
      }
      assert.deepEqual(bare, window, `${id} ${state} draws alike in both hosts (${label})`);
    }
  }
}

/** Keyboard focus lands where each reach names, nowhere for the declared ones, and changes its mark. */
function assertFocusReach(reads, specimens) {
  for (const {
    id,
    reach: { focus, mark },
  } of specimens) {
    for (const host of HOSTS) {
      const answered = reads.reach[id].focus[host];
      if (focus === null) {
        assert.ok(answered.active, `Tab reaches nothing in ${id} ${host}`);
        continue;
      }
      assert.ok(
        answered.active && answered.focusVisible,
        `${id} ${host} focuses ${JSON.stringify(focus)}`
      );
      const index = reads.reach[id].mark[host];
      assert.ok(index >= 0, `${id} ${host} draws ${JSON.stringify(mark.selector)}`);
      const at = (state) =>
        mark.properties.map((name) => reads[state][id][host][index].properties[name]);
      assert.notDeepEqual(at('focus'), at('rest'), `${id} ${host} draws its keyboard mark`);
      const marked = reads.focus[id][host][index].properties;
      assert.ok(markShows(marked, mark.properties), `${id} ${host}'s keyboard mark is visible`);
    }
  }
}

/** A computed colour's alpha: `transparent` is 0, an `rgb()` with no alpha 1. */
function alphaOf(colour) {
  if (colour === 'transparent') return 0;
  const alpha = /^rgba\(.*,\s*([\d.]+)\)$/.exec(colour) ?? /\/\s*([\d.]+)\)$/.exec(colour);
  return alpha ? Number(alpha[1]) : 1;
}

/** Whether a focus mark is drawn: a ring with a style, a width and an ink, else inked colours. */
function markShows(marked, properties) {
  // ratchet-exempt(source-pin): membership in a list of CSS property names, not source text
  if (properties.includes('outline-style')) {
    return (
      marked['outline-style'] !== 'none' &&
      marked['outline-width'] !== '0px' &&
      alphaOf(marked['outline-color']) > 0
    );
  }
  return properties.every((name) => alphaOf(marked[name]) > 0);
}

/** Each hover target is under the pointer, and an enabled one changes what it or a descendant computes. */
function assertHoverReach(reads, hovered) {
  for (const {
    id,
    reach: { hover, inert },
  } of hovered) {
    for (const host of HOSTS) {
      const named = JSON.stringify(hover);
      assert.ok(reads.reach[id].hover[host].hovered, `${id} ${host} ${named} is under the pointer`);
      if (inert) continue;
      const [first, end] = reads.reach[id].hoverSpan[host];
      assert.ok(first >= 0, `${id} ${host} draws ${named}`);
      const at = (state) =>
        reads[state][id][host].slice(first, end).map(({ properties }) => properties);
      assert.notDeepEqual(at('hover'), at('rest'), `${id} ${host} draws a hover state on ${named}`);
    }
  }
}

/** Whether an element the root draws, not one of an open panel, rests with a transition. */
const movesAtRest = (element) =>
  element.scope !== 'panel' && /[1-9]/.test(element.properties['transition-duration']);

/** The first of `name`'s specimens whose bare host draws an element with a resting transition. */
function movingSpecimen(reads, specimens, name) {
  return specimens.find(
    (specimen) => specimen.name === name && reads.rest[specimen.id].bare.some(movesAtRest)
  );
}

/**
 * Layout only, written on both hosts alike: core places every `.application` as a window, absolute
 * and stacked, and may fix and clip the page, so the page grows to its content and each host is
 * laid back in flow, unclipped, beside its sentinel, and is no containing block, as in the
 * core-min arm, so an open panel is placed from the page's origin as `viewportOf` measures it.
 * None of these is inherited or compared, and every box offset is measured from `target` or the
 * panel, so a difference core makes between the hosts stays.
 */
const HOSTS_IN_FLOW = `html, body {
  display: block; position: static; inset: auto; width: auto; height: auto;
  min-height: 0; max-height: none; overflow: visible; transform: none;
}
[data-host] {
  position: static; inset: auto; transform: none; z-index: auto; contain: none;
  container-type: normal; filter: none; perspective: none; will-change: auto;
  backdrop-filter: none; translate: none; rotate: none; scale: none;
  margin: 0; height: auto; max-height: none; min-width: 0; overflow: visible;
}
[data-host] > .window-content { overflow: visible; }`;
const fontAwesome = () => {
  const cache = resolveChromeCache(repoRoot);
  return readFileSync(join(cache.dir, 'fonts', 'fontawesome', 'css', 'all.min.css'), 'utf8');
};

/**
 * Registers shard `index`'s suites: its specimens in the core-min palettes, the two palettes
 * against each other, and, where Foundry's chrome is harvested, the harvested arm.
 */
export function defineStandaloneRootShard(index) {
  const shard = standaloneShard(index);
  const { entries, specimens, hovered, opened, focused } = shard;
  const movers = MOVERS.filter((name) => entries.includes(name));
  /** `it`, registered only in the shard that measures `entry`. */
  const itOf = (entry) => (entries.includes(entry) ? it : () => {});
  const title = (text) => `shard ${index + 1} of ${SHARD_COUNT}: ${text}`;
  const chrome = harvestedFoundryChromeCss(repoRoot);
  registerChromeRunnerGuards({ repoRoot, suitePath: shardFile(index), chrome });
  const skip = skipWithoutHarvest(chrome);
  let browser;
  let markup;
  /** Each palette's page and reads over the core-min sheets, measured in parallel pages. */
  const MEASURED = {};
  /** The harvested arm's measurement, started beside the palettes' and settled as `{ value | error }`. */
  let harvested = null;

  before(
    async () => {
      markup = await mountSpecimens(specimens);
      browser = await chromium.launch();
      if (chrome) {
        harvested = measure(browser, shard, markup, 'fabricate', [
          chrome,
          fontAwesome(),
          HOSTS_IN_FLOW,
        ]).then(
          (value) => ({ value }),
          (error) => ({ error })
        );
      }
      const pages = await Promise.all(
        PALETTES.map((palette) => measure(browser, shard, markup, palette, CORE_MIN_SHEETS))
      );
      for (const [at, palette] of PALETTES.entries()) MEASURED[palette] = pages[at];
    },
    { timeout: 900_000 }
  );

  after(async () => {
    await browser?.close();
  });

  for (const palette of PALETTES) {
    describe(
      title(`the widened entries in the ${palette} palette, over the core-min sheets`),
      () => {
        let measured;

        before(() => {
          measured = MEASURED[palette];
        });

        itOf(ENTRY_OF.toggleCard)(
          'draws a ToggleCard second line in the muted ink, or the secondary ink on a toned, on card, and no larger than its title, and a long title inside its target',
          async () => {
            const cards = specimens.filter(({ name }) => name === 'ToggleCard');
            assert.ok(
              cards.some(({ id }) => id === 'card-long-title'),
              'a long-title card is drawn'
            );
            for (const { id, width, props } of cards) {
              const toned = props.on === true && ['enabled', 'locked', 'info'].includes(props.tone);
              const subInk = toned ? 'var(--fab-text-secondary)' : 'var(--fab-text-muted)';
              for (const host of HOSTS) {
                const muted = await measured.tab.evaluate(
                  ([selector, ink]) => {
                    const probe = document.createElement('span');
                    probe.style.color = ink;
                    document.querySelector(selector).firstElementChild.append(probe);
                    const { color } = getComputedStyle(probe);
                    probe.remove();
                    return color;
                  },
                  [`${hostOf(id, host)} [data-target]`, subInk]
                );
                const drawn = measured.reads.rest[id][host];
                const [title, sub] = drawn.filter((element) => element.tag === 'p');
                assert.equal(sub.properties.color, muted, `${id} ${host} second line ink`);
                assert.notEqual(title.properties.color, muted, `${id} ${host} title ink`);
                assert.ok(
                  parseFloat(sub.properties['font-size']) <=
                    parseFloat(title.properties['font-size']),
                  `${id} ${host} second line is no larger than the title`
                );
                const overflow = await measured.tab.evaluate(
                  (selector) => {
                    const line = document
                      .querySelector(selector)
                      .querySelector('.manager-recipe-status-title');
                    return line.scrollWidth - line.clientWidth;
                  },
                  `${hostOf(id, host)} [data-target]`
                );
                assert.ok(overflow <= 0, `${id} ${host} title wraps inside its card`);
                assert.ok(drawn[0].box[0] <= width, `${id} ${host} card stays inside its target`);
              }
            }
          }
        );

        it('draws each bare specimen inside one display: contents standalone style root', async () => {
          for (const { id } of specimens) {
            const root = await measured.tab.evaluate((specimen) => {
              const target = document.querySelector(`[data-host="${specimen}-bare"] [data-target]`);
              const [only] = target.children;
              return {
                count: target.children.length,
                written: target.querySelectorAll('.fabricate-standalone-root').length,
                classes: only.className,
                display: getComputedStyle(only).display,
                theme: only.getAttribute('data-fabricate-theme'),
              };
            }, id);
            assert.deepEqual(
              root,
              {
                count: 1,
                written: 1,
                classes: 'fabricate fabricate-standalone-root',
                display: 'contents',
                theme: palette,
              },
              id
            );
          }
        });

        it('draws each open panel in the window’s frame, and on the themed standalone layer for the bare host', () => {
          const layer = `<div class="fabricate fabricate-standalone-overlay" ${THEME}="${palette}"`;
          for (const specimen of specimens) {
            const { window, bare } = markup[palette][specimen.id];
            const { id } = specimen;
            const opened = shard.opened.includes(specimen);
            assert.equal(
              Boolean(window.panel),
              opened,
              `${id} draws a panel only where it opens one`
            );
            assert.equal(Boolean(bare.panel), opened, id);
            if (!opened) continue;
            assert.ok(window.panel.startsWith('<div style="display: contents;">'), id);
            assert.ok(
              bare.panel.startsWith(layer),
              `${id}'s bare panel is on the standalone layer`
            );
          }
        });

        it('lays each open panel inside the viewport in both hosts, the bare one where its layer measured it', async () => {
          await assertPanelsInViewport(measured.tab, opened);
        });

        it('passes a press beside an open bare panel through the standalone layer, and holds one on the panel', async () => {
          await assertLayerPassesPointer(measured.tab, opened);
        });

        it('lays the core sheets in order: each bare text, number and search input takes core’s input height', () => {
          const { inputHeight, inputs } = measured.reads.probes;
          assert.equal(inputHeight, '32px', '--input-height resolves');
          assert.deepEqual(
            inputs.map(({ type, rest }) => [type, rest.height, rest['line-height']]),
            PROBED_TYPES.map((type) => [type, inputHeight, inputHeight])
          );
        });

        it('computes the same styles, pseudo elements and border box in both hosts, in every state', () => {
          assertHostsAlike(measured.reads, `core-min, ${palette}`);
        });

        it('reaches each state it compares: keyboard focus, the pointer and reduced motion', () => {
          assertFocusReach(measured.reads, specimens);
          assertHoverReach(measured.reads, hovered);
          assert.equal(
            Object.keys(measured.reads.focus).length,
            focused.length,
            'each was focused'
          );
          assert.equal(
            Object.keys(measured.reads.hover).length,
            hovered.length,
            'each was hovered'
          );
          assert.equal(measured.reads.reducedQuery, true, 'reduced motion was in force');
        });

        it('names each scoped component’s hash class in a rule of the page', async () => {
          const hashes = scopedHashes();
          const presence = await measured.tab.evaluate(scopedPresence, { hashes });
          for (const [at, name] of SCOPED.entries()) {
            const { named } = presence[at];
            assert.ok(named, `a rule in the page names ${name}'s ${hashes[at]}`);
          }
        });

        itOf(ENTRY_OF.pager)(
          'lays the default pager on one row at 560px, first page or last, and wraps it at 336px',
          async () => {
            assert.deepEqual(
              await measured.tab.evaluate(pagerWraps, { id: 'pagination-first-wide' }),
              [false, false]
            );
            assert.deepEqual(
              await measured.tab.evaluate(pagerWraps, { id: 'pagination-last-wide' }),
              [false, false]
            );
            assert.deepEqual(
              await measured.tab.evaluate(pagerWraps, { id: 'pagination-first-narrow' }),
              [true, true]
            );
          }
        );

        itOf(ENTRY_OF.footer)(
          'splits the equal footer into two even shares through the slot’s display: contents wrapper, in both hosts',
          async () => {
            const id = 'modal-equal-footer';
            for (const host of HOSTS) {
              await showPanel(measured.tab, id, host);
              const { widths, gap, content } = await measured.tab.evaluate(equalFooter, {
                id,
                host,
              });
              assert.equal(widths.length, 2, `${host}: the two footer buttons`);
              assert.ok(Math.abs(widths[0] - widths[1]) <= 1, `${host}: even shares, ${widths}`);
              const filled = widths[0] + widths[1] + gap;
              assert.ok(Math.abs(filled - content) <= 1, `${host}: ${filled} fills ${content}`);
            }
          }
        );

        it('draws nothing alike by accident: the root carries the ink and the reduced-motion rule', async () => {
          const moved = [];
          for (const name of entries) {
            const first = specimens.find((specimen) => specimen.name === name);
            const { stripped, rooted, classes } = await rootedReads(measured.tab, first.id);
            assert.ok(
              classes.split(' ').includes('fabricate'),
              `${name}'s root class was captured`
            );
            assert.notEqual(stripped.color, rooted.color, `${name}'s ink comes from the root`);
            const moving = movingSpecimen(measured.reads, specimens, name);
            if (!moving) continue;
            const motion =
              moving === first ? { stripped, rooted } : await rootedReads(measured.tab, moving.id);
            for (const [index, element] of measured.reads.rest[moving.id].bare.entries()) {
              if (!movesAtRest(element)) continue;
              assert.notEqual(
                motion.stripped.durations[index],
                motion.rooted.durations[index],
                `${moving.id}'s ${element.tag} takes its reduced motion from the root`
              );
            }
            moved.push(name);
          }
          assert.deepEqual(
            moved,
            movers,
            'the entries that move were held to the reduced-motion rule'
          );
        });
      }
    );
  }

  describe(title('the two palettes'), () => {
    it('differ in at least one compared property of every entry, at rest', () => {
      assert.deepEqual(Object.keys(MEASURED), PALETTES, 'both palettes were measured');
      const restOf = (palette, id) => JSON.stringify(MEASURED[palette].reads.rest[id].bare);
      for (const name of entries) {
        const ids = specimens.filter((specimen) => specimen.name === name).map(({ id }) => id);
        const differs = ids.some((id) => restOf('fabricate', id) !== restOf('foundry-native', id));
        assert.ok(differs, `${name} draws the palette it is given`);
      }
    });
  });

  describe(
    title('the widened entries over Foundry’s harvested sheet and Font Awesome'),
    { skip },
    () => {
      let measured;

      before(
        async () => {
          const { value, error } = await harvested;
          if (error) throw error;
          measured = value;
        },
        { timeout: 900_000 }
      );

      after(() => measured?.tab.close());

      it('really laid the harvested sheet over the page', async () => {
        const centred = await measured.tab.evaluate(
          () => getComputedStyle(document.querySelector('[data-sentinel]')).justifyContent
        );
        assert.equal(centred, 'center', "core's own button rule reached the sentinel");
      });

      it('draws core’s text, number and search inputs as the input fixture does, at rest and under focus', () => {
        assert.deepEqual(measured.reads.probes.inputs, MEASURED.fabricate.reads.probes.inputs);
      });

      it('computes the same styles, pseudo elements and border box in both hosts, in every state', () => {
        assertHostsAlike(measured.reads, 'harvested');
      });

      it('lays each open panel inside the viewport, and passes a press beside a bare one to the page', async () => {
        await assertPanelsInViewport(measured.tab, opened);
        await assertLayerPassesPointer(measured.tab, opened);
      });
    }
  );
}
