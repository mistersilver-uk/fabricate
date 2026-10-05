/**
 * The smoke's rendering readiness (issue 2192): a GM page that stops producing animation frames
 * stalls every Playwright click, so the walk brings it back to the front before it acts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { ensurePageRendering } from '../scripts/foundry-smoke/pageOps/pageRendering.mjs';

/** A page that renders frames only once `bringToFront` has run, when `background` is set. */
function fakePage({ background, rendersAfterFront = true }) {
  const log = [];
  let front = !background;
  const page = {
    bringToFront: async () => {
      log.push('bringToFront');
      front = rendersAfterFront;
    },
    evaluate: async (fn, arg) => {
      log.push('frame');
      const requestAnimationFrame = (callback) => {
        if (front) setImmediate(callback);
      };
      return runInNewContext(`(${fn})(arg)`, {
        arg: Math.min(arg, 20),
        performance,
        requestAnimationFrame,
        setTimeout,
        clearTimeout,
      });
    },
  };
  return { page, log };
}

describe('the GM page rendering check', () => {
  it('leaves a rendering page alone', async () => {
    const { page, log } = fakePage({ background: false });
    assert.equal(await ensurePageRendering(page), false);
    assert.deepStrictEqual(log, ['frame']);
  });

  it('brings a page that renders no frame to the front, then proves it renders', async () => {
    const { page, log } = fakePage({ background: true });
    assert.equal(await ensurePageRendering(page), true);
    assert.deepStrictEqual(log, ['frame', 'bringToFront', 'frame']);
  });

  it('fails a page that renders nothing even in front', async () => {
    const { page } = fakePage({ background: true, rendersAfterFront: false });
    await assert.rejects(() => ensurePageRendering(page, { timeout: 20 }), /rendered no frame/);
  });
});
