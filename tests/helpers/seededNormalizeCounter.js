/**
 * The seeded id counter the normalize delegates suites share. Importing this module has side
 * effects: it installs `foundry`, `game` and `ui` globals, so a suite imports it statically before
 * it dynamically imports `CraftingSystemManager`.
 */
let mintedIds = 0;
// ratchet-exempt(lint): the helper exists to install the globals the manager reads at import
Object.assign(globalThis, {
  foundry: { utils: { randomID: () => `rid-${String(++mintedIds).padStart(4, '0')}` } },
  game: { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null },
  ui: { notifications: { warn: () => {}, error: () => {} } },
});

/** Both sides of every comparison mint from the same seed, so ids cannot diverge spuriously. */
export function seeded(call) {
  mintedIds = 0;
  return call();
}
