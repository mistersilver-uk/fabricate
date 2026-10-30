/**
 * The published `Medallion`'s art ladder and `Avatar`'s portrait ladder and `icon` (issue 2813) on
 * Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table,
 * into a companion target under no Fabricate ancestor: each rung's edge, corner and glyph size, the
 * glyph that replaces the initials, and an `update` that moves or removes each.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-art-tile-sizes-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** Each Medallion rung with its corner and the glyph size the ladder documents for it. */
const MEDALLION_RUNGS = [
  [22, 6, 10],
  [24, 6, 10],
  [26, 7, 11],
  [28, 7, 11],
  [30, 7, 12],
  [32, 7, 13],
  [34, 9, 14],
  [36, 9, 14],
  [38, 9, 15],
  [44, 11, 18],
];

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The corner, in px, a tile's authored classes select: 9 where it carries no corner class. */
const cornerOf = (tile) => {
  const named = classesOf(tile).find((name) => name.startsWith('is-corner-'));
  return named ? Number(named.slice('is-corner-'.length)) : 9;
};

function mountMedallion(props) {
  const target = companionTarget(targets);
  const handle = ui().mount('Medallion', { target, props });
  return { handle, tile: () => target.querySelector('.fab-medallion') };
}

describe("the published Medallion's art ladder", () => {
  for (const [size, corner, glyph] of MEDALLION_RUNGS) {
    it(`draws ${size}px at corner ${corner} and the passed glyph size ${glyph}`, async () => {
      const { handle, tile } = mountMedallion({ size, glyph });
      await settle();
      const style = tile().getAttribute('style').replaceAll(/\s+/g, '');
      assert.ok(style.includes(`width:${size}px;height:${size}px`), 'the tile is its rung square');
      assert.ok(
        style.includes(`--fab-medallion-glyph:${glyph}px`),
        'the glyph size is the passed one'
      );
      assert.equal(cornerOf(tile()), corner);
      handle.destroy();
    });
  }

  it('draws a size off the ladder at its edge with the corner 9 and reports nothing', async () => {
    const { handle, tile } = mountMedallion({ size: 25 });
    await settle();
    assert.ok(styleOf(tile()).includes('width:25px;height:25px'), 'the edge is the passed size');
    assert.equal(cornerOf(tile()), 9);
    handle.destroy();
  });

  it('moves the box, the corner and the glyph on an update from one rung to another', async () => {
    const { handle, tile } = mountMedallion({ size: 22, glyph: 10 });
    await settle();
    assert.equal(cornerOf(tile()), 6);
    assert.equal(handle.update({ size: 44, glyph: 18 }), true);
    await settle();
    const style = tile().getAttribute('style').replaceAll(/\s+/g, '');
    assert.ok(style.includes('width:44px;height:44px'));
    assert.ok(style.includes('--fab-medallion-glyph:18px'));
    assert.equal(cornerOf(tile()), 11);
    handle.destroy();
  });
});

/** Each Avatar portrait rung with the glyph size its `icon` is drawn at. */
const AVATAR_RUNGS = [
  [26, 10],
  [28, 11],
  [30, 12],
  [32, 13],
];

function mountAvatar(props) {
  const target = companionTarget(targets);
  const handle = ui().mount('Avatar', { target, props });
  return {
    handle,
    tile: () => target.querySelector('.fab-avatar'),
    glyph: () => target.querySelector(':scope .fab-avatar > i'),
    initials: () => target.querySelector('.fab-avatar-initials'),
  };
}

const styleOf = (node) => node.getAttribute('style').replaceAll(/\s+/g, '');

describe("the published Avatar's portrait ladder and icon", () => {
  for (const [size, glyph] of AVATAR_RUNGS) {
    it(`draws ${size}px with the icon at ${glyph}px in place of the initials`, async () => {
      const {
        handle,
        tile,
        glyph: icon,
        initials,
      } = mountAvatar({
        name: 'Mira Voss',
        size,
        icon: 'fa-solid fa-user',
      });
      await settle();
      assert.ok(styleOf(tile()).includes(`width:${size}px;height:${size}px`), 'the box');
      assert.ok(styleOf(tile()).includes(`--fab-avatar-glyph:${glyph}px`), 'the glyph size');
      assert.deepEqual(classesOf(icon()), ['fa-solid', 'fa-user']);
      assert.equal(initials(), null, 'the initials are not drawn');
      assert.equal(tile().dataset.avatar, 'glyph');
      handle.destroy();
    });
  }

  it('draws the initials without an icon, and an update adds and removes the glyph', async () => {
    const { handle, tile, glyph, initials } = mountAvatar({ name: 'Mira Voss', size: 30 });
    await settle();
    assert.equal(initials().textContent, 'MV');
    assert.equal(glyph(), null);
    assert.equal(handle.update({ name: 'Mira Voss', size: 30, icon: 'fa-solid fa-user' }), true);
    await settle();
    assert.ok(glyph());
    assert.equal(initials(), null);
    assert.equal(handle.update({ name: 'Mira Voss', size: 30 }), true);
    await settle();
    assert.equal(glyph(), null, 'removing the key restores the initials');
    assert.equal(initials().textContent, 'MV');
    assert.equal(tile().dataset.avatar, 'initials');
    handle.destroy();
  });

  it('keeps the image over the icon when art is set', async () => {
    const { handle, tile, glyph } = mountAvatar({
      name: 'Mira Voss',
      art: 'icons/svg/mystery-man.svg',
      alt: '',
      icon: 'fa-solid fa-user',
    });
    await settle();
    assert.equal(tile().dataset.avatar, 'image');
    assert.equal(glyph(), null);
    handle.destroy();
  });
});
