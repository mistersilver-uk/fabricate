/**
 * Issue 2854 — the published `InspectorCard`'s tones and head, and the published `Well`'s tones,
 * measured in Chromium on the markup the seam draws: each tone's edge and fill over the card's and
 * the well's own rules, a toned well inside a Fabricate dialog among them; the head's title face,
 * its note's ink, its slots' places at 320px and the trailing slot wrapping beneath the heading at
 * 180px; and the second edge a toned card and well keep under forced colours.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-card-head-rendered-');
const TONES = Object.freeze(['warning', 'success', 'accent', 'info']);
const HEAD = Object.freeze({
  title: 'Activity limits',
  note: 'How many activities a character may run at once.',
  leading: true,
  trailing: true,
  children: true,
});
const TILE = '<span data-tile style="display:block;width:34px;height:34px"></span>';
const CONTROL = '<button type="button" data-control style="width:72px;height:28px">Manage</button>';
const BODY = '<p data-body style="margin:0">Two running.</p>';

const NARROW = Object.freeze({ ...HEAD, tone: 'warning', title: 'Activity limits for the party' });

/**
 * Each card case's props, width, trailing content and direction, keyed by `data-case`: 296px is
 * the View Lab fixture's card, and the crowded case holds three controls at 180px.
 */
const CARDS = Object.freeze({
  plain: [HEAD, 320],
  bare: [{ children: true }, 320],
  ...Object.fromEntries(TONES.map((tone) => [`tone-${tone}`, [{ ...HEAD, tone }, 320]])),
  fixture: [HEAD, 296],
  narrow: [NARROW, 180],
  crowded: [NARROW, 180, CONTROL.repeat(3)],
  rtl: [NARROW, 180, CONTROL, 'rtl'],
});

/** The seam's markup for `name` mounted with `props`, its slots filled as a companion would. */
async function drawn(name, props, trailing = CONTROL) {
  const { target, handle } = mountEntry(name, props);
  await settle();
  const fill = (key, html) => {
    if (props[key]) handle.slot(key).innerHTML = html;
  };
  fill('leading', TILE);
  fill('trailing', trailing);
  fill('children', BODY);
  const markup = target.innerHTML;
  handle.destroy();
  return markup;
}

const TOKENS = [
  'bg-2',
  'text',
  'text-muted',
  'text-secondary',
  ...TONES.flatMap((tone) => [`${tone}-border`, `${tone}-soft`]),
];

