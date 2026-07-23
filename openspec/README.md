# Fabricate OpenSpec

Fabricate uses OpenSpec as the planning and specification system of record for
non-trivial work.

## Layout

- `openspec/specs/*/spec.md` — canonical product and workflow specifications.
These
  are the **only** versioned spec source of truth.

Per-change planning **deltas are no longer versioned in git.** They live in the
GitHub issue for the work (see below), not under `openspec/changes/`.

## Change deltas live in GitHub Issues, not git

The per-change OpenSpec delta — what used to be
`openspec/changes/<change>/{proposal,design,tasks}.md` plus optional
`specs/<domain>/spec.md` deltas — is now a managed block in the **issue body**.
It is
the artefact planning agents author and iterate on, and it is what implementation
reconciles the canonical specs against.

- When work originates from an existing issue, the orchestrator **appends** the delta
  block to that issue, leaving the reporter's original text untouched above it.
- When work originates from a prompt with no issue, the orchestrator **creates** a new
  issue from the `OpenSpec Change Delta` template
  (`.github/ISSUE_TEMPLATE/openspec_change.md`).

### The managed delta block

```md
<!-- openspec-delta:start v=1 -->
## OpenSpec Change Delta

### Proposal
### Design
### Tasks                  <!-- every entry declares a `Lane surface:` field -->
### Spec Deltas            <!-- only when canonical requirements change -->
### Resolved Roster
### Verification & Acceptance
### Deviations             <!-- filled during reconciliation -->
<!-- openspec-delta:end -->
```

Rules:

- Agents rewrite the block **in place** — replace the content between the markers; never
  append a second block, and never edit anything outside the markers.
- `### Spec Deltas` mirrors the canonical-spec delta headings (`##### Added Requirements`
  / `##### Modified Requirements` / `##### Removed Requirements`, per domain) so reviewers
  can compare it mechanically against the real `git diff` of `openspec/specs/`.
- Every `### Tasks` entry ends with a literal `Lane surface: new-module | new-export | persisted-shape | none` field.
It is authored at plan time so the driver can read it as a lookup when it selects a model tier for that lane's spawn (rule 2 of the ladder in `AGENTS.md`).
A delta that omits it leaves that input permanently unavailable, so every lane defaults up to the `medium` model tier.
- If `gh` is unavailable, an agent returns the delta block in its text output for the
  driver/user — there is no longer a versioned file to drop it in.

> **Two separate managed-block conventions exist.** This `openspec-delta` block lives in
> the **issue** body.
The UI-screenshot managed block (patched by
> `npm run screenshots:ui:publish`) lives in the **PR** body.
They are unrelated; do not
> conflate them.

## Implementation and reconciliation

1. The implementer reads the delta via `gh issue view` and makes the canonical spec
   changes it requires under `openspec/specs/`, alongside code and tests.
2. Post-implementation review and the docs loop **reconcile** the actual canonical-spec
   diff against the proposed delta in the issue: either the implementation is a faithful
   realization of the delta, or — when implementation justifiably deviated — the issue's
   delta (and its `### Deviations` note) is updated so it accurately describes what
   shipped.

## Rules

- Edit canonical specifications in `openspec/specs/`.
- Capture the per-change delta in the issue, not in versioned files.
- Treat only `openspec/specs/` paths as canonical.
Do not rely on repo-level
  compatibility aliases.
