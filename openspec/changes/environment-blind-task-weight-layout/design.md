# Environment Blind Task Weight Layout Design

## UI Behavior
The Tasks tab continues to render the Weight column only when the environment selection mode is `blind`.

Included task rows show:

- a numeric weight input, backed by `environment.blindSelection.weights[taskId]`
- a read-only percentage calculated as `weight / sum(included task weights) * 100`

Missing or invalid weights display as the existing default weight `1`. Zero remains valid and displays `0%`. If the included weight total is zero, every included row displays `0%`.

Candidate, excluded, and non-matching rows keep the dash placeholder in the Weight column.

## Row Actions
Task rows expose their actions only through the existing overflow menu:

- open source
- include
- force add
- restore
- exclude

Hazard rows keep their current inline actions, overflow menu, and drag/reorder affordances.

## Layout
Task composition rows use a compact action column because the only visible row action is the overflow trigger. Blind task rows allocate enough width for a three-character weight input and calculated percentage before the override/runtime columns.
