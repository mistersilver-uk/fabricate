#!/usr/bin/env node
/**
 * Visual-parity COMPARATOR — render the subject and compare it to the fixture.
 *
 *   node scripts/visual-parity/compare.mjs --spec <spec.mjs> --fixture <fixture.json>
 *
 * Exits non-zero on any drift, any coverage hole, any malformed exemption, or any chrome
 * element painting a forbidden colour. Screen-agnostic; see `README.md`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { IN_PAGE_PRELUDE } from './lib/measure.js';
import {
  coverageProblems,
  exemptionProblems,
  sameComputedValue,
  validateSpec,
} from './lib/schema.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * Render one subject screen and read every region mapped onto it.
 *
 * @param {object} browser Playwright browser.
 * @param {object} options Screen, markup, selectors and sweep configuration.
 * @returns {Promise<object>} `{ regions, chrome, missingAncestors }`.
 */
async function measureScreen(browser, options) {
  const { spec, screen, query } = options;
  const page = await browser.newPage({ viewport: spec.subject.viewport, deviceScaleFactor: 1 });
  try {
    const styles = spec.subject.stylesheets.map((css) => `<style>${css}</style>`).join('\n');
    const markup = spec.subject.screens[screen]();
    await page.setContent(
      `<!doctype html><html><head>${styles}</head><body style="margin:0">${markup}</body></html>`,
      { waitUntil: 'load' }
    );
    return await page.evaluate(
      ({ selectors, prelude, sweep, ancestors }) => {
        // eslint-disable-next-line no-new-func -- authored in the spec, never user input.
        new Function(`${prelude}\nglobalThis.__parity = { paintedBackground, chromeSweep };`)();
        const { paintedBackground, chromeSweep } = globalThis.__parity;
        const regions = {};
        for (const [name, entry] of Object.entries(selectors)) {
          const el = document.querySelector(entry.selector);
          if (!el) {
            regions[name] = { missing: entry.selector };
            continue;
          }
          const cs = getComputedStyle(el);
          const props = {};
          for (const prop of entry.properties) {
            props[prop] =
              prop === 'backgroundColor' && entry.effectiveBackground
                ? paintedBackground(el)
                : cs[prop];
          }
          regions[name] = { properties: props };
        }
        return {
          regions,
          chrome: sweep ? chromeSweep(sweep.selectors, sweep.forbidden) : [],
          // THE REAL ANCESTOR CHAIN, mechanised. A harness that starts at the panel under test
          // cannot see an inset that lives above it, and the first version of this one passed
          // while 36px of stacked dead space was on screen for exactly that reason.
          missingAncestors: (ancestors ?? []).filter(
            (selector) => !document.querySelector(selector)
          ),
        };
      },
      {
        selectors: query,
        prelude: IN_PAGE_PRELUDE,
        sweep: spec.subject.chromeSweep ?? null,
        ancestors: spec.subject.requiredAncestors ?? [],
      }
    );
  } finally {
    await page.close();
  }
}

async function main() {
  const specPath = argument('spec');
  const fixturePath = argument('fixture');
  if (!specPath || !fixturePath) {
    process.stderr.write('usage: compare.mjs --spec <spec.mjs> --fixture <fixture.json>\n');
    return 2;
  }
  const spec = await import(pathToFileURL(resolve(process.cwd(), specPath)).href);
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));

  const failures = [];
  failures.push(...validateSpec(spec));
  // The fixture carries its OWN screen list and its own region screens, so a fixture that
  // came back one screen narrower fails here even if the spec was edited to match.
  failures.push(
    ...coverageProblems(
      fixture.screens ?? [],
      Object.entries(fixture.regions).map(([name, region]) => ({ name, screen: region.screen }))
    )
  );
  if (JSON.stringify(fixture.screens ?? []) !== JSON.stringify(spec.screens)) {
    failures.push(
      `the fixture's screens ${JSON.stringify(fixture.screens)} are not the spec's ` +
        `${JSON.stringify(spec.screens)}: regenerate rather than hand-editing`
    );
  }
  failures.push(...exemptionProblems(fixture));

  // Both directions of the selector map, for the same reason as the screen set: a region with
  // no selector is measured against the prototype and compared to nothing, and a selector with
  // no region asserts nothing at all.
  const mapped = Object.keys(spec.subject.selectors).sort();
  const measured = Object.keys(fixture.regions).sort();
  for (const name of measured) {
    if (!mapped.includes(name)) failures.push(`region "${name}" has no subject selector`);
  }
  for (const name of mapped) {
    if (!measured.includes(name)) failures.push(`subject selector "${name}" measures no region`);
  }

  const browser = await chromium.launch();
  const drift = [];
  try {
    const byScreen = new Map();
    for (const [name, region] of Object.entries(fixture.regions)) {
      if (!spec.subject.selectors[name]) continue;
      const screen = spec.subject.selectors[name].screen ?? region.measuredOn ?? region.screen;
      if (!byScreen.has(screen)) byScreen.set(screen, {});
      byScreen.get(screen)[name] = {
        selector: spec.subject.selectors[name].selector,
        effectiveBackground: spec.subject.selectors[name].effectiveBackground === true,
        properties: Object.keys(region.properties),
      };
    }

    for (const [screen, query] of byScreen) {
      if (!spec.subject.screens[screen]) {
        failures.push(`the subject declares no markup for screen "${screen}"`);
        continue;
      }
      const result = await measureScreen(browser, { spec, screen, query });
      for (const selector of result.missingAncestors) {
        failures.push(
          `${screen}: the rendered tree is missing required ancestor "${selector}" — a harness ` +
            `that starts below the shell cannot see an inset that lives above it`
        );
      }
      for (const entry of result.chrome) failures.push(`${screen}: chrome sweep: ${entry}`);
      for (const [name, actual] of Object.entries(result.regions)) {
        const region = fixture.regions[name];
        if (actual.missing) {
          drift.push(`${name}: no element matched \`${actual.missing}\` on screen "${screen}"`);
          continue;
        }
        const exemptions = region.exemptions ?? {};
        for (const [property, expected] of Object.entries(region.properties)) {
          if (Object.hasOwn(exemptions, property)) continue;
          if (!sameComputedValue(property, actual.properties[property], expected)) {
            drift.push(
              `[${region.screen}] ${name}.${property}: subject ${actual.properties[property]} ` +
                `!== prototype ${expected}`
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const byScreenCount = {};
  for (const region of Object.values(fixture.regions)) {
    byScreenCount[region.screen] = (byScreenCount[region.screen] ?? 0) + 1;
  }
  process.stdout.write(
    `screens: ${spec.screens.map((s) => `${s}(${byScreenCount[s] ?? 0})`).join(' ')}\n`
  );
  if (failures.length > 0) process.stdout.write(`\nGATE PROBLEMS\n  ${failures.join('\n  ')}\n`);
  if (drift.length > 0) process.stdout.write(`\nDRIFT (${drift.length})\n  ${drift.join('\n  ')}\n`);
  if (failures.length === 0 && drift.length === 0) process.stdout.write('parity: no drift\n');
  return failures.length + drift.length > 0 ? 1 : 0;
}

process.exitCode = await main();
