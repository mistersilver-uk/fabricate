/**
 * Issue 3037 — a validation row's status icon and the summary's medallion take the `-text` ink of
 * their severity, the tone the `<ValidationSummary>` specimen draws them in, in every palette the
 * module sheet ships, and not the bare `--fab-success|--fab-warning|--fab-danger` the rules read
 * before; and a toned status pill paints a fill of its own, which a class assertion cannot show.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const INKS = Object.freeze({
  pass: ['--fab-success-text', '--fab-success'],
  warn: ['--fab-warning-text', '--fab-warning'],
  block: ['--fab-danger-text', '--fab-danger'],
});

/** Each surface's marks: the row's status icon, then the summary's medallion. */
const MARKS = Object.freeze(['icon', 'medallion']);
const TONES = Object.freeze(['neutral', 'positive', 'warning', 'danger']);

const THEMES = Object.freeze([
  ...new Set(
    [...readStylesheet().matchAll(/^\.fabricate\[data-fabricate-theme="([a-z-]+)"\]/gmu)].map(
      (match) => match[1]
    )
  ),
]);

const page = () => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
</head><body class="game">
${THEMES.map(
  (
    theme
  ) => `<div class="fabricate fabricate-manager" data-fabricate-theme="${theme}" data-theme-case="${theme}">
  ${Object.entries(INKS)
    .map(
      ([
        status,
        [text, bare],
      ]) => `<span data-probe="${status}-text" style="color:var(${text})"></span>
  <span data-probe="${status}-bare" style="color:var(${bare})"></span>`
    )
    .join('\n')}
  <section class="fabricate-validation"><ul>
    <li class="manager-recipe-val-row is-pass"><i class="manager-recipe-val-status fas fa-circle-check" data-ink="icon-pass"></i></li>
    <li class="manager-recipe-val-row is-warn"><i class="manager-recipe-val-status fas fa-circle-check" data-ink="icon-warn"></i></li>
    <li class="manager-recipe-val-row is-block"><i class="manager-recipe-val-status fas fa-circle-check" data-ink="icon-block"></i></li>
  </ul>
  <div class="manager-recipe-rail-summary is-pass"><span class="manager-recipe-rail-summary-medallion" data-ink="medallion-pass"></span></div>
  <div class="manager-recipe-rail-summary is-warn"><span class="manager-recipe-rail-summary-medallion" data-ink="medallion-warn"></span></div>
  <div class="manager-recipe-rail-summary is-block"><span class="manager-recipe-rail-summary-medallion" data-ink="medallion-block"></span></div>
  </section>
</div>`
).join('\n')}
</body></html>`;

/** Each theme's computed colour per mark and status, and the two probe colours it is compared with. */
function readInks() {
  const color = (node) => getComputedStyle(node).color;
  return Object.fromEntries(
    [...document.querySelectorAll('[data-theme-case]')].map((host) => [
      host.dataset.themeCase,
      Object.fromEntries(
        ['pass', 'warn', 'block'].map((status) => [
          status,
          {
            icon: color(host.querySelector(`[data-ink="icon-${status}"]`)),
            medallion: color(host.querySelector(`[data-ink="medallion-${status}"]`)),
            text: color(host.querySelector(`[data-probe="${status}-text"]`)),
            bare: color(host.querySelector(`[data-probe="${status}-bare"]`)),
          },
        ])
      ),
    ])
  );
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-validation-ink-rendered-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/Chip.svelte',
});

/** The real `Chip` in each tone, under its scoped styles, drawn as the validation pill draws it. */
async function mountPills() {
  const shells = [];
  const cells = [];
  await harness.setup();
  try {
    const { publishedComponentRuntime: runtime, COMPONENTS: components } =
      await harness.loadRuneModule(PUBLISHED_ADAPTER);
    const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
    const ui = shippedSeam({ createPublishedComponents, runtime, components, report() {} });
    for (const tone of TONES) {
      const target = companionTarget(shells);
      const handle = ui.mount('Chip', { target, props: { tone, children: 'Pass' } });
      await settle();
      cells.push(`<div data-tone="${tone}">${target.innerHTML}</div>`);
      handle.destroy();
    }
  } finally {
    for (const shell of shells) shell.remove();
    harness.teardown();
  }
  return cells.join('');
}

let browser;
let inks;
let fills;

before(async () => {
  const pills = await mountPills();
  browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await tab.setContent(page(), { waitUntil: 'load' });
  inks = await tab.evaluate(readInks);
  const pillTab = await browser.newPage({ viewport: { width: 600, height: 300 } });
  await pillTab.setContent(
    `${renderedPageHead(['Chip'])}<body class="game">` +
      `<div class="fabricate fabricate-app" data-fabricate-theme="fabricate">${pills}</div></body></html>`,
    { waitUntil: 'load' }
  );
  fills = await pillTab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-tone]')].map((cell) => [
        cell.dataset.tone,
        getComputedStyle(cell.querySelector('.manager-chip')).backgroundColor,
      ])
    )
  );
});

after(async () => {
  await browser?.close();
});

it('reads every palette the token sheet ships', () => {
  assert.ok(THEMES.length >= 7, `only ${THEMES.length} palettes were found: ${THEMES.join(', ')}`);
  assert.deepEqual(Object.keys(inks), THEMES);
});

it('inks each status icon and summary medallion in its severity `-text` token, in every palette', () => {
  const differing = [];
  for (const [theme, statuses] of Object.entries(inks)) {
    for (const [status, ink] of Object.entries(statuses)) {
      for (const mark of MARKS) {
        assert.equal(ink[mark], ink.text, `${theme} ${status} ${mark}: ${INKS[status][0]}`);
        if (ink.text !== ink.bare) {
          assert.notEqual(
            ink[mark],
            ink.bare,
            `${theme} ${status} ${mark} reads ${INKS[status][1]}`
          );
          differing.push(`${theme} ${status} ${mark}`);
        }
      }
    }
  }
  assert.ok(differing.length > 0, 'the `-text` and bare tokens resolve alike everywhere');
});

it('paints a toned status pill with a fill of its own, unlike the neutral chip', () => {
  const toned = TONES.filter((name) => name !== 'neutral').map((tone) => [tone, fills[tone]]);
  assert.equal(toned.length, 3);
  assert.ok(
    toned.every(([, fill]) => fill !== fills.neutral && fill !== 'rgba(0, 0, 0, 0)'),
    `a toned pill paints the neutral or no fill: ${JSON.stringify({ ...fills })}`
  );
});
