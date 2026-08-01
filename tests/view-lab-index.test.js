/**
 * The index page's pure logic.
 *
 * Lightweight on purpose: no filesystem, no browser, no capture run. What can go wrong here is a
 * mis-grouped frame or an unescaped label, and both still produce a page that LOOKS fine — so these
 * assert the shape rather than the styling.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  escapeHtml,
  groupFrames,
  renderIndexHtml,
  summarise,
} from '../scripts/lib/viewLabIndex.js';

const CASES = [
  {
    id: 'a-manager-recipes',
    label: 'Manager — Recipes',
    kinds: ['manager', 'recipes'],
    reaches: 'exact',
    smokeLabels: ['manager-recipes'],
  },
  {
    id: 'b-manager-tools',
    label: 'Manager — Tools',
    kinds: ['manager', 'tools'],
    reaches: 'window',
    smokeLabels: ['manager-tools'],
  },
  {
    id: 'c-player-crafting',
    label: 'Player — Crafting',
    kinds: ['player', 'crafting'],
    reaches: 'beyond',
    smokeLabels: [],
  },
];

const FRAMES = [
  { id: 'c-player-crafting', width: 1280, height: 860 },
  { id: 'a-manager-recipes', width: 1280, height: 820 },
  { id: 'b-manager-tools', width: 1280, height: 720 },
];

test('frames group by application then area, both sorted', () => {
  const sections = groupFrames(FRAMES, CASES);
  assert.deepEqual(
    sections.map((section) => section.app),
    ['manager', 'player']
  );
  assert.deepEqual(
    sections[0].areas.map((area) => area.area),
    ['recipes', 'tools']
  );
});

test('a frame with no registry entry is surfaced, not dropped', () => {
  // A PNG on disk the registry cannot explain is precisely what someone needs to see. Dropping it
  // would make the index quietly disagree with the directory it describes.
  const sections = groupFrames([{ id: 'mystery-frame' }], CASES);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].app, 'unknown');
  assert.equal(sections[0].areas[0].frames[0].note, 'not in the case registry');
});

test('each frame carries the file name the page links to', () => {
  const [section] = groupFrames([FRAMES[1]], CASES);
  assert.equal(section.areas[0].frames[0].file, 'a-manager-recipes.png');
});

test('the summary counts every reach and flags unrecognised frames', () => {
  const counts = summarise([...FRAMES, { id: 'mystery-frame' }], CASES);
  assert.deepEqual(counts, { total: 4, exact: 1, window: 1, beyond: 1, unknown: 1 });
});

test('labels are escaped', () => {
  // The registry really does contain "Tags & Categories". Unescaped, that is invalid markup in a
  // page nobody validates.
  assert.equal(escapeHtml('Tags & Categories'), 'Tags &amp; Categories');
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');

  const html = renderIndexHtml({
    sections: groupFrames(
      [{ id: 'x' }],
      [{ id: 'x', label: 'A & B', kinds: ['manager', 'tags'], reaches: 'exact', smokeLabels: [] }]
    ),
    counts: summarise([{ id: 'x' }], []),
  });
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('A & B'));
});

test('the rendered page is self-contained and references every frame', () => {
  // Self-contained matters: the point of the page is that it opens from `file://` with no server.
  const html = renderIndexHtml({
    sections: groupFrames(FRAMES, CASES),
    counts: summarise(FRAMES, CASES),
    foundryVersion: '13.351',
  });

  assert.match(html, /^<!doctype html>/);
  assert.ok(!/<script/i.test(html), 'no scripts');
  assert.ok(!/https?:\/\//.test(html), 'no external references');
  for (const frame of FRAMES) assert.ok(html.includes(`${frame.id}.png`), `${frame.id} is linked`);
  assert.ok(html.includes('Foundry 13.351 chrome'));
});

test('an unrecorded chrome version says so rather than omitting the line', () => {
  const html = renderIndexHtml({ sections: [], counts: summarise([], []) });
  assert.ok(html.includes('chrome version unrecorded'));
});
