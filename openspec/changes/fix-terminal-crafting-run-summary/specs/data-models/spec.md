# Data Models Delta

## MODIFIED Requirements

### Requirement: Crafting run active/history consistency

Crafting run persistence MUST keep terminal runs out of active run storage and MUST provide reader-side protection against malformed or stale actor flags.

1. `Actor.flags.fabricate.craftingRuns.active` MUST contain only runs whose `status` is `inProgress` or `waitingTime`.
2. `Actor.flags.fabricate.craftingRuns.history` MUST contain only runs whose `status` is `succeeded`, `failed`, or `cancelled`.
3. When the final step of a crafting run succeeds, the run MUST become terminal with `status: "succeeded"`, `currentStepIndex: null`, `finishedAt` set, and all successful step result metadata preserved before it is removed from `active`.
4. Reader-facing run APIs used by the actor crafting app MUST NOT expose terminal-status runs as active runs, even if malformed persisted data still contains them under `active`.
5. When reader-facing run APIs or actor app preparation encounter a terminal-status run under `active`, they MUST canonicalize it into `history` when persistence repair is available, or otherwise present it as terminal history for that refresh.
6. A run whose executable steps are all `succeeded` MUST be treated as terminal even if its run-level status still says `inProgress`.
7. Internally completed runs found under `active` MUST be canonicalized into terminal `succeeded` history when persistence repair is available, or otherwise presented as terminal history for that refresh.
8. Internally completed runs MUST NOT be treated as cancellable, restartable, or continuable merely because their run-level status still says `inProgress`.
9. Active-run lookup APIs MUST NOT return terminal or internally completed runs as actionable active runs.
10. Cancelling an internally completed run MUST NOT create a new `cancelled` history entry, overwrite the successful history outcome, or remove successful result metadata.
11. Automated coverage MUST include a malformed actor flag where a terminal-status run exists only under `active`; reader-facing behavior MUST produce no actionable active run and MUST preserve or present the run as terminal history.
12. Automated coverage MUST include a malformed actor flag where an `inProgress` run has all executable steps `succeeded`; reader-facing behavior MUST produce no actionable active run and MUST preserve or present the run as terminal `succeeded` history.
