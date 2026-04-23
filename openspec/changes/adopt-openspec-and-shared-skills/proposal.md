# Proposal: Adopt OpenSpec And Shared Skills

## Summary

Move Fabricate from a root `PLAN.md` plus provider-local skill copies to a canonical OpenSpec structure with shared reusable skills.

## Motivation

- `PLAN.md` is a stale singleton and cannot safely represent concurrent or historical change intent.
- The old `spec/` directory was canonical in practice, but it did not model per-change planning.
- Provider-local skill trees encouraged drift and duplicated maintenance.

## Scope

- create the `openspec/` structure
- move canonical specs under `openspec/specs/`
- add a canonical `skills/` directory
- repoint provider-specific skill roots to `skills/`
- install `playwright-skill` and `review-implementing`
- update repo guidance, prompts, and local agent instructions

## Out Of Scope

- changing runtime Fabricate behaviour
- adding more external skills than requested
- redesigning the GitHub Actions orchestration model
