/**
 * The published `ToggleCard`'s `tone` in Chromium, on the markup the seam draws under the module
 * sheet, in all seven palettes: an on card of each tone wears its family's soft fill and a sub line
 * in the secondary ink, an off card and a neutral one wear the resting face whatever the tone, and
 * the switch is a switch named by the title and checked while on, so the state is never the colour's
 * alone. Under forced colours every tone's edge is the system's text colour, as the neutral card's
 * is, and the switch's track is filled Highlight on and hollow Canvas off, so the state survives the
 * tint.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { FABRICATE_THEME_ATTRIBUTE, FABRICATE_THEME_IDS } from '../../src/ui/theme.js';
import { publishedAxPage } from '../helpers/publishedAxPage.js';

const TITLE = 'Spend when this stage begins';
const SUB = 'The ingredient is used up as the stage starts.';
const TONES = Object.freeze(['neutral', 'enabled', 'locked', 'info']);
const FAMILY = Object.freeze({ enabled: 'success', locked: 'accent', info: 'info' });
const CASES = TONES.flatMap((tone) =>
  [true, false].map((on) => [
    `${tone}-${on}`,
    'ToggleCard',
    { title: TITLE, sub: SUB, on, tone, semantics: 'switch', onToggle() {} },
  ])
);
const PROBES = [
  ...['success-soft', 'accent-soft', 'info-soft', 'surface-soft'].map(
    (token) => `<i data-probe="${token}" style="background:var(--fab-${token})"></i>`
  ),
  ...['text-secondary', 'text-muted', 'accent'].map(
    (token) => `<i data-probe="${token}" style="color:var(--fab-${token})"></i>`
  ),
  '<i data-probe="canvastext" style="forced-color-adjust:none;color:canvastext"></i>',
].join('');

let page;

before(async () => {
  page = await publishedAxPage({
    tmpPrefix: 'fabricate-toggle-card-tone-rendered-',
    cases: CASES,
    before: PROBES,
  });
});

after(async () => {
  await page?.close();
});

/**
 * Each probe's paint, and each card's fill, edge, sub ink and track, as computed once the
 * colour transitions a new palette or media setting starts have ended.
 */
const measure = () =>
  page.tab.evaluate(
    async (cases) => {
      await Promise.all(document.getAnimations().map((animation) => animation.finished));
      const style = (node) => getComputedStyle(node);
      const probes = Object.fromEntries(
        [...document.querySelectorAll('[data-probe]')].map((node) => [
          node.dataset.probe,
          /^(text-|accent$|canvastext$)/u.test(node.dataset.probe)
            ? style(node).color
            : style(node).backgroundColor,
        ])
      );
      const cards = Object.fromEntries(
        cases.map((id) => {
          const cell = document.querySelector(`[data-case="${id}"]`);
          const card = cell.querySelector('.fabricate-toggle-card');
          const track = cell.querySelector('.manager-status-toggle-track');
          return [
            id,
            {
              fill: style(card).backgroundColor,
              edge: style(card).borderTopColor,
              sub: style(cell.querySelector('.manager-recipe-status-sub')).color,
              track: style(track).backgroundColor,
            },
          ];
        })
      );
      return { probes, cards };
    },
    CASES.map(([id]) => id)
  );

const themed = async (theme) => {
  await page.tab.evaluate(
    ([attribute, value]) => document.querySelector('.fabricate').setAttribute(attribute, value),
    [FABRICATE_THEME_ATTRIBUTE, theme]
  );
  return measure();
};

describe('the published ToggleCard’s tones in Chromium', () => {
  for (const theme of Object.values(FABRICATE_THEME_IDS)) {
    it(`draws an on card in its family’s soft fill and secondary sub ink, and every other card at rest, in ${theme}`, async () => {
      const { probes, cards } = await themed(theme);
      const resting = cards['neutral-false'];
      assert.equal(resting.fill, probes['surface-soft']);
      assert.equal(resting.sub, probes['text-muted']);
      assert.equal(cards['neutral-true'].fill, resting.fill, 'neutral draws the resting fill on');
      assert.equal(cards['neutral-true'].sub, resting.sub);
      for (const [tone, family] of Object.entries(FAMILY)) {
        const on = cards[`${tone}-true`];
        assert.equal(on.fill, probes[`${family}-soft`], tone);
        assert.notEqual(on.fill, resting.fill, tone);
        assert.equal(on.sub, probes['text-secondary'], tone);
        assert.equal(on.track, probes.accent, `${tone}: the switch’s track is the accent`);
        const off = cards[`${tone}-false`];
        assert.equal(off.fill, resting.fill, `${tone} off`);
        assert.equal(off.edge, resting.edge, `${tone} off`);
        assert.equal(off.sub, resting.sub, `${tone} off`);
        assert.notEqual(off.track, on.track, `${tone}: the track differs on from off`);
      }
    });
  }

  it('names every switch by the title and checks it while the card is on, in every tone', async () => {
    for (const [id] of CASES) {
      const on = id.endsWith('true');
      const cell = page.tab.locator(`[data-case="${id}"]`);
      const named = cell.getByRole('switch', { name: TITLE, checked: on });
      assert.equal(await named.count(), 1, id);
      assert.deepEqual(await page.axOf(`[data-case="${id}"] button`), {
        role: 'switch',
        name: TITLE,
        description: SUB,
      });
    }
  });

  it('draws every tone’s edge in the system colour under forced colours, while the track still differs on from off', async () => {
    await themed(FABRICATE_THEME_IDS.FABRICATE);
    await page.tab.emulateMedia({ forcedColors: 'active' });
    const { probes, cards } = await measure();
    for (const tone of TONES) {
      for (const on of [true, false]) {
        const card = cards[`${tone}-${on}`];
        assert.equal(card.edge, probes.canvastext, `${tone} ${on}`);
      }
      assert.notEqual(cards[`${tone}-true`].track, cards[`${tone}-false`].track, tone);
    }
    await page.tab.emulateMedia({ forcedColors: 'none' });
  });
});
