# Tasks

## Data model & service (`src/systems/GatheringRichStateService.js`)

- [ ] Update `normalizeGatheringEconomy()` (~1752) to emit the new shape
      `{ stamina: { enabled, max, start, regen }, nodes: { enabled } }` (no `mode`).
- [ ] In `normalizeGatheringEconomy()`, add read-time legacy compat: when the new flags are
      absent but a legacy `mode` is present, map `'stamina' → stamina.enabled`,
      `'nodes' → nodes.enabled`, `none`/absent → both false. New flags win when present.
- [ ] Keep `ECONOMY_MODES` / regen constants for the compat mapping and the derived accessor.
- [ ] Replace `_economyMode` / `economyMode` internal usage (~1589–1612) with
      `staminaEnabled(systemId): boolean` and `nodesEnabled(systemId): boolean` reading the
      normalized flags.
- [ ] Keep `economyMode(systemId)` as a thin derived back-compat accessor returning
      `'both' | 'stamina' | 'nodes' | 'none'` (external/API only; no internal caller relies on it).
- [ ] `evaluateStart()` (~1357): `if (mode === 'nodes')` → `if (nodesEnabled)`;
      `if (mode === 'stamina')` → `if (staminaEnabled)` (already separate blocks).
- [ ] `commitAcceptedAttempt()` (~1386): guard node-depletion block by `nodesEnabled`, stamina-
      spend block by `staminaEnabled` (both run, in order, when both enabled).
- [ ] Update remaining internal callsites: `listingStaminaCost()` (~1669, `!== 'stamina'` →
      `!staminaEnabled`) and the `_economyMode(...)` checks at ~726, ~967, ~1032.
- [ ] Read-compat precedence: treat "new flags present" as the `stamina.enabled` /
      `nodes.enabled` **key** existing (not merely truthy). Only when neither key exists do we
      fall back to mapping a legacy `mode`, so a stale `mode` can never resurrect a disabled
      limitation.
- [ ] Update the `economyMode()` JSDoc to document the new `'both'` return value.

## Engine (`src/systems/GatheringEngine.js`)

- [ ] `_processStaminaRegen` (~188): filter systems by `richState.staminaEnabled?.(id)`.
- [ ] `_processNodeRespawn` (~218): skip environments where `!richState.nodesEnabled?.(craftingSystemId)`.
- [ ] Listing view-model (~964, ~1066–1069, ~1181): guard stamina auto-seed by `staminaEnabled`;
      expose `staminaEnabled` / `nodesEnabled` booleans on the environment view-model; keep
      populating `staminaPool` when `staminaEnabled`.
- [ ] Verify `task.rich.stamina` / `task.rich.nodes` are both set from `evaluateStart` evidence
      under "both".

## Migration (`src/migration/`)

- [ ] Add `migrateGatheringLimitationToggles.js` (model on `migrateGatheringEconomy.js`): pure,
      idempotent, by-reference. For each `gatheringConfig.systems[id].economy` still carrying a
      legacy `mode`, write `stamina.enabled = (mode === 'stamina')`,
      `nodes.enabled = (mode === 'nodes')`, then drop `mode`. Leave already-migrated economies
      untouched.
- [ ] Register a new `version: '0.8.0'` step in `MigrationRunner.js`, appended after the `0.7.0`
      entry (~line 105) before the closing `]`.

## GM UI

- [ ] `GatheringEconomyView.svelte` `defaultEconomy()` / `normalizeEconomy()` (~35–81): adopt the
      two-flag shape and the same legacy `mode → flags` read mapping as the service.
- [ ] `GatheringEconomyView.svelte`: replace the 3-option `role="radiogroup"` (~146–174) with two
      toggle pills (Stamina, Resource nodes) reusing `.manager-economy-mode-option` styling;
      clicking toggles the flag (`setStamina(bool)` / `setNodes(bool)`), persisted via
      `setGatheringEconomy`; both can be `is-active`; drop the explicit "No limit" option.
- [ ] `GatheringEconomyView.svelte`: show the stamina sub-config when `economy.stamina.enabled`
      and the nodes note when `economy.nodes.enabled` (both can render at once).
