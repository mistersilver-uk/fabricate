/**
 * The tolerance that decides whether a documentation frame changed, held to both directions.
 *
 * `scripts/docs-screenshots.mjs` rewrites a committed image only when the view actually moved, and
 * the View Lab renderer is not byte-deterministic, so "moved" is a perceptual judgement with a
 * measured threshold behind it. A threshold nobody exercises is a number, and a number drifts. So
 * this asserts the only two things that make it a tolerance rather than a blindfold: the
 * renderer's own noise counts as unchanged, and the smallest change a reader would care about
 * counts as changed.
 *
 * WHY THE FIXTURES ARE PPM
 * ------------------------
 * `dwebp -ppm` writes binary P6, and that is what production parses. Committing the fixtures in
 * that same format means these assertions run under `npm test` on a machine with no libwebp
 * installed — CI has none — while still exercising the real parser and the real comparison. The
 * only thing not covered without the tools present is the `dwebp` invocation itself, and the last
 * test here closes that on a machine that has them.
 *
 * WHERE THE FIXTURES CAME FROM
 * ----------------------------
 * Both pairs are crops of real decoded frames, taken after encoding, because that is the state
 * production compares in: `cwebp -near_lossless 60` on both sides, then `dwebp -ppm` on both.
 * Cropping before measuring would be wrong; cropping the decoded rasters is not, and each crop
 * below contains the whole of the difference it stands for.
 *
 * - `renderer-noise-*.ppm` is a 111x49 crop of `player-inventory-bulk-mixed`, from two clean full
 *   renders of the same forty-six cases. It is the WORST renderer noise found across four full
 *   runs — 2116 differing pixels, more than any other frame pair produced — and the crop carries
 *   all 2116 of them.
 * - `one-character-*.ppm` is a 19x23 crop of `player-crafting-routed-by-check`, rendered before
 *   and after changing one character of one recipe name in the View Lab world fixture
 *   (`Runeblade` to `Runedlade`, a substitution between two letters of equal advance width so that
 *   nothing reflows). That name is on screen three times in that frame; this is the SMALLEST of
 *   the three changed glyphs, so the assertion is made against the weakest real signal rather than
 *   the most convenient one.
 *
 * WHAT THE MEASUREMENT SAID
 * -------------------------
 * Across four full renders of the forty-six mapped cases — six pairings, 276 frame comparisons —
 * nineteen frame pairs differed at all, and the largest per-channel difference any of them reached
 * was 16 levels, on three pixels. Not one noise pixel anywhere reached 24 levels. The smallest
 * single changed character puts 47 pixels past 24 levels, reaching 60. The threshold is 8 pixels
 * at 24 levels, so noise sits 8 pixels below it and the smallest real signal sits at nearly six
 * times it. The populations do not overlap, in count or in amplitude.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { listLabAssets, readDocsScreenshotMap } from '../scripts/lib/docsScreenshotMap.js';
import { resolveExecutable } from '../scripts/lib/resolveExecutable.js';
import {
  DECODER,
  FrameDecodeError,
  RENDER_NOISE,
  comparePortablePixmaps,
  decodeFrame,
  measureRasterDifference,
  parsePortablePixmap,
  serializePortablePixmap,
} from '../scripts/lib/webpFrames.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests/fixtures/docs-screenshots');

/** One committed fixture pair, read. */
function pair(name) {
  return [
    readFileSync(join(fixtures, `${name}-left.ppm`)),
    readFileSync(join(fixtures, `${name}-right.ppm`)),
  ];
}

const noise = pair('renderer-noise');
const oneCharacter = pair('one-character');

test('the fixtures are alive, so neither direction below can pass vacuously', () => {
  for (const [name, [left, right]] of [
    ['renderer-noise', noise],
    ['one-character', oneCharacter],
  ]) {
    assert.ok(
      !left.equals(right),
      `the ${name} fixtures are byte-identical, so they demonstrate nothing about the tolerance`
    );
    const measurement = measureRasterDifference(
      parsePortablePixmap(left),
      parsePortablePixmap(right)
    );
    assert.ok(measurement.sameDimensions, `the ${name} fixtures are not the same size`);
    assert.ok(
      measurement.differingPixels > 0,
      `the ${name} fixtures decode to identical pixels despite differing bytes`
    );
  }
});

