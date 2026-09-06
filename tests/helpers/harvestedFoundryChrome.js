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
 * chrome-dependent step sets exactly that.
 *
 * AND THAT POLICY IS ENFORCED FROM HERE, not recorded per suite (issue 1371 r20-entry3; Foundry
 * review round 6 finding 3, quality review round 6 R2). Revision 19 wrote the sentence above and
 * left the two frame suites off the step and without the fail-loud arm, so with the harvest moved
 * aside they reported `tests 40, pass 20, skipped 20` and stayed GREEN under
 * `VIEWLAB_REQUIRE_CHROME=1` — the exact gap the step exists to close, reintroduced for two of
 * the three consumers by the revision that added them. {@link registerChromeRunnerGuards} now
 * carries the fail-loud arm AND the "named on the step" source assertion for every consumer, and
 * {@link CHROME_STEP_NAME} is the ONE place in the test tree that spells the step's name.
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
 *
 * Until r20 this literal was transcribed into `components-browser-rendered.test.js` and prose-quoted
 * in two docblocks besides, so the step could not be renamed without a hand-search: `gates2` left
 * it under-describing what it runs for exactly that reason. One constant, read by the assertion
 * below, is the mirror this repository asks for everywhere else — rename the step and precisely
 * one test file has to change with it.
 *
 * @type {string}
 */
export const CHROME_STEP_NAME =
  'Run every chrome-dependent suite, where a missing harvest fails instead of skipping';

/**
 * That step's own YAML, sliced out by indentation, or `null` where no such step exists.
 *
 * The workflow is read as TEXT: `js-yaml` is a transitive dependency of this repo's toolchain
 * rather than a declared one, and a guard is not worth a new npm dependency.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {string|null}
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
 * A suite whose chrome arms skip without a harvest needs BOTH halves or it guards nothing:
 *
 *  - the FAIL-LOUD arm, so the runner that is supposed to hold a harvest cannot report a green
 *    run in which every chrome arm was skipped;
 *  - the SOURCE assertion, because "and it runs HERE in CI" is a hand-maintained mirror of
 *    another file, and a step that is renamed, deleted or emptied of this file re-opens the gap
 *    silently. Read from the workflow rather than asserted in prose, so it fails at test time.
 *
 * Called from the suite's own module scope, before its `describe`s, exactly where each consumer
 * used to write its own copy.
 *
 * @param {object} options
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
 * pass `''` instead of the sheet and every sentence still passes. Two facts say the sheet arrived,
 * and the second is the one that matters:
 *
 *  - the tab's LABEL METRICS move — Foundry declares `--font-sans` and the tab inherits it — so
 *    the first tab's box is measurably wider under it. True, but it is a METRIC, and a future
 *    Foundry release that shipped the same font would retire it silently;
 *  - the tab's `justify-content` RESOLVES DIFFERENTLY: `center` under the sheet, `normal` without
 *    it. That is the CASCADE fact M28 is about — `a.button, button { justify-content: center }`
 *    against a `.manager-editor-tab-button` that declares the property nowhere — measured on the
 *    very strip M32 rules about, and it is the one that says Foundry's own arbitration reached
 *    this frame rather than merely its typography (issue 1371 r20-entry3, Foundry review round 6).
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
