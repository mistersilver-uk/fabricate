/**
 * The standalone style root's admission clause (issue 2456), in Chromium: each widened entry's
 * specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, then drawn in one page per palette with
 * `<html>` naming the other palette. Every element computes the same compared properties and
 * border box in both hosts at rest, under keyboard focus, under the pointer and under reduced
 * motion, and the switch under forced colours; reachability and non-vacuity clauses hold each
 * state and the root itself. The harvested arm repeats the comparison over Foundry's own sheet,
 * with a layout-only rule written alike on both hosts that lays core's stacked windows back in flow.
 * Limit: happy-dom only produces the markup; it resolves no cascade layer and lays out nothing.
 * Limit: no arm loads Font Awesome's webfonts, since the harvested arm inlines its stylesheet and
 * its relative font URLs do not resolve, so a glyph's own box is unmeasured.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import * as SHARED_LISTS from '../fixtures/published-components/comparedProperties.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_SPECIMENS,
} from '../fixtures/published-components/standaloneSpecimens.js';
import {
  harvestedFoundryChromeCss,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { byName, propLocals } from '../helpers/publishedComponentGate.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEME = 'data-fabricate-theme';
const PALETTES = Object.freeze(['fabricate', 'foundry-native']);
const HOSTS = Object.freeze(['window', 'bare']);
/** The closures' components that state scoped rules; the other four draw from the module sheet. */
const SCOPED = Object.freeze(['Well', 'Kicker']);
const CONTROLS = new Set(['Button', 'IconButton', 'StatusToggle']);
/**
 * What the harness writes on both targets; ink is left to each host. The width is the companion's
 * own, because core pads a bare `.window-content` and the player window's sheet does not.
 */
const TARGET_FACE =
  'width: 280px; font-family: Arial, sans-serif; font-size: 14px; line-height: 20px';
const BUTTON_MIN = readFileSync(
  resolve(repoRoot, 'tests/fixtures/foundry-core-button-min.css'),
  'utf8'
);

const SPECIMENS = Object.entries(STANDALONE_SPECIMENS).flatMap(([name, specimens]) =>
  Object.entries(specimens).map(([id, props]) => ({ name, id, props }))
);
/** The specimens read under the pointer, those of them read under keyboard focus, and the switches. */
const HOVERED = SPECIMENS.filter(({ name }) => CONTROLS.has(name));
const FOCUSED = HOVERED.filter(({ props }) => props.disabled !== true);
const SWITCHES = SPECIMENS.filter(({ name }) => name === 'StatusToggle');

/** The keys whose every value the specimens draw, and how a value is read off a specimen. */
const VOCABULARY_KEYS = Object.freeze(['role', 'size', 'on', 'fullWidth', 'disabled', 'label']);

/** The keys of the object literal `name` declares in a component's instance script. */
function objectKeysOf(ast, name) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.id?.name !== name) continue;
    return node.init.properties.map((property) => String(property.key.name ?? property.key.value));
  }
  return null;
}

/** A published key's vocabulary, read from its component: its default and each value it maps. */
function vocabularyOf(path, key) {
  const ast = componentAstOf(path);
  const fallback = propLocals(ast).find((local) => local.key === key)?.fallback?.value;
  if (typeof fallback === 'boolean') return { kind: 'boolean', values: ['false', 'true'] };
  const mapped = objectKeysOf(ast, `${key.toUpperCase()}_CLASSES`);
  if (mapped) return { kind: 'mapped', fallback, values: [String(fallback), ...mapped] };
  return { kind: 'text', fallback, values: ['', 'text'] };
}

function valueOf(vocabulary, props, key) {
  const value = Object.hasOwn(props, key) ? props[key] : vocabulary.fallback;
  if (vocabulary.kind === 'boolean') return String(Boolean(value));
  if (vocabulary.kind === 'mapped') return String(value);
  return value ? 'text' : '';
}

const entryNamed = (name) => PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name);

