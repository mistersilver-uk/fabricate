#!/usr/bin/env node
/**
 * Visual-parity COMPARATOR — measure the REAL APP and compare it to the prototype fixture.
 *
 *   node scripts/visual-parity/compare.mjs --spec <spec.mjs> --fixture <fixture.json>
 *                                          [--screen <name>]
 *
 * Exits non-zero on any drift, any coverage hole, any malformed exemption, any chrome element
 * painting a forbidden colour, and any alignment the prototype draws and the subject breaks.
 * Screen-agnostic; see `README.md`.
 *
 * ── Its subject is the app, not a fixture ────────────────────────────────────────────────
 * This pass used to render a hand-authored markup fixture. That fixture was a MIRROR, and a
 * mirror does not fail — it drifts, silently, into measuring something the app no longer
 * draws, or (as here) into modelling a component that was never broken while the broken one
 * went unmodelled. It is the same lesson `inventory.mjs` was created to escape, so both passes
 * now boot ONE live subject through `lib/subject.js` and read `getComputedStyle` off the
 * shipped component tree.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { installRuntime } from './lib/page-runtime.js';
import {
  EDGE_TOLERANCE_PX,
  MINIMUM_REASON_LENGTH,
  coverageProblems,
  edgeSpread,
  exemptionProblems,
  locatorProblems,
  sameComputedValue,
  validateSpec,
} from './lib/schema.js';
import { openLiveSubject, subjectProblems } from './lib/subject.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * Drive the live subject to one screen and read every region and edge mapped onto it.
 *
 * @param {object} session Live subject session from `openLiveSubject`.
 * @param {object} options Spec, screen name, region query and alignment query.
 * @returns {Promise<object>} `{ regions, chrome, missingAncestors, alignments }`.
 */
async function measureScreen(session, options) {
  const { spec, screen, query, alignments } = options;
  const page = await session.show(screen);
  return page.evaluate((payload) => globalThis.__fabricateParity.measure(payload), {
    regions: query,
    alignments,
    sweep: spec.subject.chromeSweep ?? null,
    ancestors: spec.subject.requiredAncestors ?? [],
    // EVERY locator resolves inside the subject root. The app under measurement is one window
    // of a whole running product, and a document-wide `querySelector` would happily answer a
    // region with a nav item or a neighbouring panel that wears the same class.
    root: spec.subject.root ?? null,
  });
}

/** A locator, as a reader can recognise it in a report. */
function describeLocator(locator) {
  return typeof locator === 'string' ? `\`${locator}\`` : JSON.stringify(locator);
}

/**
 * An UNREACHABLE region carries a stated reason, exactly as an exemption does.
 *
 * A region the lab's world cannot put on screen is a real constraint — an empty library
 * renders no row — but "cannot be measured" is a claim, and an unreasoned claim is
 * indistinguishable from a region somebody switched off to make the run green.
 */
function unreachableProblems(spec) {
  const problems = [];
  for (const [name, entry] of Object.entries(spec?.subject?.locators ?? {})) {
    if (!entry.unreachable) continue;
    if (
      typeof entry.unreachable !== 'string' ||
      entry.unreachable.trim().length < MINIMUM_REASON_LENGTH
    ) {
      problems.push(
        `${name}: an unreachable region needs a stated reason of at least ` +
          `${MINIMUM_REASON_LENGTH} characters, not a placeholder`
      );
    }
    if (!entry.locator) {
      problems.push(
        `${name}: an unreachable region still needs its locator, or nothing can notice when ` +
          `the app starts rendering it`
      );
    }
  }
  return problems;
}

/** Both directions of the spec-to-fixture alignment map, as coverage problems. */
function alignmentCoverage(spec, fixture) {
  const declared = new Set((spec.alignments ?? []).map((group) => group.name));
  const recorded = new Set(Object.keys(fixture.alignments ?? {}));
  return [
    ...[...declared]
      .filter((name) => !recorded.has(name))
      .map(
        (name) =>
          `alignment "${name}" is declared but not in the fixture: re-extract rather than ` +
          `carrying a group the prototype was never measured for`
      ),
    ...[...recorded]
      .filter((name) => !declared.has(name))
      .map((name) => `alignment "${name}" is in the fixture and not in the spec: regenerate`),
  ];
}

