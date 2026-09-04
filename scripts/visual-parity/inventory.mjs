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
  DEFAULT_INVENTORY_LIMITS,
  compareInventories,
  inventoryCoverageProblems,
  inventoryExemptionProblems,
  observableKeys,
} from './lib/inventory.js';
import { installRuntime } from './lib/page-runtime.js';
import { validateSpec } from './lib/schema.js';
import { openLiveSubject, subjectProblems } from './lib/subject.js';

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
 * @param {string|object[]} locator CSS selector or step list resolving the root.
 * @param {object} limits Classifier thresholds.
 * @param {string|object[]|null} pane Optional locator for the box the card ratio is taken from.
 * @returns {Promise<object>} `{ cards, loose }`.
 */
async function inventoryOf(page, locator, limits, pane = null) {
  const result = await page.evaluate(
    (payload) => globalThis.__fabricateParity.inventoryOf(payload),
    { locator, limits, pane }
  );
  if (result.missingRoot) {
    throw new Error(`inventory root ${JSON.stringify(locator)} resolved to nothing`);
  }
  // A root with no box on it OR ON ANY ANCESTOR gives the card classifier no pane width to
  // measure against, so every card verdict on that screen would be arbitrary. Said out loud
  // rather than defaulted: the retired default was `|| 1`, which silently measured the
  // prototype against a one-pixel pane and the subject against its real one.
  if (result.missingPane) {
    throw new Error(
      `inventory pane ${JSON.stringify(pane)} resolved to nothing — a declared pane that does ` +
        `not resolve would silently re-calibrate the card classifier`
    );
  }
  if (result.unmeasurableRoot) {
    throw new Error(
      `inventory root ${JSON.stringify(locator)} generates no box, and neither does any ` +
        `ancestor of it — there is no pane width to classify a card against`
    );
  }
  return result;
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

  const problems = [
    ...validateSpec(spec),
    ...subjectProblems(spec),
    ...inventoryCoverageProblems(spec),
  ];
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
    await installRuntime(prototypePage);

    // THE SAME LIVE SUBJECT the computed-style pass measures, booted by the same machinery.
    // Two implementations of "render the real app and drive it to a screen" would be two
    // things to keep honest, and the pass that fell behind would be the one nobody noticed.
    subject = await openLiveSubject(browser, spec);
    await installRuntime(subject.page);

    for (const screen of screens) {
      const roots = spec.inventory.roots[screen];
      await spec.navigate(prototypePage, roots.measuredOn ?? screen);
      const prototypeInventory = await inventoryOf(
        prototypePage,
        roots.prototype,
        limits,
        roots.prototypePane ?? null
      );
      const subjectPage = await subject.show(roots.measuredOn ?? screen);
      const subjectInventory = await inventoryOf(
        subjectPage,
        roots.subject,
        limits,
        roots.subjectPane ?? null
      );

      for (const key of observableKeys(screen, prototypeInventory, subjectInventory)) {
        observed.add(key);
      }
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
    if (subject) await subject.dispose();
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