describe('InspectorCard and Well tones and head, rendered (issue 2854)', () => {
  let browser;
  let tab;

  before(async () => {
    const hosts = [];
    for (const [id, [props, width, trailing, dir = 'ltr']] of Object.entries(CARDS)) {
      const markup = await drawn('InspectorCard', props, trailing);
      hosts.push(`<div data-case="${id}" dir="${dir}" style="width:${width}px">${markup}</div>`);
    }
    for (const tone of ['', ...TONES]) {
      const markup = await drawn('Well', { tone, label: 'Reagents', children: true });
      hosts.push(`<div data-case="well-${tone || 'plain'}" style="width:280px">${markup}</div>`);
    }
    const modal = await drawn('Well', { tone: 'accent', children: true });
    const plainModal = await drawn('Well', { children: true });
    hosts.push(
      `<div class="fabricate-modal"><div data-case="well-modal-accent">${modal}</div>` +
        `<div data-case="well-modal-plain">${plainModal}</div></div>`
    );
    const standalone = await drawn('InspectorCard', { tone: 'info', children: true });
    browser = await chromium.launch();
    tab = await browser.newPage({ viewport: { width: 720, height: 1600 } });
    await tab.setContent(
      `${renderedPageHead(['Kicker', 'Well'])}<body class="game">` +
        `<div class="fabricate fabricate-app" style="font-family:Arial,sans-serif;padding:8px">` +
        TOKENS.map((name) => `<i data-token="${name}" style="color:var(--fab-${name})"></i>`).join(
          ''
        ) +
        `<i data-token="serif" style="font-family:var(--fab-font-serif)"></i>` +
        `${hosts.join('')}</div>` +
        `<div class="fabricate fabricate-standalone-root" style="display:contents">` +
        `<div data-case="standalone-info">${standalone}</div></div></body></html>`,
      { waitUntil: 'load' }
    );
  });

  after(async () => {
    await browser?.close();
  });

  const token = (name) =>
    tab.$eval(`[data-token="${name}"]`, (probe) => getComputedStyle(probe).color);

  /** The case's root, card or well: its edge, fill, outline and box. */
  const surface = (id) =>
    tab.$eval(`[data-case="${id}"] > :is(.fabricate-card, .fab-well)`, (element) => {
      const style = getComputedStyle(element);
      return {
        edge: style.borderTopColor,
        fill: style.backgroundColor,
        outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset],
      };
    });

  it('draws each tone’s edge and soft fill on the card, and the untoned card on --fab-bg-2', async () => {
    const plain = await surface('plain');
    assert.deepEqual(
      [plain.edge, plain.fill, plain.outline[0]],
      [(await surface('bare')).edge, await token('bg-2'), 'none']
    );
    for (const tone of TONES) {
      const { edge, fill } = await surface(`tone-${tone}`);
      assert.equal(edge, await token(`${tone}-border`), `${tone} edge`);
      assert.equal(fill, await token(`${tone}-soft`), `${tone} fill`);
    }
    const standalone = await surface('standalone-info');
    assert.equal(standalone.fill, await token('info-soft'), 'under the standalone style root');
  });

  it('draws each tone on the well, and outranks the dialog’s --fab-bg-2 fill', async () => {
    for (const tone of TONES) {
      const { edge, fill } = await surface(`well-${tone}`);
      assert.equal(edge, await token(`${tone}-border`), `${tone} edge`);
      assert.equal(fill, await token(`${tone}-soft`), `${tone} fill`);
    }
    assert.equal((await surface('well-modal-plain')).fill, await token('bg-2'), 'the dialog fill');
    assert.equal((await surface('well-modal-accent')).fill, await token('accent-soft'));
  });

  /** The head's parts in one card case: each box, the title's face and the note's ink. */
  const head = (id) =>
    tab.$eval(`[data-case="${id}"] > .fabricate-card`, (card) => {
      const box = (element) => {
        const { left, right, top, bottom, width } = element.getBoundingClientRect();
        return { left, right, top, bottom, width };
      };
      const style = getComputedStyle(card);
      const inset = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
      const title = card.querySelector('.fab-card-title');
      const titleStyle = getComputedStyle(title);
      return {
        card: box(card),
        inset,
        tile: box(card.querySelector('[data-tile]')),
        heading: box(card.querySelector('.fab-card-heading')),
        control: box(card.querySelector('[data-control]')),
        controls: [...card.querySelectorAll('[data-control]')].map(box),
        trailing: box(card.querySelector('.fab-card-trailing')),
        body: box(card.querySelector('[data-body]')),
        head: box(card.querySelector('.fab-card-head')),
        title: {
          family: titleStyle.fontFamily,
          size: titleStyle.fontSize,
          weight: titleStyle.fontWeight,
          color: titleStyle.color,
          margin: titleStyle.margin,
        },
        note: getComputedStyle(card.querySelector('.fab-card-note')).color,
        overflow: card.scrollWidth - card.clientWidth,
      };
    });

  it('draws the title in the serif face at 15px over the note, in --fab-text', async () => {
    const serif = await tab.$eval(
      '[data-token="serif"]',
      (probe) => getComputedStyle(probe).fontFamily
    );
    const { title } = await head('plain');
    assert.deepEqual(title, {
      family: serif,
      size: '15px',
      weight: '600',
      color: await token('text'),
      margin: '0px',
    });
  });

  it('inks the note --fab-text-muted on the untoned card and --fab-text-secondary on every toned one', async () => {
    assert.equal((await head('plain')).note, await token('text-muted'));
    for (const tone of TONES) {
      assert.equal((await head(`tone-${tone}`)).note, await token('text-secondary'), tone);
    }
  });

  it('lays the leading slot at the content edge, the heading beside it and the trailing slot at the far edge, at 320px', async () => {
    const parts = await head('plain');
    const left = parts.card.left + parts.inset;
    const right = parts.card.right - parts.inset;
    assert.equal(parts.tile.left, left, 'the tile at the content edge');
    assert.equal(parts.tile.top, parts.heading.top, 'the tile and the heading share a top');
    assert.equal(parts.heading.left, parts.tile.right + 12, 'the heading 12px after the tile');
    assert.equal(parts.control.right, right, 'the control at the far edge');
    assert.equal(parts.control.top, parts.heading.top, 'on the heading’s row');
    assert.ok(parts.control.left >= parts.heading.right, 'beside the heading, not over it');
    assert.equal(parts.body.top, parts.head.bottom + 8, 'the content 8px below the head');
    assert.equal(parts.overflow, 0);
  });

  it('wraps the trailing slot beneath the heading at the far edge at 180px, and nothing leaves the card', async () => {
    const parts = await head('narrow');
    const right = parts.card.right - parts.inset;
    assert.ok(parts.control.top >= parts.heading.bottom, 'the control drops beneath the heading');
    assert.equal(parts.tile.top, parts.heading.top, 'the heading stays beside the tile');
    assert.equal(parts.heading.left, parts.tile.right + 12);
    assert.equal(parts.control.right, right, 'still at the far edge');
    assert.ok(parts.heading.width >= 100, `the heading keeps ${parts.heading.width}px`);
    assert.ok(parts.head.right <= right, 'the head stays inside the content box');
    assert.equal(parts.overflow, 0, 'nothing overflows the card');
  });

  it('keeps the trailing slot on the heading’s row in the View Lab fixture’s 296px card', async () => {
    const parts = await head('fixture');
    assert.equal(parts.control.top, parts.heading.top, 'one row');
    assert.equal(parts.control.right, parts.card.right - parts.inset);
    assert.ok(parts.control.left >= parts.heading.right);
  });

  it('wraps three trailing controls among themselves at 180px, every one inside the card', async () => {
    const parts = await head('crowded');
    const left = parts.card.left + parts.inset;
    const right = parts.card.right - parts.inset;
    assert.equal(parts.controls.length, 3);
    assert.ok(parts.trailing.top >= parts.heading.bottom, 'the slot drops beneath the heading');
    assert.ok(parts.trailing.right <= right && parts.trailing.left >= left, 'within the head');
    for (const [index, control] of parts.controls.entries()) {
      assert.ok(control.left >= left && control.right <= right, `control ${index} inside the card`);
    }
    assert.ok(parts.controls[2].top > parts.controls[0].top, 'the slot wraps its own children');
    assert.equal(parts.overflow, 0, 'nothing overflows the card');
  });

  it('wraps the trailing slot to the inline-end edge, the left, in a right-to-left card at 180px', async () => {
    const parts = await head('rtl');
    const left = parts.card.left + parts.inset;
    assert.ok(parts.control.top >= parts.heading.bottom, 'the control drops beneath the heading');
    assert.equal(parts.control.left, left, 'at the inline end, the left edge');
    assert.equal(parts.tile.right, parts.card.right - parts.inset, 'the tile at the inline start');
    assert.equal(parts.overflow, 0);
  });

  it('inks a toned well’s label --fab-text-secondary over the kicker’s own muted rule', async () => {
    const label = (id) =>
      tab.$eval(
        `[data-case="${id}"] > .fab-well > .fab-well-label .fab-kicker`,
        (kicker) => getComputedStyle(kicker).color
      );
    assert.equal(await label('well-plain'), await token('text-muted'), 'untoned, the kicker’s ink');
    for (const tone of TONES) {
      assert.equal(await label(`well-${tone}`), await token('text-secondary'), tone);
    }
  });

  it('keeps a second, inset edge on a toned card and well under forced colours, and none untoned', async () => {
    await tab.emulateMedia({ forcedColors: 'active' });
    try {
      for (const id of [...TONES.map((tone) => `tone-${tone}`), ...TONES.map((t) => `well-${t}`)]) {
        assert.deepEqual((await surface(id)).outline, ['solid', '1px', '-4px'], id);
      }
      for (const id of ['plain', 'bare', 'well-plain', 'well-modal-plain']) {
        assert.equal((await surface(id)).outline[0], 'none', id);
      }
    } finally {
      await tab.emulateMedia({ forcedColors: 'none' });
    }
    assert.equal((await surface('tone-warning')).outline[0], 'none', 'and none in full colour');
  });
});
