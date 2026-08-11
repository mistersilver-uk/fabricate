#!/usr/bin/env node
/**
 * Visual-parity STRUCTURAL INVENTORY — can the subject be missing something?
 *
 *   node scripts/visual-parity/inventory.mjs --spec <spec.mjs> [--screen <name>] [--dump]
 *
 * `compare.mjs` measures computed styles of regions that exist on BOTH sides, so it cannot
 * see absence: it reported no drift on a screen missing a whole callout card, with two
 * controls in the wrong card and no drag handle on any row. This walks the prototype's own
 * element tree, enumerates the same landmarks out of the subject, and fails on every
 * prototype landmark the subject has no counterpart for. See `lib/inventory.js` for the
 * classifier and `README.md` for the operating manual.
 *
 * Screen-agnostic: the prototype, the subject and the roots all come from the spec.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import {
  COLLECT_INVENTORY_SOURCE,
  DEFAULT_INVENTORY_LIMITS,
  compareInventories,
  inventoryCoverageProblems,
  inventoryExemptionProblems,
  observableKeys,
} from './lib/inventory.js';
import { validateSpec } from './lib/schema.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

/**
 * Enumerate one root's landmarks in the page it is rendered in.
 *
 * @param {object} page Playwright page.
 * @param {string} locator Expression resolving the root, evaluated against `helpers`.
 * @param {string|null} helpers In-page helper source, or null for a bare selector.
 * @param {object} limits Classifier thresholds.
 * @returns {Promise<object>} `{ cards, loose }`.
 */
async function inventoryOf(page, locator, helpers, limits) {
  return page.evaluate(
    ({ source, locatorSource, helperSource, thresholds }) => {
      const collect = new Function(`${source}\nreturn collectInventory;`)();
      let root;
      if (helperSource) {
        const scope = new Function(`return (${helperSource});`)();
        root = new Function(...Object.keys(scope), `return (${locatorSource});`)(
          ...Object.values(scope)
        );
      } else {
        root = globalThis.document.querySelector(locatorSource);
      }
      if (!root) throw new Error(`inventory root "${locatorSource}" resolved to nothing`);
      return collect(root, thresholds);
    },
    {
      source: COLLECT_INVENTORY_SOURCE,
      locatorSource: locator,
      helperSource: helpers,
      thresholds: limits,
    }
  );
}

function describe(inventory) {
  const lines = [];
  for (const card of inventory.cards) {
    lines.push(`  card [${card.path.join(' > ')}] "${card.rawTitle}"`);
    if (card.labels.length > 0) lines.push(`    labels: ${card.labels.join(' | ')}`);
    if (card.glyphs.length > 0) lines.push(`    glyphs: ${card.glyphs.join(' ')}`);
  }
  if (inventory.loose.labels.length > 0) {
    lines.push(`  loose labels: ${inventory.loose.labels.join(' | ')}`);
  }
  if (inventory.loose.glyphs.length > 0) {
    lines.push(`  loose glyphs: ${inventory.loose.glyphs.join(' ')}`);
  }
  return lines.join('\n');
}

async function main() {
  const specPath = argument('spec');
  if (!specPath) {
    process.stderr.write('usage: inventory.mjs --spec <spec.mjs> [--screen <name>] [--dump]\n');
    return 2;
  }
  const spec = await import(pathToFileURL(resolve(process.cwd(), specPath)).href);
  const only = argument('screen');
  const dump = flag('dump');

  const problems = [...validateSpec(spec), ...inventoryCoverageProblems(spec)];
  if (problems.length > 0) {
    process.stdout.write(`GATE PROBLEMS\n  ${problems.join('\n  ')}\n`);
    return 1;
  }

  const limits = { ...DEFAULT_INVENTORY_LIMITS, ...spec.inventory.limits };
  const screens = spec.screens.filter((screen) => !only || screen === only);
  const exemptions = spec.inventoryExemptions ?? {};

  const browser = await chromium.launch();
  const failures = [];
  const extras = [];
  const observed = new Set();
  let subject = null;
  try {
    const prototypePage = await browser.newPage({
      viewport: spec.prototype.viewport,
      deviceScaleFactor: 1,
    });
    await prototypePage.goto(pathToFileURL(resolve(process.cwd(), spec.prototype.path)).href, {
      waitUntil: 'load',
    });
    if (spec.prototype.readySelector) {
      await prototypePage.waitForSelector(spec.prototype.readySelector, { timeout: 60_000 });
    }
    await prototypePage.waitForTimeout(spec.prototype.settleMs ?? 1500);

    subject = await spec.inventory.subject.open(browser);

    for (const screen of screens) {
      const roots = spec.inventory.roots[screen];
      await spec.navigate(prototypePage, roots.measuredOn ?? screen);
      const prototypeInventory = await inventoryOf(
        prototypePage,
        roots.prototype,
        spec.helpersSource,
        limits
      );
      await spec.inventory.subject.navigate(subject.page, roots.measuredOn ?? screen);
      const subjectInventory = await inventoryOf(subject.page, roots.subject, null, limits);

      for (const key of observableKeys(screen, prototypeInventory)) observed.add(key);
      const result = compareInventories({
        screen,
        prototype: prototypeInventory,
        subject: subjectInventory,
        exemptions,
      });
      if (dump) {
        process.stdout.write(
          `\n── ${screen} ───────────────────────────────\nPROTOTYPE\n` +
            `${describe(prototypeInventory)}\nSUBJECT\n${describe(subjectInventory)}\n`
        );
      }
      failures.push(...result.failures.map((entry) => `[${screen}] ${entry}`));
      extras.push(...result.extras.map((entry) => `[${screen}] ${entry}`));
      process.stdout.write(
        `  ${screen}: ${prototypeInventory.cards.length} prototype cards, ` +
          `${subjectInventory.cards.length} subject cards, ${result.failures.length} findings\n`
      );
    }
  } finally {
    if (subject?.dispose) await subject.dispose();
    await browser.close();
  }

  // Only meaningful over a FULL run: a `--screen` run cannot see the keys the other screens
  // would have observed, so a stale exemption there is unprovable rather than absent.
  const stale = only ? [] : inventoryExemptionProblems(exemptions, observed);

  if (stale.length > 0) process.stdout.write(`\nGATE PROBLEMS\n  ${stale.join('\n  ')}\n`);
  if (failures.length > 0) {
    process.stdout.write(`\nSTRUCTURAL DRIFT (${failures.length})\n  ${failures.join('\n  ')}\n`);
  }
  if (extras.length > 0) {
    process.stdout.write(
      `\nEXTRAS (${extras.length}, reported not failed — a product says more than a mockup)\n` +
        `  ${extras.join('\n  ')}\n`
    );
  }
  if (failures.length === 0 && stale.length === 0) {
    process.stdout.write('structural inventory: every prototype landmark has a counterpart\n');
  }
  return failures.length + stale.length > 0 ? 1 : 0;
}

process.exitCode = await main();
