/**
 * Issue 2862 — the published `Disclosure`, measured in Chromium on the markup the seam draws, its
 * slots filled as a companion fills them, under core's button rules and the module sheet: the
 * heading, button, name and expanded state Chromium's accessibility tree gives it, an icon-only
 * head's name, its body left out of the tree and the Tab order while closed, a long name's wrap,
 * the keyboard ring, the target, the hover fill, the chevron's turn and the motion it draws under
 * neither setting, the inks over all seven palettes, and under forced colours, in the dark and the light palette, a chevron that is drawn
 * and points its way pixel for pixel, enabled and disabled.
 * Limit: the markup is static, so it calls no `onToggle`; `published-disclosure-behaviour-rendered
 * .test.js` holds what a key press calls and where focus goes on the real runtime.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { chromiumAxNode } from '../helpers/chromiumAxNode.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';
import { contrast, flatten } from '../helpers/themePaletteContrast.js';

const { ui, freshTarget } = publishedEntrySeam('fab-disclosure-rendered-');
const BUTTON_SHEET = readFileSync(
  resolve(import.meta.dirname, '../fixtures/foundry-core-button-min.css'),
  'utf8'
);
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
const NAME = 'Ironwrights’ Guild';
const FIELD = '<input type="text" aria-label="Standing note" value="Owes us two favours">';

/** A name with no break opportunity, which a 200px card must still wrap inside its head. */
const UNSPACED = 'Ironwrights’GuildOfTheNorthernCoastAndTheEastQuays';
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
/** The head each case draws beside `NAME`, by `data-case`. */
const HEADS = Object.freeze({
  long: UNSPACED,
  'icon-img': `<img src="${PIXEL}" alt="${NAME}" width="16" height="16">`,
  'icon-role': `<span role="img" aria-label="${NAME}">⚒</span>`,
});

/** Each case's props beside `onToggle`, by `data-case`, and its card's width. */
const CASES = Object.freeze({
  closed: [{ head: true, body: true }, 360],
  open: [{ head: true, body: true, open: true }, 360],
  disabled: [{ head: true, body: true, disabled: true }, 360],
  'disabled-open': [{ head: true, body: true, disabled: true, open: true }, 360],
  faction: [{ head: true, body: true, open: true, level: 4 }, 360],
  twin: [{ head: true, body: true }, 360],
  long: [{ head: true, body: true }, 200],
  'icon-img': [{ head: true, body: true }, 360],
  'icon-role': [{ head: true, body: true }, 360],
});

/** Fills the faction head as the faction card does: a chip, the name, a bar and its holdings. */
function factionHead(slot) {
  const [chip, name, bar, holdings] = ['span', 'span', 'span', 'span'].map((tag) =>
    document.createElement(tag)
  );
  name.textContent = `${NAME} +42`;
  bar.style.cssText = 'display:block;flex:0 0 72px';
  holdings.innerHTML = '<span>Forge</span> <span>Assay office</span>';
  slot.append(chip, name, bar, holdings);
  ui().mount('Chip', { target: chip, props: { tone: 'positive', children: 'Honoured' } });
  ui().mount('FillBar', { target: bar, props: { value: 42, origin: 'center' } });
}

/** The seam's markup for each case, its slots filled. */
async function drawnCases() {
  const cells = [];
  for (const [id, [props, width]] of Object.entries(CASES)) {
    const target = freshTarget();
    const handle = ui().mount('Disclosure', { target, props: { ...props, onToggle() {} } });
    if (id === 'faction') factionHead(handle.slot('head'));
    else handle.slot('head').innerHTML = HEADS[id] ?? NAME;
    handle.slot('body').innerHTML = `<p style="margin:0">Holds the forges.</p>${FIELD}`;
    await settle();
    cells.push(`<div data-case="${id}" style="width:${width}px">${target.innerHTML}</div>`);
  }
  return cells.join('');
}

let browser;
let tab;

