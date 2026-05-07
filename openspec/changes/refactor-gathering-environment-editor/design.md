# Design: Refactor Gathering Environment Editor

## Editor Structure

The manager-v2 edit route keeps the global app header as the save/cancel strip. The editor body is a two-row workspace:

- environment details band with identity fields, image, scene linkage, status, and compact facts
- task workspace with task rail, selected-task editor, and evidence column

The legacy environment `Advanced` tab is removed. Scene selection and raw scene UUID editing remain visible in the scene panel because stale or manual scene references are part of normal environment setup.

## Task Workflow

Task tabs use Fabricate semantics:

- `Task Details`
- `Results`
- `Catalysts`
- `Visibility`
- `Timing`
- `Check`

The former task `Advanced` tab is removed. Progressive award/check configuration moves to `Check`; routed tasks show an empty check panel because routed result selection remains under `Results`.

## Behavior Preservation

The component continues to receive named callbacks from the root manager-v2 app. It does not introduce store writes, validation, source resolution, import/export, or cleanup behavior.

Validation links continue to reveal the right field:

- environment fields and scene UUID are visible in the details band
- result-selection and result-group errors reveal `Results`
- progressive/check errors reveal `Check`
- time and failure errors reveal `Timing`

Unsupported concepts from the visual reference, including availability scheduling, player-tool visibility, invented timestamps, biome/size/difficulty/resource rarity, and harvesting authoring, are intentionally excluded.
