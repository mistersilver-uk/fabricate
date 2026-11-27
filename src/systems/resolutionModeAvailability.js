/**
 * The resolution modes the normalizer accepts and every mode write accepts (`resolution-modes`
 * § Iterative Mode Availability), with the legacy aliases and the two refusals.
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

/** The mode a token names through its legacy alias, else the token itself. */
export function resolveResolutionModeAlias(token) {
  return Object.hasOwn(RESOLUTION_MODE_ALIASES, token) ? RESOLUTION_MODE_ALIASES[token] : token;
}

/** `'resolutionModeUnknown'` for a token that is neither a mode nor a legacy alias, else `null`. */
export function modeChangeRefusal(token) {
  return RESOLUTION_MODES.includes(resolveResolutionModeAlias(token))
    ? null
    : 'resolutionModeUnknown';
}

const ITERATIVE_VERSION_UNSUPPORTED =
  "This export's iterative settings were made by a newer version of Fabricate.";

/**
 * The `Error` an import of `system` refuses with, carrying its `reason`, or `null`: only an
 * `iterative` block newer than this build refuses. An unknown mode token still imports,
 * normalizing to `simple`.
 */
export function importModeRefusal(system) {
  if (!iterativeLibraryVersionUnsupported(system?.iterative)) return null;
  return Object.assign(new Error(ITERATIVE_VERSION_UNSUPPORTED), {
    reason: 'iterativeVersionUnsupported',
  });
}
