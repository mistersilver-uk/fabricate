---
layout: default
title: Architecture Decisions
nav_order: 17
has_children: true
---

# Architecture Decisions

Architecture Decision Records (ADRs) capture choices that are expensive to reverse: storage
formats, module boundaries, integration contracts with Foundry, and anything a future maintainer
would otherwise have to re-derive from the code.

An ADR is written to be **disagreed with on the evidence**.
Each one states the options that were considered, the criterion that would have killed each one,
what was actually measured, on which generator and at what scale, and — just as importantly — what
was *not* measured and why.
A recommendation without its risks named is an advertisement, not a decision record.

Records are numbered in the order they were opened and are never renumbered.
A superseded record stays in place with a note pointing at the record that replaced it, because the
reasoning that was current at the time is the thing worth keeping.

| Record | Status | Subject |
|:-------|:-------|:--------|
| [0001 — Granular crafting-definition persistence]({% link adr/0001-granular-crafting-definition-persistence.md %}) | **Superseded by 0003** — its own kill criterion fired at every measured corpus size | Where Fabricate stores recipes and crafting systems |
| [0002 — Fabricate Premium companion architecture]({% link adr/0002-fabricate-premium-companion-architecture.md %}) | Accepted — D6-a and a premium-hosted player window, neither of which this record recommended | How the free module and a paid companion are built, licensed, coupled, distributed and verified |
| [0003 — Whole-array crafting-definition storage]({% link adr/0003-whole-array-crafting-definition-storage.md %}) | Accepted — whole-array storage, one `world` setting key per entity class | Supersedes 0001 on live-client measurement, and leaves the compendium option open |
