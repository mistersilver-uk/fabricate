# Shared Skills

This directory is the canonical shared skill root for this repository.

Each skill directory follows the Agent Skills layout:

- `SKILL.md`
- `scripts/` when executable helpers are needed
- `references/` for supporting docs
- `assets/` for templates or other resources
- `agents/` for provider-specific metadata such as `openai.yaml`

## Skill authoring conventions

A SKILL.md is loaded whole into a subagent's context, so its token cost is paid on every spawn.

- Keep the SKILL.md core at or under 150 lines; put depth, recipes, and code samples in `references/*.md` that the SKILL.md points at for the specific situation.
- No generic language-teaching or imported boilerplate content; every section must be specific to this repository's stack and workflow.
- Every backtick-quoted repository path must exist — `npm run validate:agents` fails CI on a missing path (an intentionally absent path needs an entry in the validator's allow-missing set with a reason).
- Cite code by symbol name and file path, never by line number; the same validator rejects `file.js:NNN`-style citations.
- A PR description template must include the `Closes #<issue>` closing-keyword line inside its `Description` section.
- Write one sentence per line (`npm run lint:md` enforces it).
- Instructions must be mechanical: state the trigger condition and the default instead of "when feasible" or "where practical".

## Shared Repo Utilities

- Latest module versions: use `node scripts/latest-module-versions.mjs --profile fabricate-beta` from the repo root to query the current latest beta manifests for Fabricate plus sibling premium modules; substitute another `--profile <name>` when needed.
The script uses exact S3 manifest reads rather than bucket listing, and supports `--json`, repeated `--include <moduleId>`, `--channel <name>`, `--bucket <name>`, `--premium-config <path>`, and `--no-premium`.
