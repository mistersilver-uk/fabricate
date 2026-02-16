# Fabricate Specifications

This directory contains the authoritative design specifications for Fabricate.

Fabricate is a system-agnostic crafting module for Foundry VTT.
The spec is intended to be implementable, testable, and stable enough to drive development without relying on “tribal knowledge”.

## Specification Index

- **001-overview.md** — Project overview, goals, architecture, and storage model
- **002-data-models.md** — Data models, validation rules, and macro contracts
- **003-ui-integration.md** — UI integration points and user workflows
- **004-resolution-modes.md** — Resolution-mode semantics (simple/mapped/tiered/progressive)
- **005-recipes-and-steps.md** — Multi-step recipe process model and execution semantics
- **006-requirements-time-and-currency.md** — System-agnostic time/currency requirements and providers
- **007-destructive-changes-and-migrations.md** — Destructive operations and migration rules

## Specification-Driven Development

We follow a spec-driven approach:

- Implementations must conform to the spec.
- Automated tests must validate the behaviour described in the spec.
- Changes to behaviour must start life as spec changes.

## Terminology

- **Crafting System**: A GM-configured “rule system” that owns feature toggles and core behaviour.
- **Recipe**: A multi-step process within a crafting system.
- **Step**: One stage of a recipe with its own requirements and results.
- **Resolution Mode**: A crafting-system-level rule that controls how step results are selected.
