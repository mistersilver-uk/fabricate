/**
 * The standalone style root's admission clause (issues 2456, 2679, 2680), in Chromium: each
 * widened entry's specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, then drawn in one page per palette with
 * `<html>` naming the other palette. An open overlay's panel is drawn where the seam put it: in
 * the window's frame, and on the standalone layer for the bare host, each shown only while its
 * own host is read, and measured from its own box. Every element computes the same compared
 * properties, pseudo elements and border box in both hosts at rest, under keyboard focus, under the
 * pointer and under reduced motion, and the switch under forced colours; reach, non-vacuity,
 * scoped-style and fixture-order clauses hold each state, the root itself and the core sheets laid
 * under it. The harvested arm repeats the comparison over Foundry's own sheet, with a layout-only
 * rule written alike on both hosts that lays core's stacked windows back in flow.
 * Limit: happy-dom only produces the markup, with each field's live value and checked state
 * written back as attributes; it resolves no cascade layer and lays out nothing.
 * Limit: no arm loads Font Awesome's webfonts, since the harvested arm inlines its stylesheet and
 * its relative font URLs do not resolve, so a glyph's own box is unmeasured.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import * as SHARED_LISTS from '../fixtures/published-components/comparedProperties.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_PSEUDO_COMPARED,
  STANDALONE_SPECIMENS,
} from '../fixtures/published-components/standaloneSpecimens.js';
import {
  harvestedFoundryChromeCss,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import {
  SHIPPED,
  byName,
  importClosure,
  isComponent,
  propLocals,
} from '../helpers/publishedComponentGate.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEME = 'data-fabricate-theme';
const PALETTES = Object.freeze(['fabricate', 'foundry-native']);
const HOSTS = Object.freeze(['window', 'bare']);
const WIDENED = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.standaloneRoot === true);
/** The components with a `<style>` in the widened entries' import closures, by path. */
const SCOPED_PATHS = [...new Set(WIDENED.flatMap(({ path }) => [...importClosure(path, SHIPPED)]))]
  .filter((path) => isComponent(path) && Boolean(componentAstOf(path).css))
  .sort(byName);
const SCOPED = SCOPED_PATHS.map((path) => basename(path, '.svelte'));
/** A scoped component no published key draws, with the key that would: none of its elements is drawn. */
const UNDRAWN_SCOPED = Object.freeze({
  Chip: "EditorTabs' unpublished badges and Select's unpublished badge and reason",
});
/** The specimens in which Tab from the sentinel reaches nothing. */
const UNREACHED = Object.freeze([
  'card-filled',
  'button-disabled',
  'well-labelled',
  'well-unlabelled',
  'icon-button-disabled',
  'cards-disabled',
  'pagination-persistent-single',
]);
/** The specimens no pointer is moved over, and those whose hover target need not change. */
const UNHOVERED = Object.freeze(['card-filled', 'well-labelled', 'well-unlabelled']);
const INERT = Object.freeze([
  'button-disabled',
  'search-empty',
  'search-holding',
  'select-form-chosen',
  'select-inline-chosen',
  'select-toolbar-placeholder',
  'field-text-input',
  'field-textarea',
  'field-label-host',
  'field-fieldset-host',
  'icon-button-disabled',
  'cards-disabled',
  'pagination-persistent-single',
  'icon-picker-chosen',
  'icon-picker-no-match',
]);
/**
 * The entries whose specimens draw an element with a resting transition under the root, in table
 * order; a `Modal` keeps one empty element there, and its dialog is on the layer.
 */
const MOVERS = Object.freeze([
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

const SPECIMENS = Object.entries(STANDALONE_SPECIMENS).flatMap(([name, specimens]) =>
  Object.entries(specimens).map(([id, specimen]) => ({
    name,
    id,
    ...specimen,
    width: specimen.width ?? DEFAULT_WIDTH,
  }))
);
const FOCUSED = SPECIMENS.filter(({ reach }) => reach.focus !== null);
const HOVERED = SPECIMENS.filter(({ reach }) => reach.hover !== null);
const SWITCHES = SPECIMENS.filter(({ name }) => name === 'StatusToggle');
/** The specimens drawn with a panel open: each with opening steps, and every `Modal`. */
const OPENED = SPECIMENS.filter(({ name, open }) => Boolean(open) || name === 'Modal');

/** The keys whose every value the specimens draw, and the values no literal in a component names. */
const VOCABULARY_KEYS = Object.freeze([
  'role',
  'size',
  'on',
  'fullWidth',
  'disabled',
  'label',
  'fill',
  'density',
  'layout',
  'columns',
  'persistent',
  'activePanelOnly',
  'as',
]);
const DECLARED_VOCABULARIES = Object.freeze({ columns: Object.freeze(['1', '2', '3']) });

/** The keys of the object literal `name` declares in a component's script, frozen or not. */
function objectKeysOf(ast, name) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.id?.name !== name) continue;
    const frozen = node.init?.callee?.property?.name === 'freeze' ? node.init.arguments[0] : null;
    const literal = frozen ?? node.init;
    if (literal?.type !== 'ObjectExpression') return [];
    return literal.properties.map((property) => String(property.key.name ?? property.key.value));
  }
  return [];
}

