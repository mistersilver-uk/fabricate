#!/usr/bin/env node
/**
 * Narrow Font Awesome bundle assertion for the version smoke arms.
 *
 * This runs while `foundry-test.mjs --check=version` still has the selected Foundry container up.
 * It does NOT rely on Fabricate's committed catalogue to decide what the client can render; it
 * fetches the stylesheet that running Foundry serves and checks its release banner plus a small set
 * of version-discriminating icon names. That makes it a guard on the external premise the picker
 * depends on, rather than a test that merely compares Fabricate data with itself.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  evaluateFontAwesomeBundleObservation,
  fontAwesomeExpectationForArm,
  fontAwesomeExpectationLabel,
} from './lib/fontAwesomeSmokeExpectations.js';
import { deriveRunIdentity, reconcileFoundryEndpoint } from './lib/foundryRunIdentity.js';
import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = join(ROOT, 'test-results');
const ARM = resolveSmokeArmFromEnv();
const EXPECTATION = fontAwesomeExpectationForArm(ARM.id);
const FOUNDRY_URL = reconcileFoundryEndpoint({
  url: process.env.FOUNDRY_URL,
  hostPort: process.env.FOUNDRY_HOST_PORT,
  fallbackPort: deriveRunIdentity(ROOT).port,
}).url;

function formatAssertionTable(assertions) {
  const width = Math.max(...assertions.map((assertion) => assertion.id.length));
  return assertions
    .map(
      (assertion) =>
        `  ${assertion.passed ? 'PASS' : 'FAIL'}  ${assertion.id.padEnd(width)}  ` +
        JSON.stringify(assertion.detail)
    )
    .join('\n');
}

/**
 * Read only the Font Awesome facts the arm has declared as verdict-bearing.
 *
 * The whole CSS stays in the browser process. Returning a megabyte of minified stylesheet text to
 * Node would make a tiny smoke assertion expensive for no benefit, so the page parses the banner
 * and returns the presence of the target names plus a rule count as a non-vacuity diagnostic.
 *
 * @param {import('playwright').Page} page
 */
async function observeFontAwesomeBundle(page) {
  const targetNames = [...new Set([...EXPECTATION.present, ...EXPECTATION.absent])];

  return page.evaluate(async (targets) => {
    const loadedStylesheetUrls = [...globalThis.document.styleSheets]
      .map((sheet) => sheet.href)
      .filter((href) => typeof href === 'string' && href.includes('/fonts/fontawesome/'));
    const stylesheetUrl =
      loadedStylesheetUrls.find((href) => href.endsWith('/css/all.min.css')) ??
      new URL('/fonts/fontawesome/css/all.min.css', globalThis.location.origin).href;

    const response = await fetch(stylesheetUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `Font Awesome stylesheet ${stylesheetUrl} returned HTTP ${response.status}`
      );
    }
    const cssText = await response.text();
    const release = /Font Awesome (Free|Pro) (\d+\.\d+\.\d+)/.exec(cssText);

    const targetSet = new Set(targets);
    const foundNames = new Set();
    let glyphRuleCount = 0;
    const rulePattern = /([^{}]+)\{([^{}]+)\}/g;
    let ruleMatch;
    while ((ruleMatch = rulePattern.exec(cssText)) !== null) {
      const body = ruleMatch[2];
      if (!/(?:--fa\s*:|(?:^|;)\s*content\s*:)/.test(body)) continue;
      glyphRuleCount += 1;
      for (const selectorMatch of ruleMatch[1].matchAll(/\.fa-([a-z0-9-]+)/gi)) {
        if (targetSet.has(selectorMatch[1])) foundNames.add(selectorMatch[1]);
      }
    }

    return {
      edition: release?.[1] ?? null,
      version: release?.[2] ?? null,
      names: [...foundNames].sort((left, right) => (left < right ? -1 : 1)),
      stylesheetUrl,
      glyphRuleCount,
    };
  }, targetNames);
}

async function main() {
  process.stdout.write(
    `Font Awesome smoke arm: ${ARM.id} — expecting ${fontAwesomeExpectationLabel(EXPECTATION)}\n`
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let observation = null;
  let assertions = [];
  let failure = null;
  try {
    // `/join` is public once the version smoke has launched the world, and core styles are loaded
    // before a user joins. No second world login is needed just to inspect Foundry's own asset.
    await page.goto(`${FOUNDRY_URL}/join`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    observation = await observeFontAwesomeBundle(page);
    assertions = evaluateFontAwesomeBundleObservation(observation, EXPECTATION);
  } catch (error) {
    failure = error?.message ?? String(error);
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  const passed =
    failure === null && assertions.length > 0 && assertions.every((assertion) => assertion.passed);
  const summary = {
    arm: ARM.id,
    foundryVersion: ARM.foundryVersion,
    expectedFontAwesome: EXPECTATION,
    passed,
    failure,
    observation,
    assertions,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    join(RESULTS_DIR, `fontawesome-arm-${ARM.id}.json`),
    `${JSON.stringify(summary, null, 2)}\n`
  );

  if (assertions.length > 0) process.stdout.write(`${formatAssertionTable(assertions)}\n`);
  if (observation) {
    process.stdout.write(
      `  ----  glyph rules observed  ${observation.glyphRuleCount} (${observation.stylesheetUrl})\n`
    );
  }
  if (failure) process.stderr.write(`Font Awesome bundle probe failed: ${failure}\n`);
  process.stdout.write(
    `Font Awesome arm ${ARM.id}: ${passed ? 'PASSED' : 'FAILED'} ` +
      `(test-results/fontawesome-arm-${ARM.id}.json)\n`
  );

  if (!passed) process.exit(1);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`foundry-icon-bundle-assert fatal error: ${error.message}\n`);
  process.exit(1);
}
