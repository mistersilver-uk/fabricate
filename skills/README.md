# Shared Skills

This directory is the canonical shared skill root for this repository.

Each skill directory follows the Agent Skills layout:

- `SKILL.md`
- `scripts/` when executable helpers are needed
- `references/` for supporting docs
- `assets/` for templates or other resources
- `agents/` for provider-specific metadata such as `openai.yaml`

## Shared Repo Utilities

- Latest module versions: use `node scripts/latest-module-versions.mjs --profile fabricate-beta` from the repo root to query the current latest beta manifests for Fabricate plus sibling premium modules; substitute another `--profile <name>` when needed.
The script uses exact S3 manifest reads rather than bucket listing, and supports `--json`, repeated `--include <moduleId>`, `--channel <name>`, `--bucket <name>`, `--premium-config <path>`, and `--no-premium`.