/** A default's literal value, read through the `const` it names where it names one. */
function literalOf(ast, node) {
  if (node?.type !== 'Identifier') return node?.value;
  const declared = [...walkNodes(ast.instance)].find(
    (each) => each.type === 'VariableDeclarator' && each.id?.name === node.name
  );
  return declared?.init?.value;
}

/** The literals of an array, of `new Set([...])`, or of a name declared as either, or `[]`. */
function listedLiterals(node, declared) {
  const list = node?.type === 'Identifier' ? declared.get(node.name) : node;
  const array = list?.type === 'NewExpression' ? list.arguments[0] : list;
  if (array?.type !== 'ArrayExpression') return [];
  return array.elements.filter((element) => element?.type === 'Literal');
}

/** The literals one node compares `isLocal` with: by `===` or `!==`, a `switch`, or a list's `includes` or `has`. */
function literalsCompared(node, isLocal, declared) {
  if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
    const other = isLocal(node.left) ? node.right : isLocal(node.right) ? node.left : null;
    return other?.type === 'Literal' ? [other] : [];
  }
  if (node.type === 'SwitchStatement' && isLocal(node.discriminant)) {
    return node.cases.map((each) => each.test).filter((test) => test?.type === 'Literal');
  }
  const method = node.type === 'CallExpression' ? node.callee.property?.name : undefined;
  if ((method === 'includes' || method === 'has') && isLocal(node.arguments[0])) {
    return listedLiterals(node.callee.object, declared);
  }
  return [];
}

/** Each literal the component compares `local` with, in its script or its markup. */
function comparedLiterals(ast, local) {
  const isLocal = (node) => node?.type === 'Identifier' && node.name === local;
  const nodes = [...walkNodes(ast)];
  const declared = new Map(
    nodes
      .filter((node) => node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
      .map((node) => [node.id.name, node.init])
  );
  return nodes
    .flatMap((node) => literalsCompared(node, isLocal, declared))
    .map((literal) => String(literal.value));
}

/**
 * A published key's vocabulary, read from its component: its default, unless the key is required,
 * and each value it maps or compares.
 */
function vocabularyOf(entry, key) {
  const ast = componentAstOf(entry.path);
  const prop = propLocals(ast).find((local) => local.key === key);
  const fallback = literalOf(ast, prop?.fallback);
  if (typeof fallback === 'boolean') return { kind: 'boolean', values: ['false', 'true'] };
  if (DECLARED_VOCABULARIES[key]) {
    return { kind: 'listed', fallback, values: DECLARED_VOCABULARIES[key] };
  }
  const read = [
    ...objectKeysOf(ast, `${key.toUpperCase()}_CLASSES`),
    ...objectKeysOf(ast, `${key.toUpperCase()}S`),
    ...comparedLiterals(ast, prop.local),
  ];
  if (read.length > 0) {
    const defaulted = entry.props[key].required === true ? [] : [String(fallback)];
    return { kind: 'listed', fallback, values: [...new Set([...defaulted, ...read])] };
  }
  return { kind: 'text', fallback, values: ['', 'text'] };
}

function valueOf(vocabulary, props, key) {
  const value = Object.hasOwn(props, key) ? props[key] : vocabulary.fallback;
  if (vocabulary.kind === 'boolean') return String(Boolean(value));
  if (vocabulary.kind === 'listed') return String(value);
  return value ? 'text' : '';
}

const entryNamed = (name) => PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name);

