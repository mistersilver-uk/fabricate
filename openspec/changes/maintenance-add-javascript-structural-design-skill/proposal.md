# Proposal: Add JavaScript Structural Design Skill

## Summary

Add a shared skill that distills Elegant Objects and Miško Hevery's testability guidance into pragmatic JavaScript structure rules for Fabricate, then wire it into the implementation, review, quality, and orchestration flows.

## Motivation

- The repo already has strong runtime and Foundry-specific guidance, but it lacks a canonical structure/testability reference for JavaScript design decisions.
- Agents need consistent heuristics for collaborator boundaries, constructors, global state, and responsibility splits.
- Review guidance should detect structural patterns that make code harder to read, change, and test before they turn into defects.

## Scope

- create `skills/javascript-structural-design/`
- add source-derived reference notes for Elegant Objects and `guide-to-testable-code`
- reference the skill from relevant local skills, agent configs, prompts, and repo guidance
- align OpenSpec planning and review handoff text with the new structural rules

## Out Of Scope

- refactoring runtime code to comply with the new skill
- adding lint rules or automated enforcement
- adopting every Elegant Objects rule literally in JavaScript