describe('the standalone specimen table', () => {
  it('names exactly the entries drawn under the standalone style root', () => {
    const widened = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => entry.standaloneRoot === true);
    assert.deepEqual(
      Object.keys(STANDALONE_SPECIMENS).sort(byName),
      widened.map(({ name }) => name).sort(byName)
    );
  });

  it('draws every value of each role, size, on, fullWidth, disabled and label key the entries publish', () => {
    let held = 0;
    for (const [name, specimens] of Object.entries(STANDALONE_SPECIMENS)) {
      const entry = entryNamed(name);
      for (const key of VOCABULARY_KEYS) {
        if (!Object.hasOwn(entry.props, key)) continue;
        const vocabulary = vocabularyOf(entry.path, key);
        assert.ok(vocabulary.values.length > 1, `${name} ${key} reads a vocabulary`);
        const drawn = new Set(
          Object.values(specimens).map((props) => valueOf(vocabulary, props, key))
        );
        const expected = [...vocabulary.values].sort(byName);
        assert.deepEqual([...drawn].sort(byName), expected, `${name} ${key}`);
        held += 1;
      }
    }
    assert.equal(held, 8, 'each vocabulary key the five publish was read');
  });

  it('compares every property the three-host test compares on these controls', () => {
    const shared = Object.entries(SHARED_LISTS);
    assert.equal(shared.length, 6, 'the six lists the two tests share');
    for (const [list, properties] of shared) {
      const missing = properties.filter((property) => !STANDALONE_COMPARED.includes(property));
      assert.deepEqual(missing, [], list);
    }
  });
});

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
      for (const { name, id, props } of SPECIMENS) {
        markup[palette][id] = {
          window: drawnMarkup(ui, name, props, {
            classes: 'application fabricate fabricate-app',
            palette,
          }),
          bare: drawnMarkup(ui, name, props, { classes: 'application' }),
        };
      }
    }
    return markup;
  } finally {
    harness.teardown();
  }
}

/** One specimen's target as drawn under a frame classed `classes`, with companion text in a slot. */
function drawnMarkup(ui, name, props, { classes, palette }) {
  const frame = document.createElement('div');
  frame.className = classes;
  if (palette) frame.setAttribute(THEME, palette);
  const content = document.createElement('div');
  content.className = 'window-content';
  const target = document.createElement('div');
  target.setAttribute('data-target', '');
  target.setAttribute('style', TARGET_FACE);
  content.append(target);
  frame.append(content);
  document.body.append(frame);
  const handle = ui.mount(name, { target, props });
  const slot = handle.slot('children');
  if (slot) slot.append(Object.assign(document.createElement('p'), { textContent: 'Moonpetal' }));
  flushSync();
  const html = target.outerHTML;
  handle.destroy();
  frame.remove();
  return html;
}

/** The page: `sheets` laid down first, then core-min, the module sheet and the scoped styles. */
function pageFor(markup, palette, sheets) {
  const head = renderedPageHead(SCOPED);
  const meta = '<meta charset="utf-8">';
  assert.equal(head.split(meta).length, 2, 'one charset tag to lay the core sheets after');
  const laid = head.replace(
    meta,
    () => `${meta}${sheets.map((css) => `<style>${css}</style>`).join('')}`
  );
  const sections = SPECIMENS.map(({ id }) => {
    const frames = HOSTS.map((host) => {
      const classes =
        host === 'window'
          ? `application fabricate fabricate-app" ${THEME}="${palette}`
          : 'application';
      return `<button type="button" data-sentinel="${id}-${host}">Before</button>
<div class="${classes}" data-host="${id}-${host}" style="width:340px"><div class="window-content">${markup[id][host]}</div></div>`;
    });
    return `<section data-specimen="${id}" style="display:flex;gap:24px;align-items:flex-start;padding:8px 0">${frames.join('')}</section>`;
  });
  return `${laid}<body class="game" style="margin:0;padding:48px 24px">${sections.join('\n')}</body></html>`;
}

