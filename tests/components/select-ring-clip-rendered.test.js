/**
 * Issue 2893: a Select trigger's keyboard ring reaches 4px past it, so no clipping ancestor of a
 * trigger in the manager may leave less than that between the trigger and its own padding box.
 * Each subject of the manager-select fixture mounts a real manager surface; every trigger on it
 * is focused, as Tab would, and measured against each ancestor whose overflow clips, at the
 * manager's two widths. The arm that fails is named, so a toolbar that grows a row, or a scroll
 * box that drops its padding, fails here and not in a GM's window.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

/** How far the 2px ring, drawn 2px clear, reaches past the trigger. */
const RING_REACH = 4;
const WIDTHS = Object.freeze([1280, 720]);
const SUBJECTS = Object.freeze([
  'prerequisites',
  'currency',
  'import',
  'economy',
  'recipe-overview',
  'recipe-option',
  'environment-overview',
  'systems-browser',
  'access-tab',
  'books-scrolls',
  'environments-browser',
  'environments-settings',
  'environments-settings-1024',
  'environments-settings-1120',
  'gathering-tasks-browser',
  'gathering-events-browser',
  'recipes-browser',
  'components-browser',
  'components-browser-long-category',
  'essence-browser',
  'tools-browser',
  'recipe-inspector-1024',
  'recipe-inspector-1120',
  'tool-preview',
]);

const server = createViteFixtureServer({ styleMountPrefix: '/@manager-select-styles/' });

before(async () => {
  await server.start();
});

after(async () => {
  await server.stop();
});

const VISIBLE_TRIGGERS = '.fabricate-select-trigger';

/** The room each side of the focused trigger has inside every ancestor that clips that axis. */
function clippedArms(reach) {
  const trigger = document.activeElement;
  const box = trigger.getBoundingClientRect();
  const arms = [];
  for (let host = trigger.parentElement; host; host = host.parentElement) {
    const style = getComputedStyle(host);
    const clipsX = style.overflowX !== 'visible';
    const clipsY = style.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const edge = (side) => Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
    const hostBox = host.getBoundingClientRect();
    const room = {};
    if (clipsX) {
      room.left = box.left - (hostBox.left + edge('left'));
      room.right = hostBox.left + edge('left') + host.clientWidth - box.right;
    }
    if (clipsY) {
      room.top = box.top - (hostBox.top + edge('top'));
      room.bottom = hostBox.top + edge('top') + host.clientHeight - box.bottom;
    }
    for (const [side, space] of Object.entries(room)) {
      if (space < reach - 0.01) {
        arms.push(`${side} ${space.toFixed(1)}px inside ${host.className || host.tagName}`);
      }
    }
  }
  return { label: trigger.getAttribute('aria-label') ?? trigger.textContent.trim(), arms };
}

for (const width of WIDTHS) {
  describe(`the Select trigger ring at ${width}px`, () => {
    for (const subject of SUBJECTS) {
      it(`${subject}: no clipping ancestor cuts a trigger's ${RING_REACH}px reach`, async () => {
        const page = await server.newPage({ viewport: { width, height: 900 } });
        try {
          await page.goto(
            server.url(`/tests/fixtures/manager-select/index.html?subject=${subject}`),
            { waitUntil: 'load' }
          );
          await page.waitForFunction(() => globalThis.__managerSelectFixtureReady === true);
          const triggers = await page.locator(VISIBLE_TRIGGERS).count();
          assert.ok(triggers > 0, `${subject} mounts a trigger`);
          const cut = [];
          for (let index = 0; index < triggers; index += 1) {
            const trigger = page.locator(VISIBLE_TRIGGERS).nth(index);
            if (!(await trigger.isVisible())) continue;
            await trigger.focus();
            const { label, arms } = await page.evaluate(`(${clippedArms})(${RING_REACH})`);
            cut.push(...arms.map((arm) => `${label}: ${arm}`));
          }
          assert.deepEqual(cut, []);
        } finally {
          await page.close();
        }
      });
    }
  });
}
