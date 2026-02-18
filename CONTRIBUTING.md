# Contributing to Fabricate v2

## Development Workflow

### Mandatory Process for ALL Code Changes

**All code changes must follow this spec-first workflow:**

1. **Read the Specification** – Start by reading the relevant spec file(s) in `spec/` directory
2. **Update the Specification** – Propose changes to the spec that reflect the planned changes
3. **Await Approval** – Wait for a maintainer to accept the spec updates before proceeding
4. **Implement** – Write code following the updated specification
5. **Reference Specs** – Link to relevant spec sections during implementation (e.g., `spec/002-data-models.md`)

### Specifications

All technical specifications are located in the `spec/` directory.
These are living documents that define system behaviour before implementation.

See `spec/README.md` for:

- Specification structure
- List of all spec files
- How to read and use specifications

### Specification-Driven Development

We follow a **spec-driven approach** for development with Agents:

- **Specifications define behaviour** – Features are specified before implementation
- **Code implements specs** – Implementation follows the specification
- **Specs are living documents** - Updated as features evolve
- **Specs guide testing** – Test scenarios are derived from specifications

This ensures consistency, maintainability, and clear documentation of system behaviour.