describe('the published Disclosure in Chromium', () => {
  before(async () => {
    const cells = await drawnCases();
    const probes = [...GROUNDS, '--fab-border', '--fab-accent', '--fab-surface-raised']
      .map((token) => `<i data-token="${token}" style="background:var(${token})"></i>`)
      .join('');
    const system = ['highlight', 'graytext', 'canvas', 'canvastext', 'buttontext']
      .map((name) => `<i data-system="${name}" style="color:${name};background:${name}"></i>`)
      .join('');
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 600, height: 1000 } });
    await tab.setContent(
      renderedPageHead(['Chip', 'FillBar']).replace(
        '<meta charset="utf-8">',
        () => `<meta charset="utf-8"><style>${BUTTON_SHEET}</style>`
      ) +
        '<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate" style="padding:8px;display:grid;gap:8px;font-size:13px">' +
        `<button type="button" data-before>Before</button>${cells}<button type="button" data-after>After</button>` +
        `<div>${probes}${system}</div></div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  const headOf = (id) => `[data-case="${id}"] .fabricate-disclosure-head`;
  const chevronOf = (id) => `[data-case="${id}"] .fabricate-disclosure-chevron`;
  const tree = async (id) => String(await tab.locator(`[data-case="${id}"]`).ariaSnapshot());

  describe('the published Disclosure names', () => {
    it('is one heading holding one button named by its head, expanded only while open', async () => {
      assert.equal(
        await tree('closed'),
        `- heading "${NAME}" [level=3]:\n  - button "${NAME}"`,
        'the closed body is not in the tree'
      );
      assert.equal(
        await tree('open'),
        `- heading "${NAME}" [level=3]:\n  - button "${NAME}" [expanded]\n- paragraph: Holds the forges.\n- textbox "Standing note": Owes us two favours`
      );
      assert.equal(
        await tree('disabled-open'),
        `- heading "${NAME}" [level=3]:\n  - button "${NAME}" [disabled] [expanded]\n- paragraph: Holds the forges.\n- textbox "Standing note": Owes us two favours`
      );
    });

    it('names the faction head by its chip, name, figure and holdings, at level 4, the bar silent', async () => {
      const snapshot = await tree('faction');
      const [heading, button] = snapshot.split('\n');
      assert.equal(
        heading,
        '- heading "Honoured Ironwrights’ Guild +42 Forge Assay office" [level=4]:'
      );
      assert.equal(
        button,
        '  - button "Honoured Ironwrights’ Guild +42 Forge Assay office" [expanded]'
      );
      assert.ok(!/region|group/u.test(snapshot), 'the body is no landmark or group');
    });

    it('names an icon-only head by an img alt or by a role="img" aria-label', async () => {
      for (const id of ['icon-img', 'icon-role']) {
        const node = await chromiumAxNode(tab, headOf(id));
        assert.deepEqual([node.role, node.name], ['button', NAME], id);
      }
    });
  });

  describe('the published Disclosure on the keyboard', () => {
    it('takes one Tab stop for each head, disabled ones included, skips a closed body and enters an open one', async () => {
      await tab.focus('[data-before]');
      const order = [];
      for (let step = 0; step < 9; step += 1) {
        await tab.keyboard.press('Tab');
        order.push(
          await tab.evaluate(() => {
            const active = document.activeElement;
            const card = active.closest('[data-case]')?.dataset.case ?? 'page';
            return `${card} ${active.localName}`;
          })
        );
      }
      assert.deepEqual(order, [
        'closed button',
        'open button',
        'open input',
        'disabled button',
        'disabled-open button',
        'disabled-open input',
        'faction button',
        'faction input',
        'twin button',
      ]);
    });

    it('draws the 2px accent ring inside the card’s edge under keyboard focus, apart from the 1px edge', async () => {
      await tab.focus('[data-before]');
      await tab.keyboard.press('Tab');
      const ring = await tab.$eval(headOf('closed'), (head) => {
        const style = getComputedStyle(head);
        const card = getComputedStyle(head.closest('.fabricate-disclosure'));
        return {
          ring: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
          shadow: style.boxShadow,
          edge: [card.borderTopWidth, card.borderTopColor],
        };
      });
      const accent = await tab.$eval(
        '[data-token="--fab-accent"]',
        (probe) => getComputedStyle(probe).backgroundColor
      );
      assert.deepEqual(ring.ring, ['solid', '2px', '-2px', accent]);
      assert.equal(ring.shadow, 'none', 'core’s focus glow is struck');
      assert.equal(ring.edge[0], '1px');
      assert.notEqual(ring.edge[1], accent, 'the ring is not the edge’s colour');
    });
  });

  describe('the published Disclosure in the real cascade', () => {
    it('lays the head across the card at 38px or more, over core’s button rules', async () => {
      const box = await tab.$eval(headOf('closed'), (head) => {
        const card = head.closest('.fabricate-disclosure').getBoundingClientRect();
        const own = head.getBoundingClientRect();
        const style = getComputedStyle(head);
        const heading = getComputedStyle(head.parentElement);
        return {
          width: [own.width, card.width - 2],
          height: own.height,
          face: [style.borderTopWidth, style.backgroundColor, style.justifyContent],
          heading: [heading.marginTop, heading.fontSize, heading.borderBottomStyle],
          font: getComputedStyle(head.closest('[data-case]')).fontSize,
        };
      });
      assert.equal(box.width[0], box.width[1], 'the head spans the card inside its edge');
      assert.ok(box.height >= 38, `the head is ${box.height}px, a 24px target and more`);
      assert.deepEqual(box.face, ['0px', 'rgba(0, 0, 0, 0)', 'flex-start']);
      assert.deepEqual(box.heading, ['0px', box.font, 'none'], 'the heading draws nothing');
    });

    it('wraps an unspaced name inside a 200px card, never under the chevron', async () => {
      const fit = await tab.$eval(headOf('long'), (head) => {
        const content = head.querySelector('.fabricate-disclosure-content');
        const chevron = head.querySelector('.fabricate-disclosure-chevron').getBoundingClientRect();
        const box = content.getBoundingClientRect();
        return {
          overflow: [content.scrollWidth, content.clientWidth],
          clear: box.right <= chevron.left,
          lines: Math.round(box.height / Number.parseFloat(getComputedStyle(head).lineHeight)),
        };
      });
      assert.ok(fit.overflow[0] <= fit.overflow[1], `scrollWidth ${fit.overflow} fits`);
      assert.ok(fit.clear, 'the content box ends before the chevron');
      assert.ok(fit.lines >= 2, `the name wraps (${fit.lines} lines)`);
    });

    it('raises the head’s fill under the pointer, and a disabled head keeps its face', async () => {
      const raised = await tab.$eval(
        '[data-token="--fab-surface-raised"]',
        (probe) => getComputedStyle(probe).backgroundColor
      );
      const fillOf = async (id) => {
        await tab.hover(headOf(id));
        return tab.$eval(headOf(id), (head) => getComputedStyle(head).backgroundColor);
      };
      assert.equal(await fillOf('closed'), raised);
      assert.equal(await fillOf('disabled'), 'rgba(0, 0, 0, 0)');
      const dimmed = await tab.$eval(headOf('disabled'), (head) => getComputedStyle(head).opacity);
      assert.equal(dimmed, '0.62');
      await tab.mouse.move(590, 990);
    });

    it('turns the chevron down while closed and up while open at once, moving nothing under either motion setting', async () => {
      const turn = (id) =>
        tab.$eval(chevronOf(id), (chevron) => {
          const style = getComputedStyle(chevron);
          const head = getComputedStyle(chevron.parentElement);
          return [style.transform, style.transitionDuration, head.transitionDuration];
        });
      const down = 'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, -2)';
      const up = 'matrix(-0.707107, -0.707107, 0.707107, -0.707107, 0, 2)';
      for (const reducedMotion of ['no-preference', 'reduce']) {
        await tab.emulateMedia({ reducedMotion });
        assert.deepEqual(
          await turn('closed'),
          [down, '0s', '0s'],
          `${reducedMotion}: core's tween struck`
        );
        assert.deepEqual(await turn('open'), [up, '0s', '0s'], reducedMotion);
        assert.deepEqual(
          await turn('disabled-open'),
          [up, '0s', '0s'],
          'a disabled card keeps its way'
        );
      }
      await tab.emulateMedia({ reducedMotion: 'no-preference' });
    });
  });

  describe('the published Disclosure’s inks over the seven palettes', () => {
    /** A computed `rgb()`/`rgba()` as the palette helper's `rgb(r g b / a%)`. */
    const paletteForm = (computed) => {
      const [r, g, b, a = '1'] = computed.match(/[\d.]+/gu);
      return `rgb(${r} ${g} ${b} / ${Number(a) * 100}%)`;
    };
    const readings = (theme) =>
      tab.evaluate(
        ({ id, chevron }) => {
          document.querySelector('.fabricate').dataset.fabricateTheme = id;
          const color = (selector, property) =>
            getComputedStyle(document.querySelector(selector))[property];
          const tokens = Object.fromEntries(
            [...document.querySelectorAll('[data-token]')].map((probe) => [
              probe.dataset.token,
              getComputedStyle(probe).backgroundColor,
            ])
          );
          return {
            tokens,
            card: color('[data-case="closed"] .fabricate-disclosure', 'backgroundColor'),
            chevron: color(chevron, 'borderRightColor'),
            ink: color('[data-case="closed"] .fabricate-disclosure-head', 'color'),
          };
        },
        { id: theme, chevron: chevronOf('closed') }
      );

    it('clears 3:1 for the chevron and the ring and 4.5:1 for the head’s ink on the card’s fill and its hover fill', async () => {
      const shortfalls = [];
      const edges = [];
      for (const theme of THEMES) {
        const { tokens, card, chevron, ink } = await readings(theme);
        const fill = paletteForm(card);
        const hover = flatten(paletteForm(tokens['--fab-surface-raised']), fill);
        for (const [what, colour, floor] of [
          ['chevron', chevron, 3],
          ['ring', tokens['--fab-accent'], 3],
          ['ink', ink, 4.5],
        ]) {
          for (const [ground, base] of [
            ['fill', fill],
            ['hover', hover],
          ]) {
            const ratio = contrast(paletteForm(colour), base);
            if (ratio < floor)
              shortfalls.push(`${theme}: ${what} on ${ground} ${ratio.toFixed(2)}`);
          }
        }
        for (const ground of GROUNDS) {
          edges.push(contrast(paletteForm(tokens['--fab-border']), paletteForm(tokens[ground])));
        }
      }
      assert.deepEqual(shortfalls, []);
      assert.equal(edges.length, THEMES.length * GROUNDS.length);
      assert.ok(
        edges.every((ratio) => ratio < 3),
        'the edge stays under 3:1 against every ground, so the head’s text and chevron identify the card'
      );
      await readings('fabricate');
    });
  });

  describe('the published Disclosure under forced colours', () => {
    /**
     * The chevron's ink as Chromium paints it: the pixels of a 20px square about its centre that
     * stand apart from the corner, and how wide they spread on their first and last rows.
     */
    async function footprintOf(id) {
      const box = await tab.locator(chevronOf(id)).boundingBox();
      const clip = {
        x: Math.round(box.x + box.width / 2 - 10),
        y: Math.round(box.y + box.height / 2 - 10),
        width: 20,
        height: 20,
      };
      const png = await tab.screenshot({ clip });
      return tab.evaluate(
        async (bytes) => {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' })
          );
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0);
          const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
          const at = (x, y) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 3);
          const ground = at(0, 0);
          const rows = [];
          for (let y = 0; y < height; y += 1) {
            const xs = [];
            for (let x = 0; x < width; x += 1) {
              const apart = at(x, y).reduce(
                (sum, value, index) => sum + Math.abs(value - ground[index]),
                0
              );
              if (apart > 120) xs.push(x);
            }
            if (xs.length > 0) rows.push(Math.max(...xs) - Math.min(...xs) + 1);
          }
          return { count: rows.length, first: rows[0] ?? 0, last: rows.at(-1) ?? 0, rows };
        },
        [...png]
      );
    }

    for (const colorScheme of ['dark', 'light']) {
      it(`draws each chevron pointing its way, enabled and disabled, the ring in Highlight, on the ${colorScheme} palette`, async () => {
        await tab.emulateMedia({ forcedColors: 'active', colorScheme });
        try {
          for (const [id, way] of [
            ['closed', 'down'],
            ['open', 'up'],
            ['disabled', 'down'],
            ['disabled-open', 'up'],
          ]) {
            const { count, first, last, rows } = await footprintOf(id);
            assert.ok(count >= 4, `${id}: the chevron is drawn (${count} rows)`);
            assert.notEqual(first, last, `${id}: its top and foot differ in width (${rows})`);
            const points = first > last ? 'down' : 'up';
            assert.equal(
              points,
              way,
              `${id}: ${first}px across its top, ${last}px at its foot (${rows})`
            );
          }
          const system = (name) =>
            tab.$eval(`[data-system="${name}"]`, (probe) => getComputedStyle(probe).color);
          const head = (id) =>
            tab.$eval(headOf(id), (button) => {
              const chevron = getComputedStyle(
                button.querySelector('.fabricate-disclosure-chevron')
              );
              const own = getComputedStyle(button);
              return [own.color, chevron.borderRightColor, chevron.forcedColorAdjust, own.opacity];
            });
          const [enabled, disabled] = [await head('closed'), await head('disabled')];
          assert.equal(enabled[1], enabled[0], 'the chevron takes the head’s ink');
          assert.equal(enabled[2], 'none');
          assert.deepEqual(disabled, [
            await system('graytext'),
            await system('graytext'),
            'none',
            '1',
          ]);
          await tab.focus('[data-before]');
          await tab.keyboard.press('Tab');
          const ring = await tab.$eval(
            headOf('closed'),
            (button) => getComputedStyle(button).outlineColor
          );
          assert.equal(ring, await system('highlight'));
        } finally {
          await tab.evaluate(() => document.activeElement?.blur());
          await tab.emulateMedia({ forcedColors: 'none', colorScheme: 'no-preference' });
        }
      });
    }
  });
});
