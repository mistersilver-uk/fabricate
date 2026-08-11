#!/usr/bin/env node
/**
 * Visual-parity EXTRACTOR — record a prototype's computed styles into a fixture.
 *
 *   node scripts/visual-parity/extract.mjs --spec <spec.mjs> --out <fixture.json>
 *
 * Screen-agnostic: everything about WHICH prototype, WHICH screens and WHICH regions lives in
 * the spec, which is a development-time artefact and is not committed. See `README.md` in this
 * directory for the spec schema and for the traps this harness exists to avoid.
 *
 * ── Why computed styles and not screenshots ──────────────────────────────────────────────
 * A prototype is usually a fixed-width mockup and the real app is not, so a pixel diff cannot
 * survive the comparison and every attempt to eyeball one fails. Each side is measured at its
 * OWN natural width and only width-invariant properties are recorded — colours, type, borders,
 * radii, padding, gaps and fixed control geometry — so the two widths never enter the
 * comparison. A value that IS width-derived is recorded as an exemption rather than a number.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { IN_PAGE_PRELUDE } from './lib/measure.js';
import { DEFAULT_PROPERTY_GROUPS, validateSpec } from './lib/schema.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const specPath = argument('spec');
  const outPath = argument('out');
  if (!specPath || !outPath) {
    process.stderr.write('usage: extract.mjs --spec <spec.mjs> --out <fixture.json>\n');
    return 2;
  }
  const spec = await import(pathToFileURL(resolve(process.cwd(), specPath)).href);
  const problems = validateSpec(spec);
  if (problems.length > 0) {
    process.stderr.write(`spec is not usable:\n  ${problems.join('\n  ')}\n`);
    return 2;
  }

  const propertyGroups = { ...DEFAULT_PROPERTY_GROUPS, ...spec.propertyGroups };
  const resolvedOut = resolve(process.cwd(), outPath);
  // Exemptions are HAND-AUTHORED and live in the fixture beside the measurement they suspend,
  // so a reader of one region sees both. They are CARRIED ACROSS a regeneration rather than
  // rewritten, because losing them silently is exactly the failure the fixture exists to
  // prevent: the gate would come back one property narrower, and green.
  const previous = existsSync(resolvedOut) ? JSON.parse(readFileSync(resolvedOut, 'utf8')) : null;
  const carried = Object.fromEntries(
    Object.entries(previous?.regions ?? {})
      .filter(([, region]) => region.exemptions)
      .map(([name, region]) => [name, region.exemptions])
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: spec.prototype.viewport,
    deviceScaleFactor: 1,
  });
  const measured = {};
  try {
    await page.goto(pathToFileURL(resolve(process.cwd(), spec.prototype.path)).href, {
      waitUntil: 'load',
    });
    if (spec.prototype.readySelector) {
      await page.waitForSelector(spec.prototype.readySelector, { timeout: 60_000 });
    }
    await page.waitForTimeout(spec.prototype.settleMs ?? 1500);

    // A region is measured on the screen it says it is measured on, which is not always the
    // screen it BELONGS to: shell chrome and a persistent side rail belong to themselves and
    // are reachable from any section.
    const byScreen = new Map();
    for (const region of spec.regions) {
      const screen = region.measuredOn ?? region.screen;
      if (!byScreen.has(screen)) byScreen.set(screen, []);
      byScreen.get(screen).push(region);
    }

    for (const [screen, regions] of byScreen) {
      await spec.navigate(page, screen);
      const values = await page.evaluate(
        ({ regionSpecs, groups, prelude, helpers }) => {
          // and a string only because it has to cross the page boundary into `evaluate`.
          const readRegion = new Function(`${prelude}\nreturn readRegion;`)();

          const scope = new Function(`return (${helpers});`)();
          const out = {};
          for (const region of regionSpecs) {
            const fn = new Function(...Object.keys(scope), `return (${region.locator});`);
            const el = fn(...Object.values(scope));
            if (!el) throw new Error(`region ${region.name}: locator resolved to nothing`);
            out[region.name] = {
              tag: el.tagName.toLowerCase(),
              properties: readRegion(
                el,
                region.groups,
                groups,
                region.effectiveBackground === true
              ),
            };
          }
          return out;
        },
        {
          regionSpecs: regions,
          groups: propertyGroups,
          prelude: IN_PAGE_PRELUDE,
          helpers: spec.helpersSource,
        }
      );
      Object.assign(measured, values);
      process.stdout.write(`  ${screen}: ${regions.length} regions\n`);
    }
  } finally {
    await browser.close();
  }

  const fixture = {
    provenance: {
      ...spec.prototype,
      generator: 'scripts/visual-parity/extract.mjs',
      command: `node scripts/visual-parity/extract.mjs --spec ${specPath} --out ${outPath}`,
      engine: 'chromium (playwright)',
      note:
        'Computed styles, never screenshots. Each side is measured at its own natural width ' +
        'and only width-invariant properties are recorded, so the two widths never enter the ' +
        'comparison. This fixture is a development-time artefact and is not committed.',
    },
    screens: spec.screens,
    propertyGroups,
    regions: Object.fromEntries(
      spec.regions.map((region) => {
        const entry = {
          screen: region.screen,
          measuredOn: region.measuredOn ?? region.screen,
          groups: region.groups,
          prototypeLocator: region.locator,
          ...measured[region.name],
        };
        if (region.effectiveBackground) entry.effectiveBackground = true;
        if (carried[region.name]) entry.exemptions = carried[region.name];
        return [region.name, entry];
      })
    ),
  };

  mkdirSync(dirname(resolvedOut), { recursive: true });
  writeFileSync(resolvedOut, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${resolvedOut} (${spec.regions.length} regions)\n`);
  return 0;
}

process.exitCode = await main();
