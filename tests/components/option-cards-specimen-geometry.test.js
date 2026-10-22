/**
 * Issue 2467 — `RadioCardGroup` against the library's `<OptionCards>` specimen, measured in
 * Chromium in the three hosts that used to repaint it: a Checks Studio card, the `tool-edit` view
 * and a bare manager. Every host must draw the one face.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { scopedComponentCss } from '../helpers/scoped-component-css.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-option-cards-geometry-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: ['Field', 'Medallion', 'RadioCardGroup'].map(component),
  componentPath: component('RadioCardGroup'),
});

const body = createRawSnippet((option) => ({
  render: () => `<span class="probe-body">${option().value}</span>`,
}));
const option = (value, label, extra = {}) => ({
  value,
  label,
  description: `What choosing ${label} does.`,
  ...extra,
});

/** The groups each host draws, keyed by the `data-case` they are placed under. */
const CASES = Object.freeze({
  row: {
    options: [
      option('a', 'Breakable', { icon: 'fas fa-hammer' }),
      option('b', 'Immune', { icon: 'fas fa-lock' }),
    ],
    selectedValue: 'a',
    optionBody: body,
  },
  bare: {
    options: [option('a', 'Route one'), option('b', 'Route two')],
    selectedValue: 'b',
    optionBody: body,
  },
  stacked: {
    layout: 'stacked',
    columns: 3,
    options: ['a', 'b', 'c'].map((value) =>
      option(value, `Mode ${value}`, { icon: 'fas fa-star' })
    ),
    selectedValue: 'a',
  },
  disabled: {
    options: [
      option('a', 'On offer', { icon: 'fas fa-hammer' }),
      option('b', 'Later', { icon: 'fas fa-star', disabled: true }),
    ],
    selectedValue: 'a',
  },
});

/** The three hosts; `container` names the element whose width the option cards' reflow queries. */
const HOSTS = Object.freeze({
  checks: {
    container: '.fabricate-manager',
    wrap: (groups) =>
      `<div class="fabricate fabricate-manager" data-manager-view="checks-crafting"><section class="fabricate-card is-flush manager-checks-card"><div class="manager-checks-card-body">${groups}</div></section></div>`,
  },
  toolEdit: {
    container: '.manager-tool-editor-panel',
    wrap: (groups) =>
      `<div class="fabricate fabricate-manager" data-manager-view="tool-edit"><section class="manager-tool-editor-panel" style="grid-column:auto;grid-row:auto">${groups}</section></div>`,
  },
  manager: {
    container: '.fabricate-manager',
    wrap: (groups) => `<div class="fabricate fabricate-manager">${groups}</div>`,
  },
});

const document_ = (host, markup) => `<!doctype html><html><head><meta charset="utf-8">
<style>${read('tests/fixtures/foundry-core-min.css')}</style>
<style>@layer modules {${readStylesheet()}}</style>
<style>${scopedComponentCss(resolve(repoRoot, component('Medallion'))).css}</style>
<style>${scopedComponentCss(resolve(repoRoot, component('RadioCardGroup'))).css}</style>
<style>:root{--font-primary:Arial,sans-serif}*,*::before{transition-duration:0s!important}
${host.container}{width:1000px}</style>
</head><body class="game">${host.wrap(
  Object.keys(CASES)
    .map((key) => `<div data-case="${key}">${markup[key]}</div>`)
    .join('')
)}</body></html>`;

let browser;
const markup = {};

