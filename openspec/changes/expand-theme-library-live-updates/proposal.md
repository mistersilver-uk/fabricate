# Proposal

## Summary

Expand Fabricate's theme library with four new selectable product UI themes: `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and `Foundry Native`.
Keep `Fabricate` as the default, preserve `Mythwright` as the prior dark green palette, and make theme changes visibly update already-open Fabricate app windows without closing or reopening them.

## Problem

Fabricate's theme selector currently exposes only `Fabricate` and `Mythwright`.
The new visual directions have already been proposed, but they do not exist in the module yet, and the live-update behavior for already-open windows is not covered by focused regression tests.

## Scope

- Add four stable theme ids and setting choices for the new theme presets.
- Define complete `--fab-*` token palettes for each new theme in `styles/fabricate.css`.
- Preserve `fabricate` as the default theme id and fallback target.
- Preserve `mythwright` as the previous dark green product palette.
- Keep `Foundry Native` as a fixed Foundry-inspired palette owned by Fabricate rather than a dynamic mirror of Foundry's current runtime CSS.
- Make theme changes update already-open Fabricate UI surfaces without requiring a close/reopen cycle.
- Add tests for theme ids, setting metadata, palette token coverage, live-update behavior, and rendered readability across representative surfaces.
- Update canonical specs and end-user docs that describe the available theme options.

## Non-goals

- Per-user custom theming.
- User-authored color editing.
- Layout or workflow redesign.
- New npm dependencies.
- Foundry compatibility or module metadata changes.

## Acceptance Criteria

- The Fabricate theme setting exposes these choices:
  - `Fabricate`
  - `Mythwright`
  - `Ironblood Forge`
  - `Hearth & Herb`
  - `Starglass Arcana`
  - `Foundry Native`
- `Foundry Native` is documented as a fixed Foundry-inspired Fabricate palette and does not track Foundry's active runtime theme or third-party Foundry skins.
- Unknown or stale saved theme values still normalize safely to `fabricate`.
- Each theme defines the full token surface required by Fabricate UI, including semantic action, status, overlay, focus, shadow, tag, and alias tokens.
- Changing the theme setting updates the active Fabricate theme and visibly refreshes already-open Fabricate UI surfaces without closing them or replacing the mounted app root node.
- Browser-backed rendered validation proves buttons, tags, toggles, text, focus rings, and layout regions remain readable and unclipped for the new themes across representative GM and player surfaces.
- `npm test` and `npm run build` pass.
