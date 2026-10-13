/**
 * Issue 2465 — what `<ExprInput>` draws and does in Chromium. The static half computes the faces
 * the field, its reading and its tokens state, from the component's mounted markup; the live half
 * runs the real component in `tests/fixtures/expr-input/`, presses its tokens by pointer and by
 * keyboard, and reads what its status region says and what the engine's accessibility tree holds.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { getModifierExpressionSuggestions } from '../../src/config/modifierExpressionSuggestions.js';
import { colourOf, staticComponentPage } from '../helpers/staticComponentPage.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer, pressPointerOn } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';
const CHIP = 'src/ui/svelte/components/Chip.svelte';

/** Rounding tolerance for a fractional rect. */
const EPSILON = 0.5;

const TOKEN = '.fab-expr-input-token';
const FIELD = 'input.fab-expr-input';
const READING = '[data-expr-input-reading]';
const STATUS = '[data-expr-input-status]';

/** The entry's three tokens, which a 300px host cannot hold on one line beside a reading. */
const ENTRY_TERMS = Object.freeze(['@prof', '@abilities.dex.mod', '@skills.cra.rank']);

/** What a caller passes for a reading that reduces, and for one that does not. */
const REDUCED = Object.freeze({ resolve: () => 13, unresolvedLabel: 'Unresolved' });
const UNREDUCED = Object.freeze({ resolve: () => null, unresolvedLabel: 'Unresolved' });

/** A statement far wider than the 120px host it is mounted in. */
const LONG_STATEMENT =
  'Dieser Ausdruck lässt sich für die gewählte Figur nicht auf eine Zahl zurückführen';

/** The longest row a shipped world offers: five terms, one of them 43 characters. */
const PF2E_TERMS = getModifierExpressionSuggestions('pf2e').map(({ expression }) => expression);

/** Each static case: the props the field is mounted with, and the host its markup stands in. */
const CASES = Object.freeze({
  bare: {
    props: { tokens: ['@prof.gy', '1d4'] },
    host: (field) => `<div data-case="bare">${field}</div>`,
  },
  shell: {
    props: { tokens: ['@prof.gy', '1d4'] },
    host: (field) =>
      `<div class="fabricate-field" data-case="shell"><span>Expression</span>${field}</div>`,
  },
  disabled: {
    props: { tokens: ['@prof.gy', '1d4'], disabled: true },
    host: (field) => `<div data-case="disabled">${field}</div>`,
  },
  narrow: {
    props: { tokens: PF2E_TERMS },
    host: (field) => `<div data-case="narrow" style="width:220px">${field}</div>`,
  },
  reading: {
    props: { ...REDUCED },
    host: (field) => `<div data-case="reading">${field}</div>`,
  },
  both: {
    props: { tokens: ENTRY_TERMS, ...REDUCED },
    host: (field) => `<div data-case="both" style="width:300px">${field}</div>`,
  },
  unresolved: {
    props: { ...UNREDUCED },
    host: (field) => `<div data-case="unresolved">${field}</div>`,
  },
  long: {
    props: { resolve: () => null, unresolvedLabel: LONG_STATEMENT },
    host: (field) => `<div data-case="long" style="width:120px">${field}</div>`,
  },
  blank: {
    props: { value: '', ...REDUCED },
    host: (field) => `<div data-case="blank">${field}</div>`,
  },
  plain: {
    props: { value: '' },
    host: (field) => `<div data-case="plain">${field}</div>`,
  },
});

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@expr-input-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

