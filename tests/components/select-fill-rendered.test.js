/**
 * The published `Select`'s `fill` (issue 2904) in a real browser, mounted through the real seam
 * under the module sheet: a filled trigger is as wide as `target` at every width and `size`, in a
 * flex and a block target, in a companion's shell and in a Fabricate window, and keeps that width
 * as the user chooses a longer option, where an unfilled one changes; the long value ends in an
 * ellipsis with the chevron at the trailing edge, in RTL too; the list opens below the filled
 * trigger, its left edge on the trigger's in LTR, as wide as the trigger within its rung's band;
 * keyboard focus moves none of the trigger's edges.
 * Limit: Chromium only, without Foundry's own sheet or Font Awesome's webfonts, so the chevron's
 * box is the empty `<i>`'s; screen-reader speech is not observed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer, pressPointerOn } from '../helpers/vite-fixture-server.js';

const server = createViteFixtureServer({ styleMountPrefix: '/@select-fill-styles/' });
const VIEWPORT = Object.freeze({ width: 1280, height: 1600 });
const SIZES = Object.freeze(['form', 'inline', 'toolbar']);
const WIDTHS = Object.freeze([160, 240, 360]);
/** Each rung's height and its list's band, as `Select.svelte`'s `SIZES` states it. */
const RUNGS = Object.freeze({
  form: { height: 38, minWidth: 240, maxWidth: 340 },
  inline: { height: 30, minWidth: 96, maxWidth: 240 },
  toolbar: { height: 34, minWidth: 160, maxWidth: 320 },
});
const LONG = 'oak';

before(() => server.start());
after(() => server.stop());

const twoFrames = (page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );

/** Runs `body(page)` on the fixture opened with `query`, then closes the page. */
async function inFixture(query, body) {
  const page = await server.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  try {
    await page.goto(server.url(`/tests/fixtures/select-fill/index.html?${query}`));
    await page.locator('body[data-fixture-ready]').waitFor({ state: 'attached' });
    await twoFrames(page);
    const answer = await body(page);
    assert.deepEqual(errors, [], 'no page error');
    return answer;
  } finally {
    await page.close();
  }
}

/** Every case's target, trigger, value and chevron boxes, and its value's overflow, by case id. */
function readCases() {
  const box = (element) => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  };
  return Object.fromEntries(
    [...document.querySelectorAll('[data-case]')].map((target) => {
      const trigger = target.querySelector('.fabricate-select-trigger');
      const value = trigger.querySelector('.fabricate-select-value');
      const chevron = trigger.querySelector(':scope > i:last-child');
      const style = getComputedStyle(trigger);
      return [
        target.dataset.case,
        {
          target: box(target),
          trigger: box(trigger),
          chevron: box(chevron),
          text: value.textContent,
          overflows: value.scrollWidth > value.clientWidth,
          textOverflow: getComputedStyle(value).textOverflow,
          inset: {
            start: Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft),
            end: Number.parseFloat(style.borderRightWidth) + Number.parseFloat(style.paddingRight),
          },
        },
      ];
    })
  );
}

const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) <= 0.5, `${what}: ${actual} is not ${expected}`);

const ids = (form) => SIZES.flatMap((size) => WIDTHS.map((width) => `${form}-${size}-${width}`));
const listOf = '.fabricate-select-popover';

/** Chooses `value` in case `id` as a pointer does: a press on its trigger, then on the row. */
async function choose(page, id, value) {
  await pressPointerOn(page, `[data-case="${id}"] .fabricate-select-trigger`);
  await page.locator(`${listOf} [data-popover-option="${value}"]`).waitFor();
  await pressPointerOn(page, `${listOf} [data-popover-option="${value}"]`);
  await page.locator(`[data-case="${id}"][data-chosen="${value}"]`).waitFor();
  await twoFrames(page);
}

/** Runs `step` on each of `items` in turn, each after the last has settled: one list opens at a time. */
const inTurn = (items, step) =>
  items.reduce((settled, item) => settled.then(() => step(item)), Promise.resolve());

/** Chooses the long option in every case of `forms`, one after another. */
const chooseLongEverywhere = (page, forms) =>
  inTurn(
    forms.flatMap((form) => ids(form)),
    (id) => choose(page, id, LONG)
  );

