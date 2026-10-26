/**
 * Issue 2621 — a disabled `ArmedDangerButton` that is still armed draws `Button`'s disabled face,
 * not the solid `--fab-danger` armed fill. Chromium draws the three faces under the module sheet
 * in each of the seven themes, because the cascade is what happy-dom cannot compute.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { colourOf, staticComponentPage } from '../helpers/staticComponentPage.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/components/ArmedDangerButton.svelte';

const THEMES = Object.freeze([
  'fabricate',
  'foundry-native',
  'hearth-herb',
  'ironblood-forge',
  'mythwright',
  'sovereign',
  'starglass-arcana',
]);

const FACES = Object.freeze({
  'armed-enabled': { armed: true },
  'armed-disabled': { armed: true, disabled: true },
  'idle-disabled': { disabled: true },
});

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-armed-disabled-',
  compiledModules: ['src/ui/svelte/components/Button.svelte', componentPath],
  componentPath,
});

describe('a disabled armed danger button draws the disabled face (issue 2621)', () => {
  let browser;
  let page;

  before(async () => {
    const hosts = [];
    await harness.setup();
    try {
      for (const [name, props] of Object.entries(FACES)) {
        const target = await harness.mount({
          token: 'delete:a',
          idleLabel: 'Delete',
          armedLabel: 'Confirm delete',
          ...props,
        });
        hosts.push(`<div data-case="${name}">${target.innerHTML}</div>`);
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(staticComponentPage([], hosts), { waitUntil: 'load' });
  });

  after(async () => {
    await browser?.close();
  });

  const paint = (name) =>
    page.evaluate((caseName) => {
      const button = document.querySelector(`[data-case="${caseName}"] button`);
      const style = getComputedStyle(button);
      return {
        background: style.backgroundColor,
        border: style.borderTopColor,
        color: style.color,
        opacity: style.opacity,
        armed: button.dataset.armed,
        disabled: button.disabled,
        isArmed: button.classList.contains('is-armed'),
      };
    }, name);

  for (const theme of THEMES) {
    it(`draws the disabled face, not the armed fill, in ${theme}`, async () => {
      await page.evaluate((id) => {
        document.querySelector('.fabricate').dataset.fabricateTheme = id;
      }, theme);
      const solid = await colourOf(page, '--fab-danger');
      const enabled = await paint('armed-enabled');
      const armedOff = await paint('armed-disabled');
      const idleOff = await paint('idle-disabled');

      assert.equal(enabled.background, solid, 'anti-vacuity: an enabled armed control is solid');
      assert.equal(armedOff.armed, 'true', 'the owner still holds the token');
      assert.equal(armedOff.isArmed, true);
      assert.equal(armedOff.disabled, true);
      assert.notEqual(armedOff.background, solid);
      for (const key of ['background', 'border', 'color', 'opacity']) {
        assert.equal(
          armedOff[key],
          idleOff[key],
          `${theme}: ${key} matches the idle disabled face`
        );
      }
    });
  }
});
