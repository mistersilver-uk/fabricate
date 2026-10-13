/**
 * Issue 2465 — what a check's character value draws in Chromium, computed from the component's
 * mounted markup: the box the field shell gives its stored-path field, and the border the
 * component's own rules state over that shell's.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { CHECKS_TREE_RAW_MODULES } from '../helpers/checksHarnessModules.js';
import { colourOf, staticComponentPage } from '../helpers/staticComponentPage.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';
const CHIP = 'src/ui/svelte/components/Chip.svelte';
const CCVF = 'src/ui/svelte/apps/manager/checks/CheckCharacterValueField.svelte';

const PATH = 'system.resources.momentum.value';

/** A Preview-as character whose stored document answers `read` at every path. */
const brenna = (read) => ({ name: 'Brenna', rollData: {}, readStored: () => read });

/** The sentences a caller passes to make the field a stored-path one. */
const PATH_COPY = Object.freeze({
  empty: 'No source set.',
  unresolved: '{actor} has no stored number at {path}.',
  overridden: "An active effect changes {actor}'s {path}.",
});

/** Each stored-path case, mounted in a field shell as the additional-dice group stands it. */
const STORED_PATH = Object.freeze({
  danger: { value: '', character: brenna({ value: 2, overridden: false }) },
  warning: { value: PATH, character: brenna({}) },
  resolved: { value: PATH, character: brenna({ value: 2, overridden: false }) },
});

const inShell = (name, field) =>
  `<div class="fabricate-field" data-case="${name}"><span>Path</span>${field}</div>`;

describe("a check's character value, drawn (issue 2465)", () => {
  let browser;
  let page;

  before(async () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-check-character-value-rendered-',
      rawModules: CHECKS_TREE_RAW_MODULES,
      compiledModules: ['src/ui/svelte/components/Button.svelte', CHIP, RDE, CCVF],
      componentPath: CCVF,
    });
    await harness.setup();
    const hosts = [];
    try {
      for (const [name, props] of Object.entries(STORED_PATH)) {
        const target = await harness.mount({
          label: 'Path on the crafting character',
          hooks: { expression: 'data-path', resolution: 'data-path-line' },
          documentPath: PATH_COPY,
          ...props,
        });
        hosts.push(inShell(name, target.innerHTML));
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(staticComponentPage([CCVF, RDE, CHIP], hosts), { waitUntil: 'load' });
  });

  after(async () => {
    await browser?.close();
  });

  /** The stored-path input of one case, as the figures the clauses below read. */
  function pathInputOf(name) {
    return page.evaluate((host) => {
      const input = document.querySelector(`[data-case="${host}"] input[data-path]`);
      const style = getComputedStyle(input);
      return {
        border: style.borderTopColor,
        invalid: input.getAttribute('aria-invalid'),
        mono: /^"?JetBrains Mono/u.test(style.fontFamily),
        size: style.fontSize,
        weight: style.fontWeight,
        height: input.getBoundingClientRect().height,
      };
    }, name);
  }

  it('reads three border colours that differ, so a match below is no accident', async () => {
    const colours = await Promise.all(
      ['--fab-danger-border', '--fab-warning-border', '--fab-border'].map((token) =>
        colourOf(page, token)
      )
    );
    assert.equal(new Set(colours).size, 3, colours.join(' | '));
  });

  for (const [name, token, invalid] of [
    ['danger', '--fab-danger-border', 'true'],
    ['warning', '--fab-warning-border', 'true'],
    ['resolved', '--fab-border', 'false'],
  ]) {
    it(`draws the stored-path field in the shell's box and the mono face, bordered ${token}: ${name}`, async () => {
      assert.deepEqual(await pathInputOf(name), {
        border: await colourOf(page, token),
        invalid,
        mono: true,
        size: '11.5px',
        weight: '500',
        height: 38,
      });
    });
  }
});
