/** Issue 2257 D21: every `Kicker` draws its window's UI face, measured in View Lab cases under Foundry's harvested sheet. */
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  getCaseById,
  labQueryFor,
  mapChangedFilesToCases,
} from '../../scripts/lib/viewLabCases.js';
import { openViewLab, VIEW_LAB_VITE_CONFIG } from '../../scripts/visual-parity/lib/view-lab.js';
import {
  harvestedFoundryChromeCss,
  registerChromeRunnerGuards,
  skipWithoutHarvest,
} from '../helpers/harvestedFoundryChrome.js';
import { viteDepCacheDir } from '../helpers/vite-dep-cache-dir.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const chrome = harvestedFoundryChromeCss(repoRoot);
registerChromeRunnerGuards({
  repoRoot,
  suitePath: 'tests/components/kicker-face-rendered.test.js',
  chrome,
});
const skip = skipWithoutHarvest(chrome);

/** Kicker's own capture cases; their kickers sit under a parent already in the UI face. */
const UI_FACE_PARENT_CASES = ['player-crafting-slot-rail', 'manager-recipe-item-overview'];
/** The history cases that draw a kicker inside a notice's mono evidence. */
const MONO_EVIDENCE_CASES = [
  'fabricate-journal-lifecycle-history-just-resolved',
  'player-journal-reward-just-resolved',
];
const CASE_IDS = [
  ...new Set([
    ...mapChangedFilesToCases(['src/ui/svelte/components/Kicker.svelte']).map(({ id }) => id),
    ...UI_FACE_PARENT_CASES,
    ...MONO_EVIDENCE_CASES,
  ]),
];

/** An OS-assigned free port, because Vite reads `port: 0` as its own default. */
function freePort() {
  return new Promise((done, fail) => {
    const probe = createNetServer().once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

/** The registry's step verbs this suite's cases use; any other verb fails rather than being skipped. */
// Mirrors `runSteps` in scripts/view-lab-screenshots.mjs until a follow-up extracts a shared runner.
async function runSteps(page, steps, caseId) {
  for (const step of steps) {
    if (typeof step === 'string') {
      const label = new RegExp(
        String.raw`^\s*${step.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}(\s|$)`
      );
      await page.locator('.manager-nav-button').filter({ hasText: label }).first().click();
    } else if ((await page.locator(step.selector).count()) === 0) {
      throw new Error(
        `${caseId}: nothing matches "${step.selector}" — the case cannot reach its view state`
      );
    } else if ('fill' in step) {
      await page.locator(step.selector).first().fill(step.fill);
    } else if (Object.keys(step).length === 1) {
      await page.locator(step.selector).first().click();
    } else {
      throw new Error(`unsupported case step ${JSON.stringify(step)}`);
    }
    await page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
  }
}

/** Each kicker's face beside its window's and its parent's, then again under a forced mono parent. */
function readKickerFaces() {
  const faceOf = (element) => getComputedStyle(element).fontFamily;
  const kickers = [...globalThis.document.querySelectorAll('.fab-kicker')];
  const read = kickers.map((kicker) => ({
    text: kicker.textContent.trim(),
    face: faceOf(kicker),
    windowFace: faceOf(kicker.closest('.application')),
    parentFace: faceOf(kicker.parentElement),
    inMonoEvidence: Boolean(kicker.closest('.fab-notice-evidence')),
  }));
  for (const kicker of kickers) kicker.parentElement.style.fontFamily = 'monospace';
  return read.map((entry, index) => ({ ...entry, faceUnderMono: faceOf(kickers[index]) }));
}

const measured = new Map();
let server;
let browser;

describe('Kicker draws the host UI face in every case it is captured in', { skip }, () => {
  before(async () => {
    const port = await freePort();
    server = await createServer({
      configFile: resolve(repoRoot, VIEW_LAB_VITE_CONFIG),
      cacheDir: viteDepCacheDir(),
      server: { port },
      logLevel: 'silent',
    });
    await server.listen();
    browser = await chromium.launch();
    for (const id of CASE_IDS) {
      const viewCase = getCaseById(id);
      assert.ok(viewCase, `the registry no longer carries ${id}`);
      const { page, dispose } = await openViewLab(browser, {
        repoRoot,
        app: viewCase.app,
        query: labQueryFor(viewCase),
        port,
        settleMs: 0,
        afterOpen: (opened) => runSteps(opened, viewCase.steps ?? [], id),
      });
      measured.set(id, await page.evaluate(readKickerFaces));
      await dispose();
    }
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  it('measures kickers in every named case', () => {
    for (const id of [...UI_FACE_PARENT_CASES, ...MONO_EVIDENCE_CASES]) {
      assert.ok(measured.get(id).length > 0, `${id} drew no .fab-kicker, so nothing was measured`);
    }
  });

  it('every kicker computes its window’s UI face', () => {
    for (const [id, kickers] of measured) {
      for (const { text, face, windowFace } of kickers) {
        assert.equal(
          face,
          windowFace,
          `${id}: the "${text}" kicker draws ${face}, not its window's ${windowFace}`
        );
      }
    }
  });

  it('a kicker under a UI-face parent keeps its face', () => {
    for (const id of UI_FACE_PARENT_CASES) {
      for (const { text, face, parentFace, windowFace } of measured.get(id)) {
        assert.equal(
          parentFace,
          windowFace,
          `${id}: the "${text}" kicker's parent is not in the UI face`
        );
        assert.equal(
          face,
          parentFace,
          `${id}: the "${text}" kicker left its UI-face parent's face`
        );
      }
    }
  });

  it('a kicker inside mono evidence states the UI face itself rather than inheriting it', () => {
    for (const id of MONO_EVIDENCE_CASES) {
      const inEvidence = measured.get(id).filter(({ inMonoEvidence }) => inMonoEvidence);
      assert.ok(inEvidence.length > 0, `${id} drew no kicker inside a notice's evidence`);
      for (const { text, face, parentFace, windowFace } of inEvidence) {
        assert.notEqual(
          parentFace,
          windowFace,
          `${id}: a caller rule re-faces the "${text}" kicker's parent`
        );
        assert.equal(
          face,
          windowFace,
          `${id}: the "${text}" kicker draws its parent's ${parentFace}`
        );
      }
    }
  });

  it('every kicker keeps its window’s UI face under a mono parent', () => {
    for (const [id, kickers] of measured) {
      for (const { text, faceUnderMono, windowFace } of kickers) {
        assert.equal(
          faceUnderMono,
          windowFace,
          `${id}: the "${text}" kicker inherits a mono parent's face`
        );
      }
    }
  });
});
