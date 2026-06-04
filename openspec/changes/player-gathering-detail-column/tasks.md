# Tasks

## Phase 1 — Engine: success chance + revealed-task list
- [ ] `GatheringRichStateService`: add `listRevealedTaskIds({ actor, environmentId, scope })` →
      `string[]` mirroring `countRevealedTasks` (`:708-736`) but returning `Array.from(taskIds)`;
      `[]` on missing state; never throws. Refactor `countRevealedTasks` to delegate to it.
- [ ] `GatheringEngine._taskSuccessChance(task)` → `number|null`: d100-only; `1 − ∏(1 − dropRate/100)`
      over enabled `dropRows`; `null` for non-d100 or no enabled rows.
- [ ] `GatheringEngine._listRevealedTaskIds({ actor, environmentId, scope })`: null-safe wrapper
      mirroring `_countRevealedTasks` (`:940-947`).
- [ ] `GatheringEngine._taskModel(…, forceVisible = false)`: when true skip the opaque early-return;
      add `successChance` to the transparent branch only (never the `blindGather` entry).
- [ ] `GatheringEngine._taskBlockedReasons(…, transparent = false)`: when true, bypass only the
      `_isOpaqueBlindTask` data-redaction so revealed rows carry real weather/time/tool data.
- [ ] `GatheringEngine._buildEnvironmentListing`: stash `{task, visibility, blockedReasons}`; emit
      `discoveredTasks` (blind non-GM, reveal≠never) + collapse `tasks` to the single opaque entry;
      `discoveredTasks: []` for targeted and blind-GM.
- [ ] Tests — `tests/gathering-engine-listing.test.js`:
  - [ ] successChance ≈0.75 (two 50% d100 rows); `null` for non-d100; ignores disabled rows; `null`
        with no enabled rows.
  - [ ] blind non-GM (reveal `onAttempt`, stub `listRevealedTaskIds(['task-b'])`) →
        `tasks=[blindGather]`, `discoveredTasks=[task-b]`, no id/successChance leak on blind entry,
        `discoveredTasks.length === discoveredTaskCount`.
  - [ ] blind + reveal `never` → `discoveredTasks=[]`; blind GM → real `tasks`, `discoveredTasks=[]`.
  - [ ] no unrevealed-task leak in `discoveredTasks`.
- [ ] Tests — `tests/gathering-rich-library.test.js`: `listRevealedTaskIds` per scope
      (actor/user/global + `party`→actor); `countRevealedTasks === listRevealedTaskIds(...).length`.
- [ ] `npm test` + `npm run build`.

## Phase 2 — App wiring + components + i18n
- [ ] `SvelteFabricateApp.svelte.js`: add `startGatheringAttempt` to `_buildServices()`.
- [ ] `GatheringView.svelte`: derive `selectedEnvironment`; render `<GatheringDetail>` in the center
      column (drop `aria-hidden`).
- [ ] New `GatheringDetail.svelte`: empty hint; header (title, info pips, description, mode hint);
      blind branch (Attempt gathering + Discovered Tasks list); targeted branch (prominent task
      list); pagination; wired attempt handler with `busy` guard + re-fetch.
- [ ] New `GatheringTaskRow.svelte`: image + blocked lock overlay; name/description; blocked-reason
      lines; `SuccessChanceBar`; Attempt button; stable `data-*` hooks.
- [ ] New `SuccessChanceBar.svelte`: `role="meter"` fill bar; renders nothing when value null.
- [ ] `lang/en.json`: add `FABRICATE.App.Gathering.Detail.*` keys (copy in design.md).
- [ ] Component test — `tests/components/gathering-detail-mounted.test.js` (add
      `startGatheringAttempt` to `makeServices`): empty hint; targeted rows + success bar + blocked
      info; blind Attempt + Discovered (x/y) + discovered rows; attempt click wiring + re-fetch;
      blind attempt omits `taskId`.
- [ ] `npm test` + `npm run build`.

## Phase 3 — Smoke harness + screenshots + docs
- [ ] `scripts/foundry-test-run.mjs`: `waitFor` `[data-gathering-detail]` (+ state off `"empty"`
      after selection) before the gathering screenshot; register the new stable hooks.
- [ ] Produce real smoke-run screenshots of the gathering tab detail column; embed in the PR
      (`screenshots:ui:plan` → `test:foundry` → `screenshots:ui` → `screenshots:ui:publish` →
      `screenshots:ui:clean`).
- [ ] Docs loop: JSDoc on changed engine/RichState methods; update player-listing field docs with
      `successChance` + `discoveredTasks`; confirm no canonical spec edit needed.
