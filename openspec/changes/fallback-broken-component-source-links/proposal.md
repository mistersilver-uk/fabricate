# Fallback Broken Component Source Links

## Summary

When a GM imports a Foundry Item into Fabricate, Fabricate currently stores the
Item's canonical compendium/source UUID when Foundry exposes one. If that
canonical UUID no longer resolves, the component immediately appears with a
missing origin even though the dropped world Item is still valid.

This change makes component import verify the canonical source link before
persisting it. If the canonical link is broken, Fabricate falls back to the live
dropped Item UUID as the component source and warns the GM that the original link
was broken.

## Goals

- Prevent newly imported Items with stale `_stats.compendiumSource` /
  `flags.core.sourceId` values from appearing as missing-origin components.
- Preserve broken source evidence in `fallbackItemIds` for matching/diagnostics.
- Warn the GM on single-source imports and summarize warnings for bulk imports.
- Apply the behavior consistently to single drops, folder imports, pack imports,
  and replace-source.

## Non-Goals

- No migration of existing components that already store stale source UUIDs.
- No special support for third-party bookkeeping flags such as `dnd5e_pl.id`.
- No change to runtime matching semantics beyond the persisted source references
  produced by import.

## Affected Specs

- `data-models`: component source import must verify canonical source links and
  fall back to the live Item UUID when the canonical source is stale.
- `ui-integration`: manager import surfaces must warn when this fallback occurs.

## Agent Roster

- Plan review: `fabricate_domain_expert`, `fabricate_ux_designer`,
  `fabricate_quality_engineer`.
- Implementation: `fabricate_implementer`.
- Post-implementation review: `fabricate_reviewer`,
  `fabricate_ux_designer`, `fabricate_quality_engineer`.
- Docs loop: `fabricate_domain_expert`, `fabricate_docs_writer`.
