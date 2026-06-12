# Resolved Agent Roster — rename-gathering-regions-to-realms

Resolved from the `AGENTS.md` auto-spawn routing table against this change's signals.

## Change signals

- Touches `src/systems/`, `src/main.js`, `lang/`, `openspec/specs/`, and domain language →
  `fabricate_domain_expert`.
- Touches `src/ui/svelte/` and `styles/` (4 component renames + CSS hooks + player chip) →
  `fabricate_ux_designer`.
- Adds a new migration test, renames many test files, bumps version assertions, wires a new runner
  setting → `fabricate_quality_engineer`.
- Changes public API surface (`game.fabricate` + `gathering.*` + `api` class export) and
  JSDoc/`docs/` + `DOMAIN.md` + canonical specs → `fabricate_docs_writer` + `fabricate_domain_expert`
  paired docs loop.
- UI-changing PR (`*.svelte`, `styles/`, `lang/`) → real smoke screenshot evidence required.

## Roster

| Stage | Agents |
|-------|--------|
| Plan (always) | `fabricate_orchestrator` |
| Plan review | `fabricate_domain_expert`, `fabricate_ux_designer`, `fabricate_quality_engineer` |
| Build | `fabricate_implementer` |
| Post-implementation review | `fabricate_reviewer`, `fabricate_ux_designer`, `fabricate_quality_engineer` |
| Docs loop | `fabricate_domain_expert` + `fabricate_docs_writer` (paired) |

Caps: 3 revisions per loop. Surface any `BLOCKED` verdict to the user.

## Implementer entry criteria

- Land in the layer order in `design.md`; each step keeps `npm test` + `npm run build` green.
- Use whole-identifier renames, never a blind `Region`→`Realm` text sweep (the `sceneRegionUuid`
  substring trap).
- New migration is `1.1.0` and must wire `gatheringParties` through `MigrationRunner`.
- Public API keeps deprecated `*Region*` delegates (non-breaking).
- Actor discovery flag uses a legacy-read fallback, not the runner.
- UI slice needs real smoke screenshot evidence (Travel realm list, environment realm selector,
  player realm-locked card) before PR open/update.
