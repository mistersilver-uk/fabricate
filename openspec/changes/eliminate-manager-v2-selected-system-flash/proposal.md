# Proposal: Eliminate Manager V2 Selected-System Loading Flash

## Summary

Manager V2 should show the selected crafting system context immediately when opened. The current initial refresh publishes the systems list before awaited card/environment work, but leaves `selectedSystem` empty until the second phase finishes. That makes the left rail and right selected-system inspector briefly look broken even though a valid system exists.

## Problem

The previous first-open sequencing fix solved the systems-library empty-state flash by publishing the systems list synchronously. Manager V2 left navigation and selected-system details, however, depend on `viewState.selectedSystem`, not only `systems` or `selectedSystemName`. Because `selectedSystem` is still published after awaited item-card and environment work, the selected-system rail scope, feature menu, and inspector can lag behind the systems table.

## Goals

- Publish the selected-system view model during the synchronous first refresh phase whenever a valid crafting system exists.
- Keep async card/environment work from blocking the selected-system shell.
- Preserve the no-systems state and existing store/service contracts.
- Add regression coverage for first-open selected-system availability.

## Non-Goals

- Do not change persistence, crafting system normalization, item-card source resolution, recipe behavior, or gathering environment behavior.
- Do not add new UI placeholders or loading skeletons.
- Do not add dependencies.
