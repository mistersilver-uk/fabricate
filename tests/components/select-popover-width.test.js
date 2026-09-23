/*
 * THE PANEL IS AS WIDE AS ITS CALLER ASKED, MEASURED IN A REAL BROWSER (issue 1520 review round 2).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const { anchoredPopover, hostRelativePopoverLayout } = await import(
  '../../src/ui/svelte/actions/anchoredPopover.js'
);
const { computeIconPickerPopoverLayout } = await import(
  '../../src/ui/svelte/util/iconPickerPopover.js'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(__dirname, '../../styles/fabricate.css'), 'utf8');

/** The `form` rung's own ceiling, which every case below is measured against. */
const FORM_RUNG_MAX_WIDTH = 340;
/** The shared box's floor, which the "or…" menu shipped being clipped UP to. */
const SHARED_PANEL_MIN_WIDTH = 240;
/** The `inline` rung's band, restated here from `Select.svelte`'s own `SIZES` (issue 1511). */
const INLINE_RUNG = Object.freeze({ minWidth: 96, maxWidth: 240 });

/** A rect literal in the shape `getBoundingClientRect` returns. */
function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/**
 * The style attribute the SHIPPED action writes for one trigger and one band.
 *
 * @param {{triggerWidth: number, minWidth: number, maxWidth: number}} params
 * @returns {string} The whole `style` attribute, verbatim.
 */
function styleWrittenByTheAction({ triggerWidth, minWidth, maxWidth }) {
  const host = document.createElement('div');
  host.className = 'fabricate-app';
  host.getBoundingClientRect = () => rect(0, 0, 1000, 800);
  const root = document.createElement('div');
  const trigger = document.createElement('button');
  trigger.getBoundingClientRect = () => rect(16, 100, triggerWidth, 38);
  const panel = document.createElement('div');
  panel.getBoundingClientRect = () => rect(0, 0, triggerWidth, 200);
  root.append(trigger, panel);
  host.append(root);
  document.body.append(host);

  const handle = anchoredPopover(panel, {
    component: 'SelectPopoverWidthProbe',
    trigger,
    layout: hostRelativePopoverLayout(computeIconPickerPopoverLayout),
    layoutOptions: () => ({ horizontalAlign: 'left', minWidth, maxWidth }),
  });
  const style = panel.getAttribute('style');
  handle.destroy();
  document.body.innerHTML = '';
  return style;
}

/**
 * The same style with the two BOUND declarations removed, and nothing else.
 *
 * @param {string} style
 * @returns {string}
 */
function withoutBounds(style) {
  return style.replaceAll(/(?:min|max)-width: \d+px; /g, '');
}

/** One panel, exactly as `Select` renders it at one rung, carrying one style. */
function panelMarkup(probe, style, rung = 'form') {
  return `
    <div
      class="fabricate-picker-popover manager-travel-popover fabricate-select-popover fabricate-select-popover-${rung}"
      data-probe="${probe}"
      role="dialog"
      style="${style}"
    >
      <div class="manager-travel-popover-options fabricate-select-options" role="listbox">
        <button type="button" class="manager-travel-option fabricate-select-option" role="option"
          ><span class="fabricate-select-label">Woodland Grove — Azure gathering site</span></button
        >
      </div>
    </div>`;
}

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
});

/**
 * Measure both boxes for one band, in one page.
 *
 * @param {{triggerWidth: number, minWidth: number, maxWidth: number}} band
 * @param {string} [rung] The `Select` rung whose class rule the panel carries.
 * @returns {Promise<{fixed: number, control: number, style: string}>}
 */
