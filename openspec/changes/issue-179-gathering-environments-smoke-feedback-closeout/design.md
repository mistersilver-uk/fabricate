# Design: Issue #179 Gathering Environments Smoke Feedback Closeout

## Smoke Harness Strategy

The Foundry smoke harness remains the runtime screenshot seam. It can create deterministic fixture actors, items, crafting systems, gathering environments, roll tables, macros, scenes, tokens, and gathering attempts through Foundry and Fabricate public APIs, then drive the visible application shells for screenshots.

The first implementation slice should prefer adding clear helper functions inside `scripts/foundry-test-run.mjs` over extracting a new harness module. The current script is already the executable contract used by `npm run test:foundry`, and keeping the first expansion in place avoids module-loading drift in the container.

Each gathering smoke phase should:

- create deterministic data with explicit names
- assert visible UI state before screenshots
- dismiss global Foundry notifications before screenshots
- push a distinct `results.steps` entry so failures identify the broken gathering state
- use screenshot labels that name the application and state

## Fixture Decisions

- Use one gathering-enabled system with managed components already created by the smoke script.
- Keep the existing GM validation fixture, but add player-safe runnable environments separately so invalid admin screenshots do not block player attempts.
- Use progressive `dnd5e` checks with deterministic formulas such as `20` and `1` for success/failure where possible.
- Use immediate tasks for feedback/history screenshots.
- Use timed tasks with short minute requirements for active-run screenshots, then advance Foundry world time to trigger completion.
- Use a scene-linked environment with a missing scene UUID for blocked scene/token screenshots.
- Use a catalyst-gated task and select an actor that lacks the catalyst for catalyst-blocked screenshots.
- Use a blind environment for non-GM redaction screenshots. Real task names, task ids, result details, catalyst details, diagnostics, and check internals must not appear for non-GM users.

## Screenshot Review Workflow

After the first expanded `npm run test:foundry` pass:

1. Collect generated screenshot paths from `test-results/`.
2. Ask UX, QA, and domain reviewers to inspect the relevant screenshots.
3. Convert accepted findings into tasks in `tasks.md`.
4. Record rejected or deferred findings with a reason.
5. Require sign-off from UX, QA, and domain reviewers before implementation starts for product UI fixes.

## Review Criteria

UX review should focus on layout, hierarchy, wrapping, spacing, button ergonomics, empty states, blocked states, and narrow Foundry window behavior.

QA review should focus on coverage completeness, deterministic assertions, reproducibility, meaningful failure diagnostics, and screenshot naming.

Domain review should focus on targeted vs blind semantics, scene gating, catalyst gating, timed run lifecycle, feedback/history behavior, and absence of harvesting-specific runtime surfaces.

## Risks

- The existing Foundry smoke script is large. Keep helper names concrete and steps independently reported.
- Live Foundry screenshots can drift with Foundry chrome and async rendering. Wait on Fabricate selectors rather than arbitrary timeouts whenever practical.
- Non-GM redaction needs a real non-GM viewer; GM screenshots are not sufficient evidence.
- Broadening smoke coverage may expose pre-existing harness instability. Treat harness failures as implementation defects if they block #179 evidence collection.

