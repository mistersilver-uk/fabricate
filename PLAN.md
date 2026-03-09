# PLAN: T-189 Second Pass -- Rename `cauldron` to `alchemy` in Store + Tests

## Context

The first pass of T-189 renamed identifiers in `src/systems/*.js` but left stale
`cauldron` references in the crafting store and test files.  The engine method is
now `craftAlchemy`, the normalized config key is `system.alchemy`, and the reason
strings are `alchemy-hidden` / `alchemy-learned` / `alchemy-not-learned`.

This plan covers the three files in scope for Team 2.

---

## File 1: `src/ui/svelte/stores/craftingStore.js`

One change:

| Line | Old                                    | New                                   |
|------|----------------------------------------|---------------------------------------|
| 744  | `craftingEngine.craftCauldron(`        | `craftingEngine.craftAlchemy(`         |

---

## File 2: `tests/cauldron-mode.test.js` -> `tests/alchemy-mode.test.js`

### Step A: `git mv tests/cauldron-mode.test.js tests/alchemy-mode.test.js`

### Step B: Content changes (line references are from the original file)

**Header comment (line 8):**
- `CraftingEngine.craftCauldron:` -> `CraftingEngine.craftAlchemy:`

**`buildAlchemySystem` helper (line 87):**
- `cauldron: { learnOnCraft: true, ...}` -> `alchemy: { learnOnCraft: true, ...}`

**Test "normalizes alchemy config with defaults" (lines 159-163):**
- Input stays `cauldron: {}` (tests legacy fallback path `system.alchemy ?? system.cauldron`)
- Assertions change from `system.cauldron` -> `system.alchemy` (output key is `alchemy`)
- Assertion message `'cauldron config should be set'` -> `'alchemy config should be set'`

**Test "respects explicit alchemy config values" (lines 168-175):**
- Input: `cauldron: { ... }` -> `alchemy: { ... }` (tests the primary path, not legacy)
- Assertions: `system.cauldron.X` -> `system.alchemy.X`

**Test "sets cauldron to null for non-alchemy modes" (lines 177-181):**
- Test name: `sets cauldron to null` -> `sets alchemy to null`
- Assertion: `system.cauldron` -> `system.alchemy`

**Legacy normalization tests (lines 190-226) -- these test backward compat:**
- Lines 199, 202-203: Keep `cauldron:` as INPUT key (this is the legacy path being tested)
- Lines 206-208: Change output assertions `system.cauldron` -> `system.alchemy`
- Lines 219, 224-225: Change output assertions `system.cauldron` -> `system.alchemy`
- Assertion messages: `'cauldron config should be carried over'` -> `'alchemy config should be carried over'`, `'cauldron sub-config must still be populated'` -> `'alchemy sub-config must still be populated'`
- Line 199 test name: `preserves cauldron config when normalizing` -> `preserves alchemy config when normalizing legacy cauldron to alchemy`

**RecipeVisibilityService tests (lines 418-527):**
- All `buildAlchemySystem({ cauldron: { ... } })` -> `buildAlchemySystem({ alchemy: { ... } })`
  (Lines: 419, 433, 448, 465, 480, 493, 517)
- Reason assertions:
  - Line 444: `'cauldron-hidden'` -> `'alchemy-hidden'`
  - Line 461: `'cauldron-learned'` -> `'alchemy-learned'`
  - Line 476: `'cauldron-not-learned'` -> `'alchemy-not-learned'`

---

## File 3: `tests/stores/alchemy-store.test.js`

**Mock engine references:**

| Line | Old                        | New                        |
|------|----------------------------|----------------------------|
| 207  | `craftCauldron: async`     | `craftAlchemy: async`      |
| 221  | `calls craftCauldron with` | `calls craftAlchemy with`  |
| 233  | `craftCauldron: async`     | `craftAlchemy: async`      |
| 251  | `'craftCauldron should'`   | `'craftAlchemy should'`    |
| 267  | `craftCauldron: async`     | `craftAlchemy: async`      |

---

## Verification

After all changes:
1. `npm test` must pass (all ~1344 tests)
2. `grep -rn 'craftCauldron\|system\.cauldron' src/ui/ tests/` should return zero hits
   (except legacy test inputs that deliberately pass `cauldron:` to test normalization fallback,
   and comment text describing the legacy behavior)
