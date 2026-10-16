/**
 * Issue 2465 — what a check's character value draws in Chromium, computed from the component's
 * mounted markup: the box the field shell gives its stored-path field, the border the component's
 * own rules state over that shell's, and where the field's reading stands against the line.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { CHECKS_TREE_RAW_MODULES } from '../helpers/checksHarnessModules.js';
import { colourOf, staticComponentPage } from '../helpers/staticComponentPage.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/components/RollDataExpressionInput.svelte';
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

const inShell = (name, field) =>
  `<div class="fabricate-field" data-case="${name}"><span>Path</span>${field}</div>`;

const storedPath = (props) => ({
  props: {
    label: 'Path on the crafting character',
    hooks: { expression: 'data-field', resolution: 'data-line' },
    documentPath: PATH_COPY,
    ...props,
  },
  host: inShell,
});

/** Each stored-path case, mounted in a field shell as the additional-dice group stands it. */
const STORED_PATH = Object.freeze({
  danger: storedPath({ value: '', character: brenna({ value: 2, overridden: false }) }),
  warning: storedPath({ value: PATH, character: brenna({}) }),
  resolved: storedPath({ value: PATH, character: brenna({ value: 2, overridden: false }) }),
});

const inDifficultyField = (name, field) =>
  `<div class="manager-checks-difficulty-field is-expression" data-case="${name}" style="width:320px">` +
  `<span class="manager-checks-difficulty-label">Character value</span>${field}</div>`;

const expression = (value) => ({
  props: {
    value,
    label: 'Character value',
    character: { name: 'Idrin', rollData: { skills: { craft: { value: 12 } } } },
    hooks: { expression: 'data-field', hint: 'data-hint', resolution: 'data-line' },
  },
  host: inDifficultyField,
});

/** Each expression case, mounted in the Difficulty card's own field host. */
const EXPRESSION = Object.freeze({
  'expression-resolved': expression('@skills.craft.value'),
  'expression-unresolved': expression('@skills.lore.value'),
});

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
      for (const [name, { props, host }] of Object.entries({ ...STORED_PATH, ...EXPRESSION })) {
        const target = await harness.mount(props);
        hosts.push(host(name, target.innerHTML));
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
      const input = document.querySelector(`[data-case="${host}"] input[data-field]`);
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

  /** One case's parts top to bottom, each as its edges against the field's left edge. */
  function stackOf(name) {
    return page.evaluate((host) => {
      const root = document.querySelector(`[data-case="${host}"]`);
      const field = root.querySelector('input[data-field]').getBoundingClientRect();
      const edges = (selector) => {
        const node = root.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left - field.left, top: box.top, bottom: box.bottom };
      };
      return {
        fieldBottom: field.bottom,
        row: edges('.fab-expr-input-row'),
        reading: edges('[data-expr-input-reading]'),
        tone: root.querySelector('[data-expr-input-reading]')?.dataset.exprInputReading ?? '',
        line: edges('[data-line]'),
      };
    }, name);
  }

  /** The reading starts at the field's left edge, on a row of its own beneath the field. */
  function assertReadingUnderField(stack, name) {
    assert.ok(stack.row.top >= stack.fieldBottom, `${name}: the row stands beneath the field`);
    assert.ok(
      Math.abs(stack.reading.left) <= 0.5,
      `${name}: the reading starts ${stack.reading.left}px from the field's left edge`
    );
  }

  it('stands an expression’s reading between the field and the line, and alone where it resolves', async () => {
    const resolved = await stackOf('expression-resolved');
    assert.equal(resolved.tone, 'resolved');
    assertReadingUnderField(resolved, 'resolved');
    assert.equal(resolved.line, null, 'a resolved value draws no line');

    const unresolved = await stackOf('expression-unresolved');
    assert.equal(unresolved.tone, 'unresolved');
    assertReadingUnderField(unresolved, 'unresolved');
    assert.ok(
      unresolved.line.top >= unresolved.row.bottom,
      `the line starts at ${unresolved.line.top}px, above the row's bottom edge at ${unresolved.row.bottom}px`
    );
  });

  it('stands a stored path’s reading between the field and the line, under the border its line gives', async () => {
    const resolved = await stackOf('resolved');
    assert.equal(resolved.tone, 'resolved');
    assertReadingUnderField(resolved, 'resolved');
    assert.equal(resolved.line, null, 'a stored number draws no line');

    const warning = await stackOf('warning');
    assert.equal(warning.tone, 'unresolved');
    assertReadingUnderField(warning, 'warning');
    assert.ok(
      warning.line.top >= warning.row.bottom,
      `the line starts at ${warning.line.top}px, above the row's bottom edge at ${warning.row.bottom}px`
    );
    assert.equal(
      (await pathInputOf('warning')).border,
      await colourOf(page, '--fab-warning-border'),
      'the field keeps its warning border under the unresolved reading'
    );

    const empty = await stackOf('danger');
    assert.deepEqual(
      [empty.reading, empty.row, Boolean(empty.line)],
      [null, null, true],
      'an empty path draws the line alone'
    );
  });
});
