/**
 * An insecure-origin `crypto` (issue 3032): `getRandomValues` stays, and any read of the
 * secure-context id API throws. Node 22's `globalThis.crypto` is a getter-only accessor, so the
 * swap redefines it and restores the saved descriptor; the stub calls the native method bound.
 */
export function installInsecureOriginCrypto() {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const real = globalThis.crypto;
  const stub = {
    getRandomValues: (array) => real.getRandomValues(array),
    get randomUUID() {
      throw new Error('randomUUID is absent on an insecure origin');
    },
  };
  Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true, writable: true });
  return () => Object.defineProperty(globalThis, 'crypto', saved);
}

/** Run `fn` under the swap, restoring the real `crypto` however it settles. */
export async function withInsecureOriginCrypto(fn) {
  const restore = installInsecureOriginCrypto();
  try {
    return await fn();
  } finally {
    restore();
  }
}
