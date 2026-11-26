/** The one non-security id mint (issue 3032): Foundry's `randomID` first, else base-36. */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { randomBase36, randomId } from '../src/utils/randomId.js';

import { withInsecureOriginCrypto } from './helpers/insecureOriginCrypto.js';

const BASE36_ID = /^[a-z0-9]{16}$/;

describe('randomId', () => {
  const originalFoundry = globalThis.foundry;
  afterEach(() => {
    Object.assign(globalThis, { foundry: originalFoundry });
  });

  it("takes Foundry's id wherever Foundry is loaded, also on an insecure origin", async () => {
    Object.assign(globalThis, { foundry: { utils: { randomID: () => 'FoundryMint01234' } } });
    assert.equal(randomId(), 'FoundryMint01234');
    await withInsecureOriginCrypto(() => assert.equal(randomId(), 'FoundryMint01234'));
  });

  it('mints 16 base-36 characters without Foundry on an insecure origin', async () => {
    Object.assign(globalThis, { foundry: undefined });
    await withInsecureOriginCrypto(() => {
      const first = randomId();
      const second = randomId();
      assert.match(first, BASE36_ID);
      assert.match(second, BASE36_ID);
      assert.notEqual(first, second);
    });
  });

  it('draws the fallback from exactly the 36 lowercase alphanumerics', () => {
    Object.assign(globalThis, { foundry: undefined });
    const drawn = Array.from({ length: 200 }, () => randomId()).join('');
    assert.equal(new Set(drawn).size, 36, 'every one of the 36 characters, and nothing else');
    assert.match(drawn, /^[a-z0-9]+$/);
  });
});

describe('randomBase36', () => {
  it('returns the asked length', () => {
    for (const length of [0, 1, 5, 16, 64]) assert.equal(randomBase36(length).length, length);
  });

  it('never draws from Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random was read');
    };
    try {
      assert.equal(randomBase36(16).length, 16);
    } finally {
      Math.random = original;
    }
  });
});
