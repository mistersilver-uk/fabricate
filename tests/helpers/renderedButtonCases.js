/**
 * The published `Button` cases a rendered suite measures in Chromium: each case's button as the
 * seam draws it, under the module sheet, in a `.fabricate` root a suite re-themes, beside a probe
 * per token whose `color` resolves that token in the root's palette.
 */
import { chromium } from 'playwright';

import { settle } from './publishedComponentModules.js';
import { renderedPageHead } from './renderedPageHead.js';

/**
 * Mounts `[id, props]` per case through `mountEntry`, each over `base`, and opens one page holding
 * them and `extra` markup; resolves `{ browser, tab }`, which the suite closes.
 */
export async function openButtonCases({ mountEntry, base, cases, tokens, extra = '', viewport }) {
  const cells = [];
  for (const [id, props] of cases) {
    const { target, handle } = mountEntry('Button', { onclick() {}, ...base, ...props });
    await settle();
    cells.push(`<div data-case="${id}">${target.innerHTML}</div>`);
    handle.destroy();
  }
  const probes = tokens
    .map((name) => `<i data-token="${name}" style="color:var(${name})"></i>`)
    .join('');
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport });
  await tab.setContent(
    `${renderedPageHead([])}<body class="game"><div class="fabricate fabricate-app" data-fabricate-theme="fabricate">` +
      '<style>[data-case]{display:flex;padding:8px}</style>' +
      `${cells.join('')}<div>${probes}${extra}</div></div></body></html>`,
    { waitUntil: 'load' }
  );
  return { browser, tab };
}

/** The case's button face as Chromium computes it now. */
export const buttonFaceOf = (tab, id) =>
  tab.evaluate((hook) => {
    const style = getComputedStyle(document.querySelector(`[data-case="${hook}"] button`));
    return {
      ink: style.color,
      fill: style.backgroundColor,
      edge: style.borderTopColor,
      opacity: style.opacity,
      outline: [style.outlineStyle, style.outlineWidth, style.outlineOffset, style.outlineColor],
    };
  }, id);

/** Every token probe's resolved colour now, keyed by its token. */
export const tokenColours = (tab) =>
  tab.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-token]')].map((probe) => [
        probe.dataset.token,
        getComputedStyle(probe).color,
      ])
    )
  );
