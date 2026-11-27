/** Non-security id mints that work on an insecure origin and never use `Math.random` (S2245). */
const BASE36_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `length` base-36 characters; `getRandomValues` is called on `crypto` so it stays bound. */
export function randomBase36(length) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => BASE36_ALPHABET[byte % BASE36_ALPHABET.length]).join('');
}

/** Foundry's `randomID()` wherever it is loaded, else 16 base-36 characters. */
export function randomId() {
  const foundryMint = globalThis.foundry?.utils?.randomID;
  return typeof foundryMint === 'function' ? globalThis.foundry.utils.randomID() : randomBase36(16);
}
