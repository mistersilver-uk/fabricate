# Design: Gathering Task Tools

## Data Model

The `Tool` model and the per-system Tools library are delivered in `gathering-tools-page`. Tasks reference library tools by id (`task.toolIds: string[]`, normalized in both `_normalizeGatheringTask` and runtime `normalizeLibraryTask`). There is no inline `tools: Tool[]` array on tasks; the library is the single source of truth.

The `Tool` model lives at `src/models/Tool.js`:

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

Tasks store `toolIds: string[]`. Both `_normalizeGatheringTask` (`src/ui/svelte/stores/adminStore.js`) and the runtime `normalizeLibraryTask` (`src/systems/GatheringRichStateService.js`) coerce each id to a trimmed string and drop empties; missing field normalizes to `[]`. Library Tool authoring/validation already lives in the Tools page from `gathering-tools-page`.

No migration runner entry is required.

## Runtime

`src/systems/GatheringEngine.js`:

1. **Reference resolution.** For each `taskId in task.toolIds`, resolve `environment.__libraryTools.get(toolId)`. Ids that miss the library are logged and dropped (mirrors the editor's stale-chip behaviour); resolved Tool objects feed every subsequent stage.
2. **Start-attempt gate.** Immediately after the catalyst gate, run the tool availability injectable across the resolved tools. On failure, return `_blockedStart({ reason: 'TOOL_BLOCKED', data: { taskId, missing, failedRequirements } })`. Add `TOOL_BLOCKED` to `BLOCKED_REASON_KEYS` and mirror the gate in `_taskBlockedReasons` for listing parity.
3. **Terminal plan/apply.** Mirror `_planTerminalCatalysts` / `_applyTerminalCatalysts` with `_planTerminalTools` / `_applyTerminalTools`, again over the resolved tools. The plan increments `timesUsed` for `limitedUses` tools, evaluates breakage, and records evidence. The apply step destroys, flags, or replaces broken tools.
4. **Policy override.** Read `gatheringRules.toolBreakagePolicy` from `GatheringRichStateService.getGatheringRules(systemId)`. When at least one tool broke and the policy is `failureOnBreak` (default), set `outcome.status = 'failed'` and clear `outcome.resultGroups` before the result-creation step. `successDespiteBreak` leaves the outcome untouched. Tool destruction/flagging/replacement always resolves regardless of policy.
5. **Evidence.** Add `usedTools` to the terminal response next to `usedCatalysts`. Surface in `enrichPublicTerminalRun`.

`src/systems/GatheringGateAndCheckEvaluator.js` gains `evaluateRequirement({ requirement, actor, environment, task })` returning `{ allowed: boolean, diagnostic }`. System providers evaluate the formula through the injected `evaluateExpression` and coerce with `Boolean(value)`. Macro providers accept either a bare boolean or `{ allowed, description }`.

`src/main.js` gains two factories near `createGatheringCatalystAvailability` / `createGatheringCatalystUsage`:

- `createGatheringToolAvailability(craftingSystemManager, evaluator)` — checks each tool's component is present in the actor's inventory (ignoring items with `flags.fabricate.toolBroken === true`) and that the optional requirement passes.
- `createGatheringToolBreakage(craftingSystemManager, evaluateExpression)` — exposes `{ plan, apply }`. `plan` runs `Tool.evaluateBreakage` for each matched tool; `apply` runs the increment → evaluate → on-break sequence.

Both inject `evaluateGatheringExpression` so the engine remains system-agnostic.

## UI Editor

Already shipped in `gathering-tools-page`: the per-system Tools page (`ToolsBrowserView.svelte`) authors tools, and `GatheringTaskEditView.svelte` exposes a `Required Tools` section that searches the library and adds/removes references on `task.toolIds`. No additional editor surfaces are needed for this change.

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
