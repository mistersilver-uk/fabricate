# Agent-Facing Architecture Notes

These notes explain layered patterns and data-model subtleties that aren't obvious from reading any single file. They exist so agents and contributors landing on a feature for the first time can orient quickly instead of re-discovering the same patterns from scratch.

Scope:

- **AGENTS.md** is the source of truth for repo-wide rules (do / don't). Read it first.
- **This directory** holds the *explanations* behind the rules — how a layered helper actually composes, where the canonical data lives, what to grep when a UI change might have broken something out of view.
- **`openspec/specs/*/spec.md`** owns behavior contracts. **`docs/` (the Jekyll site at root)** is end-user GM documentation. Neither overlaps with this directory.
- **Reusable scripts** are indexed in `scripts/README.md`. For latest beta manifest/version lookups across Fabricate and the premium sibling modules, use `node scripts/latest-module-versions.mjs --profile fabricate-beta`, substituting the local AWS profile when needed.

## Index

- [`manager-confirm-discard.md`](manager-confirm-discard.md) — the three-layer "discard unsaved draft?" guard used by every editor in the Crafting System Manager.
- [`gathering-environment-data-model.md`](gathering-environment-data-model.md) — environment objects carry both legacy embedded data and modern library refs; this explains which to read for what.
- [`smoke-harness.md`](smoke-harness.md) — what `npm run test:foundry` does, where its outputs land, and which selectors routinely drift.

## Maintenance

Treat the cited file paths in each note as **load-bearing**. When a PR touches a path mentioned in a note, update the note in the same PR. Stale citations defeat the whole point of the directory — better to delete a note than to keep one that lies about where the code lives.