before(async () => {
  await harness.setup();
  try {
    for (const [key, props] of Object.entries(CASES)) {
      markup[key] = (
        await harness.mount({ legend: key, groupName: key, configCards: true, ...props })
      ).innerHTML;
      harness.remount();
    }
  } finally {
    harness.teardown();
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

/** Opens one host's page, runs `check` against it, and closes it. */
async function inHost(hostId, check) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  try {
    await tab.setContent(document_(HOSTS[hostId], markup), { waitUntil: 'load' });
    // Svelte writes `checked` and `disabled` as properties, which serialised markup drops.
    await tab.evaluate(() => {
      for (const card of document.querySelectorAll('.manager-resolution-option')) {
        const radio = card.querySelector('input[type="radio"]');
        radio.checked = card.classList.contains('is-active');
        radio.disabled = card.classList.contains('is-disabled');
      }
    });
    return await check(tab);
  } finally {
    await tab.close();
  }
}

/** The geometry and computed face of every card in one case. */
const readCase = (tab, caseId) =>
  tab.evaluate((id) => {
    const rect = (element) => element && element.getBoundingClientRect().toJSON();
    const style = (element, pseudo) => element && getComputedStyle(element, pseudo);
    const group = document.querySelector(`[data-case="${id}"]`);
    const options = group.querySelector('.manager-resolution-mode-options');
    return {
      tracks: style(options).gridTemplateColumns.split(' ').length,
      columnGap: style(options).columnGap,
      cards: [...group.querySelectorAll('.manager-resolution-option')].map((card) => {
        const part = (selector) => card.querySelector(selector);
        const cs = style(card);
        const before = style(card, '::before');
        const medallion = part('[data-tool-choice-icon] .fab-medallion');
        return {
          card: rect(card),
          paddingLeft: Number.parseFloat(cs.paddingLeft),
          borderLeft: Number.parseFloat(cs.borderLeftWidth),
          rowGap: cs.rowGap,
          position: cs.position,
          isolation: cs.isolation,
          before: {
            content: before.content,
            zIndex: before.zIndex,
            pointerEvents: before.pointerEvents,
          },
          chip: rect(part('[data-tool-choice-icon]')),
          chipClasses: medallion
            ? [...medallion.classList].filter((c) => !c.startsWith('svelte-'))
            : [],
          glyph: medallion && style(medallion.querySelector('i')).color,
          text: rect(part('.manager-resolution-option-text')),
          name: {
            box: rect(part('[data-tool-choice-title]')),
            ...pick(style(part('[data-tool-choice-title]'))),
          },
          desc: pick(style(part('[data-tool-choice-description]'))),
          radio: {
            box: rect(part('input[type="radio"]')),
            opacity: style(part('input[type="radio"]')).opacity,
          },
          body: rect(part('.manager-resolution-option-body')),
          opacity: [
            '[data-tool-choice-icon]',
            '[data-tool-choice-title]',
            '[data-tool-choice-description]',
          ].map((selector) => part(selector) && style(part(selector)).opacity),
          own: cs.opacity,
        };
      }),
    };
    function pick(cs) {
      return (
        cs && { size: cs.fontSize, weight: cs.fontWeight, leading: cs.lineHeight, color: cs.color }
      );
    }
  }, caseId);

/** A token resolved to the colour Chromium computes for it. */
const tokenColour = (tab, token) =>
  tab.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.querySelector('.fabricate-manager').append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

for (const hostId of Object.keys(HOSTS)) {
  describe(`<OptionCards> in the ${hostId} host (issue 2467)`, () => {
    it('draws the 30px chip, the 16px radio, the type and the 8px rhythm', () =>
      inHost(hostId, async (tab) => {
        const row = await readCase(tab, 'row');
        const [chosen, resting] = row.cards;
        assert.equal(row.columnGap, '8px', 'cards sit 8px apart');
        for (const card of row.cards) {
          assert.deepEqual(
            [card.chip.width, card.chip.height],
            [30, 30],
            'the chip is the 30 rung'
          );
          assert.deepEqual([card.radio.box.width, card.radio.box.height], [16, 16], 'a 16px radio');
          assert.equal(card.text.left - card.chip.right, 8, 'an 8px gap from chip to text');
          assert.equal(card.radio.box.left - card.text.right, 8, 'and from text to radio');
          assert.equal(card.rowGap, '6px', 'the card stacks its parts 6px apart');
          assert.deepEqual(
            [card.name.size, card.name.weight, card.name.leading],
            ['12.5px', '600', '20px']
          );
          assert.deepEqual(
            [card.desc.size, card.desc.weight, card.desc.leading],
            ['10.5px', '400', '15.75px']
          );
          assert.equal(card.desc.color, await tokenColour(tab, '--fab-text-muted'));
        }
        assert.equal(chosen.name.color, await tokenColour(tab, '--fab-text'));
        assert.equal(resting.name.color, await tokenColour(tab, '--fab-text-secondary'));
        const contentLeft = (card) => card.card.left + card.borderLeft + card.paddingLeft;
        assert.equal(
          chosen.body.left - contentLeft(chosen),
          38,
          'the body starts at the text column'
        );
        const bare = await readCase(tab, 'bare');
        for (const card of bare.cards) {
          assert.equal(card.body.left - contentLeft(card), 0, 'with no chip, at the card padding');
        }
      }));

    it('inks the chosen chip accent and a resting one neutral', () =>
      inHost(hostId, async (tab) => {
        const [chosen, resting] = (await readCase(tab, 'row')).cards;
        assert.ok(
          chosen.chipClasses.includes('is-glyph-chip') &&
            chosen.chipClasses.includes('is-tone-accent')
        );
        assert.ok(
          !chosen.chipClasses.includes('is-ink-neutral'),
          'the chosen chip is not inked neutral'
        );
        assert.ok(
          resting.chipClasses.includes('is-glyph-chip') &&
            resting.chipClasses.includes('is-ink-neutral')
        );
        assert.ok(!resting.chipClasses.includes('is-tone-accent'), 'a resting chip takes no tone');
        assert.equal(chosen.glyph, await tokenColour(tab, '--fab-accent-text'));
        assert.equal(resting.glyph, await tokenColour(tab, '--fab-text-secondary'));
      }));

    it('layers the chosen ground on an isolated card, so it shows and never takes the pointer', () =>
      inHost(hostId, async (tab) => {
        const [chosen, resting] = (await readCase(tab, 'row')).cards;
        assert.deepEqual([chosen.position, chosen.isolation], ['relative', 'isolate']);
        assert.deepEqual(chosen.before, { content: '""', zIndex: '-1', pointerEvents: 'none' });
        assert.equal(resting.before.content, 'none', 'a resting card draws no layer');
        const corner = (card) =>
          tab.screenshot({
            clip: { x: card.card.left + 4, y: card.card.top + 4, width: 2, height: 2 },
          });
        assert.ok(
          !(await corner(chosen)).equals(await corner(resting)),
          'a chosen card’s padding corner paints the same as a resting one: the layer sank under the card'
        );
        const hit = await tab.evaluate(
          ([radio, name]) => {
            const at = (box) =>
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            const card = document.querySelector('[data-case="row"] .manager-resolution-option');
            return {
              radio: at(radio) === card.querySelector('input[type="radio"]'),
              title: card.querySelector('[data-tool-choice-title]').contains(at(name)),
            };
          },
          [chosen.radio.box, chosen.name.box]
        );
        assert.deepEqual(
          hit,
          { radio: true, title: true },
          'the pointer reaches the radio and the title'
        );
      }));

    it('moves only the border of an enabled, unchosen card on hover', () =>
      inHost(hostId, async (tab) => {
        const selector = '[data-case="row"] .manager-resolution-option:nth-child(2)';
        const face = () =>
          tab.$eval(selector, (card) => {
            const cs = getComputedStyle(card);
            const keys = ['backgroundColor', 'borderTopColor', 'boxShadow', 'color', 'opacity'];
            return Object.fromEntries(keys.map((key) => [key, cs[key]]));
          });
        const rest = await face();
        await tab.hover(selector);
        const hovered = await face();
        const moved = Object.keys(rest).filter((key) => rest[key] !== hovered[key]);
        assert.deepEqual(moved, ['borderTopColor'], 'hover moves the border and nothing else');
        assert.equal(hovered.borderTopColor, await tokenColour(tab, '--fab-border-strong'));
      }));

    it('keeps a focused chosen radio a 4px ring with no shadow', () =>
      inHost(hostId, async (tab) => {
        await tab.keyboard.press('Tab');
        await tab.focus('[data-case="row"] input[type="radio"]:checked');
        const ring = await tab.$eval('[data-case="row"] input[type="radio"]:checked', (radio) => {
          const cs = getComputedStyle(radio);
          return {
            visible: radio.matches(':focus-visible'),
            shadow: cs.boxShadow,
            border: cs.borderTopWidth,
            outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineOffset}`,
          };
        });
        assert.deepEqual(ring, {
          visible: true,
          shadow: 'none',
          border: '4px',
          outline: '2px solid 2px',
        });
      }));

    it('dims each part of a disabled option, never the card', () =>
      inHost(hostId, async (tab) => {
        const [, later] = (await readCase(tab, 'disabled')).cards;
        assert.deepEqual([...later.opacity, later.radio.opacity], ['0.45', '0.45', '0.45', '0.45']);
        assert.equal(later.own, '1');
      }));

    it('falls to one track below 620px of host, keeping each layout', () =>
      inHost(hostId, async (tab) => {
        const wide = { row: await readCase(tab, 'row'), stacked: await readCase(tab, 'stacked') };
        assert.deepEqual([wide.row.tracks, wide.stacked.tracks], [2, 3]);
        await tab.$eval(HOSTS[hostId].container, (node) => {
          node.style.width = '600px';
        });
        assert.ok((await tab.evaluate(() => innerWidth)) >= 1280, 'the viewport stays wide');
        for (const caseId of ['row', 'stacked']) {
          const narrow = await readCase(tab, caseId);
          assert.equal(narrow.tracks, 1, `${caseId} falls to one track`);
          const [first, second] = narrow.cards;
          assert.ok(second.card.top >= first.card.bottom, `${caseId} cards stack`);
        }
        for (const card of (await readCase(tab, 'stacked')).cards) {
          assert.ok(
            card.text.top >= card.chip.bottom,
            'a collapsed stacked card keeps chip over text'
          );
          assert.ok(
            card.radio.box.left > card.chip.right,
            'with the radio trailing on the chip’s line'
          );
        }
        for (const card of (await readCase(tab, 'row')).cards) {
          assert.ok(card.text.left >= card.chip.right, 'a collapsed row card stays a row');
        }
      }));
  });
}
