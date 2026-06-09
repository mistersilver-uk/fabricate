/**
 * PURE view helpers for the Interactable config panel
 * ({@link InteractableConfigRoot}).
 *
 * Kept in a plain `.js` module (no Svelte/ApplicationV2 import chain) so the
 * non-trivial display decisions — the linked-visual status banner, the activation
 * gate summary line, the node count line, and the respawn-ETA formatting — are
 * unit-testable under `node:test` without the Svelte compiler. The component
 * shell imports these and renders their localization keys + fallbacks.
 *
 * Each helper returns a `{ key, fallback, ... }` shape so the component localizes
 * the key and renders the fallback when no translation exists.
 */

const VISUAL_STATUS = Object.freeze({
  ok: { severity: 'ok', icon: 'fa-link', key: 'FABRICATE.Canvas.Interactable.Config.VisualOk', fallback: 'Marker linked.' },
  missing: { severity: 'missing', icon: 'fa-link-slash', key: 'FABRICATE.Canvas.Interactable.Config.VisualMissing', fallback: 'Linked marker is missing.' },
  none: { severity: 'none', icon: 'fa-circle-minus', key: 'FABRICATE.Canvas.Interactable.Config.VisualNone', fallback: 'No marker (region only).' }
});

/**
 * Describe the linked-visual status banner from the view model's `linkedVisual`
 * block. PURE. Returns `{ severity, icon, key, fallback }`.
 *
 * @param {{ status?: string, mode?: string } | null} linkedVisual
 * @returns {{ severity: string, icon: string, key: string, fallback: string }}
 */
export function describeVisualStatus(linkedVisual) {
  const status = linkedVisual?.status;
  if (status === 'ok') return VISUAL_STATUS.ok;
  if (status === 'missing') return VISUAL_STATUS.missing;
  return VISUAL_STATUS.none;
}

/**
 * Describe the activation gate as a one-line summary key. PURE: folds the
 * behaviour state into the FIRST blocking gate, else "active". Mirrors the
 * Phase-1 `evaluateActivationEligibility` precedence so the panel agrees with what
 * the player sees: DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN →
 * NODE_DEPLETED.
 *
 * COOLDOWN needs the current world time (`ctx.now`) to compare against
 * `cooldown.lastUsedWorldTime + cooldown.seconds`; NODE_DEPLETED reads the node
 * summary (`ctx.node`). Both are optional — omitting them simply skips those
 * gates (so an existing caller that passes only `state` keeps its prior result for
 * the first four gates).
 *
 * @param {object|null} state  The view model's `state` block.
 * @param {object} [ctx]
 * @param {number} [ctx.now]   Current world time (seconds) for the cooldown gate.
 * @param {{ hasNode?: boolean, depleted?: boolean }|null} [ctx.node]  Node summary for the depletion gate.
 * @returns {{ status: string, key: string, fallback: string }}
 */
export function describeActivationGate(state, { now, node } = {}) {
  const s = state && typeof state === 'object' ? state : {};
  if (s.enabled === false) {
    return { status: 'disabled', key: 'FABRICATE.Canvas.Interactable.Config.GateDisabled', fallback: 'Disabled' };
  }
  if (s.locked === true) {
    return { status: 'locked', key: 'FABRICATE.Canvas.Interactable.Config.GateLocked', fallback: 'Locked' };
  }
  if (s.consumed === true) {
    return { status: 'consumed', key: 'FABRICATE.Canvas.Interactable.Config.GateConsumed', fallback: 'Consumed' };
  }
  const usesMax = numberOrNull(s.uses?.max);
  const usesUsed = numberOrNull(s.uses?.used) ?? 0;
  if (usesMax != null && usesUsed >= usesMax) {
    return { status: 'usesExhausted', key: 'FABRICATE.Canvas.Interactable.Config.GateUsesExhausted', fallback: 'Uses exhausted' };
  }
  const cdSeconds = numberOrNull(s.cooldown?.seconds);
  const cdLast = numberOrNull(s.cooldown?.lastUsedWorldTime);
  const nowNumber = numberOrNull(now);
  if (cdSeconds != null && cdLast != null && nowNumber != null && nowNumber < cdLast + cdSeconds) {
    return { status: 'cooldown', key: 'FABRICATE.Canvas.Interactable.Config.GateCooldown', fallback: 'On cooldown' };
  }
  if (node?.hasNode === true && node?.depleted === true) {
    return { status: 'nodeDepleted', key: 'FABRICATE.Canvas.Interactable.Config.GateNodeDepleted', fallback: 'Depleted' };
  }
  return { status: 'active', key: 'FABRICATE.Canvas.Interactable.Config.GateActive', fallback: 'Active' };
}

/**
 * Describe the node count line. PURE: returns the depleted/available key + a
 * fallback. Returns the "no node" line when there is no node.
 *
 * @param {{ hasNode?: boolean, depleted?: boolean } | null} node  The node summary.
 * @returns {{ key: string, fallback: string }}
 */
export function describeNodeLine(node) {
  if (!node?.hasNode) {
    return { key: 'FABRICATE.Canvas.Interactable.Config.NodeUnlimited', fallback: 'Unlimited (no node)' };
  }
  if (node.depleted) {
    return { key: 'FABRICATE.Canvas.Interactable.Config.NodeDepleted', fallback: 'Depleted' };
  }
  return { key: 'FABRICATE.Canvas.Interactable.Config.NodeAvailable', fallback: 'Available' };
}

/**
 * Format a respawn ETA (seconds until) into a compact human string. PURE.
 * Returns null when there is no ETA (manual / at-max / no node).
 *
 * @param {{ secondsUntil?: number } | null} respawnEta
 * @returns {string|null}
 */
export function formatRespawnEta(respawnEta) {
  const secondsUntil = numberOrNull(respawnEta?.secondsUntil);
  if (secondsUntil == null) return null;
  if (secondsUntil <= 0) return formatDuration(0);
  return formatDuration(secondsUntil);
}

/**
 * Format a non-negative duration in seconds as `Nd Nh Nm Ns`, dropping leading
 * zero units (keeps at most the two most significant units). PURE.
 *
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total === 0) return '0s';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs) parts.push(`${secs}s`);
  return parts.slice(0, 2).join(' ');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
