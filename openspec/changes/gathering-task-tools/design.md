# Design: Gathering Task Tools

## Data Model

New `src/models/Tool.js` (sibling to `src/models/Catalyst.js`).

```
Tool {
  componentId: string                       // managed component reference
  requirement: null | {
    provider: 'dnd5e' | 'pf2e' | 'macro'
    formula?: string                         // provider !== 'macro'
    macroUuid?: string                       // provider === 'macro'
  }
  breakage: {
    mode: 'limitedUses' | 'breakageChance' | 'diceExpression'
    maxUses?: number | null                  // limitedUses
    breakageChance?: number                  // 0..100 integer, breakageChance
    formula?: string                         // diceExpression
    threshold?: number                       // diceExpression; broken when result < threshold
  }
  onBreak: {
    mode: 'destroy' | 'flagBroken' | 'replaceWith'
    replacementComponentId?: string | null   // replaceWith; must !== componentId
  }
}
```

Validation matrix:

| Field | Rule |
| --- | --- |
| `componentId` | required, non-empty string |
| `requirement.macro` | `macroUuid` required |
| `requirement` system providers | `formula` required non-empty |
| `breakage.maxUses` (limitedUses) | `null` or positive integer |
| `breakage.breakageChance` (breakageChance) | integer in `0..100` |
| `breakage.formula` (diceExpression) | non-empty string |
| `breakage.threshold` (diceExpression) | finite number |
| `onBreak.replacementComponentId` (replaceWith) | required non-empty string, must not equal `componentId` |

Item-flag conventions:

- `flags.fabricate.toolUsage = { timesUsed: number }` (mirrors `catalystItemUsage`; only the `limitedUses` mode persists state on the item).
- `flags.fabricate.toolBroken = true` (set by the `flagBroken` on-break action; presence gate treats such items as not satisfying the tool until a GM clears the flag).

## Persistence & Normalization

`src/systems/GatheringEnvironmentStore.js` gets a `normalizeTool(data)` helper next to `normalizeCatalyst` and a `validateTools(...)` helper next to `validateCatalysts`. `_normalizeTask` adds `tools: Array.isArray(data?.tools) ? data.tools.map(normalizeTool) : []`. `_validateTask` invokes `validateTools` after the catalyst validation. Normalization defaults a missing `requirement` to `null`, `breakage.mode` to `'limitedUses'` with `maxUses: null`, and `onBreak.mode` to `'destroy'`. Unknown enum values fall through to defaults.

No migration runner entry is required.

## Runtime

`src/systems/GatheringEngine.js`:

1. **Start-attempt gate.** Immediately after the catalyst gate, run the tool availability injectable. On failure, return `_blockedStart({ reason: 'TOOL_BLOCKED', data: { taskId, missing, failedRequirements } })`. Add `TOOL_BLOCKED` to `BLOCKED_REASON_KEYS` and mirror the gate in `_taskBlockedReasons` for listing parity.
2. **Terminal plan/apply.** Mirror `_planTerminalCatalysts` / `_applyTerminalCatalysts` with `_planTerminalTools` / `_applyTerminalTools`. The plan increments `timesUsed` for `limitedUses` tools, evaluates breakage, and records evidence. The apply step destroys, flags, or replaces broken tools.
3. **Policy override.** Read `gatheringRules.toolBreakagePolicy` from `GatheringRichStateService.getGatheringRules(systemId)`. When at least one tool broke and the policy is `failureOnBreak` (default), set `outcome.status = 'failed'` and clear `outcome.resultGroups` before the result-creation step. `successDespiteBreak` leaves the outcome untouched. Tool destruction/flagging/replacement always resolves regardless of policy.
4. **Evidence.** Add `usedTools` to the terminal response next to `usedCatalysts`. Surface in `enrichPublicTerminalRun`.

`src/systems/GatheringGateAndCheckEvaluator.js` gains `evaluateRequirement({ requirement, actor, environment, task })` returning `{ allowed: boolean, diagnostic }`. System providers evaluate the formula through the injected `evaluateExpression` and coerce with `Boolean(value)`. Macro providers accept either a bare boolean or `{ allowed, description }`.