async function measure(band, rung = 'form') {
  setupDOM();
  let style;
  try {
    style = styleWrittenByTheAction(band);
  } finally {
    teardownDOM();
  }

  const context = await browser.newContext({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    // The panel's own containing block is the window frame it is portalled onto.
    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            /* Core's own layer order and its universal box-sizing reset, both load-bearing:
               the panel declares a padding and a border and NO box-sizing of its own, so a
               fixture without the reset measures a content-box and reports every figure here
               14px too wide. Foundry ships this in the first of ten layers, so it is part of
               the box model every one of these rules is written against. */
            @layer reset, variables, elements, blocks, applications, compatibility, layouts, system, modules, exceptions;
            @layer reset { *, *::before, *::after { box-sizing: border-box; } }
            @layer modules { ${css} }
            body { margin: 0; font-family: Arial, sans-serif; }
            .probe-frame { position: relative; width: 480px; height: 700px; }
            /* The reflowed browse column is wider than the config window this fixture was
               written for, and a definite width is not shrunk by its container — but a frame
               narrower than the case would still be measuring its own scaffolding if that ever
               changed, so the wide case gets a frame of its own. */
            .probe-frame-wide { position: relative; width: 1000px; height: 700px; }
          </style>
        </head>
        <body>
          <div class="fabricate fabricate-app ${band.triggerWidth > 480 ? 'probe-frame-wide' : 'probe-frame'}">
            ${panelMarkup('fixed', style, rung)}
            ${panelMarkup('control', withoutBounds(style), rung)}
          </div>
        </body>
      </html>
    `);

    const measured = await page.evaluate(() =>
      Object.fromEntries(
        ['fixed', 'control'].map((probe) => {
          const element = globalThis.document.querySelector(`[data-probe="${probe}"]`);
          return [
            probe,
            {
              width: Number(element.getBoundingClientRect().width.toFixed(2)),
              // THE CEILING'S OWN ORIGIN, and it is asserted separately from the width because
              // the two can agree by accident. `min-width` WINS over `max-width` in the used-value
              // formula — `max(min, min(max, width))` — so a panel carrying only a floor already
              // renders at the caller's figure while its ceiling still comes from the class rule.
              maxWidth: globalThis.getComputedStyle(element).maxWidth,
            },
          ];
        })
      )
    );
    return { ...measured, style };
  } finally {
    await context.close();
  }
}

test('a full-width trigger opens a panel of its own width, not the rung’s 340px band', async () => {
  // The config window's own numbers.
  const { fixed, control, style } = await measure({
    triggerWidth: 450,
    minWidth: SHARED_PANEL_MIN_WIDTH,
    maxWidth: 480,
  });

  assert.equal(
    fixed.width,
    450,
    `the panel is as wide as the trigger it drops from. Style written: "${style}"`
  );
  assert.equal(
    fixed.maxWidth,
    '450px',
    'and its CEILING is the resolved band rather than the class rule, which is the finding'
  );
  assert.equal(
    control.width,
    FORM_RUNG_MAX_WIDTH,
    'and the sheet DOES still clip a bare width to the rung band, so the assertion above is ' +
      'about the two bound declarations rather than about a box nothing constrains'
  );
  assert.equal(control.maxWidth, `${FORM_RUNG_MAX_WIDTH}px`, 'which is where that clip came from');
});

test('a trigger narrower than the band opens at the band floor, not the shared 240px one', async () => {
  // The FLOOR half of the same defect, and the one already paid for once.
  const { fixed, control } = await measure({ triggerWidth: 40, minWidth: 150, maxWidth: 150 });

  assert.equal(fixed.width, 150, 'the layout resolved 150, and 150 is what the box takes');
  assert.equal(fixed.maxWidth, '150px', 'bounded at itself rather than at the rung ceiling');
  assert.equal(
    control.width,
    SHARED_PANEL_MIN_WIDTH,
    'and a bare width is still floored to 240 by the shared box, which is what the bound ' +
      'declarations are for'
  );
  assert.equal(
    control.maxWidth,
    `${FORM_RUNG_MAX_WIDTH}px`,
    'the control is the pre-fix box — a bare width under the class rule — which is what makes ' +
      'the two assertions above refutable'
  );
});

test('an inline trigger at the browse column minimum opens a panel of its own width', async () => {
  // THE PLAYER APP'S CRAFTING FILTERS (issue 1511).
  const { fixed, control } = await measure(
    { triggerWidth: 280, minWidth: INLINE_RUNG.minWidth, maxWidth: 1024 },
    'inline'
  );

  assert.equal(fixed.width, 280, 'the panel is as wide as the trigger it drops from');
  assert.equal(fixed.maxWidth, '280px', 'and its ceiling is the resolved band, not the rung rule');
  assert.equal(
    control.width,
    INLINE_RUNG.maxWidth,
    'and the sheet DOES still clip a bare width to the inline rung’s 240, so the assertion ' +
      'above is about the two bound declarations rather than about a box nothing constrains'
  );
  assert.equal(control.maxWidth, `${INLINE_RUNG.maxWidth}px`, 'which is where that clip came from');
});

test('an inline trigger in the reflowed single column opens a panel of its own width', async () => {
  // THE WIDE END of the same range. At the supported 1024px window floor the crafting grid
  // reflows to ONE column and the browse column measures 906px, so the same two filters drop a
  // 906px list — nearly four times the rung's own ceiling. Measured at the 1024px reflow.
  const { fixed, control } = await measure(
    { triggerWidth: 906, minWidth: INLINE_RUNG.minWidth, maxWidth: 1024 },
    'inline'
  );

  assert.equal(fixed.width, 906, 'the resolved band survives the sheet at the reflowed width');
  assert.equal(fixed.maxWidth, '906px', 'bounded at itself rather than at the rung ceiling');
  assert.equal(
    control.width,
    INLINE_RUNG.maxWidth,
    'the pre-fix box is still 240 here, so the gap between the two is the whole finding'
  );
});
