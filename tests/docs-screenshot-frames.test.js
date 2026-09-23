/** The tolerance that decides whether a documentation frame changed, held to its own numbers. */
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
  classifyRasterDifference,
  comparePortablePixmaps,
  decodeFrame,
  measureRasterDifference,
  parsePortablePixmap,
  serializePortablePixmap,
} from '../scripts/lib/webpFrames.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(root, 'tests/fixtures/docs-screenshots');

/** Bytes per pixel in a P6 raster, which is what both fixtures and production are. */
const CHANNELS = 3;

/** The geometry both fixture pairs were cropped out of, and every mapped frame is rendered at. */
const FRAME = Object.freeze({ width: 1280, height: 860 });

/** How many pixels that is, which is the denominator of the area rule. */
const FRAME_PIXELS = FRAME.width * FRAME.height;

/** What the two committed pairs measure, pinned. */
const MEASURED = Object.freeze({
  noise: Object.freeze({ differingPixels: 2116, significantPixels: 0, maxChannelDelta: 16 }),
  oneCharacter: Object.freeze({ differingPixels: 91, significantPixels: 47, maxChannelDelta: 60 }),
});

/** One committed fixture pair, read. */
function pair(name) {
  return [
    readFileSync(join(fixtures, `${name}-left.ppm`)),
    readFileSync(join(fixtures, `${name}-right.ppm`)),
  ];
}

/**
 * A crop, padded back out to the geometry of the frame it was cut from.
 *
 * @param {Buffer} buffer A cropped PPM raster.
 * @returns {Buffer} The same crop inside a full-frame PPM raster.
 */
function restoredToFrame(buffer) {
  const crop = parsePortablePixmap(buffer);
  assert.ok(
    crop.width <= FRAME.width && crop.height <= FRAME.height,
    `a ${crop.width}x${crop.height} crop does not fit the frame it is supposed to have come from`
  );
  const pixels = Buffer.alloc(FRAME_PIXELS * CHANNELS);
  for (let row = 0; row < crop.height; row += 1) {
    crop.pixels.copy(
      pixels,
      row * FRAME.width * CHANNELS,
      row * crop.width * CHANNELS,
      (row + 1) * crop.width * CHANNELS
    );
  }
  return serializePortablePixmap({ width: FRAME.width, height: FRAME.height, pixels });
}

/**
 * The same raster with a band of rows lifted by a fixed amount on every channel.
 *
 * @param {Buffer} buffer A full-frame PPM raster.
 * @param {number} amount Levels to add, clamped at 255.
 * @param {number} [fromRow] First row to lift.
 * @param {number} [rowCount] How many rows, defaulting to the rest of the frame.
 * @returns {Buffer} The lifted raster.
 */
function lightened(buffer, amount, fromRow = 0, rowCount) {
  const raster = parsePortablePixmap(buffer);
  const pixels = Buffer.from(raster.pixels);
  const rows = rowCount ?? raster.height - fromRow;
  const start = fromRow * raster.width * CHANNELS;
  const end = start + rows * raster.width * CHANNELS;
  for (let offset = start; offset < end; offset += 1) {
    pixels[offset] = Math.min(255, pixels[offset] + amount);
  }
  return serializePortablePixmap({ width: raster.width, height: raster.height, pixels });
}

/** The three numbers {@link MEASURED} pins, out of a measurement. */
function pinned(measurement) {
  return {
    differingPixels: measurement.differingPixels,
    significantPixels: measurement.significantPixels,
    maxChannelDelta: measurement.maxChannelDelta,
  };
}

const noise = pair('renderer-noise').map((buffer) => restoredToFrame(buffer));
const oneCharacter = pair('one-character').map((buffer) => restoredToFrame(buffer));

/** A band of rows deep enough to sit just past the area rule: 52 of 860 is 6.05% of the frame. */
const BAND_ROWS = 52;

/** How far under the amplitude threshold the synthesized lifts sit. */
const LIFT_LEVELS = 10;

test('the fixtures are alive, so no direction below can pass vacuously', () => {
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
    assert.equal(
      measurement.pixels,
      FRAME_PIXELS,
      `the ${name} pair was not restored to the geometry of the frame it came from, so the area` +
        ' rule would be asked about a window rather than about a frame'
    );
    assert.ok(
      measurement.differingPixels > 0,
      `the ${name} fixtures decode to identical pixels despite differing bytes`
    );
  }
  assert.ok(
    LIFT_LEVELS < RENDER_NOISE.channelDelta,
    `the synthesized lift of ${LIFT_LEVELS} levels must stay under the ${RENDER_NOISE.channelDelta}` +
      ' the amplitude rule reacts to, or the area assertions below would be proving the wrong rule'
  );
});

test('both fixture pairs still measure what they were recorded as measuring', () => {
  assert.deepEqual(
    pinned(comparePortablePixmaps(...noise).measurement),
    MEASURED.noise,
    'the worst renderer noise measured across four full runs no longer measures what it did. Either' +
      ' the fixture pair was altered, or RENDER_NOISE.channelDelta moved and changed how many of' +
      ' its pixels count as significant. Re-measure before touching either.'
  );
  assert.deepEqual(
    pinned(comparePortablePixmaps(...oneCharacter).measurement),
    MEASURED.oneCharacter,
    'one changed character of on-screen text no longer measures what it did. Either the fixture' +
      ' pair was altered, or RENDER_NOISE.channelDelta moved: 47 pixels reach 24 levels, 44 reach' +
      ' 25 and 54 reach 20, so this count pins that constant to 21..24.'
  );
});

