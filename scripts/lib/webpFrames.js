/**
 * Encode, decode, and compare the frames the documentation site publishes.
 *
 * The View Lab renders a PNG; the documentation site carries a WebP; and the generator has to
 * answer one question about the pair — has this view actually changed since the committed image
 * was made? Everything that answers it lives here, because the answer depends on the encoder
 * settings being identical on both sides, and that guarantee only holds while one module owns
 * them.
 *
 * WHY THE COMPARISON IS PERCEPTUAL RATHER THAN BYTE-EQUAL
 * ------------------------------------------------------
 * The renderer is not byte-deterministic. Repeated clean renders of the same case set differ in a
 * handful of frames, and the differing set MOVES between runs rather than settling, so the
 * instability is per-run timing and not a property of any case. The magnitude is antialiasing
 * jitter on the edge of a control: a few pixels of a million, no channel far from its neighbour.
 * Byte equality would therefore report roughly a tenth of the set as changed on every run forever
 * — the unreviewable churn this generator exists to prevent, wearing the costume of the gate meant
 * to prevent it. So "changed" is a measured perceptual judgement, and {@link RENDER_NOISE} carries
 * the measurements it was derived from.
 *
 * WHY BOTH SIDES ARE WEBP
 * -----------------------
 * Encoding is deterministic even though rendering is not, and `-near_lossless 60` preprocesses and
 * then encodes losslessly, so one PNG always yields one WebP byte sequence. Re-encoding the fresh
 * render with {@link ENCODER_SETTINGS} and comparing WebP against WebP therefore puts both sides
 * under identical encoder treatment, and the fast path is a buffer comparison most frames pass.
 * Comparing a fresh PNG against the committed WebP would instead fold the encoder's own
 * preprocessing into every measurement and swamp any tolerance narrow enough to be useful.
 *
 * WHY PPM
 * -------
 * Only a mismatch decodes, and it decodes with `dwebp -ppm`, whose output is the simplest raster
 * format there is: `P6\n<width> <height>\n255\n` and three bytes per pixel. That is a short parser
 * and no image-decoding dependency, in a repository that ships no runtime dependencies at all. The
 * test fixtures are PPM for the same reason — they are exactly what `dwebp` emits, so committed
 * fixtures exercise the real parser and the real comparison under `npm test` on a machine with no
 * libwebp installed at all.
 */
import { spawnSync } from 'node:child_process';

/**
 * The encoder the committed assets were produced with.
 *
 * Measured rather than assumed, on a representative 1280x860 frame. Against a 191958-byte source
 * PNG: `-lossless` gives 162794 bytes, a 15% saving that does not pay for the conversion; `-q 95`
 * gives 104454 bytes at 36.74 dB, which is what the quality ladder collapses to on UI text; and
 * `-near_lossless 60` gives 115468 bytes at 57.89 dB. Near-lossless is barely heavier than the
 * lossy setting and visually intact, so it wins on both counts.
 */
export const ENCODER = 'cwebp';

/**
 * The settings every encode uses, on both sides of every comparison.
 *
 * Shared rather than restated at each call site because the comparison's whole premise is that the
 * fresh encode and the committed encode were produced identically. Two copies of this list would
 * make that premise a coincidence.
 *
 * @see ENCODER
 */
export const ENCODER_SETTINGS = Object.freeze(['-near_lossless', '60', '-quiet']);

/** The decoder the perceptual path needs. Fails closed alongside {@link ENCODER}. */
export const DECODER = 'dwebp';

/**
 * The renderer's own noise, measured, and the tolerance derived from it.
 *
 * `channelDelta` is the per-channel amplitude at which a pixel counts as meaningfully different
 * rather than as jitter; `pixels` is how many such pixels a frame may carry before it counts as
 * changed. A frame differs when either its dimensions moved or its significant-pixel count exceeds
 * `pixels`.
 *
 * The two populations these numbers sit between are recorded in `CONTRIBUTING.md`, and
 * `tests/docs-screenshot-frames.test.js` asserts both directions from committed fixtures. Do not
 * widen either number without repeating that measurement: a tolerance that cannot distinguish
 * renderer jitter from a changed character of on-screen text is not a tolerance, it is a blindfold.
 */
