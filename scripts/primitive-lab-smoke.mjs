#!/usr/bin/env node
/**
 * `npm run lab:check` (issue 1487): boot the View Lab's Vite app, open the Primitive Lab, and fail
 * unless every catalogued row mounted with no console error, page error, Fabricate warning or
 * failed request. Maintainer-run: it refuses without a chrome harvest, which CI does not have.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import {
  ERROR_ATTRIBUTE,
  LAB_PAGE_PATH,
  LIVE_LABEL_SELECTOR,
  MOUNTED_ATTRIBUTE,
  MOUNT_ALL_QUERY,
  PARTIAL_SELECTOR,
  READY_ATTRIBUTE,
  SPECIMEN_ATTRIBUTE,
  SPECIMEN_SELECTOR,
  cataloguePaths,
  describeLiveLabelMismatch,
  describeMountFailure,
  describePartialMismatch,
  describeSectionMismatch,
  describeUnstableSizes,
  describeUnwidenedInsetSpecimens,
  describeWideBesideSpecimens,
  emptyCatalogueMessage,
  readLabExpectations,
  startLabServer,
} from './lib/primitiveLabSmoke.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The browser context `scripts/view-lab-screenshots.mjs` uses, so frames are comparable. */
const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];

/** Sized for a cold Vite optimiser building the whole module graph; a warm run takes seconds. */
const READY_TIMEOUT_MS = 120_000;
const NAVIGATION_TIMEOUT_MS = 150_000;

/**
 * Collect console errors, page errors, failed requests and `Fabricate |` warnings — each listener
 * sees what the others miss.
 *
 * @param {import('playwright').Page} page The page.
 * @returns {string[]} The live collector, appended to as the page runs.
 */
function collectPageFailures(page) {
  const failures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`);
      return;
    }
    // A Fabricate warning here is a component rejecting a catalogue row's props: fatal.
    if (message.type() === 'warning' && message.text().includes('Fabricate |')) {
      failures.push(`warning: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${String(error?.message ?? error)}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    failures.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
  });
  return failures;
}

/**
 * Open the lab, wait for its ready or error attribute, and return what it says about itself.
 *
 * @param {import('playwright').Page} page The page.
 * @param {string} baseUrl The server's own reported URL.
 * @returns {Promise<{error: string|null, mounted: number, specimens: string[]}>} The page's report.
 */
