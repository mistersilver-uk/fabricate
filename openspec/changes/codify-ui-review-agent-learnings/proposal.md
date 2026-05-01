# Proposal

## Problem

The Gathering Environments card-grid iteration showed that agents can pass a UI change when they have screenshots and tests, but still miss visible layout and interaction defects. The missed issues were not caused by lack of artifacts; they were caused by weak review criteria for those artifacts.

## Goals

- Codify screenshot review as acceptance-criteria comparison, not screenshot existence.
- Require real browser pointer hit-testing for overlay/card/action UI where CSS or Foundry globals can intercept clicks.
- Warn implementers and reviewers about generic CSS state classes in Foundry surfaces.
- Require representative visual fixtures for image-card UI, including linked scene imagery when scene-image behavior is in scope.
- Make UX review a standard part of UI implementation sign-off.
- Record screenshot artifacts, what they prove, and remaining gaps in OpenSpec task logs.

## Non-Goals

- No runtime application changes.
- No new npm dependencies.
- No changes to model settings or agent names.