async function main() {
  const specPath = argument('spec');
  const fixturePath = argument('fixture');
  const only = argument('screen');
  if (!specPath || !fixturePath) {
    process.stderr.write(
      'usage: compare.mjs --spec <spec.mjs> --fixture <fixture.json> [--screen <name>]\n'
    );
    return 2;
  }
  const spec = await import(pathToFileURL(resolve(process.cwd(), specPath)).href);
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));

  // Both directions of the locator map, for the same reason as the screen set: a region with
  // no subject locator is measured against the prototype and compared to nothing, and a
  // locator with no region asserts nothing at all.
  const byName = (left, right) => left.localeCompare(right);
  const mapped = Object.keys(spec.subject.locators).sort(byName);
  const measured = Object.keys(fixture.regions).sort(byName);

  const failures = [
    ...validateSpec(spec),
    ...subjectProblems(spec),
    ...unreachableProblems(spec),
    // The fixture carries its OWN screen list and its own region screens, so a fixture that
    // came back one screen narrower fails here even if the spec was edited to match.
    ...coverageProblems(
      fixture.screens ?? [],
      Object.entries(fixture.regions).map(([name, region]) => ({ name, screen: region.screen }))
    ),
    ...(JSON.stringify(fixture.screens ?? []) === JSON.stringify(spec.screens)
      ? []
      : [
          `the fixture's screens ${JSON.stringify(fixture.screens)} are not the spec's ` +
            `${JSON.stringify(spec.screens)}: regenerate rather than hand-editing`,
        ]),
    ...exemptionProblems(fixture),
    ...alignmentCoverage(spec, fixture),
    ...Object.entries(spec.subject.locators ?? {}).flatMap(([name, entry]) =>
      locatorProblems(entry.locator, `subject locator "${name}"`)
    ),
    ...measured
      .filter((name) => !mapped.includes(name))
      .map((name) => `region "${name}" has no subject locator`),
    ...mapped
      .filter((name) => !measured.includes(name))
      .map((name) => `subject locator "${name}" measures no region`),
  ];
  if (failures.length > 0) {
    process.stdout.write(`GATE PROBLEMS\n  ${failures.join('\n  ')}\n`);
    return 1;
  }

  const subjectScreenOf = (name, region) =>
    spec.subject.locators[name].screen ?? region.measuredOn ?? region.screen;

  const byScreen = new Map();
  const screenOf = (screen) => {
    if (!byScreen.has(screen)) byScreen.set(screen, { regions: {}, alignments: {} });
    return byScreen.get(screen);
  };
  for (const [name, region] of Object.entries(fixture.regions)) {
    const entry = spec.subject.locators[name];
    const screen = subjectScreenOf(name, region);
    if (only && screen !== only) continue;
    screenOf(screen).regions[name] = {
      locator: entry.locator,
      effectiveBackground: entry.effectiveBackground === true,
      unreachable: Boolean(entry.unreachable),
      properties: Object.keys(region.properties),
    };
  }
  for (const [name, group] of Object.entries(fixture.alignments ?? {})) {
    if (only && group.measuredOn !== only) continue;
    // Only the edges the PROTOTYPE actually shares are asserted; the rest were measured and
    // recorded as `false`, which is a fact about the design rather than a rule for the app.
    if (!Object.values(group.shared).some(Boolean)) continue;
    screenOf(group.measuredOn).alignments[name] = Object.fromEntries(
      group.regions.map((member) => [member, spec.subject.locators[member].locator])
    );
  }

  const browser = await chromium.launch();
  const drift = [];
  const notes = [];
  let session = null;
  try {
    session = await openLiveSubject(browser, spec);
    await installRuntime(session.page);
    for (const [screen, query] of byScreen) {
      const result = await measureScreen(session, {
        spec,
        screen,
        query: query.regions,
        alignments: query.alignments,
      });
      if (result.missingRoot) {
        failures.push(
          `${screen}: the subject root \`${result.missingRoot}\` matched nothing — the app did ` +
            `not render, and every region below it would report as missing for that one reason`
        );
        continue;
      }
      for (const selector of result.missingAncestors) {
        failures.push(
          `${screen}: the rendered tree is missing required ancestor "${selector}" — a harness ` +
            `that starts below the shell cannot see an inset that lives above it`
        );
      }
      for (const entry of result.chrome) failures.push(`${screen}: chrome sweep: ${entry}`);
      for (const [name, actual] of Object.entries(result.regions)) {
        const region = fixture.regions[name];
        const entry = spec.subject.locators[name];
        if (actual.unreachable) {
          notes.push(`[${screen}] ${name} is UNREACHABLE: ${entry.unreachable}`);
          continue;
        }
        if (actual.reachableAfterAll) {
          failures.push(
            `${screen}: ${name} is marked unreachable, but the app renders it now — delete the ` +
              `note and let the region measure, rather than carrying an excuse for nothing`
          );
          continue;
        }
        if (actual.missing) {
          drift.push(
            `${name}: nothing matched ${describeLocator(entry.locator)} on screen "${screen}"`
          );
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
      for (const [name, group] of Object.entries(result.alignments)) {
        const recorded = fixture.alignments[name];
        for (const member of group.missing) {
          drift.push(`[${recorded.screen}] alignment "${name}": nothing matched "${member}"`);
        }
        if (group.missing.length > 0) continue;
        for (const side of recorded.edges) {
          if (!recorded.shared[side]) continue;
          const spread = edgeSpread(group.edges, side);
          if (spread.delta <= EDGE_TOLERANCE_PX) continue;
          drift.push(
            `[${recorded.screen}] alignment "${name}".${side}: the prototype lines these up and ` +
              `the subject insets "${spread.high}" ${spread.delta.toFixed(1)}px from ` +
              `"${spread.low}" (${Object.entries(spread.values)
                .map(([member, value]) => `${member} ${value.toFixed(1)}`)
                .join(', ')})`
          );
        }
      }
    }
  } finally {
    if (session) await session.dispose();
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
  if (drift.length > 0)
    process.stdout.write(`\nDRIFT (${drift.length})\n  ${drift.join('\n  ')}\n`);
  if (notes.length > 0)
    process.stdout.write(
      `\nNOT MEASURED (${notes.length}, each with a stated reason)\n  ${notes.join('\n  ')}\n`
    );
  if (failures.length === 0 && drift.length === 0) {
    // A SCOPED run is not a coverage claim, and saying so is the difference between a note and
    // a false one: the closed screen set is the whole reason an unmeasured screen fails.
    process.stdout.write(
      only
        ? `parity: no drift on screen "${only}" (scoped run, not a coverage claim)\n`
        : 'parity: no drift\n'
    );
  }
  return failures.length + drift.length > 0 ? 1 : 0;
}

process.exitCode = await main();
