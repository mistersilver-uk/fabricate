/**
 * The bridge closure a mounted manifest declares: `foundryBridge.js` re-exports eight siblings, so
 * naming the barrel alone under-declares and hangs the suite (issue 1668). Pinned against the real
 * barrel by `tests/util/foundry-bridge-barrel.test.js`.
 */
export const FOUNDRY_BRIDGE_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/foundryDialogs.js',
  'src/ui/svelte/util/foundryDocuments.js',
  'src/ui/svelte/util/foundryDragData.js',
  'src/ui/svelte/util/foundryEnrich.js',
  'src/ui/svelte/util/foundryHooks.js',
  'src/ui/svelte/util/foundryLocalize.js',
  'src/ui/svelte/util/foundryNotify.js',
  'src/ui/svelte/util/foundryUser.js',
]);

/** `util/localizeOr.js` and the two `src/utils/` leaves it binds; it reaches the bridge as well. */
export const LOCALIZE_OR_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/localizeOr.js',
  'src/utils/fillPlaceholders.js',
  'src/utils/localizeWithFallback.js',
]);