- [ ] `CraftingSystemManagerRoot.svelte`: replace `selectedGatheringTaskEconomyMode` (line 516)
      with two derived booleans (`...economy?.stamina?.enabled` / `...economy?.nodes?.enabled`)
      and pass both props (line 3142).
- [ ] `GatheringTaskEditView.svelte`: replace the `economyMode` prop (line 11) with
      `staminaEnabled` / `nodesEnabled`; `{#if economyMode === 'stamina'}` (793) →
      `{#if staminaEnabled}`; `{#if economyMode === 'nodes'}` (842) → `{#if nodesEnabled}`.
      Decide where the nodes guidance hint lives now that nodes can be on alongside stamina
      (the old `{:else}` structural assumption no longer holds).
- [ ] **a11y:** drop `role="radiogroup"` / `role="radio"` / `aria-checked`; wrapper becomes
      `role="group"` with an aria-label, each pill is `<button type="button" aria-pressed={…}>`.
      Keep the `data-economy-mode-option` attribute name; change its values to `stamina` /
      `nodes` (drop `none`). Add a muted empty-state hint shown when both flags are off.
- [ ] **Extra callsite:** `src/ui/SvelteCraftingSystemManagerApp.svelte.js` (~555) —
      `setGatheringEconomy` compares `economy?.mode` (prev vs next) to decide whether to fire
      `refreshGatheringConfig()`. Change it to compare `stamina.enabled` / `nodes.enabled`, or
      the task editor goes stale after a toggle.
- [ ] **i18n (`lang/*.json`, all locales):** reword `Economy.NodesNote` and
      `Economy.TaskStaminaHint` to drop "mode"; repurpose `Mode.None` as the "no limit"
      empty-state hint; keep `Mode.Stamina` / `Mode.Nodes` as the two pill labels.

## Player UI

- [ ] `GatheringDetail.svelte`: replace the `economyMode` derivation (line 71) and `=== 'stamina'`
      checks (74) with `staminaEnabled` / `nodesEnabled` derived from the env view-model.
- [ ] `GatheringDetail.svelte` economy strip (239–256): render the stamina item when
      `staminaEnabled` AND the node legend item when `nodesEnabled` (both can appear), replacing
      the current if/else.
- [ ] `GatheringTaskDetail.svelte`: verify only — already presence-driven (`task.rich.stamina` /
      `task.rich.nodes`, lines 56–64, 173–191); no logic change once the engine populates both.

## Tests

- [ ] `tests/gathering-economy-modes.test.js`: update existing mode assertions to the flag shape;
      add a "both enabled" case proving (a) both gates fire in `evaluateStart` and
      (b) one accepted `commitAcceptedAttempt` both depletes the node pool and spends stamina.
- [ ] `tests/gathering-economy-modes.test.js` (or a dedicated normalize test): assert the
      read-time legacy `mode → flags` mapping (`stamina`/`nodes`/`none`/absent) and that present
      flags win over a stale `mode`.
