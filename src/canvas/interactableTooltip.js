/**
 * Pure decision for the interactable-tile hover tooltip text.
 *
 * Tiles have no nameplate, so an interactable tile shows its source name on hover
 * for discoverability. The "what name to show" is pure and lives here: it prefers
 * the display `name` carried in `flags.fabricate` (stamped at spawn), then falls
 * back to a name resolved from the synthetic `sourceUuid` (via the injected
 * `resolveName` seam). The rendering (activating the Foundry tooltip on the PIXI
 * element) is the thin Foundry edge in {@link InteractableManager}.
 */

import { readInteractableTileFlags } from './interactableTileFlags.js';

/**
 * Decide the tooltip text for a hovered tile, or `null` when there is nothing to
 * show (not an interactable tile, or no resolvable name).
 *
 * @param {object} tile  The tile document (carries `flags.fabricate`).
 * @param {object} [deps]
 * @param {(sourceUuid: string) => (string|null)} [deps.resolveName]  Resolve a
 *   display name from the synthetic `sourceUuid` (the live tool/task lookup),
 *   used only when the flag carries no `name`.
 * @returns {string|null}
 */
export function interactableTooltipText(tile, { resolveName } = {}) {
  const flags = readInteractableTileFlags(tile);
  if (!flags) return null;
  const name = typeof flags.name === 'string' ? flags.name.trim() : '';
  if (name) return name;
  if (typeof resolveName === 'function') {
    const resolved = resolveName(flags.sourceUuid);
    if (typeof resolved === 'string' && resolved.trim()) return resolved.trim();
  }
  return null;
}
