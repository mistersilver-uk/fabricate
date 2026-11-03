/**
 * A formatted `Stepper` computes the same field in a Fabricate Manager window as under a bare
 * root, whether the module sheet loads in `layer(modules)` (Foundry) or flat beside the component's
 * own styles (a dev server): the Manager's text-field baseline draws no box on it. A plain text
 * input in the same Manager keeps the baseline, so the exclusion is the stepper's alone.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { settle } from '../helpers/publishedComponentModules.js';
import { publishedEntrySeam } from '../helpers/publishedEntrySeam.js';
import { STEPPER_NAMES } from '../helpers/publishedStepperFixture.js';
import { renderedPageHead } from '../helpers/renderedPageHead.js';

const { mountEntry } = publishedEntrySeam('fab-stepper-manager-baseline-');
const BASE = Object.freeze({ value: 2, min: 0, max: 9, ...STEPPER_NAMES, onChange() {} });

const CASES = Object.freeze({
  signed: { format: 'signed', value: 3, min: -9 },
  unlimited: { format: 'unlimited', value: 4, nullLabel: 'No limit' },
  endpoint: { format: 'unlimited', value: 0, nullLabel: 'No limit' },
  disabled: { format: 'signed', value: 3, min: -9, disabled: true },
  toolbar: { format: 'signed', value: 3, min: -9, size: '34' },
  fill: { format: 'signed', value: 3, min: -9, fill: true },
});

const PROPERTIES = [
  'backgroundColor',
  'backgroundImage',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRadius',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'minHeight',
  'minWidth',
  'height',
  'width',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'appearance',
  'cursor',
];

const ROOTS = Object.freeze({
  bare: 'fabricate fabricate-app',
  manager: 'fabricate fabricate-manager',
});

/** The page head with the module sheet in `layer(modules)`, or flat where `layered` is false. */
const headOf = (layered) => {
  const head = renderedPageHead(['Stepper']);
  if (layered) return head;
  const flat = head.replace(`@layer modules {${readStylesheet()}}`, () => readStylesheet());
  assert.notEqual(flat, head, 'the layer wrapper was found and removed');
  return flat;
};

for (const [cascade, layered] of Object.entries({ layered: true, flat: false })) {
  describe(`a formatted Stepper in a Fabricate Manager window, ${cascade} module sheet`, () => {
    let browser;
    let tab;

    before(async () => {
      const hosts = [];
      const shown = {};
      for (const [id, props] of Object.entries(CASES)) {
        const { target, handle } = mountEntry('Stepper', { ...BASE, ...props });
        await settle();
        shown[id] = target.querySelector('input').value;
        for (const [root, classes] of Object.entries(ROOTS)) {
          hosts.push(
            `<div class="${classes}" data-root="${root}"><div data-case="${id}" style="width:240px">${target.innerHTML}</div></div>`
          );
        }
        handle.destroy();
      }
      browser = await chromium.launch();
      tab = await browser.newPage({ viewport: { width: 480, height: 1200 } });
      await tab.setContent(
        `${headOf(layered)}<body class="game">` +
          `<div style="font-family:Arial,sans-serif;padding:8px;display:grid;gap:8px">${hosts.join('')}` +
          `<div class="fabricate fabricate-manager"><input type="text" data-plain value="plain"></div>` +
          `</div></body></html>`,
        { waitUntil: 'load' }
      );
      // `innerHTML` carries no input value, so each field is given the text it mounted with.
      await tab.evaluate((values) => {
        for (const input of document.querySelectorAll('[data-case] input')) {
          input.value = values[input.closest('[data-case]').dataset.case];
        }
      }, shown);
    });

    after(async () => {
      await browser?.close();
    });

    const computed = (root, id) =>
      tab
        .locator(`[data-root="${root}"] [data-case="${id}"] input`)
        .evaluate((input, properties) => {
          const style = getComputedStyle(input);
          return {
            ...Object.fromEntries(properties.map((name) => [name, style[name]])),
            shown: input.value,
            clipped: input.scrollWidth > input.clientWidth,
          };
        }, PROPERTIES);

    for (const id of Object.keys(CASES)) {
      it(`computes the ${id} field alike under the Manager root and a bare root`, async () => {
        const bare = await computed('bare', id);
        const manager = await computed('manager', id);
        assert.deepEqual(manager, bare);
        if (id === 'endpoint') assert.equal(manager.shown, 'No limit');
        assert.equal(manager.borderTopWidth, '0px', 'the field draws no border of its own');
        assert.notEqual(manager.shown, '', 'the field holds its text');
        assert.equal(manager.clipped, false, 'the text fits the field');
      });
    }

    it('keeps the Manager baseline on a plain text input', async () => {
      const plain = await tab.locator('[data-plain]').evaluate((input) => {
        const style = getComputedStyle(input);
        return { minHeight: style.minHeight, border: style.borderTopWidth };
      });
      assert.deepEqual(plain, { minHeight: '34px', border: '1px' });
    });
  });
}
