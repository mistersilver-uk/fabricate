# UI Integration Spec Delta

## ADDED Requirements

### Requirement: Expanded Theme Library

Fabricate MUST expose a global module setting that selects the active product UI colour theme from the supported preset library.

#### Scenario: Theme catalog includes all supported presets

- **GIVEN** Fabricate settings are registered
- **WHEN** a user opens the theme dropdown
- **THEN** the choices include `Fabricate`, `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and `Foundry Native`
- **AND** the default stored theme id is `fabricate`

#### Scenario: Unknown stored values fall back safely

- **GIVEN** a stored theme id that is missing or unsupported
- **WHEN** Fabricate resolves the active theme
- **THEN** it falls back to `fabricate`

#### Scenario: Foundry Native is fixed

- **GIVEN** a user selects `Foundry Native`
- **WHEN** Fabricate applies the theme
- **THEN** the module uses Fabricate-owned fixed tokens inspired by Foundry's default visual language
- **AND** the palette does not dynamically track Foundry runtime CSS, the active Foundry theme, or third-party Foundry skins

### Requirement: Live Theme Updates For Open Windows

Changing the Fabricate theme MUST update already-open Fabricate application windows without requiring the user to close or reopen them.

#### Scenario: Theme change refreshes an already-open Fabricate window

- **GIVEN** one or more Fabricate application windows are already mounted
- **WHEN** the Fabricate theme setting changes
- **THEN** Fabricate updates the active theme attribute on `document.documentElement`
- **AND** Fabricate updates the active theme attribute on open Fabricate app roots
- **AND** the same mounted app root remains open while its computed theme-driven styles change

#### Scenario: Theme scopes remain token-driven

- **GIVEN** a Fabricate application window consumes shared `--fab-*` tokens
- **WHEN** the active theme changes
- **THEN** the surface updates through theme token inheritance rather than through a close/reopen cycle or per-surface inline recoloring

### Requirement: Theme Token Completeness

Every supported Fabricate theme MUST define the full token surface required by shared product UI CSS.

#### Scenario: All supported themes resolve shared tokens

- **GIVEN** the supported theme library
- **WHEN** shared UI CSS references a `--fab-*` token used by manager, actor-app, gathering, or editor surfaces
- **THEN** each supported theme resolves that token directly or through an explicit alias chain
- **AND** no supported theme may omit a token relied on by shared UI states such as actions, status chips, warnings, overlays, focus rings, or shadows