describe('ExprInput, drawn (issue 2465)', () => {
  let tab;

  before(async () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-expr-input-rendered-',
      rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
      compiledModules: ['src/ui/svelte/components/Button.svelte', CHIP, RDE],
      componentPath: RDE,
    });
    await harness.setup();
    const hosts = [];
    try {
      for (const { props, host } of Object.values(CASES)) {
        const target = await harness.mount({
          value: '1d4 + @prof',
          tokensLabel: 'Add a term',
          ...props,
        });
        hosts.push(host(target.innerHTML));
        harness.remount();
      }
    } finally {
      harness.teardown();
    }
    tab = await fixtureServer.newPage({ viewport: { width: 1280, height: 900 } });
    await tab.setContent(staticComponentPage([RDE, CHIP], hosts), { waitUntil: 'load' });
  });

  /** Every token of one case, as the figures the clauses below read. */
  function tokensOf(name) {
    return tab.evaluate(
      ({ host, token }) => {
        const root = document.querySelector(`[data-case="${host}"]`);
        const edge = root.getBoundingClientRect().right;
        return [...root.querySelectorAll(token)].map((button) => {
          const style = getComputedStyle(button);
          const label = button.querySelector('.fab-truncate');
          const box = button.getBoundingClientRect();
          return {
            text: button.textContent,
            height: box.height,
            top: box.top,
            pastHost: box.right - edge,
            radius: style.borderTopLeftRadius,
            mono: /^"?JetBrains Mono/u.test(style.fontFamily),
            size: style.fontSize,
            weight: style.fontWeight,
            lineHeight: style.lineHeight,
            borderStyle: style.borderTopStyle,
            borderColour: style.borderTopColor,
            ink: style.color,
            opacity: style.opacity,
            labelClipsRows: label.scrollHeight - label.clientHeight,
            labelClipsColumns: label.scrollWidth - label.clientWidth,
            labelOverflow: getComputedStyle(label).textOverflow,
          };
        });
      },
      { host: name, token: TOKEN }
    );
  }

  it('computes the mono face at 11.5px / 500 on the field in every host', async () => {
    const drawn = await tab.evaluate(() =>
      [...document.querySelectorAll('[data-case]')].map((host) => {
        const style = getComputedStyle(host.querySelector('input'));
        return {
          host: host.dataset.case,
          mono: /^"?JetBrains Mono/u.test(style.fontFamily),
          size: style.fontSize,
          weight: style.fontWeight,
        };
      })
    );
    assert.deepEqual(
      drawn,
      Object.keys(CASES).map((host) => ({ host, mono: true, size: '11.5px', weight: '500' }))
    );
  });

  for (const host of ['bare', 'shell']) {
    it(`draws each token as a dashed 26px mono button, ${host}`, async () => {
      const tokens = await tokensOf(host);
      const border = await colourOf(tab, '--fab-border-strong');
      const ink = await colourOf(tab, '--fab-text-muted');
      assert.equal(tokens.length, 2, 'both tokens are drawn');
      for (const token of tokens) {
        assert.deepEqual(
          {
            height: token.height,
            radius: token.radius,
            mono: token.mono,
            size: token.size,
            weight: token.weight,
            borderStyle: token.borderStyle,
            borderColour: token.borderColour,
            ink: token.ink,
          },
          {
            height: 26,
            radius: '7px',
            mono: true,
            size: '10px',
            weight: '500',
            borderStyle: 'dashed',
            borderColour: border,
            ink,
          },
          `${host}: ${token.text}`
        );
      }
    });

    it(`starts the row at the field's left edge, beneath it, ${host}`, async () => {
      const { field, row } = await tab.evaluate((name) => {
        const root = document.querySelector(`[data-case="${name}"]`);
        const rect = (node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, top: box.top, bottom: box.bottom };
        };
        return {
          field: rect(root.querySelector('input')),
          row: rect(root.querySelector('.fab-expr-input-row')),
        };
      }, host);
      assert.ok(
        Math.abs(row.left - field.left) <= EPSILON,
        `the row starts at ${row.left}px against a field at ${field.left}px`
      );
      assert.ok(
        row.top >= field.bottom - EPSILON,
        `the row starts at ${row.top}px, above the field's bottom edge at ${field.bottom}px`
      );
    });
  }

  it('gives a token with descenders a whole line, so its label clips none of them', async () => {
    const [token] = await tokensOf('bare');
    assert.equal(token.text, '@prof.gy');
    assert.equal(token.lineHeight, 'normal', "the button family's `line-height: 1` is cleared");
    assert.equal(token.labelClipsRows, 0, 'the truncating label is as tall as its text');
  });

  it('keeps a disabled token its box and takes it off the resting paint', async () => {
    const tokens = await tokensOf('disabled');
    const resting = await colourOf(tab, '--fab-border-strong');
    assert.equal(tokens.length, 2);
    for (const token of tokens) {
      assert.deepEqual(
        [token.height, token.radius, token.borderStyle, token.size, token.weight],
        [26, '7px', 'dashed', '10px', '500'],
        `${token.text} keeps its geometry and its dashed edge`
      );
      assert.notEqual(token.borderColour, resting, `${token.text} keeps the resting edge colour`);
      assert.equal(token.opacity, '0.62', `${token.text} is not dimmed as a disabled button is`);
    }
  });

  it('wraps a row longer than its host, and ellipsizes a token longer than a line', async () => {
    const tokens = await tokensOf('narrow');
    assert.deepEqual(
      tokens.map((token) => token.text),
      PF2E_TERMS
    );
    assert.ok(
      new Set(tokens.map((token) => token.top)).size > 1,
      'five pf2e terms stand on one line of a 220px host, so nothing here wrapped'
    );
    const longest = tokens.reduce((held, token) =>
      token.text.length > held.text.length ? token : held
    );
    assert.ok(
      longest.labelClipsColumns > 0 && longest.labelOverflow === 'ellipsis',
      `${longest.text} is not truncated: its label overflows by ${longest.labelClipsColumns}px`
    );
    for (const token of tokens) {
      assert.ok(
        token.pastHost <= EPSILON,
        `${token.text} runs ${token.pastHost}px past the host's right edge`
      );
    }
  });

  /** The reading of one case and the tokens beside it, as the figures the clauses below read. */
  function readingOf(name) {
    return tab.evaluate(
      ({ host, reading, token }) => {
        const root = document.querySelector(`[data-case="${host}"]`);
        const row = root.querySelector('.fab-expr-input-row');
        const chip = root.querySelector(reading);
        const style = getComputedStyle(chip);
        const edge = row.getBoundingClientRect().left;
        const placed = (node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left - edge, top: box.top, middle: box.top + box.height / 2 };
        };
        return {
          text: chip.textContent,
          height: chip.getBoundingClientRect().height,
          ...placed(chip),
          mono: /^"?JetBrains Mono/u.test(style.fontFamily),
          hostFace: style.fontFamily === getComputedStyle(root).fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          numerals: style.fontVariantNumeric,
          ink: style.color,
          tokens: [...root.querySelectorAll(token)].map((button) => placed(button)),
        };
      },
      { host: name, reading: READING, token: TOKEN }
    );
  }

  it("draws the reading at the chip's inspector rung, 20px tall, so Chip's own rules reach it", async () => {
    for (const host of ['reading', 'unresolved', 'both']) {
      assert.equal((await readingOf(host)).height, 20, host);
    }
  });

  it('computes the mono face at 10px / 500, tabular numerals and the info ink on a number', async () => {
    const { text, mono, size, weight, numerals, ink } = await readingOf('reading');
    assert.deepEqual(
      { text, mono, size, weight, numerals, ink },
      {
        text: '= 13',
        mono: true,
        size: '10px',
        weight: '500',
        numerals: 'tabular-nums',
        ink: await colourOf(tab, '--fab-info-text'),
      }
    );
  });

  it('computes the UI face and the secondary ink on a statement', async () => {
    const { text, mono, hostFace, size, weight, numerals, ink } = await readingOf('unresolved');
    assert.deepEqual(
      { text, mono, hostFace, size, weight, numerals, ink },
      {
        text: 'Unresolved',
        mono: false,
        hostFace: true,
        size: '10px',
        weight: '600',
        numerals: 'normal',
        ink: await colourOf(tab, '--fab-text-secondary'),
      }
    );
  });

  it("stands the reading first on the row's first line, centred against a token, and wraps a token to the row's left edge", async () => {
    const chip = await readingOf('both');
    const [first] = chip.tokens;
    assert.equal(chip.tokens.length, ENTRY_TERMS.length);
    assert.ok(Math.abs(chip.left) <= EPSILON, `the reading starts ${chip.left}px into its row`);
    assert.ok(first.left > chip.left, 'the first token follows the reading');
    assert.ok(
      Math.abs(first.middle - chip.middle) <= EPSILON,
      `the reading's middle is ${chip.middle}px against the first token's ${first.middle}px`
    );
    const wrapped = chip.tokens.filter((token) => token.top > first.top + EPSILON);
    assert.ok(wrapped.length > 0, 'three terms and a reading stand on one line of a 300px host');
    assert.ok(
      Math.abs(wrapped[0].left) <= EPSILON,
      `the wrapped token starts ${wrapped[0].left}px into its row, not at its left edge`
    );
  });

  it('wraps a statement longer than its host inside its chip, written whole', async () => {
    const drawn = await tab.evaluate((reading) => {
      const root = document.querySelector('[data-case="long"]');
      const chip = root.querySelector(reading);
      const box = chip.getBoundingClientRect();
      const row = root.querySelector('.fab-expr-input-row').getBoundingClientRect();
      return {
        statement: chip.textContent,
        clipsColumns: chip.scrollWidth - chip.clientWidth,
        height: box.height,
        pastRow: box.right - row.right,
        rowPastHost: row.right - root.getBoundingClientRect().right,
      };
    }, READING);
    assert.equal(drawn.statement, LONG_STATEMENT, 'the statement is never truncated');
    assert.ok(drawn.clipsColumns <= 0, `the chip clips ${drawn.clipsColumns}px of its statement`);
    assert.ok(drawn.height > 20, `a wrapped chip is taller than one line: ${drawn.height}px`);
    assert.ok(
      drawn.pastRow <= EPSILON && drawn.rowPastHost <= EPSILON,
      `the chip runs ${drawn.pastRow}px past its row, the row ${drawn.rowPastHost}px past its host`
    );
  });

  it('clips the status region to one pixel out of flow, so a blank field is no taller for it', async () => {
    const drawn = await tab.evaluate((status) => {
      const height = (name) =>
        document.querySelector(`[data-case="${name}"]`).getBoundingClientRect().height;
      const region = document.querySelector(`[data-case="blank"] ${status}`);
      const style = getComputedStyle(region);
      return {
        blank: height('blank'),
        plain: height('plain'),
        row: Boolean(document.querySelector('[data-case="blank"] .fab-expr-input-row')),
        region: [style.position, style.width, style.height, style.overflow, style.clipPath],
      };
    }, STATUS);
    assert.equal(drawn.row, false, 'a blank expression draws no row');
    assert.ok(drawn.plain > 0, 'the plain field has a height to compare against');
    assert.equal(drawn.blank, drawn.plain);
    assert.deepEqual(drawn.region, ['absolute', '1px', '1px', 'hidden', 'inset(50%)']);
  });
});

