# Proposal: Agent persona parity across Codex and Claude

## Problem

The repo's `plan → plan-review → implement → review → docs` workflow ran automatically
only under Codex: the routing tokens in `AGENTS.md` resolved to pre-registered personas in
`.codex/agents/*.toml`. Under Claude those tokens resolved to nothing — `.claude/` held only
`settings.local.json`, and Claude does not auto-discover the top-level `skills/` directory —
so Claude could only emulate the workflow when prompted per task. Each `.codex/agents/*.toml`
also duplicated its `skills/*/SKILL.md` by hand.

## Summary

Make each agent role a single source of truth in `skills/<role>/SKILL.md`, referenced (not
copied) by thin provider bindings on both sides, and register the roles for Claude so the
existing routing table drives the same workflow without per-task prompting.

## Goals

- Claude runs the same iterative workflow and personas as Codex, driven by config.
- One canonical persona per role; `.codex/agents/*.toml` and `.claude/agents/*.md` are thin
  pointers with no divergent behavior.
- Structural enforcement where possible: Claude `tools:` allowlists block agent spawning and
  match each role's Codex sandbox mode; a validator + CI job keep the bindings consistent.
- Progressive disclosure: bindings hold only provider-local metadata and guardrails, then defer
  persona behavior to the skill, which defers to specs / `docs/agents/` notes / sibling skills
  on demand.

## Out of scope

- Wholesale rewrites of the role playbooks; scoped edits are limited to canonical-source
  statements and guidance moved out of provider bindings.
- Changing the Codex GitHub Actions prompts under `.github/prompts/`.
- The read-only `fabricate_pr_explorer` mapping role gains no Claude binding — Claude uses its
  built-in `Explore` agent.
