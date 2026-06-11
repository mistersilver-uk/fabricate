# Travel: live current-region sensing

How a gathering **party's current Fabricate region** is determined, and the
Foundry V13 token-movement timing trap that makes the naive implementation report
the region the marker *just left* (an off-by-one that cost three round-trips to
diagnose). Touch any of the files below and re-read this first.

## Resolution model

`GatheringLocationService.resolveCurrentRegions({ partyId, systemId })`
(`src/systems/GatheringLocationService.js`) resolves in this order:

1. **Manual override** — `party.currentRegionOverrides[systemId].mode === 'manual'`
   wins; the GM has pinned regions explicitly (`source: 'manualOverride'`).
2. **Auto (travel-actor) sensing** — otherwise the current region is derived
   **live** from where the party's travel-marker token (`party.travelActorUuid`)
   currently sits: scene-region UUIDs the marker is inside → mapped to Fabricate
   regions by each region's `sceneMappings[].sceneRegionUuid` (`source: 'travelActor'`).
   No state is stored; it always reflects the marker's live position.

The service stays Foundry-free and unit-testable: the `senseSceneRegions`
collaborator (a `(travelActorUuid) => Iterable<sceneRegionUuid>`) is injected, and
defaults to `() => []`. The real implementation is wired in `src/main.js` where the
service is constructed.

Consumers need **no change** when the auto branch is involved — the engine's
location gating (`GatheringEngine._resolveRegionContext` → `buildCurrentRegionContext`
→ `evaluateLocationAvailability` in `src/systems/gatheringLocation.js`) and the
manager view-model already consume `{ resolved, regions, regionIds }` generically.
The manager's `adminStore` travel `buildState` resolves each party once via
`resolveCurrentRegions` and buckets by region, so **auto-resolved** parties appear
in region→party lists — do not read `currentRegionOverrides` directly for "parties
in region", or auto parties vanish.

## The V13 token-movement off-by-one (read this twice)

Foundry V13 **animates** token movement. When a token moves:

- the `updateToken` hook fires with the **document** already at the destination,
  **but** the placeable (`token.object`) is still animating from the old spot, and
- `token.object.center` **and `TokenDocument#getCenterPoint()`** report the
  *animating* position — i.e. **the position the token just left** — until the
  animation settles.

So any containment test that reads the placeable centre *at the hook* resolves the
**previous** region. Symptom: the first entry shows "no region", and each later move
shows the region from the move before. This is deterministic, not flaky.

Three independent mitigations are in place (use all of them; they reinforce):

1. **Read Foundry's authoritative membership.** `senseSceneRegions` prefers
   `TokenDocument#regions` (the set of regions Foundry itself tracks the token
   inside — the same core system that drives interactable `tokenEnter`/`tokenExit`),
   falling back to position hit-testing only when it is unavailable.
2. **Compute the centre from the DOCUMENT, not the placeable.**
   `tokenDocumentCenter(token)` in `src/canvas/regionHitTest.js` computes the centre
   from `token.x/y` + footprint + `scene.grid.size` first; `getCenterPoint()` /
   `object.center` are fallbacks only (they lag during the move). `tokenCenter`
   (placeable-first) is correct for a *settled* token — e.g. the interactable
   `controlToken` re-trigger — but wrong during movement; do not reuse it for
   travel sensing.
3. **Wait for the move to settle before re-resolving.**
   `subscribeTravelMarkerMove` (`src/ui/svelte/util/foundryBridge.js`) defers its
   notification until the token's move animation completes (`CanvasAnimation`), so
   the UI re-reads after everything is final.

## Reactive refresh (no reopen)

`subscribeTravelMarkerMove(handler)` hooks `updateToken` / `createToken` /
`deleteToken` and fires `handler(actorUuid)` with the **base** world-actor uuid
(`Actor.<actorId>`, so it matches `party.travelActorUuid` for linked *and* unlinked
marker tokens). It does not pre-filter on `x/y` keys — V13 can deliver movement
differently — so the **consumer** filters to actual travel markers.

- **GM manager**: `adminStore` subscribes and calls `travel.patch()` when a moved
  token is some party's marker; disposed in `destroy()`.
- **Player app**: `GatheringView.svelte` subscribes and quietly re-fetches
  (`load(true)`); `SvelteFabricateApp` injects `isTravelMarkerActor(actorUuid)` so
  only marker moves trigger a refetch. Players also stay correct without a refresh
  because the engine resolves live whenever the gathering app is opened/re-listed.

Token positions sync to every client, so each client derives the same live result —
no socket/broadcast is needed.

## Files

- `src/systems/GatheringLocationService.js` — resolution (manual + auto branches).
- `src/main.js` — `senseSceneRegions` injection (`fromUuidSync` + `getActiveTokens`).
- `src/canvas/regionHitTest.js` — `sceneRegionUuidsContainingToken`, `tokenDocumentCenter`.
- `src/ui/svelte/util/foundryBridge.js` — `subscribeTravelMarkerMove` (+ settle-wait).
- `src/ui/svelte/stores/adminStore.js` — travel `buildState` live resolution + subscription.
- `src/ui/svelte/apps/gathering/GatheringView.svelte`, `src/ui/SvelteFabricateApp.svelte.js` — player refresh + `isTravelMarkerActor`.