/** Each element the specimen draws in `host`, in tree order: its tag, properties and border box. */
function readHost({ id, host, properties }) {
  const target = document.querySelector(`[data-host="${id}-${host}"] [data-target]`);
  const drawnIn = host === 'bare' ? target.firstElementChild : target;
  const origin = target.getBoundingClientRect();
  return [...drawnIn.querySelectorAll('*')].map((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      tag: element.localName,
      properties: Object.fromEntries(
        properties.map((name) => [name, style.getPropertyValue(name)])
      ),
      // A `display: contents` element makes no box, so it has no offset to compare.
      box:
        style.display === 'contents'
          ? null
          : [box.width, box.height, box.left - origin.left, box.top - origin.top].map(Math.round),
    };
  });
}

/** What the specimen's control in `host` answers: focus, keyboard focus, hover, reduced motion. */
function reachOf({ id, host }) {
  const control = document.querySelector(`[data-host="${id}-${host}"] button`);
  return {
    active: document.activeElement === control,
    focusVisible: control.matches(':focus-visible'),
    hovered: control.matches(':hover'),
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/**
 * Past the fonts and every running animation and transition on an element in `scope`, a selector,
 * or in the whole page; transitions stay on, so a read never lands mid-transition.
 */
async function settled(tab, scope = null) {
  await tab.evaluate(async (selector) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    await frame();
    await frame();
    await document.fonts.ready;
    const within = selector ? document.querySelector(selector) : document.documentElement;
    const running = document
      .getAnimations()
      .filter((animation) => within.contains(animation.effect?.target ?? null));
    await Promise.all(running.map((animation) => animation.finished.catch(() => {})));
    await frame();
  }, scope);
}

const hostOf = (id, host) => `[data-host="${id}-${host}"]`;

const read = (tab, id, host) =>
  tab.evaluate(readHost, { id, host, properties: STANDALONE_COMPARED });
const reach = (tab, id, host) => tab.evaluate(reachOf, { id, host });

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
  for (const { id } of FOCUSED) {
    reads.reach[id] = { focus: {}, hover: {} };
    reads.focus[id] = await bothHosts(async (host) => {
      await tab.focus(`[data-sentinel="${id}-${host}"]`);
      await tab.keyboard.press('Tab');
      await settled(tab, hostOf(id, host));
      reads.reach[id].focus[host] = await reach(tab, id, host);
      const focused = await read(tab, id, host);
      await tab.evaluate(() => document.activeElement?.blur());
      return focused;
    });
  }
  await settled(tab);
  for (const { id } of HOVERED) {
    reads.reach[id] ??= { hover: {} };
    reads.hover[id] = await bothHosts(async (host) => {
      await tab.mouse.move(0, 0);
      await settled(tab, hostOf(id, host));
      await tab.hover(`${hostOf(id, host)} button`);
      await settled(tab, hostOf(id, host));
      reads.reach[id].hover[host] = await reach(tab, id, host);
      const hovered = await read(tab, id, host);
      await tab.mouse.move(0, 0);
      return hovered;
    });
  }
  await tab.emulateMedia({ reducedMotion: 'reduce' });
  await settled(tab);
  reads.reducedQuery = (await reach(tab, SPECIMENS[0].id, 'bare')).reduced;
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
 * The bare host's first drawn element's colour, and the switch track's transition under reduced
 * motion, with the standalone style root's classes stripped and then restored.
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
    await settled(tab, hostOf(id, 'bare'));
    const [first] = await read(tab, id, 'bare');
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    const track = await tab.evaluate((specimen) => {
      const node = document.querySelector(
        `[data-host="${specimen}-bare"] .manager-status-toggle-track`
      );
      return node ? getComputedStyle(node).transitionDuration : null;
    }, id);
    await tab.emulateMedia({ reducedMotion: 'no-preference' });
    return { color: first.properties.color, track };
  };
  const stripped = await sample('');
  const rooted = await sample(classes);
  await settled(tab);
  return { stripped, rooted, classes };
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

