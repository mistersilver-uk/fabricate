/**
 * The bridge closure a mounted manifest declares: `foundryBridge.js` re-exports nine siblings, so
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
  'src/ui/svelte/util/foundryTooltip.js',
  'src/ui/svelte/util/foundryUser.js',
]);

/**
 * `util/localizeOr.js`, the tab count-mark builder that binds it, and the two `src/utils/` leaves
 * it binds; it reaches the bridge as well.
 */
export const LOCALIZE_OR_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/localizeOr.js',
  'src/ui/svelte/util/tabCountMark.js',
  'src/utils/fillPlaceholders.js',
  'src/utils/localizeWithFallback.js',
]);

/**
 * `util/appLocalizer.js` and the two `src/utils/` leaves a component that localizes its own copy
 * through `APP_LOCALIZER` binds; none reaches the bridge.
 */
export const APP_LOCALIZER_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/appLocalizer.js',
  'src/utils/fillPlaceholders.js',
  'src/utils/localizeWithFallback.js',
]);
