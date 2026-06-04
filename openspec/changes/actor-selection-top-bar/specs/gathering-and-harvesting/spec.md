# Gathering And Harvesting Spec Delta

## Added Requirements

### Selectable Actor Listing API

Fabricate MUST expose a player-safe API for listing the actors a user may select as a gathering actor
in the unified-window actor selection bar.

1. The API returns, for the calling user, the **player-character** actors — the actor type(s) a
   system designates as player characters — that the user owns (non-GM) or all such actors (GM), as
   redaction-safe display records of the form `{ id, uuid, name, img }`. "Player character" is a
   CONCEPT; the current dnd5e/pf2e implementation is the predicate `isPlayerCharacterActor`
   (`actor.type === 'character'`), which is the documented seam for future per-system extension.
   `'character'` MUST NOT be treated as universal truth, and systems with a differing player-character
   type are a known limitation.
2. This selection predicate is distinct from gathering attempt authorization. It MUST NOT reuse or
   modify the ownership-based attempt-authorization predicate; narrowing attempt authorization by the
   player-character concept is explicitly forbidden by this change.
3. The selection predicate combines ownership (player owns / GM sees all) AND the player-character
   concept (`isPlayerCharacterActor`). An owned non-player-character actor remains attempt-authorized
   but does not appear in this list.
4. The API returns ONLY redaction-safe display data — records containing exactly `{ id, uuid, name,
   img }` and no other actor internals — and MUST NOT leak GM-only actor state.

### Remembered Gathering Actor Persistence

The selected gathering actor MUST persist across reloads and tab switches through the existing
last-gathering-actor client setting, and the listing API MUST honor it by default.

1. A persisted last-gathering-actor accessor reads and writes the existing `lastGatheringActor`
   client setting; no new persistence key is introduced.
2. `listGatheringForActor(options)` MUST default `rememberedActorId` to the persisted last-gathering
   actor (or `null` when unset), while an explicit `rememberedActorId` passed in `options` overrides
   the persisted default.
3. The unified-window gathering view passes the live shared-store selection as `rememberedActorId`, so
   a selection change re-drives the listing without losing the persisted default for fresh loads.
4. On first load, when the shared selection is empty, the view adopts the listing's resolved
   `selectedActorId` **at most once and only when that id is present in the shared store's
   player-character selectable list**; otherwise the view leaves the store's own fallback in place.
   The adoption is a backstop (the shell seeds the store first, so it rarely fires) and MUST be
   idempotent — no re-adoption or ping-pong on subsequent fetches. Thereafter the shared selection is
   authoritative for the listing fetch.
5. The listing's remembered-actor resolution matches `rememberedActorId` against the **ownership**
   selectable list, NOT the player-character list, and remains authoritative for a given fetch. A
   persisted owned non-player-character id MAY therefore be resolved and gathered as that actor on the
   first fetch; the shared store converges by falling back to a player character and re-persisting.
   The "single source of truth" guarantee for the selected gathering actor holds **after
   convergence**, not necessarily on the very first fetch when a legacy non-player-character id is
   persisted. Startup preference cleanup stays ownership-based and does not clear an owned
   non-player-character id; convergence is the shared store's responsibility, not cleanup's.

## Modified Requirements

### Rich Gathering APIs and Hooks

In addition to the existing rich gathering APIs, Fabricate exposes:

- A player-safe selectable-actor listing API returning redaction-safe `{ id, uuid, name, img }`
  records (and no other actor internals) for the user's selectable player characters — owned for
  non-GM, all for GM, narrowed by the player-character concept (`isPlayerCharacterActor`, currently
  `type === 'character'`; other player-character types are a known limitation).
- Accessors to read and write the remembered gathering-actor selection over the existing
  last-gathering-actor client setting.

`listGatheringForActor` continues to enforce the same visibility, scene/access, blind redaction,
stamina, node, attempt-limit, and provider-diagnostic secrecy rules; it additionally defaults
`rememberedActorId` to the persisted selection while honoring an explicit override. The selectable-
actor API enforces the same redaction rules as the UI and does not expand attempt authorization.

## Testing Requirements

- Unit tests for the selectable-actor listing: owned-only for non-GM, all for GM, narrowed by the
  player-character concept (`isPlayerCharacterActor`), returning records containing ONLY
  `{ id, uuid, name, img }` (a redaction assertion that no other actor internals leak).
- Unit tests asserting an owned non-player-character actor is absent from the selectable-actor list
  while its gathering attempt authorization is unchanged.
- Unit tests for `listGatheringForActor` defaulting `rememberedActorId` from the persisted setting and
  honoring an explicit `rememberedActorId` override.
- A test (or note) documenting the convergence contract: a persisted owned non-player-character
  `rememberedActorId` is resolved against the engine's ownership list for that fetch, while the shared
  store treats it as stale and converges to a player character; the single-source-of-truth guarantee
  holds after convergence.
- These service tests MUST route through the same injected-dependency boundary used by
  `tests/gathering-engine-listing.test.js` (injecting `getSelectableActors`, `isActorSelectable`,
  `localize`, and the settings accessors) so they run under `node:test` without touching
  `game.settings` / `game.actors`.
