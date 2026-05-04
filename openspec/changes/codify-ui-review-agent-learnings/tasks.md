# Tasks

- [x] Create proposal and design for codifying UI review learnings.
- [x] Update custom Fabricate agent prompts.
- [x] Update shared Fabricate skills and Playwright guidance.
- [x] Run lightweight validation for formatting/parsing.
- [x] Record validation results.

## Follow-up: Manager V2 Session Learnings

- [x] Add concise agent guidance for spec-first UI decisions and Foundry harness caveats.
- [x] Add matching shared skill guidance without copying product rules into every skill.
- [x] Move manager-v2 behavioral contracts into canonical UI/design docs.
- [x] Validate instruction/config formatting and whitespace.

## Validation

- `python3 - <<'PY' ... tomllib ... PY` parsed all `.codex/agents/fabricate-*.toml` files successfully.
- `ruby -e 'require "yaml"; Dir["skills/*/agents/openai.yaml"].sort.each { |f| YAML.load_file(f) }'` parsed skill OpenAI metadata successfully.
- `git diff --check -- .codex/agents skills openspec/changes/codify-ui-review-agent-learnings openspec/changes/fabricate-ui-design-system-manager-v2 openspec/specs/agentic-workflow/spec.md openspec/specs/ui-integration/spec.md` passed.
