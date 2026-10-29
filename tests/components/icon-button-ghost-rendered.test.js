/**
 * Issue 2632: the ghost icon button's resting paint and its drawn width, measured in Chromium on
 * the real `IconButton` markup under the module stylesheet. `ghost-danger` rests with no edge and
 * the subtle ink and keeps the danger treatment on hover and keyboard focus; the ghost rung is 28
 * wide in a flex row, hover tile included, while the default and compact rungs stay as shipped.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const ICON_BUTTON_PATH = 'src/ui/svelte/components/IconButton.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-icon-button-ghost-',
  rawModules: ['src/ui/svelte/util/appLocalizer.js'],
  compiledModules: [ICON_BUTTON_PATH],
  componentPath: ICON_BUTTON_PATH,
});

/** Each case's props; every button is named and carries a glyph. */
const CASES = Object.freeze({
  ghost: { role: 'ghost' },
  'ghost-danger': { role: 'ghost-danger' },
  'ghost-danger-disabled': { role: 'ghost-danger', disabled: true },
  'ghost-disabled': { role: 'ghost', disabled: true },
  danger: { role: 'danger' },
  neutral: {},
  'size-24': { role: 'ghost', size: '24' },
  'size-26': { size: '26' },
});

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

let browser;
let page;

/** The border colour, ink, ground and box of the button under `key`, resolved in the page. */
const paint = (key) =>
  page.evaluate((hook) => {
    const button = document.querySelector(`[data-case="${hook}"] button`);
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    return {
      border: style.borderTopColor,
      ink: style.color,
      ground: style.backgroundColor,
      width: box.width,
      height: box.height,
    };
  }, key);

/** What a token resolves to as a colour on the first button, so no colour literal is written here. */
const token = (name) =>
  page.evaluate((property) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${property})`;
    document.querySelector('[data-case="neutral"] button').append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, name);

before(async () => {
  await harness.setup();
  const markup = {};
  try {
    for (const [key, extra] of Object.entries(CASES)) {
      markup[key] = (
        await harness.mount({ icon: 'fas fa-xmark', ariaLabel: `Remove ${key}`, ...extra })
      ).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  const rows = Object.entries(markup)
    .map(([key, html]) => `<div data-case="${key}" style="display:flex">${html}</div>`)
    .join('');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 600, height: 500 } });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
</head><body class="game"><div class="fabricate fabricate-manager" data-fabricate-theme="fabricate">${rows}</div></body></html>`,
    { waitUntil: 'load' }
  );
});

after(async () => {
  await browser?.close();
});

describe('the ghost icon button, rendered (issue 2632)', () => {
  it('draws ghost-danger quietly at rest: no edge, no fill, the subtle ink', async () => {
    const rest = await paint('ghost-danger');
    assert.equal(rest.border, TRANSPARENT, 'no resting edge');
    assert.equal(rest.ground, TRANSPARENT, 'no resting fill');
    assert.equal(rest.ink, await token('--fab-text-subtle'), 'the subtle ink');
  });

  it('draws ghost-danger as the ghost does at rest', async () => {
    const [danger, ghost] = [await paint('ghost-danger'), await paint('ghost')];
    assert.deepEqual(
      [danger.border, danger.ink, danger.ground],
      [ghost.border, ghost.ink, ghost.ground]
    );
  });

  it('keeps the danger tile under the pointer', async () => {
    await page.hover('[data-case="ghost-danger"] button');
    const hover = await paint('ghost-danger');
    await page.mouse.move(0, 0);
    assert.equal(hover.ink, await token('--fab-danger-text'));
    assert.equal(hover.ground, await token('--fab-danger-soft'));
    assert.equal(hover.border, await token('--fab-danger-border'));
  });

  it('keeps the danger face on keyboard focus', async () => {
    await page.focus('body');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() =>
      document.activeElement.closest('[data-case]').getAttribute('data-case')
    );
    assert.equal(focused, 'ghost-danger', 'Tab reached the ghost-danger button');
    const face = await paint('ghost-danger');
    await page.evaluate(() => document.activeElement.blur());
    assert.equal(face.ink, await token('--fab-danger-text'));
    assert.equal(face.ground, await token('--fab-danger-soft'));
    assert.equal(face.border, await token('--fab-danger-border'));
  });

  it('draws a disabled ghost-danger from the disabled face, as a disabled ghost does', async () => {
    const [danger, ghost] = [await paint('ghost-danger-disabled'), await paint('ghost-disabled')];
    assert.deepEqual(
      [danger.border, danger.ink, danger.ground],
      [ghost.border, ghost.ink, ghost.ground]
    );
    assert.equal(danger.ink, await token('--fab-text-muted'));
  });

  it('leaves the plain danger button its danger edge and ink at rest', async () => {
    const rest = await paint('danger');
    assert.equal(rest.border, await token('--fab-danger-border'));
    assert.equal(rest.ink, await token('--fab-danger-text'));
  });

  it('draws the ghost rung 28 wide in a flex row, and its hover tile 28 by 28', async () => {
    for (const key of ['ghost', 'ghost-danger']) {
      const rest = await paint(key);
      assert.deepEqual([rest.width, rest.height], [28, 28], `${key} at rest`);
      await page.hover(`[data-case="${key}"] button`);
      const hover = await paint(key);
      await page.mouse.move(0, 0);
      assert.deepEqual([hover.width, hover.height], [28, 28], `${key} under the pointer`);
    }
  });

  it('leaves the default and compact rungs as shipped', async () => {
    const sizes = {};
    for (const key of ['neutral', 'danger', 'size-24', 'size-26']) {
      const { width, height } = await paint(key);
      sizes[key] = [width, height];
    }
    assert.deepEqual(sizes, {
      neutral: [34, 34],
      danger: [34, 34],
      'size-24': [24, 24],
      'size-26': [26, 26],
    });
  });
});
