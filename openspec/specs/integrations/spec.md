# Spec 008 — Module Integrations

## Purpose

Define the requirements for Fabricate integrations with third-party Foundry modules.
Integrations must be automated, transparent, and require zero user-authored macros or scripts.

## Principles

1. **Automated, not scripted.** An integration means Fabricate detects a companion module, reads its data through its API, and wires behaviour automatically.
Users must never be required to write, paste, or maintain macros to make two modules work together.
2. **Opt-in via system settings.** Each integration is gated behind a crafting-system-level toggle (e.g. `features.itemPiles`).
When the toggle is off, Fabricate must have zero runtime interaction with the companion module.
3. **Graceful absence.** If the companion module is not installed or not active, the integration toggle must be hidden or disabled in the UI and Fabricate must behave as if the integration does not exist.
No errors, no warnings, no degraded paths.
4. **No duplicate data entry.** If a companion module already stores a piece of data (e.g. currency denominations, merchant stock lists, container contents), Fabricate must read it from the companion module's API rather than asking the user to re-enter it in Fabricate's own settings.
5. **Behaviour, not documentation.** A macro example in a docs page is not an integration.
An integration is shipped code that automates a workflow end-to-end.

## Integration contract

Every integration must satisfy the following before it ships:

| # | Requirement                                                                            | Rationale                                                                            |
|---|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| 1 | A system-level feature toggle controls the integration.                                | Users who do not use the companion module must not be affected.                      |
| 2 | Fabricate detects whether the companion module is installed and active at startup.     | Prevents errors when the module is absent.                                           |
| 3 | All data exchange uses the companion module's public API.                              | Avoids coupling to internal implementation details that may change between versions. |
| 4 | The integration requires zero user-authored macros, scripts, or manual data wiring.    | Macros are a support burden and a UX anti-pattern for integrations.                  |
| 5 | The integration is covered by unit tests that mock the companion module's API surface. | Ensures the integration can be tested without the companion module installed.        |
| 6 | A compatibility range is documented (minimum companion module version).                | Prevents silent breakage when the companion module updates.                          |
| 7 | The integration degrades cleanly if the companion module's API changes.                | Version-gated feature detection, not hard crashes.                                   |

## Planned integrations

The following integrations are candidates.
Each must meet the contract above before implementation begins.

| Companion module | Integration scope                                                                                                               | Status      |
|------------------|---------------------------------------------------------------------------------------------------------------------------------|-------------|
| Item Piles       | Currency costs as a crafting requirement; merchant stock as ingredient source; container contents as crafting-station inventory | Not started |
| Simple Calendar  | Time-gate progression tied to in-world calendar advancement                                                                     | Not started |

## Testing requirements

1. Each integration must include unit tests that mock the companion module's API and verify the full automated workflow.
2. Tests must cover: module-absent path, module-present-but-toggle-off path, and module-present-and-toggle-on happy path.
3. Tests must verify that no user-authored macros or scripts are required at any point in the workflow.
4. Integration-specific error handling must be tested for API version mismatches and missing expected API methods.
