/**
 * The Interact prompt's lifecycle: the `tokenEnter`/`tokenExit` seams, the control and keybinding
 * re-triggers for a token already inside, and the post-close re-prompt. Every Foundry collaborator
 * is an injected function resolved at call time; this module reads no global.
 */

import {
  eventToken,
  ownsToken,
  sceneTokenDocs,
  shouldPromptForEnter,
} from './interactablePredicates.js';
import { selectRepromptTokenDoc } from './regionHitTest.js';
import { shouldPromptOnEnter } from './regions/interactableRegionActivation.js';
import { readInteractableBehaviorSystem } from './regions/interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from './regions/interactableRegionNodeAdapter.js';

/**
 * `tokenEnter` seam, on every client. Prompts per {@link shouldPromptForEnter} when the behaviour
 * is `regionEnter`-triggered and currently visible — the prompt is gated on VISIBILITY, not
 * eligibility, so a LOCKED interactable still prompts and Interact routes the localized denial.
 */
export function onRegionEnter(event, behavior, deps) {
  const system = readInteractableBehaviorSystem(behavior);
  if (!system) return;
  if (system.activation?.trigger !== 'regionEnter') return;

  const token = eventToken(event);
  if (!shouldPromptForEnter({ event, token, currentUser: deps.currentUser() })) return;
  if (!shouldPromptOnEnter(system)) return;

  const ref = identifyRegionBehaviorRef(behavior);
  if (!ref) return;
  raisePrompt({ behavior, system, ref, actorId: actorOf(token) }, deps);
}

/**
 * `tokenExit` seam: dismiss UNCONDITIONALLY. `PromptApp.dismiss(ref)` is ref-matched and a no-op
 * elsewhere, so the showing clients drop it however the token left — the stale-prompt case where
 * a GM staged a player's token and the player walks out.
 */
export function onRegionExit(_event, behavior, deps) {
  const ref = identifyRegionBehaviorRef(behavior);
  if (!ref) return;
  void deps.getPromptAppClass()?.dismiss?.(behaviorRefOf(ref));
}

/** The keybinding re-trigger: prompt for the first controlled token's eligible region. */
export function interactHere(deps) {
  const controlled = deps.controlledTokens();
  const token = (Array.isArray(controlled) ? controlled : [])[0] ?? null;
  if (!token) return;
  deps.promptForTokenInsideRegion(token);
}

/** Shared re-trigger body: {@link onRegionEnter} driven by control rather than a region event. */
export function promptForTokenInsideRegion(tokenPlaceable, deps) {
  const tokenDoc = tokenPlaceable?.document ?? tokenPlaceable;
  if (!tokenDoc) return;
  if (!ownsToken(tokenDoc, { isGM: deps.currentUser()?.isGM === true })) return;
  for (const { behavior } of deps.behaviorsContainingToken(tokenPlaceable)) {
    const system = readInteractableBehaviorSystem(behavior);
    if (!system || system.activation?.trigger !== 'regionEnter') continue;
    if (!shouldPromptOnEnter(system)) continue;
    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) continue;
    raisePrompt({ behavior, system, ref, actorId: actorOf(tokenDoc) }, deps);
    return; // one prompt at a time.
  }
}

/**
 * Re-raise the prompt after a gathering session closes, iff the token is still inside (issue 332),
 * through the injected {@link promptForTokenInsideRegion}, which re-applies the hit-test, guard
 * and ref-matching. No-throw: a close-handler error must never break the app close.
 */
export function repromptAfterClose({ ref, actorId } = {}, deps) {
  try {
    if (!ref || typeof ref !== 'object') return;
    const sceneId = ref.sceneId ?? null;
    if (!sceneId || !actorId) return;
    const scene =
      deps.getScene(sceneId) ??
      (String(deps.viewedScene()?.id ?? '') === String(sceneId) ? deps.viewedScene() : null);
    // Only re-prompt for the scene being viewed; the toast and hit-test target the active canvas.
    if (!scene || String(deps.viewedScene()?.id ?? '') !== String(scene.id ?? sceneId)) return;
    const tokenDoc = selectRepromptTokenDoc(sceneTokenDocs(scene), actorId);
    if (!tokenDoc) return;
    // Prefer the live placeable for its canvas centre; the document still resolves one.
    deps.promptForTokenInsideRegion(tokenDoc.object ?? tokenDoc);
  } catch {
    // Defensive: never let a re-prompt failure break the window close.
  }
}

function raisePrompt({ behavior, system, ref, actorId }, deps) {
  void deps.getPromptAppClass()?.show?.({
    behaviorRef: behaviorRefOf(ref),
    name: system.name || '',
    promptText: system.presentation?.promptText ?? null,
    onInteract: () =>
      deps.requestActivation(behavior, {
        actorId,
        userId: deps.currentUserId(),
        activationSource: 'regionEnter',
      }),
  });
}

function behaviorRefOf(ref) {
  return `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`;
}

function actorOf(token) {
  return token?.actor?.id ?? token?.actorId ?? null;
}
