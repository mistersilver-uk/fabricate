# Add Theme Colour Management

## Summary

Add a module-level theme selector for Fabricate UI colours. Preserve the current dark green product palette as `Mythwright`, introduce the supplied peach/sage dark palette as `Fabricate`, and make `Fabricate` the default theme for new users.

## Motivation

Fabricate's product UI colours are currently centralized in `--fab-*` tokens but are not selectable by users, and some component-local CSS still embeds literal colour values. A theme layer lets the module evolve visual identity without scattering colour decisions through Svelte components or Foundry integration code.

## Scope

- Register a global configurable module setting for the active Fabricate theme.
- Apply the selected theme to Fabricate UI by setting a stable document-level theme attribute.
- Define `Fabricate` and `Mythwright` CSS token palettes.
- Keep existing UI structure, spacing, typography, and workflow behavior unchanged.
- Replace product UI CSS colour literals with theme tokens or reusable semantic variables.
- Add tests for setting registration, theme application, palette tokens, and the no-literal-colours contract.

## Out of Scope

- Per-user custom colour editing.
- Additional themes beyond `Fabricate` and `Mythwright`.
- Reworking layouts, icons, copy, or feature behavior.
- Changing Foundry compatibility metadata.

## Acceptance Criteria

- The module settings UI exposes a dropdown named `FABRICATE.Settings.Theme.Name`.
- The setting defaults to `fabricate`, with dropdown choices `Fabricate` and `Mythwright`.
- Selecting a theme updates the active theme without requiring a reload.
- `Fabricate` uses the supplied palette values:
  - backgrounds: `#111A23`, `#15212B`, `#1B2833`, border `#2C3B49`
  - text: `#F1D1B5`, `#D9B89C`
  - accents: `#E8C6A7`, `#9AB89C`, `#A9C7AA`, `#B97C78`
  - tags: `#BFD5C3`, `#B9D3DD`, `#CEC1E6`, `#E4C0CD`, `#EBC8B3`, `#E7DBB1`, `#B9DDD7`, `#D8BED4`
- `Mythwright` preserves the current `--fab-*` product palette as a selectable theme.
- Product UI CSS colours are declared through theme tokens or semantic reusable tokens, with tests preventing new literal colour values outside token declarations.