for (const host of ['companion', 'window']) {
  describe(`a filled published Select in a ${host === 'window' ? 'Fabricate window' : "companion's shell"}`, () => {
    it('is as wide as target at every width and size, in a flex and a block target, and at its rung’s height', () =>
      inFixture(`host=${host}`, async (page) => {
        const cases = await page.evaluate(readCases);
        for (const form of ['fill-flex', 'fill-block']) {
          for (const id of ids(form)) {
            near(cases[id].trigger.width, cases[id].target.width, `${id} trigger width`);
            near(cases[id].trigger.left, cases[id].target.left, `${id} start edge`);
            const size = id.split('-', 3)[2];
            near(cases[id].trigger.height, RUNGS[size].height, `${id} height`);
          }
        }
      }));

    it('keeps its width as a longer option is chosen, where the unfilled trigger changes', () =>
      inFixture(`host=${host}`, async (page) => {
        const before = await page.evaluate(readCases);
        await chooseLongEverywhere(page, ['fill-flex', 'hug-flex']);
        const after = await page.evaluate(readCases);
        for (const id of ids('fill-flex')) {
          assert.match(after[id].text, /^Oak heartwood/, `${id} shows the choice`);
          near(after[id].trigger.width, before[id].trigger.width, `${id} width after choosing`);
        }
        for (const id of ids('hug-flex')) {
          assert.ok(
            after[id].trigger.width > before[id].trigger.width + 20,
            `${id} hugs its label: ${before[id].trigger.width} then ${after[id].trigger.width}`
          );
          assert.ok(before[id].trigger.width < before[id].target.width - 20, `${id} hugs at rest`);
        }
      }));
  });
}

describe('a filled published Select’s long value', () => {
  for (const dir of ['ltr', 'rtl']) {
    it(`ends in an ellipsis with the chevron at the trailing edge, in ${dir}`, () =>
      inFixture(`dir=${dir}`, async (page) => {
        await chooseLongEverywhere(page, ['fill-flex']);
        const cases = await page.evaluate(readCases);
        for (const id of ids('fill-flex')) {
          const { trigger, chevron, inset, overflows, textOverflow } = cases[id];
          assert.ok(overflows, `${id} value overflows its box`);
          assert.equal(textOverflow, 'ellipsis', `${id} value ellipsises`);
          near(trigger.width, cases[id].target.width, `${id} width`);
          if (dir === 'ltr')
            near(chevron.right, trigger.right - inset.end, `${id} chevron at the end`);
          else near(chevron.left, trigger.left + inset.start, `${id} chevron at the end in rtl`);
        }
      }));
  }
});

describe('the list a filled published Select opens', () => {
  for (const dir of ['ltr', 'rtl']) {
    it(`opens below the trigger in ${dir}, as wide as the trigger within its rung’s band, its left edge on the trigger’s in ltr`, () =>
      inFixture(`host=companion&dir=${dir}`, async (page) => {
        await inTurn(ids('fill-flex'), async (id) => {
          const size = id.split('-', 3)[2];
          const trigger = `[data-case="${id}"] .fabricate-select-trigger`;
          await pressPointerOn(page, trigger);
          await page.locator(listOf).waitFor();
          await twoFrames(page);
          const [panel, anchor] = await page.evaluate(
            ([list, button]) =>
              [list, button].map((selector) => {
                const { left, top, bottom, width } = document
                  .querySelector(selector)
                  .getBoundingClientRect();
                return { left, top, bottom, width };
              }),
            [listOf, trigger]
          );
          const { minWidth, maxWidth } = RUNGS[size];
          const wanted = Math.min(Math.max(anchor.width, minWidth), maxWidth);
          near(panel.width, wanted, `${id} list width`);
          if (dir === 'ltr') near(panel.left, anchor.left, `${id} list left edge`);
          assert.ok(panel.top >= anchor.bottom, `${id} list below the trigger`);
          await page.keyboard.press('Escape');
          await page.locator(listOf).waitFor({ state: 'detached' });
        });
      }));
  }
});

describe('a filled published Select under keyboard focus', () => {
  it('keeps its border box as wide as target at every size, the focus mark moving no edge', () =>
    inFixture('host=companion', async (page) => {
      const before = await page.evaluate(readCases);
      const ids = SIZES.map((size) => `fill-flex-${size}-240`);
      await inTurn(ids, async (id) => {
        const trigger = `[data-case="${id}"] .fabricate-select-trigger`;
        await page.evaluate((selector) => {
          document.querySelector(selector).focus({ focusVisible: true });
        }, trigger);
        await page.keyboard.press('Shift');
        const focused = await page.evaluate(
          (selector) => document.querySelector(selector).matches(':focus-visible'),
          trigger
        );
        assert.ok(focused, `${id} holds keyboard focus`);
        const after = await page.evaluate(readCases);
        near(after[id].trigger.width, before[id].target.width, `${id} width under focus`);
        near(after[id].trigger.width, before[id].trigger.width, `${id} width unchanged by focus`);
        near(after[id].trigger.left, before[id].target.left, `${id} start edge under focus`);
      });
    }));
});