describe('the standalone specimen table', () => {
  it('names exactly the entries drawn under the standalone style root', () => {
    assert.deepEqual(
      Object.keys(STANDALONE_SPECIMENS).sort(byName),
      WIDENED.map(({ name }) => name).sort(byName)
    );
  });

  it('draws every value of each vocabulary key the entries publish, compared or declared', () => {
    let held = 0;
    for (const [name, specimens] of Object.entries(STANDALONE_SPECIMENS)) {
      const entry = entryNamed(name);
      for (const key of VOCABULARY_KEYS) {
        if (!Object.hasOwn(entry.props, key)) continue;
        const vocabulary = vocabularyOf(entry, key);
        assert.ok(vocabulary.values.length > 1, `${name} ${key} reads a vocabulary`);
        const drawn = new Set(
          Object.values(specimens).map(({ props }) => valueOf(vocabulary, props, key))
        );
        const expected = [...vocabulary.values].sort(byName);
        assert.deepEqual([...drawn].sort(byName), expected, `${name} ${key}`);
        held += 1;
      }
    }
    assert.equal(held, 18, 'each vocabulary key the sixteen publish was read');
  });

  it('reads the rungs Select maps for size from its frozen table', () => {
    const { values } = vocabularyOf(entryNamed('Select'), 'size');
    assert.deepEqual([...values].sort(byName), ['form', 'inline', 'toolbar']);
  });

  it('opens a panel in a specimen of each overlay entry, and reads it in every other only closed', () => {
    const opened = SPECIMENS.filter(({ open }) => open).map(({ name }) => name);
    const overlays = WIDENED.filter((entry) => entry.overlays === true).map(({ name }) => name);
    assert.deepEqual([...new Set(opened)].sort(byName), ['ActionMenu', 'IconPicker', 'Select']);
    assert.ok(
      SPECIMENS.filter(({ name }) => name === 'Modal').every(({ props }) => props.open === true),
      'a Modal specimen is drawn open, which is its whole face'
    );
    assert.deepEqual(overlays.sort(byName), ['ActionMenu', 'IconPicker', 'Modal', 'Select']);
  });

  it('reads the densities SegmentedControl compares, which no class table maps', () => {
    const { values } = vocabularyOf(entryNamed('SegmentedControl'), 'density');
    assert.deepEqual([...values].sort(byName), ['compact', 'default', 'field', 'inline']);
  });

  it('reads the hosts Field draws for as through its set, with no default for the required key', () => {
    const { values } = vocabularyOf(entryNamed('Field'), 'as');
    assert.deepEqual([...values].sort(byName), ['div', 'fieldset', 'label']);
  });

  it('compares every property the three-host test compares on these controls', () => {
    const shared = Object.entries(SHARED_LISTS);
    assert.equal(shared.length, 6, 'the six lists the two tests share');
    for (const [list, properties] of shared) {
      const missing = properties.filter((property) => !STANDALONE_COMPARED.includes(property));
      assert.deepEqual(missing, [], list);
    }
  });

  it('declares exactly the specimens Tab reaches nothing in', () => {
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.focus === null).map(({ id }) => id),
      UNREACHED
    );
  });

  it('declares exactly the specimens no pointer is moved over, and those whose hover may not change', () => {
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.hover === null).map(({ id }) => id),
      UNHOVERED
    );
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.inert).map(({ id }) => id),
      INERT
    );
  });

  it('lays every scoped component of the closures, and names the one no published key draws', () => {
    assert.ok(SCOPED.length > 2, 'the closures state scoped rules');
    for (const name of Object.keys(UNDRAWN_SCOPED)) assert.ok(SCOPED.includes(name), name);
    assert.ok(!Object.hasOwn(entryNamed('EditorTabs').props, 'badges'), 'badges is unpublished');
  });
});

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
async function mountSpecimens() {
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
      for (const specimen of SPECIMENS) {
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
 * body states the face the player window draws in, as Foundry's body does for every window, so a
 * panel on the standalone layer inherits that face.
 */
function pageFor(markup, palette, sheets) {
  const head = renderedPageHead(SCOPED);
  const meta = '<meta charset="utf-8">';
  assert.equal(head.split(meta).length, 2, 'one charset tag to lay the core sheets after');
  const laid = head.replace(
    meta,
    () =>
      `${meta}${sheets.map((css) => `<style>${css}</style>`).join('')}${PANELS_SHOWN_ONE_AT_A_TIME}`
  );
  const probes = `<div data-probe-inputs>${PROBED_TYPES.map((type) => `<input type="${type}">`).join('')}<div data-probe-height style="height: var(--input-height)"></div></div>`;
  const sections = SPECIMENS.map(({ id, width }) => {
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
  const layered = SPECIMENS.map(({ id }) => panelWrapper(id, 'bare', markup[id].bare.panel));
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
      // A `display: contents` element makes no box, so it has no offset to compare.
      box:
        style.display === 'contents'
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

/** For each scoped hash class: whether a rule names it, the specimens drawing it in both hosts, and its count. */
function scopedPresence({ hashes, ids }) {
  const named = new Set();
  const walk = (rules) => {
    for (const rule of rules) {
      for (const hash of hashes) if (rule.selectorText?.includes(`.${hash}`)) named.add(hash);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) walk(sheet.cssRules);
  const drawnIn = (id, host, selector) => {
    const { target, container } = globalThis.standaloneParts(id, host);
    return Boolean(target.querySelector(selector) ?? container?.querySelector(selector));
  };
  return hashes.map((hash) => ({
    named: named.has(hash),
    drawn: ids.filter((id) => ['window', 'bare'].every((host) => drawnIn(id, host, `.${hash}`))),
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
async function measureFocus(tab, reads) {
  for (const specimen of SPECIMENS) {
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
async function measureHover(tab, reads) {
  for (const specimen of HOVERED) {
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
async function measure(browser, markup, palette, sheets) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(pageFor(markup[palette], palette, sheets), { waitUntil: 'load' });
  await fitViewport(tab);
  const other = PALETTES.find((each) => each !== palette);
  await tab.evaluate(
    ([name, value]) => document.documentElement.setAttribute(name, value),
    [THEME, other]
  );
  await tab.mouse.move(0, 0);
  await settled(tab);
  const reads = { rest: {}, focus: {}, hover: {}, reduced: {}, forced: {}, reach: {} };
  for (const { id } of SPECIMENS) {
    reads.rest[id] = await bothHosts((host) => read(tab, id, host));
  }
  reads.probes = await tab.evaluate(probeInputs, { properties: PROBED });
  await measureFocus(tab, reads);
  await measureHover(tab, reads);
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  await settled(tab);
  reads.reducedQuery = (await reach(tab, SPECIMENS[0], 'bare')).reduced;
  for (const { id } of SPECIMENS) {
    reads.reduced[id] = await bothHosts((host) => read(tab, id, host));
  }
  await tab.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await settled(tab);
  for (const { id } of SWITCHES) {
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
async function assertPanelsInViewport(tab) {
  for (const { id } of OPENED) {
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
async function assertLayerPassesPointer(tab) {
  for (const { id } of OPENED) {
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
function assertFocusReach(reads) {
  for (const {
    id,
    reach: { focus, mark },
  } of SPECIMENS) {
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
function assertHoverReach(reads) {
  for (const {
    id,
    reach: { hover, inert },
  } of HOVERED) {
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
function movingSpecimen(reads, name) {
  return SPECIMENS.find(
    (specimen) => specimen.name === name && reads.rest[specimen.id].bare.some(movesAtRest)
  );
}

let browser;
let markup;
/** Each palette's page and reads over the core-min sheets, measured in parallel pages. */
const MEASURED = {};
/** The harvested arm's measurement, started beside the palettes' and settled as `{ value | error }`. */
let harvested = null;

before(
  async () => {
    markup = await mountSpecimens();
    browser = await chromium.launch();
    if (chrome) {
      harvested = measure(browser, markup, 'fabricate', [
        chrome,
        fontAwesome(),
        HOSTS_IN_FLOW,
      ]).then(
        (value) => ({ value }),
        (error) => ({ error })
      );
    }
    const pages = await Promise.all(
      PALETTES.map((palette) => measure(browser, markup, palette, CORE_MIN_SHEETS))
    );
    for (const [index, palette] of PALETTES.entries()) MEASURED[palette] = pages[index];
  },
  { timeout: 900_000 }
);

after(async () => {
  await browser?.close();
});

for (const palette of PALETTES) {
  describe(`the widened entries in the ${palette} palette, over the core-min sheets`, () => {
    let measured;

    before(() => {
      measured = MEASURED[palette];
    });

    it('draws each bare specimen inside one display: contents standalone style root', async () => {
      for (const { id } of SPECIMENS) {
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
      for (const specimen of SPECIMENS) {
        const { window, bare } = markup[palette][specimen.id];
        const { id } = specimen;
        const opened = OPENED.includes(specimen);
        assert.equal(Boolean(window.panel), opened, `${id} draws a panel only where it opens one`);
        assert.equal(Boolean(bare.panel), opened, id);
        if (!opened) continue;
        assert.ok(window.panel.startsWith('<div style="display: contents;">'), id);
        assert.ok(bare.panel.startsWith(layer), `${id}'s bare panel is on the standalone layer`);
      }
    });

    it('lays each open panel inside the viewport in both hosts, the bare one where its layer measured it', async () => {
      await assertPanelsInViewport(measured.tab);
    });

    it('passes a press beside an open bare panel through the standalone layer, and holds one on the panel', async () => {
      await assertLayerPassesPointer(measured.tab);
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
      assertFocusReach(measured.reads);
      assertHoverReach(measured.reads);
      assert.equal(Object.keys(measured.reads.focus).length, FOCUSED.length, 'each was focused');
      assert.equal(Object.keys(measured.reads.hover).length, HOVERED.length, 'each was hovered');
      assert.equal(measured.reads.reducedQuery, true, 'reduced motion was in force');
    });

    it('draws each scoped component’s hash class in both hosts of a specimen, and a rule names it', async () => {
      const hashes = SCOPED_PATHS.map(
        (path) => scopedComponentCss(resolve(repoRoot, path)).hashClass
      );
      const ids = SPECIMENS.map(({ id }) => id);
      const presence = await measured.tab.evaluate(scopedPresence, { hashes, ids });
      for (const [index, name] of SCOPED.entries()) {
        const { named, drawn, anywhere } = presence[index];
        assert.ok(named, `a rule in the page names ${name}'s ${hashes[index]}`);
        if (Object.hasOwn(UNDRAWN_SCOPED, name)) {
          assert.equal(anywhere, 0, `${name} is drawn only for ${UNDRAWN_SCOPED[name]}`);
        } else {
          assert.ok(drawn.length > 0, `a specimen draws ${name} in both hosts`);
        }
      }
    });

    it('lays the default pager on one row at 560px, first page or last, and wraps it at 336px', async () => {
      assert.deepEqual(await measured.tab.evaluate(pagerWraps, { id: 'pagination-first-wide' }), [
        false,
        false,
      ]);
      assert.deepEqual(await measured.tab.evaluate(pagerWraps, { id: 'pagination-last-wide' }), [
        false,
        false,
      ]);
      assert.deepEqual(await measured.tab.evaluate(pagerWraps, { id: 'pagination-first-narrow' }), [
        true,
        true,
      ]);
    });

    it('draws nothing alike by accident: the root carries the ink and the reduced-motion rule', async () => {
      const moved = [];
      for (const name of Object.keys(STANDALONE_SPECIMENS)) {
        const first = SPECIMENS.find((specimen) => specimen.name === name);
        const { stripped, rooted, classes } = await rootedReads(measured.tab, first.id);
        assert.ok(classes.split(' ').includes('fabricate'), `${name}'s root class was captured`);
        assert.notEqual(stripped.color, rooted.color, `${name}'s ink comes from the root`);
        const moving = movingSpecimen(measured.reads, name);
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
      assert.deepEqual(moved, MOVERS, 'the entries that move were held to the reduced-motion rule');
    });
  });
}

describe('the two palettes', () => {
  it('differ in at least one compared property of every entry, at rest', () => {
    assert.deepEqual(Object.keys(MEASURED), PALETTES, 'both palettes were measured');
    const restOf = (palette, id) => JSON.stringify(MEASURED[palette].reads.rest[id].bare);
    for (const name of Object.keys(STANDALONE_SPECIMENS)) {
      const ids = SPECIMENS.filter((specimen) => specimen.name === name).map(({ id }) => id);
      const differs = ids.some((id) => restOf('fabricate', id) !== restOf('foundry-native', id));
      assert.ok(differs, `${name} draws the palette it is given`);
    }
  });
});

const chrome = harvestedFoundryChromeCss(repoRoot);
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/published-standalone-root-rendered.test.js',
  chrome,
});
const skip = skipWithoutHarvest(chrome);
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

describe('the widened entries over Foundry’s harvested sheet and Font Awesome', { skip }, () => {
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
    await assertPanelsInViewport(measured.tab);
    await assertLayerPassesPointer(measured.tab);
  });
});
