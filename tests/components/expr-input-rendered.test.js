/**
 * Issue 2465 — what `<ExprInput>` draws and does in Chromium. The static half computes the faces
 * the field and its tokens state, from the component's mounted markup; the live half runs the real
 * component in `tests/fixtures/expr-input/` and presses its tokens by pointer and by keyboard.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { getModifierExpressionSuggestions } from '../../src/config/modifierExpressionSuggestions.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer, pressPointerOn } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';

/** Rounding tolerance for a fractional rect. */
const EPSILON = 0.5;

const TOKEN = '.fab-expr-input-token';
const FIELD = 'input.fab-expr-input';

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
});

const staticPage = (hosts) => `<!doctype html><html><head><meta charset="utf-8">
<style>${readFileSync(resolve(repoRoot, 'tests/fixtures/foundry-core-min.css'), 'utf8')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, RDE)).css}</style>
</head><body class="game"><div class="fabricate fabricate-manager" style="width:900px">
${hosts.join('\n')}
</div></body></html>`;

const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@expr-input-styles/' });

before(async () => {
  await fixtureServer.start();
});

after(async () => {
  await fixtureServer.stop();
});

/** What a `--fab-*` colour token computes to under the page's manager root. */
function colourOf(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${name})`;
    document.querySelector('.fabricate-manager').append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  }, token);
}

describe('ExprInput, drawn (issue 2465)', () => {
  let tab;

  before(async () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-expr-input-rendered-',
      rawModules: [],
      compiledModules: ['src/ui/svelte/components/Button.svelte', RDE],
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
    await tab.setContent(staticPage(hosts), { waitUntil: 'load' });
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
});