let browser;
let markup;
/** Each palette's page and reads over the core-min sheet, measured in parallel pages. */
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
      PALETTES.map((palette) => measure(browser, markup, palette, [BUTTON_MIN]))
    );
    for (const [index, palette] of PALETTES.entries()) MEASURED[palette] = pages[index];
  },
  { timeout: 600_000 }
);

after(async () => {
  await browser?.close();
});

for (const palette of PALETTES) {
  describe(`the widened entries in the ${palette} palette, over the core-min sheet`, () => {
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
            classes: only.className,
            display: getComputedStyle(only).display,
            theme: only.getAttribute('data-fabricate-theme'),
          };
        }, id);
        assert.deepEqual(
          root,
          {
            count: 1,
            classes: 'fabricate fabricate-standalone-root',
            display: 'contents',
            theme: palette,
          },
          id
        );
      }
    });

    it('computes the same styles and border box in both hosts, in every state', () => {
      assertHostsAlike(measured.reads, `core-min, ${palette}`);
    });

    it('reaches each state it compares: keyboard focus, the pointer and reduced motion', () => {
      for (const [id, { focus, hover }] of Object.entries(measured.reads.reach)) {
        for (const host of HOSTS) {
          if (focus?.[host]) {
            assert.ok(
              focus[host].active && focus[host].focusVisible,
              `${id} ${host} takes keyboard focus`
            );
            const rest = measured.reads.rest[id][host][0].properties;
            const ring = measured.reads.focus[id][host][0].properties;
            assert.notDeepEqual(
              [ring['outline-style'], ring['outline-width'], ring['outline-color']],
              [rest['outline-style'], rest['outline-width'], rest['outline-color']],
              `${id} ${host} draws a ring`
            );
          }
          assert.ok(hover[host].hovered, `${id} ${host} is under the pointer`);
        }
      }
      assert.ok(FOCUSED.length > 0, 'an enabled control is drawn');
      assert.equal(Object.keys(measured.reads.focus).length, FOCUSED.length, 'each was focused');
      assert.equal(measured.reads.reducedQuery, true, 'reduced motion was in force');
    });

    it('draws nothing alike by accident: the root carries the ink and the reduced-motion rule', async () => {
      for (const name of Object.keys(STANDALONE_SPECIMENS)) {
        const id = SPECIMENS.find((specimen) => specimen.name === name).id;
        const { stripped, rooted, classes } = await rootedReads(measured.tab, id);
        assert.ok(classes.split(' ').includes('fabricate'), `${name}'s root class was captured`);
        assert.notEqual(stripped.color, rooted.color, `${name}'s ink comes from the root`);
        if (name === 'StatusToggle') {
          assert.notEqual(stripped.track, rooted.track, "the track's reduced motion comes from it");
        }
      }
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
 * laid back in flow, unclipped, beside its sentinel. None of these is inherited or compared, and
 * every box offset is measured from `target`, so a difference core makes between the hosts stays.
 */
const HOSTS_IN_FLOW = `html, body {
  display: block; position: static; inset: auto; width: auto; height: auto;
  min-height: 0; max-height: none; overflow: visible; transform: none;
}
[data-host] {
  position: relative; inset: auto; transform: none; z-index: auto;
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
    { timeout: 600_000 }
  );

  after(() => measured?.tab.close());

  it('really laid the harvested sheet over the page', async () => {
    const centred = await measured.tab.evaluate(
      () => getComputedStyle(document.querySelector('[data-sentinel]')).justifyContent
    );
    assert.equal(centred, 'center', "core's own button rule reached the sentinel");
  });

  it('computes the same styles and border box in both hosts, in every state', () => {
    assertHostsAlike(measured.reads, 'harvested');
  });
});
