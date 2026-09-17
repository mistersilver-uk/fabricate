/** Encode, decode, and compare the frames the documentation site publishes. */
import { spawnSync } from 'node:child_process';

/** The encoder the committed assets were produced with. */
export const ENCODER = 'cwebp';

/** The settings every encode uses, on both sides of every comparison. */
export const ENCODER_SETTINGS = Object.freeze(['-near_lossless', '60', '-quiet']);

/** The decoder the perceptual path needs. Fails closed alongside {@link ENCODER}. */
export const DECODER = 'dwebp';

/** The renderer's own noise, measured, and the tolerance derived from it. */
export const RENDER_NOISE = Object.freeze({
  channelDelta: 24,
  pixels: 0,
  area: 0.05,
});

/** A fraction of a frame, as the reports write it. */
function asPercentage(share) {
  return `${(share * 100).toFixed(2)}%`;
}

/** The raster `dwebp -ppm` writes: binary P6, three channels, 8 bits each. */
const PPM_HEADER = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/;

/** How far into a buffer the header can possibly reach, for three decimal fields. */
const PPM_HEADER_SEARCH_BYTES = 64;

/** Bytes per pixel in a P6 raster. */
const CHANNELS = 3;

/** Thrown when a buffer is not the raster this module knows how to read. */
export class FrameDecodeError extends Error {}

/** Parse the binary PPM `dwebp -ppm` emits. */
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

/** Serialise a raster back to binary PPM. */
export function serializePortablePixmap(raster) {
  const header = Buffer.from(`P6\n${raster.width} ${raster.height}\n255\n`, 'latin1');
  return Buffer.concat([header, raster.pixels]);
}

/** Measure how far two rasters are apart. */
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

/** Turn a measurement into the generator's verdict, with the sentence it should print. */
export function classifyRasterDifference(measurement) {
  if (!measurement.sameDimensions) return { changed: true, reason: 'the frame changed size' };
  if (measurement.significantPixels > RENDER_NOISE.pixels) {
    return {
      changed: true,
      reason:
        `${measurement.significantPixels} pixel(s) differ by ${RENDER_NOISE.channelDelta} levels` +
        ` or more, up to ${measurement.maxChannelDelta}; measured renderer noise put no pixel` +
        ` past ${RENDER_NOISE.channelDelta} at all`,
    };
  }
  if (measurement.differingPixels === 0) return { changed: false, reason: 'identical' };

  const share = measurement.differingPixels / measurement.pixels;
  if (share > RENDER_NOISE.area) {
    return {
      changed: true,
      reason:
        `${measurement.differingPixels} pixel(s) differ, ${asPercentage(share)} of the frame,` +
        ` past the ${asPercentage(RENDER_NOISE.area)} this tolerance allows; the difference only` +
        ` reaches ${measurement.maxChannelDelta} levels, but the worst measured noise touched` +
        ' 0.19% of a frame, so one this broad is a view change however shallow it is',
    };
  }
  return {
    changed: false,
    reason:
      `${measurement.differingPixels} pixel(s) differ, ${asPercentage(share)} of the frame,` +
      ` ${measurement.significantPixels} of them by ${RENDER_NOISE.channelDelta} levels or more,` +
      ` up to ${measurement.maxChannelDelta} — inside both halves of the measured tolerance`,
  };
}

/** Compare two decoded frames. */
export function comparePortablePixmaps(left, right) {
  const measurement = measureRasterDifference(
    parsePortablePixmap(left),
    parsePortablePixmap(right)
  );
  return { ...classifyRasterDifference(measurement), measurement };
}

/** Encode one source PNG to WebP with the settings the committed assets use. */
export function encodeFrame(encoder, source, target) {
  const result = spawnSync(encoder, [...ENCODER_SETTINGS, '-o', target, source], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    throw new FrameDecodeError(`${ENCODER} failed on ${source} (exit ${result.status})`);
  }
}

/** Decode a WebP to a raw PPM buffer. */
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

/** Compare two committed-shaped WebP files, byte-equality first and pixels only on a mismatch. */
export function compareEncodedFrames(decoder, left, leftPath, right, rightPath) {
  if (left.equals(right)) return { changed: false, reason: 'identical bytes', measurement: null };
  return comparePortablePixmaps(decodeFrame(decoder, leftPath), decodeFrame(decoder, rightPath));
}
