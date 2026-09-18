/**
 * FOUNDRY'S OWN STYLESHEET, for the rendered suites that must be arbitrated against it (issue 1371
 * r19-gates2; Foundry review round 5 finding 7, quality review round 5 Q2). WHY A HARVEST CAN BE
 * ABSENT AT ALL.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, test } from 'node:test';

import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';

import { measureEntryFrameArrangements } from './renderedManagerShell.js';

/** What a skipped arm says, so every suite gives a reader the same next step. */
export const NO_HARVEST_SKIP_REASON = 'no local Foundry chrome harvest (.foundry-chrome)';
export const HARVEST_HINT = 'run: npm run viewlab:chrome:harvest';

/** The workflow that owns the one CI runner holding a harvest. */
const WORKFLOW_PATH = '.github/workflows/pr-screenshots.yml';

/**
 * The step every chrome-dependent suite runs on, quoted verbatim from that workflow — and quoted
 * ONCE, here.
 */
export const CHROME_STEP_NAME =
  'Run every chrome-dependent suite, where a missing harvest fails instead of skipping';

/**
 * That step's own YAML, sliced out by indentation, or `null` where no such step exists.
 *
 * @param {string} repoRoot Absolute repository root.
 */
function chromeDependentStep(repoRoot) {
  const lines = readFileSync(resolve(repoRoot, WORKFLOW_PATH), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${CHROME_STEP_NAME}`);
  if (start === -1) return null;
  const marker = lines[start].indexOf('- ');
  const after = lines.findIndex(
    (line, index) => index > start && line.indexOf('- ') === marker && line.trim().startsWith('- ')
  );
  return lines.slice(start, after === -1 ? lines.length : after).join('\n');
}

/**
 * The two guards that make a suite's SKIP POLICY true, registered together.
 *
 * @param {string} options.repoRoot Absolute repository root.
 * @param {string} options.suitePath the suite's own repo-relative path, as the workflow names it.
 * @param {string} options.chrome the sheet from {@link harvestedFoundryChromeCss}, or `''`.
 */
export function registerChromeRunnerGuards({ repoRoot, suitePath, chrome }) {
  if (!chrome && process.env.VIEWLAB_REQUIRE_CHROME === '1') {
    test(`a harvested Foundry chrome is present for ${suitePath} (VIEWLAB_REQUIRE_CHROME=1)`, () => {
      assert.fail(`no css/foundry2.css under .foundry-chrome/, but VIEWLAB_REQUIRE_CHROME=1; ${HARVEST_HINT}`);
    });
  }
  describe(`${suitePath} runs on the one CI runner that harvests a chrome`, () => {
    it('is named on pr-screenshots.yml’s chrome-dependent step, under VIEWLAB_REQUIRE_CHROME and --conditions=browser', () => {
      const step = chromeDependentStep(repoRoot);
      assert.ok(
        step,
        `${WORKFLOW_PATH} no longer carries a step named "${CHROME_STEP_NAME}" — every chrome-dependent suite's harvested-sheet arms now run nowhere in CI`
      );
      assert.ok(
        step.includes(suitePath),
        `${WORKFLOW_PATH}'s "${CHROME_STEP_NAME}" step no longer runs ${suitePath}, so its harvested-sheet arms skip silently in the only place they run`
      );
      assert.match(
        step,
        /VIEWLAB_REQUIRE_CHROME: '1'/,
        'that step no longer sets VIEWLAB_REQUIRE_CHROME=1, so a missing harvest would skip rather than fail'
      );
      assert.match(
        step,
        /--conditions=browser/,
        `that step no longer passes --conditions=browser, so every mount in ${suitePath} fails with "mount(...) is not available on the server"`
      );
    });
  });
}

/**
 * The newest harvested `foundry2.css`, or `''` where nothing is harvested.
 *
 * @param {string} repoRoot Absolute repository root.
 */
export function harvestedFoundryChromeCss(repoRoot) {
  const cache = resolveChromeCache(repoRoot);
  const sheet = cache ? join(cache.dir, 'css', 'foundry2.css') : '';
  return sheet && existsSync(sheet) ? readFileSync(sheet, 'utf8') : '';
}

/**
 * The harvested build's version, for a failure message that names what was measured.
 *
 * @param {string} repoRoot Absolute repository root.
 */
export function harvestedFoundryVersion(repoRoot) {
  return resolveChromeCache(repoRoot)?.version ?? 'none';
}

/**
 * `node:test`'s `skip` option: `false` where a harvest exists, the reason where it does not.
 *
 * @param {string} chrome The sheet from {@link harvestedFoundryChromeCss}.
 */
export function skipWithoutHarvest(chrome) {
  return chrome ? false : NO_HARVEST_SKIP_REASON;
}

/**
 * The shared editor frame's three arrangements, re-measured under Foundry's own sheet. `null` where
 * nothing is harvested, which is the value the skipped arms never read.
 */
export async function measureEntryFrameUnderHarvestedChrome({ chrome, pageFor, viewport }) {
  if (!chrome) return null;
  const arrangements = await measureEntryFrameArrangements(pageFor, viewport);
  return { hostHeight: viewport.height, ...arrangements };
}

/**
 * Hold a frame suite's shared contract a SECOND time, under Foundry's own harvested sheet. THE
 * FIRST ARM IS NON-VACUITY FOR EVERY ARM AFTER IT (issue 1371).
 *
 * @param {string} options.chrome the sheet, or `''` for no harvest.
 * @param {string} options.version the harvested build, for the arms' names.
 * @param {() => object} options.honestFrames the arrangements measured without the sheet.
 * @param {() => object|null} options.chromeFrames the same arrangements measured under it.
 * @param {ReadonlyArray<[string, (frames: object) => void]>} options.checks the shared contract.
 */
export function registerHarvestedChromeFrameArms({ chrome, version, honestFrames, chromeFrames, checks }) {
  const skip = skipWithoutHarvest(chrome);
  it('really laid Foundry’s own sheet over this frame, not an empty string', { skip }, () => {
    const width = (box) => box.right - box.left;
    const under = width(chromeFrames().honest.firstTab);
    const bare = width(honestFrames().honest.firstTab);
    assert.ok(
      Math.abs(under - bare) > 1,
      `the first tab measured ${under}px under Foundry ${version} and ${bare}px without it — the sheet did not reach the page`
    );
    assert.equal(
      chromeFrames().honest.firstTabJustify,
      'center',
      `the tab resolved justify-content: ${chromeFrames().honest.firstTabJustify} under Foundry ${version} — its own \`a.button, button { justify-content: center }\` did not arbitrate this strip, so the sheet did not reach the cascade`
    );
    assert.equal(
      honestFrames().honest.firstTabJustify,
      'normal',
      `without the sheet the tab already resolved justify-content: ${honestFrames().honest.firstTabJustify} — the module sheet now declares it, so the arm above no longer measures Foundry's arbitration`
    );
  });
  for (const [name, check] of checks) {
    it(`${name} — under Foundry ${version}’s own sheet`, { skip }, () => check(chromeFrames()));
  }
}
