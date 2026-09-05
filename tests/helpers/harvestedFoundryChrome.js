/**
 * FOUNDRY'S OWN STYLESHEET, for the rendered suites that must be arbitrated against it
 * (issue 1371 r19-gates2; Foundry review round 5 finding 7, quality review round 5 Q2).
 *
 * Three suites now lay Foundry's harvested chrome under the module sheet — the rules list's M28
 * geometry and the shared editor frame's, once per consumer — and all three need the same three
 * facts: where the sheet is, what to say when there is no harvest, and how to measure a frame
 * under it. Written once here rather than transcribed per suite: a per-suite copy is the
 * duplication SonarCloud's new-code gate refuses, and a copy that drifts is a suite reporting
 * "measured under Foundry" while measuring something else.
 *
 * WHY A HARVEST CAN BE ABSENT AT ALL. `.foundry-chrome/` holds licensed Foundry assets, so it is
 * a local artefact that `npm test` must be able to run without: on a machine with no harvest the
 * arms that need one SKIP. A skip policy is only honest with a runner where the skip cannot be
 * taken, so `VIEWLAB_REQUIRE_CHROME=1` turns it into a failure and `pr-screenshots.yml`'s
 * chrome-dependent step sets exactly that. Each consuming suite records its own placement.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';

import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';

import { measureEntryFrameArrangements } from './renderedManagerShell.js';

/** What a skipped arm says, so every suite gives a reader the same next step. */
export const NO_HARVEST_SKIP_REASON = 'no local Foundry chrome harvest (.foundry-chrome)';
export const HARVEST_HINT = 'run: npm run viewlab:chrome:harvest';

/**
 * The newest harvested `foundry2.css`, or `''` where nothing is harvested.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {string}
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
 * @returns {string}
 */
export function harvestedFoundryVersion(repoRoot) {
  return resolveChromeCache(repoRoot)?.version ?? 'none';
}

/**
 * `node:test`'s `skip` option: `false` where a harvest exists, the reason where it does not.
 *
 * @param {string} chrome The sheet from {@link harvestedFoundryChromeCss}.
 * @returns {false|string}
 */
export function skipWithoutHarvest(chrome) {
  return chrome ? false : NO_HARVEST_SKIP_REASON;
}

/**
 * The shared editor frame's three arrangements, re-measured under Foundry's own sheet.
 *
 * `null` where nothing is harvested, which is the value the skipped arms never read. The frame's
 * tabs are `<button role="tab">` and `.manager-editor-tab-button` declares no `justify-content`,
 * so Foundry's `a.button, button { justify-content: center }` still arbitrates them — the rule M28
 * exists to beat, left un-overridden on the strip M32 rules about. It changes nothing today
 * because a tab box is content-sized and has no free space to distribute; a future tab-strip edit
 * that gives one free space would resolve its content's position from Foundry, and this is what
 * would notice.
 *
 * @param {object} options
 * @param {string} options.chrome
 * @param {(control: string) => string} options.pageFor
 * @param {{width: number, height: number}} options.viewport
 * @returns {Promise<object|null>}
 */
export async function measureEntryFrameUnderHarvestedChrome({ chrome, pageFor, viewport }) {
  if (!chrome) return null;
  const arrangements = await measureEntryFrameArrangements(pageFor, viewport);
  return { hostHeight: viewport.height, ...arrangements };
}

/**
 * Hold a frame suite's shared contract a SECOND time, under Foundry's own harvested sheet.
 *
 * Registered from here rather than written out in each suite: the two frame suites are already
 * held to one list of sentences precisely so they cannot drift apart, and a per-suite copy of the
 * arms that lay Foundry's sheet would reintroduce that drift — and would be the near-identical
 * block SonarCloud's new-code duplication gate refuses.
 *
 * THE FIRST ARM IS NON-VACUITY FOR EVERY ARM AFTER IT. The frame's geometry is chrome-INVARIANT
 * today, which is the good news and also the reason a chrome arm could quietly measure nothing:
 * pass `''` instead of the sheet and every sentence still passes. What Foundry does move is the
 * tab's LABEL METRICS — it declares `--font-sans` and the tab inherits it — so the first tab's box
 * is measurably wider under it. That is the fact that says the sheet arrived.
 *
 * The frames are taken as thunks because a suite measures them in `before()`, after registration.
 *
 * @param {object} options
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
  });
  for (const [name, check] of checks) {
    it(`${name} — under Foundry ${version}’s own sheet`, { skip }, () => check(chromeFrames()));
  }
}