describe('ExprInput, pressed (issue 2465)', () => {
  /** Open the fixture, and wait for the mounted field. */
  async function open(query = {}) {
    const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 800 } });
    const search = new URLSearchParams(query).toString();
    await page.goto(fixtureServer.url(`/tests/fixtures/expr-input/index.html?${search}`), {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => document.documentElement.dataset.exprInputReady === 'true');
    return page;
  }

  /** The field's value, selection and focus, and every write the caller received. */
  function read(page) {
    return page.evaluate(
      ({ field, token }) => {
        const input = document.querySelector(field);
        const active = document.activeElement;
        return {
          value: input.value,
          selection: [input.selectionStart, input.selectionEnd],
          focus:
            active === input
              ? 'field'
              : active?.matches(token)
                ? `token ${[...document.querySelectorAll(token)].indexOf(active)}`
                : (active?.tagName ?? ''),
          writes: JSON.parse(document.documentElement.dataset.exprInputWrites ?? '[]'),
        };
      },
      { field: FIELD, token: TOKEN }
    );
  }

  function placeCaret(page, at) {
    return page.evaluate(
      ({ field, index }) => {
        const input = document.querySelector(field);
        input.focus();
        input.setSelectionRange(index, index);
      },
      { field: FIELD, index: at }
    );
  }

  it('inserts at a placed caret on a pointer press, and returns focus with the caret after it', async () => {
    const page = await open({ value: '@a + @b' });
    try {
      await placeCaret(page, 2);
      await pressPointerOn(page, TOKEN);
      assert.deepEqual(await read(page), {
        value: '@a + @prof + @b',
        selection: [10, 10],
        focus: 'field',
        writes: ['@a + @prof + @b'],
      });
    } finally {
      await page.close();
    }
  });

  /** The page point at the middle of the field's characters from `from` to `to`. */
  function pointInText(page, from, to) {
    return page.evaluate(
      ({ field, range }) => {
        const input = document.querySelector(field);
        const style = getComputedStyle(input);
        const pen = document.createElement('canvas').getContext('2d');
        pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const box = input.getBoundingClientRect();
        const inset =
          Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
        const [start, end] = range.map(
          (index) => pen.measureText(input.value.slice(0, index)).width
        );
        return { x: box.left + inset + (start + end) / 2, y: box.top + box.height / 2 };
      },
      { field: FIELD, range: [from, to] }
    );
  }

  it('joins the end when a double-click selected one word of a path, cutting the term', async () => {
    const page = await open({ value: '2d6 + @prof' });
    try {
      const { x, y } = await pointInText(page, 7, 11);
      await page.mouse.dblclick(x, y);
      assert.deepEqual(
        (await read(page)).selection,
        [7, 11],
        'Chromium selects the word `prof`, and leaves the `@` outside it'
      );

      await pressPointerOn(page, TOKEN);
      assert.deepEqual(await read(page), {
        value: '2d6 + @prof + @prof',
        selection: [19, 19],
        focus: 'field',
        writes: ['2d6 + @prof + @prof'],
      });
    } finally {
      await page.close();
    }
  });

  it('joins the end when the field was reached with Tab, which selects all of it', async () => {
    const page = await open({ value: '@a + @b' });
    try {
      await page.focus('[data-before]');
      await page.keyboard.press('Tab');
      const tabbed = await read(page);
      assert.equal(tabbed.focus, 'field', 'Tab from the control before the field reaches it');
      assert.deepEqual(tabbed.selection, [0, 7], 'and Chromium selects the whole value there');

      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.deepEqual(await read(page), {
        value: '@a + @b + @prof',
        selection: [15, 15],
        focus: 'field',
        writes: ['@a + @b + @prof'],
      });
    } finally {
      await page.close();
    }
  });

  it('is operable from the keyboard: Tab reaches each token, Enter and Space press it', async () => {
    const page = await open({ value: '@a' });
    try {
      await page.focus(FIELD);
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const active = document.activeElement;
        const style = getComputedStyle(active);
        return {
          focusVisible: active.matches(':focus-visible'),
          outline: [style.outlineStyle, style.outlineWidth, style.outlineColor],
        };
      });
      assert.equal(
        (await read(page)).focus,
        'token 0',
        'Tab from the field reaches the first token'
      );
      assert.equal(ring.focusVisible, true);
      assert.deepEqual(ring.outline, ['solid', '2px', await colourOf(page, '--fab-accent')]);

      await page.keyboard.press('Enter');
      assert.deepEqual(await read(page), {
        value: '@a + @prof',
        selection: [10, 10],
        focus: 'field',
        writes: ['@a + @prof'],
      });

      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal((await read(page)).focus, 'token 1');
      await page.keyboard.press('Space');
      assert.deepEqual(await read(page), {
        value: '@a + @prof + 1d4',
        selection: [16, 16],
        focus: 'field',
        writes: ['@a + @prof', '@a + @prof + 1d4'],
      });

      await page.keyboard.press('Tab');
      assert.equal((await read(page)).focus, 'token 0');
      await page.keyboard.press('Shift+Tab');
      assert.equal((await read(page)).focus, 'field', 'Shift+Tab from the first token returns');
    } finally {
      await page.close();
    }
  });

  it('appends on a press when the field was never focused', async () => {
    const page = await open({ value: '@a' });
    try {
      await pressPointerOn(page, TOKEN);
      assert.deepEqual(await read(page), {
        value: '@a + @prof',
        selection: [10, 10],
        focus: 'field',
        writes: ['@a + @prof'],
      });
    } finally {
      await page.close();
    }
  });

  it('keeps the caret after the term under a parent that echoes the value trimmed', async () => {
    const page = await open({ value: '  @a + @b  ', parent: 'trim' });
    try {
      assert.equal((await read(page)).value, '  @a + @b  ', 'the mounted value keeps its spaces');
      await placeCaret(page, 4);
      await pressPointerOn(page, TOKEN);
      assert.deepEqual(await read(page), {
        value: '@a + @prof + @b',
        selection: [10, 10],
        focus: 'field',
        writes: ['@a + @prof + @b'],
      });
    } finally {
      await page.close();
    }
  });

  it('delivers no press from a disabled token, and takes no focus for its field', async () => {
    const page = await open({ value: '@a', disabled: '1' });
    try {
      const box = await page.locator(TOKEN).first().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const { value, focus, writes } = await read(page);
      assert.deepEqual({ value, writes }, { value: '@a', writes: [] });
      assert.notEqual(focus, 'field', 'a disabled token hands the field no focus');
    } finally {
      await page.close();
    }
  });

  it('lights a hovered token with the accent border', async () => {
    const page = await open({ value: '@a' });
    try {
      const border = () =>
        page.evaluate(
          (token) => getComputedStyle(document.querySelector(token)).borderTopColor,
          TOKEN
        );
      const accent = await colourOf(page, '--fab-accent-border');
      assert.notEqual(await border(), accent, 'the token rests on the accent already');
      await page.hover(TOKEN);
      assert.equal(await border(), accent);
    } finally {
      await page.close();
    }
  });

  it('rings the focused field inside its own box when it stands in a field shell', async () => {
    const page = await open({ value: '@a', shell: '1' });
    try {
      await page.focus('[data-before]');
      await page.keyboard.press('Tab');
      const outline = await page.evaluate((field) => {
        const input = document.querySelector(field);
        const style = getComputedStyle(input);
        return {
          focused: document.activeElement === input && input.matches(':focus-visible'),
          shell: Boolean(input.closest('div.fabricate-field')),
          drawn: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
        };
      }, FIELD);
      assert.equal(outline.focused, true);
      assert.equal(outline.shell, true);
      assert.deepEqual(outline.drawn, [
        'solid',
        '1px',
        '-1px',
        await colourOf(page, '--fab-accent'),
      ]);
    } finally {
      await page.close();
    }
  });

  /** Record every write to the status region, with where focus stood and how long since a key. */
  function watchStatus(page) {
    return page.evaluate(
      ({ field, status }) => {
        const region = document.querySelector(status);
        const input = document.querySelector(field);
        const heard = [];
        let lastKey = 0;
        input.addEventListener('input', () => {
          lastKey = performance.now();
        });
        new MutationObserver(() => {
          heard.push({
            said: region.textContent,
            focus: document.activeElement === input ? 'field' : 'elsewhere',
            sinceLastKey: performance.now() - lastKey,
          });
          document.documentElement.dataset.exprInputHeard = JSON.stringify(heard);
        }).observe(region, { childList: true, characterData: true, subtree: true });
      },
      { field: FIELD, status: STATUS }
    );
  }

  /** Every write to the status region, once there is one. */
  async function firstSpoken(page) {
    await page.waitForFunction(() => 'exprInputHeard' in document.documentElement.dataset);
    return page.evaluate(() => JSON.parse(document.documentElement.dataset.exprInputHeard));
  }

  it('says nothing while a reading is typed, then the reading once typing has rested', async () => {
    const page = await open({ value: '', resolve: '1' });
    try {
      await watchStatus(page);
      await page.focus(FIELD);
      await page.keyboard.type('@prof + 8');
      const heard = await firstSpoken(page);
      assert.equal(heard.length, 1, 'nine keystrokes are one write');
      assert.equal(heard[0].said, '= 11');
      assert.equal(await page.locator(READING).textContent(), '= 11', "and it is the chip's text");
      assert.ok(
        heard[0].sinceLastKey >= 490,
        `the region was written ${heard[0].sinceLastKey}ms after the last key, inside the 500ms rest`
      );
    } finally {
      await page.close();
    }
  });

  it('speaks a pressed token with focus already back on the field', async () => {
    const page = await open({ value: '@prof', resolve: '1' });
    try {
      await watchStatus(page);
      await pressPointerOn(page, TOKEN);
      const [spoken] = await firstSpoken(page);
      assert.deepEqual(
        { said: spoken.said, focus: spoken.focus },
        { said: '= 6', focus: 'field' },
        'the region changes after the focus move it must not be cancelled by'
      );
    } finally {
      await page.close();
    }
  });

  it('lists the reading, then the named group of tokens alone, then the status region', async () => {
    const page = await open({ value: '@prof', resolve: '1' });
    try {
      const lines = String(await page.locator('[data-host]').ariaSnapshot()).split('\n');
      const at = (pattern) => lines.findIndex((line) => pattern.test(line));
      const reading = at(/= 3/u);
      const group = at(/^- group "Add a term":/u);
      const status = at(/^- status\b/u);
      assert.ok(reading >= 0 && group > reading && status > group, lines.join(' | '));
      assert.deepEqual(
        lines.slice(group + 1, status),
        ['  - button "@prof"', '  - button "1d4"'],
        'the group holds the two tokens and nothing else'
      );
    } finally {
      await page.close();
    }
  });

  it("keeps the group's role and name in Chromium's own accessibility tree, around the tokens alone", async () => {
    const page = await open({ value: '@prof', resolve: '1' });
    const session = await page.context().newCDPSession(page);
    try {
      const { nodes } = await session.send('Accessibility.getFullAXTree');
      const byId = new Map(nodes.map((node) => [node.nodeId, node]));
      const named = (node) => `${node.role?.value} "${node.name?.value ?? ''}"`;
      const descendants = (node) =>
        (node.childIds ?? [])
          .map((id) => byId.get(id))
          .flatMap((child) => [child, ...descendants(child)]);
      const groups = nodes.filter((node) => named(node) === 'group "Add a term"');
      assert.equal(groups.length, 1, 'the engine exposes one group by that name');
      const held = descendants(groups[0]).filter((node) => !node.ignored);
      assert.deepEqual(
        held.filter((node) => node.role?.value === 'button').map((node) => named(node)),
        ['button "@prof"', 'button "1d4"']
      );
      assert.deepEqual(
        held.filter((node) => /= 3/u.test(node.name?.value ?? '')).map((node) => named(node)),
        [],
        'the reading is no descendant of the group'
      );
      assert.deepEqual(
        nodes
          .filter((node) => node.role?.value === 'textbox')
          .map((node) => [named(node), node.description?.value]),
        [['textbox "Expression"', '= 3']],
        'the engine does expose the reading: it is the description of the field'
      );
    } finally {
      await session.detach();
      await page.close();
    }
  });
});
