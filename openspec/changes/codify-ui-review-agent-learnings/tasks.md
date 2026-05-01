# Tasks

- [x] Create proposal and design for codifying UI review learnings.
- [x] Update custom Fabricate agent prompts.
- [x] Update shared Fabricate skills and Playwright guidance.
- [x] Run lightweight validation for formatting/parsing.
- [x] Record validation results.

## Validation

- `python3 -c "... tomllib ..."` parsed all `.codex/agents/fabricate-*.toml` files successfully and confirmed skill metadata keys are present.
- `git diff --check -- .codex/agents skills openspec/changes/codify-ui-review-agent-learnings` passed.
- `rg` inspection confirmed the new guidance covers screenshot criteria, pointer hit-testing, generic Foundry state-class collisions, linked-image fixtures, and fallback-image gaps.
- Validation commands were run with escalation because the sandbox wrapper failed before shell execution with `unexpected argument '--sandbox-policy'`; no production code or external network access was used.
