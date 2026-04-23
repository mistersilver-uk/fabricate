# Proposal: Remove Legacy Repo Shims

## Summary

Remove the remaining repo-level compatibility shims for planning, specs, and provider-local skill roots so Fabricate uses only canonical `openspec/` and `skills/` paths.

## Motivation

- The compatibility layer is now the main source of stale references and onboarding confusion.
- Provider-local skill symlinks and legacy spec links no longer add value once prompts, docs, and tests use canonical paths directly.
- Keeping deprecated repo-level bridges around makes future cleanup and automation harder.

## Scope

- update docs and tests to use canonical `openspec/` and `skills/` paths
- remove root `PLAN.md`
- remove the legacy `spec/` compatibility directory contents
- remove provider-local skill symlink roots under `.codex/`, `.claude/`, and `.opencode/`

## Out Of Scope

- runtime backward-compatibility aliases in product code or tests
- historical OpenSpec change records that mention the migration work
- changes to external agent tooling outside this repository
