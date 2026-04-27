# Recipes and Steps Delta

## MODIFIED Requirements

### Requirement: Final-step success is terminal

Successful completion of the last executable recipe step MUST end the crafting run.

1. For implicit single-step recipes, successful craft resolution MUST complete the only step and immediately transition the run to terminal `succeeded` history.
2. For explicit multi-step recipes, successful resolution of the last step MUST immediately transition the run to terminal `succeeded` history.
3. After final-step success, no actor crafting app workflow may resume, cancel, or restart that same run ID as though it were still active.
4. Starting a fresh craft for the same recipe after successful completion MUST create a new run ID when run tracking is needed; it MUST NOT reuse the completed run ID.
5. Repairing a completed run into history MUST preserve newest-first history ordering and MUST continue to enforce the canonical 50-entry history cap.
6. Resume-by-run-ID requests for terminal or internally completed runs MUST fail closed before ingredient consumption, result creation, macro execution, run cancellation, or fresh-run restart behavior.
