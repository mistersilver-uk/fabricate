# Design: Remove Legacy Repo Shims

## Decisions

1. `openspec/specs/*/spec.md` remains the only durable spec location.
2. `skills/` remains the only shared skill root tracked in the repo.
3. Provider-specific notes should point directly at `skills/` rather than relying on local symlink discovery roots.
4. Historical OpenSpec change records are preserved as history, even when they mention now-removed compatibility bridges.

## Tradeoffs

- Removing the compatibility links may break unmaintained local habits or scripts that still assume `PLAN.md` or `spec/`.
- Updating vendored skill docs creates a small divergence from upstream, but keeps repo-local guidance accurate.
- Empty provider directories may remain after symlink removal unless explicitly cleaned up.

## Validation

- verify no active docs, tests, or prompts still reference repo-level `PLAN.md` or `spec/`
- verify no active docs still point skill consumers at `.codex/skills`, `.claude/skills`, or `.opencode/skill`
- verify the repo still documents `openspec/` and `skills/` as canonical
