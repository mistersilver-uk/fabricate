// View helpers for the Interactable config panel, in a plain `.js` module so the two non-trivial
// decisions — the linked-visual banner and the activation gate line — are testable without the
// Svelte compiler. Each returns `{ key, fallback, ... }` for the component to localize. A
// gathering-task interactable carries NO per-interactable node pool (the environment's
// `nodeRuntime[taskId]` owns depletion and respawn), so no node count or ETA is formatted here.

const VISUAL_STATUS = Object.freeze({
  ok: { severity: 'ok', icon: 'fa-link', key: 'FABRICATE.Canvas.Interactable.Config.VisualOk', fallback: 'Marker linked.' },
  missing: { severity: 'missing', icon: 'fa-link-slash', key: 'FABRICATE.Canvas.Interactable.Config.VisualMissing', fallback: 'Linked marker is missing.' },
  none: { severity: 'none', icon: 'fa-circle-minus', key: 'FABRICATE.Canvas.Interactable.Config.VisualNone', fallback: 'No marker (region only).' }
});

// Tile, Drawing and Token are the supported kinds (`LINKED_VISUAL_DOCUMENT_NAMES`), each with its
// own icon and label so an "ok" banner reads "Linked marker: Token".
const VISUAL_KIND = Object.freeze({
  Tile: { icon: 'fa-image', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindTile', fallback: 'Tile' },
  Drawing: { icon: 'fa-draw-polygon', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindDrawing', fallback: 'Drawing' },
  Token: { icon: 'fa-user', key: 'FABRICATE.Canvas.Interactable.Config.VisualKindToken', fallback: 'Token' }
});

// An unknown or absent kind falls back to the plain "Marker linked." banner, so a caller passing
// only `{ status }` is unaffected.
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

// The FIRST blocking gate, else "active". The precedence mirrors
// `evaluateActivationEligibility` — disabled, locked, consumed, uses-exhausted, cooldown — so the
// panel agrees with what the player sees. `now` is optional, and omitting it skips the cooldown gate
// rather than changing the four before it.
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
