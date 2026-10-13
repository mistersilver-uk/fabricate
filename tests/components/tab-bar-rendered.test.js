/**
 * Issue 2464: one family rule draws every tab strip. The real `EditorTabs` is mounted under each
 * caller's class vocabulary and host, laid under the sheet in Chromium, and measured.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { rulesIn, styleTextFor } from '../helpers/styleBlockScan.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { contrast, themePalettes } from '../helpers/themePaletteContrast.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const sheet = readStylesheet();

/** Foundry core's fixed button box, which the minimal core sheet does not state. */
const CORE_BUTTON = '@layer blocks{button{height:28px;overflow:hidden}}';

const TABS = Object.freeze(
  [['tiers'], ['outcomes'], ['validation'], ['settings', { tierGated: true }]].map(
    ([id, extra]) => ({ id, labelKey: `x.${id}`, label: `Section ${id}`, ...extra })
  )
);
const count = { vehicle: 'count', label: 3 };
const issue = (tone) => ({ vehicle: 'issue', label: 3, tone });
const MARKS = Object.freeze({
  tiers: count,
  outcomes: [count, { vehicle: 'dot', name: '1 issue' }],
});
const BADGED = Object.freeze({ ...MARKS, validation: issue('warning') });

const MANAGER = ['<div class="fabricate fabricate-manager">', '</div>'];
const within = (open, close) => [`${MANAGER[0]}${open}`, `${close}${MANAGER[1]}`];
const ALIAS = Object.freeze({
  containerClass: 'manager-environment-tabs',
  buttonClass: 'manager-environment-tab-button',
});

/** Each mount: the props a caller passes, the host it stands in, and the gaps its marks leave. */
const MOUNTS = Object.freeze({
  default: {},
  checks: {
    props: { ...ALIAS, containerClass: `${ALIAS.containerClass} manager-checks-sections` },
    host: within('<div data-checks-editor>', '</div>'),
  },
  environment: { props: { ...ALIAS, badgeClass: 'manager-environment-tab-badge' } },
  'entry-column': { host: within('<div class="manager-component-entry-column">', '</div>') },
  bare: { host: ['<div class="fabricate">', '</div>'] },
  'no-badge': { badges: MARKS, marks: { validation: 0 } },
  danger: {
    props: { danger: true },
    badges: { ...MARKS, tiers: [count, issue('danger')], validation: issue('danger') },
    marks: { tiers: 2 },
  },
});
const MARK_COUNTS = Object.freeze({ tiers: 1, outcomes: 2, validation: 1, settings: 1 });
const HOST_LINES = Object.freeze(['1.2', '1.6']);
const PROBED = Object.freeze([
  '--fab-text-muted',
  '--fab-text',
  '--fab-accent',
  '--fab-danger-text',
  '--fab-danger-border',
  '--fab-bg-2',
]);
const PROBES = PROBED.map(
  (token) => `<span data-probe="${token}" style="color:var(${token})"></span>`
).join('');

/** The family's tab, as the sheet states it at a 16px root. */
const TAB = Object.freeze({
  padding: '12px 12px 12px 12px',
  'font-size': '12.5px',
  'line-height': '20px',
  'column-gap': '6px',
  'border-bottom-width': '2px',
});
const TAB_HEIGHT = 46;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const page = (markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}
${CORE_BUTTON}</style>
<style>@layer modules {${sheet}}</style>
${['Chip', 'EditorTabs']
  .map((name) => `<style>${scopedComponentCss(resolve(repoRoot, component(name))).css}</style>`)
  .join('\n')}
