# Proposal: Require Agent Work Through Branches and PRs

## Summary

Make the branch, commit, and PR workflow explicit across Fabricate agent and skill instructions so future agent work does not happen directly on `main`.

## Problem

The root guidance only prohibited direct commits to `main`; individual agent and skill files did not consistently require agents to create a task branch, commit there, open a PR to `main`, and update the same PR for review feedback.

## Scope

- Update `AGENTS.md`, custom agent prompts, Fabricate role skills, and the canonical agentic workflow spec.
- Distinguish mutating roles from read-only review roles.
- Require PR titles to comply with Conventional Commits, including issue numbers for `feat`, `fix`, and `perf`.
- Require a shared PR description template with H2 sections for Description, Benefit(s), Changes in this PR, Testing, and Screenshots (if applicable).
- Keep the workflow rule concise and reusable rather than embedding task-specific behavior.

## Out of Scope

- Changing runtime code, tests, release automation, or GitHub branch protection settings.