- [ ] `tests/gathering-economy-modes.test.js`: migrate the per-mode cases (e.g. ~:262 "not in
      nodes mode", ~:408 "only in stamina mode", ~:426 "mode is none") to the flag shape, and
      add explicit **stamina-only** (nodes flag false → node pool never decremented even with
      `task.nodes`), **nodes-only** (stamina flag false → `getActorStamina` untouched even with
      a `staminaCost`), and **both-off** (neither gate fires, both evidence null) cases. The
      both-enabled case must assert against `env.nodeRuntime[…]` + `getActorStamina(…)` in one
      block (the anti-dogpiling proof).
- [ ] `tests/components/gathering-task-editor-economy.test.js`: update the two-prop
      (`staminaEnabled` / `nodesEnabled`) gating and the `inspectorSource.includes(...)` source
      strings (~:21,:26,:33,:42,:103); assert both cards render when both are on; resolve the
      `{:else}` nodes-hint assumption (~:39-49).
- [ ] **REQUIRED rewrite — `tests/components/gathering-economy-view-mounted.test.js`:** this
      mounted test hard-asserts 3 `[data-economy-mode-option]` options, `'none'` active, and a
      click on `nodes` writing `economy.mode === 'nodes'` (~:82-90, :134-136). Rewrite for the
      two-pill toggle model: two pills, no `'none'`, independent on/off, both-active, neither =
      no limit, and `setStamina` / `setNodes` persistence (`economy.stamina.enabled` /
      `economy.nodes.enabled`) instead of `economy.mode`.
- [ ] `tests/migration-runner.test.js`: add a `0.8.0` case (legacy `mode` → toggles; idempotent;
      already-migrated economies untouched). **Bump every `'0.7.0'` version assertion**
      (~:285,:353,:463,:492 and integration ~:272-286) to `'0.8.0'` in lockstep. Add a
      0.3.0→0.8.0 chain case proving the env-level `economyMode` mapped by 0.3.0 into
      `economy.mode` is then rewritten to flags by 0.8.0 (the two economy migrations compose).
- [ ] `tests/stores/adminStore.test.js` (~:4135-4172): confirm the store normalizer preserves
      the new `stamina.enabled` / `nodes.enabled` fields verbatim; update the
      refresh-on-change test only if the refresh trigger changes (see the extra callsite above).
- [ ] Leave these read-compat regression guards green **unedited** (they prove the read mapping
      works): `tests/gathering-engine-timed-completion.test.js` (~:209),
      `tests/gathering-node-respawn-integration.test.js` (~:55),
      `tests/canvas/node-respawn-math.test.js` (~:136) — all use `economy: { mode: 'nodes' }`.

## Spec & docs (applied by the docs loop)

- [ ] Update `openspec/specs/gathering-and-harvesting/spec.md` "Gathering Economy and Stamina"
      (~660–722): replace the `mode` enum in Properties with `stamina.enabled` / `nodes.enabled`;
      rewrite requirements 1–4 / 6–7 for independent toggles, both-on = both limits
      (anti-dogpiling), neither-on = no limit; document the read-time legacy `mode` mapping and
      that timed attempts remain orthogonal.
- [ ] Record the `0.8.0` migration in the spec's migration note (legacy `mode` → flags, drop
      `mode`; idempotent).
- [ ] In the Properties block, reconcile the stamina `regen` sub-shape to what the normalizer
      actually emits (`policy / unit / amount / lastRoll`) — drop the stale `formula` /
      `characterModifiers` fields rather than copying them forward.
- [ ] Reword requirements 3/4 ("only in this mode" → "only when `stamina.enabled` /
      `nodes.enabled`"), requirement 6 (no single "selected mode" controlling which controls
      are primary/hidden — the two toggles independently show/hide their sub-blocks), and
      requirement 7 (retain the 0.3.0 history, add the 0.8.0 mapping, retire `mode` wording).
- [ ] *Add* (don't rewrite) to "Gathering Resource Nodes" (~573–620) a requirement stating node
      mechanics apply only when the owning system's `nodes.enabled` is set; per-task node
      mechanics otherwise unchanged.
- [ ] Add the spec delta under `openspec/changes/gathering-limitation-toggles/specs/gathering-and-harvesting/spec.md`.

## Validation gates

- [ ] `npm test` — all suites green, including the new both-mode, normalize-compat, migration,
      and editor cases.
- [ ] `npm run build` — clean Vite build.
- [ ] Manual (Foundry V13): in the manager gathering Settings tab, toggle both pills on; confirm
      stamina config + node note render together. On a task set a stamina cost and a node count.
      As a player, attempt the task: confirm the detail strip shows both the stamina pool and the
      node legend, the attempt both spends stamina and decrements the node, and the result chat
      card footer reports stamina spent + nodes remaining. Deplete the node with a high-stamina
      actor and confirm further attempts are blocked (anti-dogpiling) until world-time advance
      respawns the node.
- [ ] Manual: load a pre-existing world that used `mode: 'stamina'` (or `'nodes'`) and confirm
      the migration flips the matching toggle on and the system behaves identically.
