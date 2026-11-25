/**
 * Which resolution modes the normalizer accepts and which a GM may select (`resolution-modes`
 * § Iterative Mode Availability). The admin store's mode change and the importer consult
 * `isResolutionModeSelectable`, and either may inject the selectable set.
 */
import { iterativeLibraryVersionUnsupported } from './normalize/iterativeLibrary.js';

export const RESOLUTION_MODES = Object.freeze([
  'simple',
  'routedByIngredients',
  'routedByCheck',
  'progressive',
  'alchemy',
  'iterative',
]);

/** Legacy tokens: `cauldron`, and the 1.9.0 migration's `mapped`, bare `routed` and `tiered`. */
export const RESOLUTION_MODE_ALIASES = Object.freeze({
  cauldron: 'alchemy',
  mapped: 'routedByIngredients',
  routed: 'routedByIngredients',
  tiered: 'routedByCheck',
});

export const SELECTABLE_RESOLUTION_MODES = Object.freeze(
  RESOLUTION_MODES.filter((mode) => mode !== 'iterative')
);

/** The mode a token names through its legacy alias, else the token itself. */
export function resolveResolutionModeAlias(token) {
  return Object.hasOwn(RESOLUTION_MODE_ALIASES, token) ? RESOLUTION_MODE_ALIASES[token] : token;
}

export function isResolutionModeSelectable(mode, selectable = SELECTABLE_RESOLUTION_MODES) {
  return selectable.includes(mode);
}

/**
 * Why a GM may not change to `token`, or `null`: `'resolutionModeUnavailable'` for a known mode
 * outside the selectable set, and `'resolutionModeUnknown'` for a token that is neither a mode
 * nor a legacy alias.
 */
export function modeChangeRefusal(token, selectable = SELECTABLE_RESOLUTION_MODES) {
  const mode = resolveResolutionModeAlias(token);
  if (!RESOLUTION_MODES.includes(mode)) return 'resolutionModeUnknown';
  return isResolutionModeSelectable(mode, selectable) ? null : 'resolutionModeUnavailable';
}

const IMPORT_REFUSAL_MESSAGES = Object.freeze({
  resolutionModeUnavailable:
    'This export uses the Iterative resolution mode, which this version of Fabricate cannot import yet.',
  iterativeVersionUnsupported:
    "This export's iterative settings were made by a newer version of Fabricate.",
});

/**
 * The `Error` an import of `system` refuses with, carrying its `reason`, or `null`. A known mode
 * outside the selectable set refuses, and so does an `iterative` block newer than this build.
 * An unknown token still imports, normalizing to `simple`.
 */
export function importModeRefusal(system, selectable = SELECTABLE_RESOLUTION_MODES) {
  const mode = resolveResolutionModeAlias(system?.resolutionMode);
  let reason = null;
  if (RESOLUTION_MODES.includes(mode) && !isResolutionModeSelectable(mode, selectable)) {
    reason = 'resolutionModeUnavailable';
  } else if (iterativeLibraryVersionUnsupported(system?.iterative)) {
    reason = 'iterativeVersionUnsupported';
  }
  return reason ? Object.assign(new Error(IMPORT_REFUSAL_MESSAGES[reason]), { reason }) : null;
}
