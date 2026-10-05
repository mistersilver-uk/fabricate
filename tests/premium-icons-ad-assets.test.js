/**
 * The Premium advert's bundled icons (issue 2220): every `url()` the stylesheet takes from
 * `assets/premium/` names a real file, every file there is one the stylesheet uses, and each is the
 * 68px square that is about twice the 30px tile and too small to serve as Item art.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';

const repoRoot = resolve(import.meta.dirname, '..');
const PREMIUM_DIR = 'assets/premium';
const ICON_SIDE = 68;

const stylesheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
const referenced = [
  ...stylesheet.matchAll(/url\(["']?\.\.\/assets\/premium\/([^"')]+)["']?\)/g),
].map(([, file]) => file);
const bundled = readdirSync(resolve(repoRoot, PREMIUM_DIR)).sort(byCodePoint);
const FOURTEEN_BITS = 0x3f_ff;

/** A lossy (`VP8 `) or lossless (`VP8L`) WebP's pixel size, read from its first chunk. */
function webpSize(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'not a RIFF container');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', 'not a WebP');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & FOURTEEN_BITS,
      height: buffer.readUInt16LE(28) & FOURTEEN_BITS,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & FOURTEEN_BITS) + 1, height: ((bits >> 14) & FOURTEEN_BITS) + 1 };
  }
  throw new Error(`unread WebP chunk "${chunk}"`);
}

describe('the Premium advert icons', () => {
  it('are six, all referenced by the stylesheet and all present on disk', () => {
    assert.equal(referenced.length, 6, `the stylesheet references ${referenced.length} icons`);
    for (const file of referenced) {
      assert.ok(existsSync(resolve(repoRoot, PREMIUM_DIR, file)), `${file} is not bundled`);
    }
    assert.deepEqual(
      bundled,
      [...new Set(referenced)].sort(byCodePoint),
      'a bundled icon nothing draws'
    );
  });

  it(`are each ${ICON_SIDE}px square`, () => {
    for (const file of bundled) {
      const size = webpSize(readFileSync(resolve(repoRoot, PREMIUM_DIR, file)));
      assert.deepEqual(size, { width: ICON_SIDE, height: ICON_SIDE }, file);
    }
  });
});
