/**
 * Issue 2852 — the published `Button`'s pressed face, measured in Chromium on the markup the seam
 * draws, under the module sheet: in each of the seven visual roles at rest and under the pointer,
 * its label, edge and fill against the four grounds and the unpressed face in all seven palettes as
 * the cascade resolves them,
 * its difference from the unpressed face and the keyboard ring, its disabled form, and forced
 * colours.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { contrast, flatten } from '../helpers/themePaletteContrast.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-button-pressed-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

const ROLES = Object.freeze(['neutral', 'primary', 'ghost', 'dashed', 'danger', 'warning', 'info']);
const THEMES = Object.freeze([
  'fabricate',
  'mythwright',
  'ironblood-forge',
  'hearth-herb',
  'starglass-arcana',
  'foundry-native',
  'sovereign',
]);
const GROUNDS = Object.freeze(['--fab-bg-0', '--fab-bg-1', '--fab-surface', '--fab-bg-2']);
const TOKENS = Object.freeze(['--fab-accent', '--fab-accent-hover', '--fab-on-accent']);

/** Each case's id and the props its button takes beside the label and `onclick`. */
const CASES = Object.freeze([
  ...ROLES.flatMap((role) => [
    [`pressed-${role}`, { role, pressed: true }],
    [`rest-${role}`, { role, pressed: false }],
  ]),
  ['pressed-disabled', { pressed: true, disabled: true }],
  ['rest-disabled', { pressed: false, disabled: true }],
]);

let browser;
let tab;

