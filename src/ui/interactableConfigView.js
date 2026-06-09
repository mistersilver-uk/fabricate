/**
 * PURE view helpers for the Interactable config panel
 * ({@link InteractableConfigRoot}).
 *
 * Kept in a plain `.js` module (no Svelte/ApplicationV2 import chain) so the
 * non-trivial display decisions — the linked-visual status banner and the
 * activation gate summary line — are unit-testable under `node:test` without the
 * Svelte compiler. The component shell imports these and renders their
 * localization keys + fallbacks.
 *
 * A gathering-task interactable carries NO per-interactable node pool (depletion /
 * respawn is owned by the environment's `nodeRuntime[taskId]`), so there is no
 * node count line or respawn-ETA formatting here.
 *
 * Each helper returns a `{ key, fallback, ... }` shape so the component localizes
 * the key and renders the fallback when no translation exists.
 */

const VISUAL_STATUS = Object.freeze({
  ok: { severity: 'ok', icon: 'fa-link', key: 'FABRICATE.Canvas.Interactable.Config.VisualOk', fallback: 'Marker linked.' },
  missing: { severity: 'missing', icon: 'fa-link-slash', key: 'FABRICATE.Canvas.Interactable.Config.VisualMissing', fallback: 'Linked marker is missing.' },
  none: { severity: 'none', icon: 'fa-circle-minus', key: 'FABRICATE.Canvas.Interactable.Config.VisualNone', fallback: 'No marker (region only).' }
});

// Per-kind icon + localized label for a resolved marker, so an "ok" banner can
// read sensibly per document kind ("Linked marker: Token"). Tile/Drawing/Token
// are the supported linked-visual kinds (`LINKED_VISUAL_DOCUMENT_NAMES`).
const VISUAL_KIND = Object.freeze({
  Tile: { icon: 'fa-image', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindTile', fallback: 'Tile' },
  Drawing: { icon: 'fa-draw-polygon', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindDrawing', fallback: 'Drawing' },
  Token: { icon: 'fa-user', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindToken', fallback: 'Token' }
});

/**
 * Describe the linked-visual status banner from the view model's `linkedVisual`
 * block. PURE. Returns `{ severity, icon, key, fallback }`.
 *
 * For a RESOLVED ('ok') marker the banner is enriched with the linked document
 * kind so it reads "Linked marker: Token" (or Tile / Drawing): the `key`/`fallback`
 * switch to the per-kind "VisualOkKind" string, the per-kind icon is used, and a
 * `documentName` + `kind:{ key, fallback }` block is attached for the component to
 * interpolate. An unknown/absent kind falls back to the plain "Marker linked."
 * banner — so existing callers that pass only `{ status }` are unaffected.
 *
 * @param {{ status?: string, mode?: string, documentName?: string } | null} linkedVisual
 * @returns {{ severity: string, icon: string, key: string, fallback: string, documentName?: string|null, kind?: { key: string, fallback: string } }}
 */
export function describeVisualStatus(linkedVisual) {
  const status = linkedVisual?.status;
  if (status === 'ok') {
    const documentName = typeof linkedVisual?.documentName === 'string' ? linkedVisual.documentName : null;
    const kind = documentName ? VISUAL_KIND[documentName] ?? null : null;
    if (!kind) return VISUAL_STATUS.ok;
    return {
      severity: 'ok',
      icon: kind.icon,
      key: 'FABRICATE.Canvas.Interactable.Config.VisualOkKind',
      fallback: `Linked marker: ${kind.fallback}`,
      documentName,
      kind: { key: kind.key, fallback: kind.fallback }
    };
  }
  if (status === 'missing') return VISUAL_STATUS.missing;
  return VISUAL_STATUS.none;
}

/**
 * Describe the activation gate as a one-line summary key. PURE: folds the
 * behaviour state into the FIRST blocking gate, else "active". Mirrors the
 * `evaluateActivationEligibility` precedence so the panel agrees with what the
 * player sees: DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN.
 *
 * COOLDOWN needs the current world time (`ctx.now`) to compare against
 * `cooldown.lastUsedWorldTime + cooldown.seconds`; it is optional — omitting it
 * simply skips that gate (so a caller that passes only `state` keeps its prior
 * result for the first four gates).
 *
 * @param {object|null} state  The view model's `state` block.
 * @param {object} [ctx]
 * @param {number} [ctx.now]   Current world time (seconds) for the cooldown gate.
 * @returns {{ status: string, key: string, fallback: string }}
 */
export function describeActivationGate(state, { now } = {}) {
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
  return { status: 'active', key: 'FABRICATE.Canvas.Interactable.Config.GateActive', fallback: 'Active' };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