test("the renderer's own noise counts as unchanged", () => {
  const { changed, measurement, reason } = comparePortablePixmaps(...noise);
  assert.equal(
    changed,
    false,
    `the worst renderer noise measured across four full runs — ${measurement.differingPixels}` +
      ` differing pixels reaching ${measurement.maxChannelDelta} levels — was judged a view` +
      ` change (${reason}). Every run would then rewrite a tenth of the documentation set forever.`
  );
  assert.ok(
    RENDER_NOISE.pixels <= MEASURED.noise.significantPixels,
    `the pixel budget allows ${RENDER_NOISE.pixels} pixel(s) past ${RENDER_NOISE.channelDelta}` +
      ` levels, but measured noise produced ${MEASURED.noise.significantPixels}. Every level of` +
      ' margin this rule has is in amplitude, so a budget above the measurement buys only' +
      ' blindness: eight pixels flipped to pure white, or a two-by-three punctuation mark' +
      ' appearing, would pass unseen.'
  );
  assert.ok(
    RENDER_NOISE.area * FRAME_PIXELS >= MEASURED.noise.differingPixels * 20,
    `the area rule allows ${RENDER_NOISE.area * FRAME_PIXELS} differing pixel(s) per frame, which` +
      ` is less than twenty times the ${MEASURED.noise.differingPixels} the worst measured noise` +
      ' produced. Renderer jitter would start reading as a view change.'
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
  const share = measurement.differingPixels / measurement.pixels;
  assert.ok(
    share < RENDER_NOISE.area,
    `one changed character covers ${(share * 100).toFixed(3)}% of a frame, which the area rule` +
      ` now calls broad on its own (it allows ${(RENDER_NOISE.area * 100).toFixed(2)}%). This` +
      ' assertion would then be proving the area rule and nothing would be left proving the' +
      ' amplitude rule, which is the one that has to catch a moved glyph.'
  );
});

test('a shallow change across a whole frame counts as changed', () => {
  const lifted = lightened(noise[0], LIFT_LEVELS);
  const { changed, measurement, reason } = comparePortablePixmaps(noise[0], lifted);
  assert.equal(
    measurement.significantPixels,
    0,
    'the synthesized lift reached the amplitude threshold, so this proves nothing about area'
  );
  assert.equal(
    changed,
    true,
    `lifting every pixel of a frame by ${LIFT_LEVELS} levels — a Fabricate colour token changing` +
      ` across a panel — moved ${measurement.differingPixels} pixel(s) and was judged unchanged` +
      ` (${reason}). Amplitude alone cannot see a broad shallow change, which is exactly the class` +
      ' of change documentation exists to show.'
  );
});

test('the area rule is bracketed from above as well as below', () => {
  const banded = lightened(noise[0], LIFT_LEVELS, FRAME.height - BAND_ROWS, BAND_ROWS);
  const { changed, measurement } = comparePortablePixmaps(noise[0], banded);
  const share = measurement.differingPixels / measurement.pixels;
  assert.equal(
    measurement.differingPixels,
    BAND_ROWS * FRAME.width,
    'the band did not lift the rows it was supposed to lift, so its share of the frame is not what' +
      ' this assertion thinks it is'
  );
  assert.equal(
    changed,
    true,
    `a ${BAND_ROWS}-row band, ${(share * 100).toFixed(2)}% of the frame, lifted by ${LIFT_LEVELS}` +
      ` levels was judged unchanged. The area rule allows ${(RENDER_NOISE.area * 100).toFixed(2)}%,` +
      ' which is above the smallest broad change this tolerance undertakes to see. Widening it' +
      ' further has to be measured, not assumed.'
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
    quiet.significantPixels <= RENDER_NOISE.pixels && RENDER_NOISE.pixels < loud.significantPixels,
    `the budget of ${RENDER_NOISE.pixels} pixel(s) must sit at or above noise at` +
      ` ${quiet.significantPixels} and below one changed character at ${loud.significantPixels}.` +
      ' Once the two meet, this tolerance cannot discriminate and must be re-measured rather than' +
      ' moved.'
  );
});

test('a frame that changed size is changed, whatever its pixels say', () => {
  const left = parsePortablePixmap(noise[0]);
  const shorter = serializePortablePixmap({
    width: left.width,
    height: left.height - 1,
    pixels: left.pixels.subarray(0, left.width * (left.height - 1) * CHANNELS),
  });
  assert.equal(comparePortablePixmaps(noise[0], shorter).changed, true);
});

test('a measurement of nothing is not divided by nothing', () => {
  const { changed, reason } = classifyRasterDifference({
    sameDimensions: true,
    pixels: 0,
    differingPixels: 0,
    significantPixels: 0,
    maxChannelDelta: 0,
  });
  assert.equal(changed, false);
  assert.equal(reason, 'identical', 'an empty raster produced an area fraction of NaN');
});

test('a raster that is not what dwebp writes is refused rather than misread', () => {
  const valid = parsePortablePixmap(noise[0]);
  // Each body is the length its own header declares, so the guard being tested is the only one that
  // can fire.
  const sixteenBit = `P6\n4 4\n65535\n${'x'.repeat(4 * 4 * CHANNELS)}`;
  const cases = [
    [`P5\n4 4\n255\n${'x'.repeat(4 * 4 * CHANNELS)}`, 'a greyscale PGM'],
    [sixteenBit, 'sixteen bits per channel'],
    ['P6\n4 4\n255\nshort', 'a truncated pixel run'],
    ['PNG\r\n', 'a PNG'],
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