before(async () => {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const [id, props] of CASES) {
      const target = fabricateTarget(shells);
      const handle = ui.mount('Button', {
        target,
        props: { children: 'Show the reward', onclick() {}, ...props },
      });
      await settle();
      cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  const probes = [...GROUNDS, ...TOKENS]
    .map((token) => `<i data-token="${token}" style="background:var(${token})"></i>`)
    .join('');
  const system = ['highlight', 'graytext']
    .map((name) => `<i data-system="${name}" style="background:${name}"></i>`)
    .join('');
  browser = await chromium.launch();
  tab = await browser.newPage({ viewport: { width: 900, height: 1400 } });
  await tab.setContent(
    `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">` +
      '<style>[data-case]{display:flex;padding:8px}</style>' +
      `${cells.join('')}<div>${probes}${system}</div></div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

/** The face of the case's button, or of every role's, as Chromium computes it now. */
const faceOf = (id) =>
  tab.evaluate((hook) => {
    const button = document.querySelector(`[data-case="${hook}"] button`);
    const style = getComputedStyle(button);
    return {
      ink: style.color,
      fill: style.backgroundColor,
      edge: style.borderTopColor,
      outline: style.outlineStyle,
      opacity: style.opacity,
    };
  }, id);

/** Every probe's computed background, keyed by its token or system colour. */
const probesNow = () =>
  tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-token], [data-system]')].map((probe) => [
        probe.dataset.token ?? probe.dataset.system,
        getComputedStyle(probe).backgroundColor,
      ])
    )
  );

const setTheme = (theme) =>
  tab.evaluate((id) => {
    document.querySelector('.fabricate').dataset.fabricateTheme = id;
  }, theme);

/** A computed `rgb()`/`rgba()` as the palette helper's `rgb(r g b / a%)`. */
function paletteForm(computed) {
  const [r, g, b, a = '1'] = computed.match(/[\d.]+/gu);
  return `rgb(${r} ${g} ${b} / ${Number(a) * 100}%)`;
}

const hover = async (id) => {
  await tab.hover(`[data-case="${id}"] button`);
  return faceOf(id);
};

describe('the published pressed Button', () => {
  it('draws the pressed tile in every role at rest and under the pointer, whatever the role draws there', async () => {
    await setTheme('fabricate');
    const token = await probesNow();
    for (const role of ROLES) {
      const rest = await faceOf(`pressed-${role}`);
      assert.deepEqual(
        [rest.fill, rest.edge, rest.ink],
        [token['--fab-accent'], token['--fab-accent'], token['--fab-on-accent']],
        `${role} at rest`
      );
      const hovered = await hover(`pressed-${role}`);
      assert.deepEqual(
        [hovered.fill, hovered.edge, hovered.ink],
        [token['--fab-accent-hover'], token['--fab-accent-hover'], token['--fab-on-accent']],
        `${role} under the pointer`
      );
    }
    await tab.mouse.move(0, 0);
  });

  it('clears 4.5:1 for its label, 3:1 for its edge against the ground and 3:1 for its fill against the unpressed face but primary’s, on the four grounds in all seven palettes', async (t) => {
    const found = [];
    const worst = { ink: Infinity, edge: Infinity, apart: Infinity };
    const drawnGrounds = new Set();
    const note = (theme, role, state, ground, what, ratio, floor) => {
      worst[what] = Math.min(worst[what], ratio);
      if (ratio < floor)
        found.push(`${theme} ${role} ${state} on ${ground}: ${what} ${ratio.toFixed(2)}`);
    };
    for (const theme of THEMES) {
      await setTheme(theme);
      const grounds = await probesNow();
      drawnGrounds.add(grounds['--fab-bg-1']);
      for (const role of ROLES) {
        const unpressed = await faceOf(`rest-${role}`);
        for (const [state, face] of [
          ['rest', await faceOf(`pressed-${role}`)],
          ['hover', await hover(`pressed-${role}`)],
        ]) {
          for (const ground of GROUNDS) {
            const base = paletteForm(grounds[ground]);
            const fill = flatten(paletteForm(face.fill), base);
            note(theme, role, state, ground, 'ink', contrast(paletteForm(face.ink), fill), 4.5);
            note(theme, role, state, ground, 'edge', contrast(paletteForm(face.edge), base), 3);
            // A pressed `primary` is told from its own success fill by hue alone, as the group states.
            if (state === 'rest' && role !== 'primary') {
              const rest = flatten(paletteForm(unpressed.fill), base);
              note(theme, role, state, ground, 'apart', contrast(fill, rest), 3);
            }
          }
        }
      }
    }
    await tab.mouse.move(0, 0);
    await setTheme('fabricate');
    assert.equal(drawnGrounds.size, THEMES.length, 'each palette resolved its own ground');
    t.diagnostic(
      `worst ink ${worst.ink.toFixed(2)}:1, edge ${worst.edge.toFixed(2)}:1, fill against unpressed ${worst.apart.toFixed(2)}:1`
    );
    assert.deepEqual(found, []);
  });

  it('differs from the keyboard ring by more than an outline', async () => {
    await tab.keyboard.press('Tab');
    await tab.focus('[data-case="rest-neutral"] button');
    const focused = await faceOf('rest-neutral');
    const pressed = await faceOf('pressed-neutral');
    assert.equal(focused.outline, 'solid', 'the keyboard ring is an outline');
    assert.equal(pressed.outline, 'none', 'and the pressed face draws none');
    assert.notEqual(focused.fill, pressed.fill, 'the focused unpressed face keeps its own fill');
    await tab.evaluate(() => document.activeElement?.blur());
  });

  it('keeps its tile under the disabled face, so a disabled toggle still shows its state', async () => {
    await setTheme('fabricate');
    const token = await probesNow();
    const [pressed, rest] = [await faceOf('pressed-disabled'), await faceOf('rest-disabled')];
    assert.equal(pressed.opacity, rest.opacity, 'both take the disabled opacity');
    assert.deepEqual([pressed.fill, pressed.edge], [token['--fab-accent'], token['--fab-accent']]);
    assert.notEqual(pressed.fill, rest.fill);
  });

  it('stays distinct under forced colours: Highlight while pressed, GrayText while pressed and disabled', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      const system = await probesNow();
      const [pressed, rest] = [await faceOf('pressed-neutral'), await faceOf('rest-neutral')];
      assert.equal(pressed.fill, system.highlight);
      assert.notEqual(pressed.fill, rest.fill, 'the reader’s palette tells them apart');
      const hovered = await hover('pressed-ghost');
      assert.equal(hovered.fill, system.highlight, 'under the pointer too');
      await tab.mouse.move(0, 0);
      const disabled = await faceOf('pressed-disabled');
      assert.deepEqual([disabled.fill, disabled.opacity], [system.graytext, '1']);
      assert.notEqual(disabled.fill, (await faceOf('rest-disabled')).fill);
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
  });
});
