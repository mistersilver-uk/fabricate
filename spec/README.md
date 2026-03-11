# Fabricate Specifications

This directory contains the authoritative design specifications for Fabricate.

## Specification Index

- `001-overview.md` - project overview and architecture
- `002-data-models.md` - schemas, contracts, and persistence
- `003-ui-integration.md` - Foundry UI integration and workflows
- `004-resolution-modes.md` - mode semantics and mode validation
- `005-recipes-and-steps.md` - recipe structure and execution lifecycle
- `006-recipe-visibility.md` - visibility, knowledge gating, and learning
- `007-destructive-changes-and-migrations.md` - destructive changes and clean-up/migration policy
- `008-integrations.md` - third-party module integration requirements
- `009-gathering-and-harvesting.md` - environment gathering and harvesting boundaries

When files overlap, behaviour specs (`004`-`009`) override summary text in `001` and UI text in `003`.

## Specification-Driven Development

- Implementations must conform to the spec.
- Tests must validate specified behaviour.
- Behaviour changes must start as spec changes.
