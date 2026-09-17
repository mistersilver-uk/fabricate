#!/usr/bin/env node
/** Narrow Font Awesome bundle assertion for the version smoke arms. */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  describeFontAwesomeBundle,
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

/** The paths Foundry serves its Font Awesome bundle from. fixed, not discovered. */
const STYLESHEET_PATH = '/fonts/fontawesome/css/all.min.css';
const LICENSE_PATH = '/fonts/fontawesome/LICENSE.txt';

/** Collect only the Font Awesome evidence the arms declare as verdict-bearing. */
async function probeFontAwesomeBundle(page, targetNames) {
  return page.evaluate(
    async ({ targets, stylesheetPath, licensePath }) => {
      const stylesheetUrl = new URL(stylesheetPath, globalThis.location.origin).href;
      const licenseUrl = new URL(licensePath, globalThis.location.origin).href;

      const response = await fetch(stylesheetUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(
          `Font Awesome stylesheet ${stylesheetUrl} returned HTTP ${response.status}`
        );
      }
      const cssText = await response.text();

      // The licence is corroborating evidence, not the bundle, so a bundle that ships without one
      // is reported as such and left to the arm to judge.
      const licenseResponse = await fetch(licenseUrl, { cache: 'no-store' });
      const licenseText = licenseResponse.ok ? await licenseResponse.text() : null;

      const release = /Font Awesome (Free|Pro) (\d+\.\d+\.\d+)/.exec(cssText);
      const fontFamilies = [
        ...new Set([...cssText.matchAll(/(["'])(Font Awesome \d+[^"']*)\1/g)].map((m) => m[2])),
      ];

      const targetSet = new Set(targets);
      const foundNames = new Set();

      // Read the stylesheet's declaration blocks without a `([^{}]+)\{([^{}]+)\}` splitter.
      const glyphRuleSelectors = cssText
        .split('}')
        .slice(0, -1)
        .map((block) => block.split('{'))
        .filter((parts) => parts.length > 1 && parts.at(-2) !== '' && /--fa\s*:/.test(parts.at(-1)))
        .map((parts) => parts.at(-2));

      for (const selectorText of glyphRuleSelectors) {
        for (const selectorMatch of selectorText.matchAll(/\.fa-([a-z0-9-]+)/gi)) {
          if (targetSet.has(selectorMatch[1])) foundNames.add(selectorMatch[1]);
        }
      }

      return {
        edition: release?.[1] ?? null,
        version: release?.[2] ?? null,
        fontFamilies,
        licenseText,
        names: [...foundNames].sort((left, right) => (left < right ? -1 : 1)),
        stylesheetUrl,
        licenseUrl,
        glyphRuleCount: glyphRuleSelectors.length,
      };
    },
    { targets: targetNames, stylesheetPath: STYLESHEET_PATH, licensePath: LICENSE_PATH }
  );
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
    observation = describeFontAwesomeBundle(
      await probeFontAwesomeBundle(page, [
        ...new Set([...EXPECTATION.present, ...EXPECTATION.absent]),
      ])
    );
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
    process.stdout.write(`  ----  read from  ${observation.stylesheetUrl}\n`);
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
