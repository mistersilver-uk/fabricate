# Mythwright Gathering Task Images

## Summary

Mythwright gathering tasks currently seed without task-specific images, so Manager V2 and player gathering surfaces fall back to the generic item bag icon. This change adds deterministic Foundry core icon paths to the seeded Mythwright gathering task library.

## Goals

- Give every seeded Mythwright gathering task a non-generic `img`.
- Keep task images deterministic and idempotent across repeated bootstrap runs.
- Use Foundry core icon paths already compatible with the bootstrap's approved icon validation.

## Out of Scope

- New bundled image assets.
- Schema changes to gathering task data.
- UI layout changes for task image rendering.
- New npm dependencies.

## Acceptance Criteria

- `buildGatheringTasks()` returns every Mythwright gathering task with a non-default `img`.
- Task image paths are included in `APPROVED_MYTHWRIGHT_ICON_PATHS`.
- Re-running the Mythwright bootstrap updates seeded gathering task records with the deterministic image paths.
