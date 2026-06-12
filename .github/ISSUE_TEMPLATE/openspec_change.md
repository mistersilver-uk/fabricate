---
name: OpenSpec Change Delta
about: Planning artefact for a non-trivial change — the OpenSpec delta that planning agents iterate on and implementation reconciles against. Usually authored by the orchestrator; create one directly only for prompt-driven work that has no originating issue.
title: ""
labels: ["openspec-change"]
assignees: []
---

<!--
This template captures an OpenSpec change DELTA in a GitHub issue. Deltas are no
longer versioned as files under openspec/changes/ — the issue is the artefact.

Everything an agent owns lives INSIDE the managed block below, between the
`openspec-delta:start` / `openspec-delta:end` markers. Automation rewrites the
block in place (it replaces the content between the markers; it never appends a
second block) and MUST NOT edit anything outside the markers. When this delta is
appended to an existing human-filed issue, the reporter's original text stays
above the block, untouched.

The block is a self-contained consolidation of what used to be proposal.md +
design.md + tasks.md + the optional per-domain spec deltas + roster.md.
-->

<!-- openspec-delta:start v=1 -->
## OpenSpec Change Delta

### Proposal

Problem and motivation, scope, in-scope / out-of-scope, and any decisions already
confirmed with the user.

### Design

Implementation and architecture decisions; dependency boundaries, split points, and
test seams where JavaScript structure is part of the task.

### Tasks

Plain-markdown checklist (do **not** use GitHub sub-issues — keep tasks inside this
block as text so `gh issue view` round-trips cleanly):

- [ ] Phase 1 — …
- [ ] Phase 2 — …

### Spec Deltas

Include this section **only when canonical requirements change.** One subsection per
affected canonical domain, mirroring the canonical-spec delta heading conventions
exactly so the implementation/docs reviewers can compare mechanically against the
real `git diff` of `openspec/specs/`:

#### <domain> (`openspec/specs/<domain>/spec.md`)

##### Added Requirements

##### Modified Requirements

##### Removed Requirements

### Resolved Roster

The agents resolved from the `AGENTS.md` auto-spawn routing table: plan-review,
post-implementation review, and docs-loop roles.

### Verification & Acceptance

Acceptance criteria and the end-to-end verification plan (tests, build, smoke /
screenshot evidence for UI work).

### Deviations

Filled during post-implementation reconciliation. When the shipped canonical-spec
change justifiably differs from what was proposed above, record the difference and
the justification here so the reviewer can confirm the delta accurately describes
what exists.

<!-- openspec-delta:end -->