</head><body class="game"><button data-core-button>Core</button>
${HOST_LINES.map(
  (line) => `<div data-host-line="${line}" style="width:900px;line-height:${line}">
${Object.entries(markup)
  .map(([key, html]) => {
    const [open, close] = MOUNTS[key].host ?? MANAGER;
    return `<section data-mount="${key}">${open}${html}${PROBES}${close}</section>`;
  })
  .join('\n')}
</div>`
).join('\n')}
</body></html>`;

/** Every strip on the page: its box, its host's probes, and each tab's box, paint and marks. */
function readStrips() {
  const box = (element) => {
    const { left, right, bottom, height } = element.getBoundingClientRect();
    return { left, right, bottom, height };
  };
  const readCount = (mark) => {
    if (!mark) return null;
    const style = getComputedStyle(mark);
    return {
      'font-size': style.fontSize,
      mono: /^"?JetBrains Mono/u.test(style.fontFamily),
      'font-weight': style.fontWeight,
      color: style.color,
    };
  };
  const readTab = (button) => {
    const style = getComputedStyle(button);
    const parts = [...button.children].map(box);
    return {
      id: button.id.replace(/^.*-tab-/u, ''),
      current: button.matches('.is-active'),
      danger: button.matches('.is-danger'),
      box: box(button),
      paint: {
        padding: ['Top', 'Right', 'Bottom', 'Left']
          .map((side) => style[`padding${side}`])
          .join(' '),
        'font-size': style.fontSize,
        'line-height': style.lineHeight,
        'column-gap': style.columnGap,
        'border-bottom-width': style.borderBottomWidth,
      },
      weight: style.fontWeight,
      color: style.color,
      border: style.borderBottomColor,
      gaps: parts.slice(1).map((part, index) => part.left - parts[index].right),
      count: readCount(button.querySelector('.manager-editor-tab-count')),
    };
  };
  return [...document.querySelectorAll('[data-mount]')].map((mount) => {
    const strip = mount.querySelector('[role="tablist"]');
    return {
      key: mount.dataset.mount,
      line: mount.parentElement.dataset.hostLine,
      strip: box(strip),
      probes: Object.fromEntries(
        [...mount.querySelectorAll('[data-probe]')].map((probe) => [
          probe.dataset.probe,
          getComputedStyle(probe).color,
        ])
      ),
      tabs: [...strip.querySelectorAll('[role="tab"]')].map(readTab),
    };
  });
}

async function mountedMarkup() {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-tab-bar-rendered-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
    compiledModules: [component('Chip'), component('EditorTabs')],
    componentPath: component('EditorTabs'),
  });
  await harness.setup();
  const markup = {};
  try {
    for (const [key, { props, badges = BADGED }] of Object.entries(MOUNTS)) {
      const root = await harness.mount({ tabs: TABS, activeTab: 'tiers', badges, ...props });
      markup[key] = root.innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  return markup;
}

let browser;
let tab;
let core;
let strips;

before(async () => {
  const markup = await mountedMarkup();
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(markup), { waitUntil: 'load' });
  core = await tab.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontSize,
    button: getComputedStyle(document.querySelector('[data-core-button]')).height,
  }));
  strips = await tab.evaluate(readStrips);
});

after(async () => {
  await browser?.close();
});

const named = ({ key, line }, { id }) => `${key} at host line ${line}, ${id}`;
const eachTab = (visit) => {
  for (const strip of strips) for (const drawn of strip.tabs) visit(strip, drawn);
};
const near = (actual, expected) => Math.abs(actual - expected) < 0.01;

it('stands on a 16px root, under the fixed button height Foundry core gives every button', () => {
  assert.deepEqual(core, { root: '16px', button: '28px' });
  assert.deepEqual(
    strips.map(({ key, line }) => `${key} ${line}`),
    HOST_LINES.flatMap((line) => Object.keys(MOUNTS).map((key) => `${key} ${line}`))
  );
});

it('draws every tab at the family’s padding, type, line and gap, under both class vocabularies', () => {
  eachTab((strip, drawn) => {
    assert.deepEqual(drawn.paint, TAB, named(strip, drawn));
    assert.equal(drawn.weight, drawn.current ? '600' : '500', named(strip, drawn));
  });
});

it('inks an idle tab muted, and the current tab and its border in the accent', () => {
  eachTab((strip, drawn) => {
    const { '--fab-text-muted': muted, '--fab-text': text, '--fab-accent': accent } = strip.probes;
    assert.equal(new Set([muted, text, accent]).size, 3, 'the three inks are distinct');
    if (drawn.danger) return;
    assert.equal(drawn.color, drawn.current ? accent : muted, named(strip, drawn));
    assert.equal(drawn.border, drawn.current ? accent : TRANSPARENT, named(strip, drawn));
  });
});

it('keeps a danger tab in the danger ink, current and idle, under the accent rule', () => {
  const expected = [
    ['tiers', true],
    ['validation', false],
  ];
  for (const strip of strips) {
    const danger = strip.tabs.filter((drawn) => drawn.danger);
    assert.deepEqual(
      danger.map(({ id, current }) => [id, current]),
      strip.key === 'danger' ? expected : [],
      strip.key
    );
    assert.notEqual(strip.probes['--fab-danger-text'], strip.probes['--fab-accent']);
    for (const drawn of danger) {
      assert.equal(drawn.color, strip.probes['--fab-danger-text'], named(strip, drawn));
      if (drawn.current) assert.equal(drawn.border, strip.probes['--fab-danger-border']);
    }
  }
});

it('takes the text ink on a hovered idle tab, and keeps the current tab’s own ink under hover', async () => {
  const [line] = HOST_LINES;
  for (const strip of strips) {
    if (strip.line !== line) continue;
    const inks = {};
    for (const id of ['outcomes', 'tiers']) {
      const hovered = tab.locator(
        `[data-host-line="${line}"] [data-mount="${strip.key}"] [role="tab"][id$="-${id}"]`
      );
      await hovered.hover();
      inks[id] = await hovered.evaluate((button) => getComputedStyle(button).color);
    }
    const current = strip.key === 'danger' ? '--fab-danger-text' : '--fab-accent';
    assert.deepEqual(
      inks,
      { outcomes: strip.probes['--fab-text'], tiers: strip.probes[current] },
      strip.key
    );
  }
  await tab.mouse.move(0, 0);
});

it('draws every tab 46px tall and flush, its bottom edge on its strip’s, in every host', () => {
  for (const strip of strips) {
    assert.equal(strip.tabs.length, TABS.length, strip.key);
    for (const [index, drawn] of strip.tabs.entries()) {
      assert.equal(drawn.box.height, TAB_HEIGHT, named(strip, drawn));
      assert.ok(
        near(drawn.box.bottom, strip.strip.bottom),
        `${named(strip, drawn)} ends ${strip.strip.bottom - drawn.box.bottom}px above its strip`
      );
      if (index === 0) continue;
      const gap = drawn.box.left - strip.tabs[index - 1].box.right;
      assert.ok(near(gap, 0), `${named(strip, drawn)} sits ${gap}px after the tab before it`);
    }
  }
});

it('sets each mark 6px after what precedes it', () => {
  for (const strip of strips) {
    const expected = { ...MARK_COUNTS, ...MOUNTS[strip.key].marks };
    for (const drawn of strip.tabs) {
      assert.deepEqual(
        drawn.gaps.map((gap) => Math.round(gap * 100) / 100),
        Array.from({ length: expected[drawn.id] }, () => 6),
        named(strip, drawn)
      );
    }
  }
});

it('draws a count at 10.5px mono 500 in the muted ink, on the current tab and on an idle one', () => {
  for (const strip of strips) {
    const counted = strip.tabs.filter((drawn) => drawn.count);
    assert.deepEqual(
      counted.map(({ id, current }) => [id, current]),
      [
        ['tiers', true],
        ['outcomes', false],
      ],
      strip.key
    );
    for (const drawn of counted) {
      assert.deepEqual(
        drawn.count,
        {
          'font-size': '10.5px',
          mono: true,
          'font-weight': '500',
          color: strip.probes['--fab-text-muted'],
        },
        named(strip, drawn)
      );
    }
  }
});

/** A computed `rgb()` or `rgba()` in the palette's own space-separated form. */
function paletteForm(computed) {
  const [red, green, blue, alpha = '1'] = computed.match(/[\d.]+/gu);
  return `rgb(${red} ${green} ${blue} / ${Number(alpha) * 100}%)`;
}

/** The count's and the idle label's computed inks and the `--fab-bg-2` ground, under one palette. */
function readThemed(theme) {
  const mount = document.querySelector('[data-mount="default"]');
  mount.firstElementChild.dataset.fabricateTheme = theme;
  const ink = (selector) => getComputedStyle(mount.querySelector(selector)).color;
  return {
    count: ink('[role="tab"]:not(.is-active) .manager-editor-tab-count'),
    label: ink('[role="tab"]:not(.is-active) > span'),
    ground: ink('[data-probe="--fab-bg-2"]'),
  };
}

it('reads the count and the idle label at 4.5:1 or over on bg-2 in every palette', async (t) => {
  const themes = [...themePalettes(rulesIn(styleTextFor('styles/fabricate.css', sheet))).keys()];
  assert.equal(themes.length, 7, `the sheet declares ${themes.length} palettes, not seven`);
  const under = [];
  const grounds = new Set();
  for (const theme of themes) {
    const themed = await tab.evaluate(readThemed, theme);
    grounds.add(themed.ground);
    for (const part of ['count', 'label']) {
      const ratio = contrast(paletteForm(themed[part]), paletteForm(themed.ground));
      t.diagnostic(`${theme} ${part}: ${ratio.toFixed(2)}:1 on --fab-bg-2`);
      if (ratio < 4.5) under.push(`${theme} ${part} ${ratio.toFixed(2)}:1`);
    }
  }
  assert.equal(grounds.size, themes.length, 'each palette paints its own ground');
  // A reading under the floor is issue 2368's ink debt: record it here, never loosen the floor.
  assert.deepEqual(under, []);
});
