/** A throwing `globalThis` trap proving a module reads no Foundry runtime global (issue 1704). */

const TRAPPED_GLOBALS = Object.freeze([
  'game',
  'canvas',
  'ui',
  'Hooks',
  'CONFIG',
  'PIXI',
  'window',
  'fromUuidSync',
]);

export function armFoundryGlobalTrap(moduleName) {
  const descriptors = new Map();
  for (const key of TRAPPED_GLOBALS) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        throw new Error(`${moduleName} read globalThis.${key}`);
      },
    });
  }
  return descriptors;
}

export function disarmFoundryGlobalTrap(descriptors) {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

/** Run `body` with every Foundry global trapped, restoring them whatever it does. */
export async function underFoundryGlobalTrap(moduleName, body) {
  const descriptors = armFoundryGlobalTrap(moduleName);
  try {
    return await body();
  } finally {
    disarmFoundryGlobalTrap(descriptors);
  }
}