async function readLabReport(page, baseUrl) {
  await page.goto(`${baseUrl}${LAB_PAGE_PATH}?${MOUNT_ALL_QUERY}`, {
    waitUntil: 'load',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForFunction(
    ([ready, failed]) => document.body.hasAttribute(ready) || document.body.hasAttribute(failed),
    [READY_ATTRIBUTE, ERROR_ATTRIBUTE],
    { timeout: READY_TIMEOUT_MS }
  );
  return page.evaluate(
    ([failed, mounted, specimen, selector]) => ({
      error: document.body.getAttribute(failed),
      mounted: Number(document.body.getAttribute(mounted)),
      specimens: [...document.querySelectorAll(selector)].map((element) =>
        element.getAttribute(specimen)
      ),
    }),
    [ERROR_ATTRIBUTE, MOUNTED_ATTRIBUTE, SPECIMEN_ATTRIBUTE, SPECIMEN_SELECTOR]
  );
}

/** How long after ready the sizes are read again; a corrective resize lands within a frame or two. */
const SETTLE_MS = 750;

/** Every specimen iframe's rendered size, in document order. */
function readSpecimenSizes(page) {
  return page.evaluate(
    ([specimen, selector]) =>
      [...document.querySelectorAll(selector)].map((element) => {
        const rect = element.getBoundingClientRect();
        return { specimen: element.getAttribute(specimen), width: rect.width, height: rect.height };
      }),
    [SPECIMEN_ATTRIBUTE, SPECIMEN_SELECTOR]
  );
}

/** Every library section the page drew: its number, title and ledes, and the parts with no box. */
function readRenderedSections(page) {
  return page.evaluate(() => {
    const text = (element) => element?.textContent ?? null;
    const drawn = (element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility === 'visible';
    };
    return [...document.querySelectorAll('section[id]')].map((section) => {
      const number = section.querySelector(':scope > .sec-head .num');
      const title = section.querySelector(':scope > .sec-head h2');
      const ledes = [...section.querySelectorAll(':scope > p.lede')];
      const parts = [
        ['number', number],
        ['title', title],
        ...ledes.map((lede, index) => [`lede ${index + 1}`, lede]),
      ];
      return {
        id: section.id,
        number: text(number),
        title: text(title),
        ledes: ledes.map(text),
        unseen: parts.filter(([, element]) => element && !drawn(element)).map(([name]) => name),
      };
    });
  });
}

/**
 * Every chip a specimen stands under, read in one pass: each `live` label (its own word, the partial
 * qualifier aside), each partial qualifier, and each filling specimen beside its drawing with both
 * widths and the row inset the specimen pads itself by. Every record carries its entry heading and whether its chip directly precedes a specimen.
 */
function readSpecimenChips(page) {
  return page.evaluate(
    ([label, partial, specimen]) => {
      const entryOf = (element) =>
        (element.closest('.spec')?.querySelector(':scope > .spec-head > h4')?.textContent ?? '?')
          .replaceAll(/\s+/g, ' ')
          .trim();
      const leads = (element) => element?.nextElementSibling?.matches(specimen) ?? false;
      const all = (selector) => [...document.querySelectorAll(selector)];
      return {
        labels: all(label).map((element) => ({
          entry: entryOf(element),
          text: [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join(''),
          paired: leads(element),
        })),
        captions: all(partial).map((element) => ({
          entry: entryOf(element),
          text: element.textContent,
          paired: leads(element.parentElement),
        })),
        slots: all(specimen).map((frame) => ({
          entry: entryOf(frame),
          specimen: frame.dataset.primitiveLabSpecimen,
          width: frame.getBoundingClientRect().width,
          drawn: Number.parseFloat(frame.dataset.primitiveLabDrawn),
          capped: 'primitiveLabCapped' in frame.dataset,
        })),
        beside: all(`${label} + .pl-specimen-fill${specimen}`).map((frame) => ({
          entry: entryOf(frame),
          specimen: frame.dataset.primitiveLabSpecimen,
          width: frame.getBoundingClientRect().width,
          drawn: frame.previousElementSibling.previousElementSibling.getBoundingClientRect().width,
          inset:
            Number.parseFloat(
              frame.contentDocument?.querySelector('.pl-specimen')?.style.paddingLeft
            ) || 0,
        })),
      };
    },
    [LIVE_LABEL_SELECTOR, PARTIAL_SELECTOR, SPECIMEN_SELECTOR]
  );
}

async function run() {
  // Before the server: a 503'd chrome stylesheet neither throws nor logs in the page.
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  const expected = cataloguePaths(ROOT);
  if (expected.length === 0) throw new Error(emptyCatalogueMessage(ROOT));
  console.log(`using harvested Foundry ${cache.version} chrome`);
  const expectations = readLabExpectations(ROOT);
  console.log(
    `expecting ${expected.length} catalogued specimens, ${expectations.beside} beside their ` +
      `drawing, and ${expectations.sections.length} library sections`
  );

  const server = await startLabServer(ROOT);
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  try {
    const context = await browser.newContext(BROWSER_CONTEXT);
    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    const page = await context.newPage();
    const failures = collectPageFailures(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const report = await readLabReport(page, server.baseUrl);
    if (report.error) throw new Error(`the lab refused to boot: ${report.error}`);
    const atReady = await readSpecimenSizes(page);
    await page.waitForTimeout(SETTLE_MS);
    const unstable = describeUnstableSizes(atReady, await readSpecimenSizes(page));
    if (unstable) throw new Error(`ready was published before the sizes settled: ${unstable}`);

    const mismatch = describeMountFailure({
      expected,
      mounted: report.specimens,
      reported: report.mounted,
    });
    if (mismatch) throw new Error(`mounted set disagrees with the catalogue:\n  ${mismatch}`);
    const sections = describeSectionMismatch(
      expectations.sections,
      await readRenderedSections(page)
    );
    if (sections) throw new Error(`the page did not draw the library's sections:\n  ${sections}`);
    const chips = await readSpecimenChips(page);
    const labels = describeLiveLabelMismatch({
      expected: expectations.besideByEntry,
      labels: chips.labels,
    });
    if (labels) throw new Error(`the beside specimens are not all labelled:\n  ${labels}`);
    const partial = describePartialMismatch({
      expected: expectations.partialByEntry,
      captions: chips.captions,
    });
    if (partial) throw new Error(`the partial specimens do not all say so:\n  ${partial}`);
    const wide = describeWideBesideSpecimens(chips.beside);
    if (wide) throw new Error(`a filling specimen is wider than the drawing beside it: ${wide}`);
    const unwidened = describeUnwidenedInsetSpecimens(
      chips.slots.map((slot) => ({ ...slot, inset: expectations.insetByPath[slot.specimen] }))
    );
    if (unwidened) throw new Error(`an inset row's slot is not widened by its inset: ${unwidened}`);
    if (failures.length > 0) {
      throw new Error(
        `the page reported ${failures.length} failure(s):\n  ${failures.join('\n  ')}`
      );
    }
    console.log(
      `OK  ${report.mounted} specimens mounted (${expectations.beside} beside their drawing, ` +
        `each labelled; ${chips.captions.length} partial, each captioned), ` +
        `${expectations.sections.length} sections drawn, no console, page or request failures`
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