test("the renderer's own noise counts as unchanged", () => {
  const { changed, measurement } = comparePortablePixmaps(...noise);
  assert.equal(
    changed,
    false,
    `the worst renderer noise measured across four full runs — ${measurement.differingPixels}` +
      ` differing pixels reaching ${measurement.maxChannelDelta} levels — was judged a view` +
      ' change. Every run would then rewrite a tenth of the documentation set forever.'
  );
  assert.equal(
    measurement.differingPixels,
    2116,
    'this fixture pair no longer carries the whole of the noise it was cropped to hold'
  );
  assert.ok(
    measurement.significantPixels <= RENDER_NOISE.pixels,
    `noise put ${measurement.significantPixels} pixel(s) past ${RENDER_NOISE.channelDelta} levels,` +
      ` which the tolerance allows only ${RENDER_NOISE.pixels} of`
  );
});

test('a single changed character of on-screen text counts as changed', () => {
  const { changed, measurement } = comparePortablePixmaps(...oneCharacter);
  assert.equal(
    changed,
    true,
    `one changed character moved ${measurement.significantPixels} pixel(s) past` +
      ` ${RENDER_NOISE.channelDelta} levels and was still judged unchanged. A tolerance that` +
      ' cannot see that is a blindfold, and the documentation would go stale silently.'
  );
  assert.ok(
    measurement.significantPixels > RENDER_NOISE.pixels,
    'the signal must exceed the threshold by the recorded margin, not merely reach it'
  );
});

test('the threshold sits strictly between the two measured populations', () => {
  const quiet = comparePortablePixmaps(...noise).measurement;
  const loud = comparePortablePixmaps(...oneCharacter).measurement;
  assert.ok(
    quiet.maxChannelDelta < RENDER_NOISE.channelDelta,
    `noise reaches ${quiet.maxChannelDelta} levels, at or past the ${RENDER_NOISE.channelDelta}` +
      ' the tolerance calls significant, so amplitude alone no longer separates them'
  );
  assert.ok(
    quiet.significantPixels < RENDER_NOISE.pixels && RENDER_NOISE.pixels < loud.significantPixels,
    `the threshold of ${RENDER_NOISE.pixels} pixel(s) must sit strictly between noise at` +
      ` ${quiet.significantPixels} and one changed character at ${loud.significantPixels}. Once` +
      ' the two meet, this tolerance cannot discriminate and must be re-measured rather than moved.'
  );
});

test('a frame that changed size is changed, whatever its pixels say', () => {
  const left = parsePortablePixmap(noise[0]);
  const shorter = serializePortablePixmap({
    width: left.width,
    height: left.height - 1,
    pixels: left.pixels.subarray(0, left.width * (left.height - 1) * 3),
  });
  assert.equal(comparePortablePixmaps(noise[0], shorter).changed, true);
});

test('a raster that is not what dwebp writes is refused rather than misread', () => {
  const valid = parsePortablePixmap(noise[0]);
  const cases = [
    ['P5\n4 4\n255\nxxxx', 'a greyscale PGM'],
    ['P6\n4 4\n65535\n', 'sixteen bits per channel'],
    ['P6\n4 4\n255\nshort', 'a truncated pixel run'],
    ['PNG\r\n', 'a PNG'],
  ];
  for (const [bytes, description] of cases) {
    assert.throws(
      () => parsePortablePixmap(Buffer.from(bytes, 'latin1')),
      FrameDecodeError,
      `${description} was accepted; every pixel would then be compared at the wrong offset and the` +
        ' frame would be reported as a view change'
    );
  }
  assert.equal(parsePortablePixmap(serializePortablePixmap(valid)).width, valid.width);
});

test(
  'the parser reads what the real decoder actually emits',
  { skip: !resolveExecutable(DECODER) },
  async () => {
    const map = await readDocsScreenshotMap(root);
    const committed = await listLabAssets(root);
    assert.ok(committed.length > 0, 'no committed frame to decode, so this proves nothing');
    const asset = join(root, 'docs/img/screenshots/lab', committed[0]);
    const raster = parsePortablePixmap(decodeFrame(resolveExecutable(DECODER), asset));
    assert.ok(raster.width > 0 && raster.height > 0, `${committed[0]} decoded to an empty raster`);
    assert.ok(map.screenshots.length > 0, 'the map names no cases, so the frame above is unowned');
    assert.equal(
      comparePortablePixmaps(
        decodeFrame(resolveExecutable(DECODER), asset),
        decodeFrame(resolveExecutable(DECODER), asset)
      ).changed,
      false,
      'a committed frame compared against itself was reported as changed'
    );
  }
);
