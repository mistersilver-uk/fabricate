# Fabricate OpenSpec

Fabricate uses OpenSpec as the planning and specification system of record for non-trivial work.

## Layout

- `openspec/specs/*/spec.md` - canonical product and workflow specifications
- `openspec/changes/<change>/proposal.md` - why the change exists
- `openspec/changes/<change>/design.md` - implementation and architecture decisions
- `openspec/changes/<change>/tasks.md` - concrete execution checklist
- `openspec/changes/<change>/specs/<domain>/spec.md` - optional per-change spec deltas when the change updates a canonical domain

## Rules

- Edit canonical specifications in `openspec/specs/`.
- For non-trivial work, create or update a change folder before implementation.
- Keep change folders issue-scoped when possible.
- Treat only `openspec/` paths as canonical. Do not rely on repo-level compatibility aliases.