export const RENDER_NOISE = Object.freeze({
  channelDelta: 24,
  pixels: 8,
});

/** The raster `dwebp -ppm` writes: binary P6, three channels, 8 bits each. */
const PPM_HEADER = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/;

/** How far into a buffer the header can possibly reach, for three decimal fields. */
const PPM_HEADER_SEARCH_BYTES = 64;

/** Bytes per pixel in a P6 raster. */
const CHANNELS = 3;

/** Thrown when a buffer is not the raster this module knows how to read. */
export class FrameDecodeError extends Error {}

/**
 * Parse the binary PPM `dwebp -ppm` emits.
 *
 * Strict on purpose. A lenient parser that shrugged at an unexpected header would hand the
 * comparison a mis-framed pixel buffer, and then every subsequent pixel differs — reporting "this
 * view changed" for what is really "this file was not what I thought it was".
 *
 * @param {Buffer} buffer Raw PPM bytes.
 * @returns {{width: number, height: number, pixels: Buffer}} The decoded raster.
 */
export function parsePortablePixmap(buffer) {
  const header = PPM_HEADER.exec(buffer.subarray(0, PPM_HEADER_SEARCH_BYTES).toString('latin1'));
  if (!header) {
    throw new FrameDecodeError(
      'expected a binary PPM (P6) raster, which is what `dwebp -ppm` writes, but this buffer does' +
        ' not begin with one'
    );
  }
  const [matched, rawWidth, rawHeight, rawMaximum] = header;
  if (rawMaximum !== '255') {
    throw new FrameDecodeError(
      `expected 8 bits per channel (maximum value 255) but this raster declares ${rawMaximum}`
    );
  }
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  const pixels = buffer.subarray(matched.length);
  const expected = width * height * CHANNELS;
  if (pixels.length !== expected) {
    throw new FrameDecodeError(
      `a ${width}x${height} RGB raster needs ${expected} bytes of pixel data but ${pixels.length}` +
        ' are present'
    );
  }
  return { width, height, pixels };
}

/**
 * Serialise a raster back to binary PPM.
 *
 * Present so the committed fixtures are produced by the same code that reads them, rather than by
 * a one-off script whose idea of the format nothing checks.
 *
 * @param {{width: number, height: number, pixels: Buffer}} raster The raster to write.
 * @returns {Buffer} PPM bytes.
 */
export function serializePortablePixmap(raster) {
  const header = Buffer.from(`P6\n${raster.width} ${raster.height}\n255\n`, 'latin1');
  return Buffer.concat([header, raster.pixels]);
}

/**
 * Measure how far two rasters are apart.
 *
 * Reports both populations rather than one verdict, because the interesting question while
 * calibrating is the SHAPE of a difference: a scatter of pixels a level or two apart is jitter, and
 * a cluster of pixels a hundred levels apart is a glyph.
 *
 * @param {{width: number, height: number, pixels: Buffer}} left One raster.
 * @param {{width: number, height: number, pixels: Buffer}} right The other raster.
 * @returns {{sameDimensions: boolean, pixels: number, differingPixels: number,
 *   significantPixels: number, maxChannelDelta: number}} The measurement.
 */
export function measureRasterDifference(left, right) {
  if (left.width !== right.width || left.height !== right.height) {
    return {
      sameDimensions: false,
      pixels: 0,
      differingPixels: 0,
      significantPixels: 0,
      maxChannelDelta: 255,
    };
  }

  let differingPixels = 0;
  let significantPixels = 0;
  let maxChannelDelta = 0;
  for (let offset = 0; offset < left.pixels.length; offset += CHANNELS) {
    const delta = Math.max(
      Math.abs(left.pixels[offset] - right.pixels[offset]),
      Math.abs(left.pixels[offset + 1] - right.pixels[offset + 1]),
      Math.abs(left.pixels[offset + 2] - right.pixels[offset + 2])
    );
    if (delta === 0) continue;
    differingPixels += 1;
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    if (delta >= RENDER_NOISE.channelDelta) significantPixels += 1;
  }

  return {
    sameDimensions: true,
    pixels: left.width * left.height,
    differingPixels,
    significantPixels,
    maxChannelDelta,
  };
}

