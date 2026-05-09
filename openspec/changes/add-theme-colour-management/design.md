# Design

## Theme Model

Theme ids are stable lowercase strings:

- `fabricate`
- `mythwright`

The setting is world-scoped because the user requested a global module setting and Fabricate's visual identity should be consistent at the table. Runtime consumers use exported constants instead of repeating ids.

## Runtime Application

Theme application is intentionally thin:

1. `registerFabricateSettings()` registers `fabricate.theme`.
2. The setting's `onChange` callback calls `applyFabricateTheme(themeId)`.
3. Startup calls `applyCurrentFabricateTheme(getSetting)` immediately after settings registration.
4. `applyFabricateTheme()` writes `data-fabricate-theme="<id>"` to `document.documentElement`.
5. Invalid or missing ids fall back to `fabricate`.

This keeps Foundry globals isolated to startup and settings registration and keeps CSS as the source of truth for colour values.

## CSS Token Strategy

Use `:root` for non-colour spacing/layout tokens plus a default `Fabricate` colour assignment. Add explicit selectors for both themes:

```css
:root,
:root[data-fabricate-theme="fabricate"] {
  --fab-bg-0: #111A23;
}

:root[data-fabricate-theme="mythwright"] {
  --fab-bg-0: #071116;
}
```

Theme palettes define raw semantic colour tokens such as:

- `--fab-bg-*`
- `--fab-surface*`
- `--fab-border*`
- `--fab-text*`
- `--fab-accent*`
- `--fab-success*`
- `--fab-warning*`
- `--fab-danger*`
- `--fab-tag-*`
- overlay/shadow/focus tokens where alpha is part of reusable theme semantics

Existing `--fab-v2-*` aliases remain mapped to these tokens so component CSS does not need to know which theme is active.

Compatibility aliases including legacy `--fabricate-*`, manager `--fab-v2-*`, and app-local editor aliases stay mapped through canonical `--fab-*` theme tokens until a later cleanup removes them intentionally.

Repeated product states should use shared semantic classes where that reduces duplication, especially for chips, status pills, warning/danger states, focus treatment, and action surfaces. Component-local selectors may remain when they express layout, but repeated colour decisions should flow through the shared semantic tokens/classes.

## Literal Colour Cleanup

CSS may contain literal colour values only inside the theme declaration block and local test fixtures. Product UI component styles must reference variables. This includes Svelte `<style>` blocks, `styles/fabricate.css`, and shared UI JS/CSS surfaces.

## Tests

Add focused tests:

- settings registration includes the theme dropdown, default, choices, and `onChange`.
- settings registration invokes the real theme applier by calling the captured `definition.onChange('mythwright')` and asserting `document.documentElement.dataset.fabricateTheme` changes.
- startup/current-setting coverage proves `applyCurrentFabricateTheme(getSetting)` reads the registered value and applies it after settings registration.
- theme helper normalizes invalid ids and writes the document attribute.
- stylesheet contains both theme blocks and the supplied Fabricate palette values.
- product UI styles do not contain literal hex/rgb/hsl colours outside the two theme selector blocks and local test fixtures. The detector must use an allowlist/parser approach that ignores Svelte control syntax such as `{#each}` and only scans style/source colour contexts. Failure output must include file and line details for each offender.
- rendered validation covers representative Fabricate and Mythwright surfaces at compact Foundry-style widths, checking contrast, focus rings, button visibility, clipping, scroll containment, and tag/status readability. Use the existing Vite/component screenshot path when practical, falling back to source-level evidence if a surface is not screenshotable in this slice.

Existing `npm test` and `npm run build` remain required validation gates.