`src/main.js` gains two factories near `createGatheringCatalystAvailability` / `createGatheringCatalystUsage`:

- `createGatheringToolAvailability(craftingSystemManager, evaluator)` — checks each tool's component is present in the actor's inventory (ignoring items with `flags.fabricate.toolBroken === true`) and that the optional requirement passes.
- `createGatheringToolBreakage(craftingSystemManager, evaluateExpression)` — exposes `{ plan, apply }`. `plan` runs `Tool.evaluateBreakage` for each matched tool; `apply` runs the increment → evaluate → on-break sequence.

Both inject `evaluateGatheringExpression` so the engine remains system-agnostic.

## UI Editor

`src/ui/svelte/apps/environments/ToolsList.svelte` (new), modeled on `CatalystList.svelte`. Per-row layout:

1. Component picker (same `<select>` as `CatalystList`).
2. Tool requirement via reused `ProviderExpressionInput` (with an "Add requirement" affordance when `requirement` is `null`).
3. Breakage mechanic segmented radio with conditional subform per mode.
4. On-break action radio; when `replaceWith` is selected, a second component picker for `replacementComponentId`.
5. Delete button.

`src/ui/svelte/apps/manager-v2/EnvironmentEditView.svelte` adds a `'tools'` task tab between `'catalysts'` and `'visibility'`, hosts `ToolsList`, threads `addTool`/`updateTool`/`deleteTool`/`toolField` callbacks (parallel to the catalyst equivalents), and maps `tools` paths into the section/tab focus helpers.

## System-Level Setting

`src/ui/svelte/stores/adminStore.js` gains a `GATHERING_TOOL_BREAKAGE_POLICIES` constant, `toolBreakagePolicy: 'failureOnBreak'` in `DEFAULT_GATHERING_RULES`, and a normalization branch in `_normalizeGatheringRules` (unknown values fall back to default).

`src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte` adds a "Tool breakage outcome" `<select>` row immediately after the `hazardPolicy` select, with `failureOnBreak` and `successDespiteBreak` options.

## Localization

New keys cover the tab label, list label, add/delete/empty controls, requirement, breakage modes and per-mode fields, on-break actions and the replacement-component picker, the rules section label and option labels, and the `FABRICATE.Gathering.Blocked.ToolBlocked` reason. The existing `Catalysts / Tools` label is retagged back to plain `Catalysts` to reclaim the word "Tools" for the new section.

## Tests

- `tests/tool-model.test.js` — model defaults, validation matrix, JSON round-trip, `evaluateBreakage` (all three modes with injected `random`/`evaluateExpression`), `applyUsage`, `applyBreakage`.
- `tests/gathering-environment-store-tools.test.js` — legacy `tools: []` normalization, per-rule validation messages, idempotent round-trip.
- `tests/gathering-gate-and-check-evaluator.test.js` — new `evaluateRequirement` cases (truthy/falsy formula, macro happy path, macro misconfiguration).
- `tests/gathering-bootstrap-api.test.js` — coverage of `createGatheringToolAvailability` and `createGatheringToolBreakage` parallel to the catalyst factories.
- `tests/gathering-tool-runtime.test.js` — missing-tool/failed-requirement/`toolBroken` block the start; `failureOnBreak` overrides status and clears results; `successDespiteBreak` preserves success; multi-tool semantics; `usedTools` evidence on terminal response.

## Risks

1. Catalysts currently apply after result creation; tool breakage must roll before result creation so the policy can override success. The terminal pipeline ordering needs careful inspection: planning order is catalysts → tools → success override → results; apply commit runs catalysts → tools → results → failureFeedback.
2. The engine doesn't read gathering rules today. `GatheringRichStateService.getGatheringRules(systemId)` is exposed so the engine can plumb the rules into the terminal pipeline.
3. `breakageChance` semantics are exact (`random() * 100 < breakageChance`); edges (0 never breaks; 100 always breaks) must not be normalized away.