/**
 * Turn a measurement into the generator's verdict, with the sentence it should print.
 *
 * @param {ReturnType<typeof measureRasterDifference>} measurement The measurement.
 * @returns {{changed: boolean, reason: string}} The verdict and why.
 */
export function classifyRasterDifference(measurement) {
  if (!measurement.sameDimensions) return { changed: true, reason: 'the frame changed size' };
  if (measurement.significantPixels > RENDER_NOISE.pixels) {
    return {
      changed: true,
      reason:
        `${measurement.significantPixels} pixel(s) differ by ${RENDER_NOISE.channelDelta} levels` +
        ` or more, up to ${measurement.maxChannelDelta}, past the ${RENDER_NOISE.pixels} this` +
        " renderer's own noise reaches",
    };
  }
  if (measurement.differingPixels === 0) return { changed: false, reason: 'identical' };
  return {
    changed: false,
    reason:
      `${measurement.differingPixels} pixel(s) differ by up to ${measurement.maxChannelDelta}` +
      " levels, within this renderer's own noise",
  };
}

/**
 * Compare two decoded frames.
 *
 * @param {Buffer} left One PPM raster.
 * @param {Buffer} right The other PPM raster.
 * @returns {{changed: boolean, reason: string,
 *   measurement: ReturnType<typeof measureRasterDifference>}} The verdict and its measurement.
 */
export function comparePortablePixmaps(left, right) {
  const measurement = measureRasterDifference(
    parsePortablePixmap(left),
    parsePortablePixmap(right)
  );
  return { ...classifyRasterDifference(measurement), measurement };
}

/**
 * Encode one source PNG to WebP with the settings the committed assets use.
 *
 * @param {string} encoder Absolute `cwebp` path.
 * @param {string} source Absolute source PNG path.
 * @param {string} target Absolute WebP path to write.
 * @returns {void}
 */
export function encodeFrame(encoder, source, target) {
  const result = spawnSync(encoder, [...ENCODER_SETTINGS, '-o', target, source], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new FrameDecodeError(`${ENCODER} failed on ${source} (exit ${result.status})`);
  }
}

/**
 * Decode a WebP to a raw PPM buffer.
 *
 * Decoded to stdout rather than through a temporary file: there is nothing to clean up afterwards,
 * and no chance of two comparisons choosing the same scratch name.
 *
 * @param {string} decoder Absolute `dwebp` path.
 * @param {string} source Absolute WebP path.
 * @returns {Buffer} PPM bytes.
 */
export function decodeFrame(decoder, source) {
  const result = spawnSync(decoder, ['-quiet', '-ppm', source, '-o', '-'], {
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new FrameDecodeError(
      `${DECODER} failed on ${source} (exit ${result.status}): ${String(result.stderr).trim()}`
    );
  }
  return result.stdout;
}

/**
 * Compare two committed-shaped WebP files, byte-equality first and pixels only on a mismatch.
 *
 * The fast path is the common one and it is exact: identical bytes cannot be a different view. The
 * slow path is what makes the answer perceptual, and it is only reached by the handful of frames
 * per run that the renderer's jitter actually moves.
 *
 * @param {string} decoder Absolute `dwebp` path.
 * @param {Buffer} left One WebP file's bytes.
 * @param {string} leftPath Where those bytes live, for the decoder.
 * @param {Buffer} right The other WebP file's bytes.
 * @param {string} rightPath Where those live.
 * @returns {{changed: boolean, reason: string,
 *   measurement: ReturnType<typeof measureRasterDifference>|null}} The verdict.
 */
export function compareEncodedFrames(decoder, left, leftPath, right, rightPath) {
  if (left.equals(right)) return { changed: false, reason: 'identical bytes', measurement: null };
  return comparePortablePixmaps(decodeFrame(decoder, leftPath), decodeFrame(decoder, rightPath));
}
