# Design

## Theme Model

Extend `src/ui/theme.js` with four new stable lowercase ids:

- `ironblood-forge`
- `hearth-herb`
- `starglass-arcana`
- `foundry-native`

`fabricate` remains `DEFAULT_FABRICATE_THEME`.
`FABRICATE_THEME_CHOICES` continues to define stable user-facing proper-noun labels in the setting dropdown.
This change does not rename the themes per locale.
Localized setting copy still lives in `lang/en.json`, and the mirrored theme-name entries there must stay in sync with the exported choices for documentation and future localization work.

## Palette Strategy

Each theme continues to define the same canonical Fabricate token surface already consumed by the product UI:

- `--fab-bg-*`
- `--fab-surface*`
- `--fab-border*`
- `--fab-text*`
- `--fab-accent*`
- `--fab-success*`
- `--fab-info*`
- `--fab-warning*`
- `--fab-danger*`
- `--fab-purple*`
- `--fab-tag-*`
- overlay, focus, and shadow tokens derived from the theme's base background and foreground colors

New theme blocks live in `styles/fabricate.css` beside the existing `fabricate` and `mythwright` blocks.
Theme selectors are explicit and dual-scoped:

- `:root[data-fabricate-theme="<id>"]`
- `.fabricate[data-fabricate-theme="<id>"]`

This allows the active theme to remain authoritative at the document root while also making app-root stamping meaningful for already-open ApplicationV2 windows.
Raw product UI color literals remain limited to approved theme declaration blocks.

## Canonical Token Coverage

This change treats the canonical token surface as the union of:

1. every `--fab-*` token declared by existing supported themes
2. every `var(--fab-*)` token referenced by product UI CSS and Svelte component styles
3. legacy alias tokens that still map through canonical Fabricate tokens

Implementation and tests MUST verify that every supported theme defines or resolves the full surface rather than only a hand-picked subset.
That coverage includes, at minimum:

- solid semantic anchors such as `--fab-accent`, `--fab-info`, `--fab-success`, `--fab-warning`, `--fab-danger`, and `--fab-purple`
- readable foreground tokens such as `--fab-on-accent`, `--fab-on-info`, `--fab-on-success`, and status text tokens
- soft/background/border variants used by chips, toggles, warnings, info states, and destructive controls
- overlay, focus, and shadow tokens
- tag tokens and compatibility aliases consumed by manager-v2, actor apps, and editor surfaces

## Theme References

The four new themes are implemented as fixed Fabricate-owned palettes derived from the supplied reference boards.
`Foundry Native` is Foundry-inspired rather than dynamically bound to Foundry's own runtime CSS variables so the palette remains stable, testable, and screenshotable.

### Ironblood Forge

- backgrounds: `#141214`, `#1F1A1D`, `#2C2428`, border `#5A4A50`
- text: `#F0E2D4`, `#C8B1A3`
- accents: `#C58B5A`, `#8E9A8F`, `#92A78B`, `#A86D66`
- tags: `#D8AE8D`, `#C9C3BF`, `#B8C4CB`, `#B1BEAC`, `#D6C08E`, `#C3B2CA`, `#D1A19A`, `#A39AA2`

### Hearth & Herb

- backgrounds: `#161C19`, `#1F2924`, `#2B3831`, border `#53695E`
- text: `#F1E9D8`, `#D5C6A8`
- accents: `#C8A36E`, `#9BB79E`, `#AFC7A4`, `#B98378`
- tags: `#C6D8C2`, `#B8C8A5`, `#E7D9B8`, `#E9C5AF`, `#C8D9D3`, `#E7D8A2`, `#DFC0C0`, `#D0C7E2`

### Starglass Arcana

- backgrounds: `#121824`, `#1A2232`, `#243147`, border `#40506B`
- text: `#F2ECFF`, `#CBBFEC`
- accents: `#9FC5E8`, `#C7A6E6`, `#9DC9BD`, `#C78A96`
- tags: `#C7D7EE`, `#D6C4EC`, `#E6E0C8`, `#B8DBE0`, `#E3C4D2`, `#BEC3EE`, `#EBD8E8`, `#C3C2DA`

### Foundry Native

- backgrounds: `#0C0A14`, `#111018`, `#30282F`, border `#2E2833`
- text: `#F3F3F5`, `#B6B4B2`
- accents: `#BC8963`, `#706B70`, `#617054`, `#A16C60`
- tags: `#A9BE9E`, `#CBC6BB`, `#A99BC4`, `#C8A09A`, `#D0A17A`, `#D5C09A`, `#948F90`, `#706B70`

## Semantic Mapping Rules

The supplied boards define anchor colors, not every downstream token.
Derived theme tokens therefore follow deterministic rules:

1. `--fab-bg-0` through `--fab-bg-3`, `--fab-text`, `--fab-text-secondary`, `--fab-accent`, `--fab-info`, `--fab-success`, and `--fab-danger` map directly from the board anchors.
2. `--fab-warning` uses the warm highlight tag that is distinct from the primary accent for the theme.
3. `--fab-purple` uses the violet, bruise, lilac, periwinkle, lavender, or equivalent cool-magenta tag for the theme.
4. `--fab-accent-hover` and stronger text/action variants derive from the same family as the corresponding solid anchor and must preserve AA contrast with their paired foreground token.
5. soft and border variants derive from the solid anchor colors with stable alpha semantics across themes so repeated UI states behave consistently.
6. `--fab-on-*` tokens use whichever foreground produces AA contrast on the paired solid fill, even if that differs by theme.
7. overlay and shadow tokens derive from the base app background color family and must preserve existing separation and focus behavior.
8. mounted Fabricate app roots that define the window edge (`.fabricate.crafting-app`, `.fabricate.gathering-app`, and equivalent product shells) must paint their background and foreground from the active theme tokens so the active theme remains visible at the app boundary and no unrelated transparent edge shows around the inner surface.

The implementation MUST prefer these deterministic mappings over ad hoc per-selector tweaks.

## Live Update Strategy

Theme switching remains driven by `applyFabricateTheme(themeId)`.
This change tightens the contract so already-open Fabricate application windows update as soon as the setting changes, without remounting or reopening the window.

Implementation expectations:

1. Theme application writes the active theme id to `document.documentElement`.
2. Theme application also stamps the active theme id onto open Fabricate app roots so already-open ApplicationV2 shells have an explicit local theme scope.
3. Open Fabricate app roots must consume theme tokens from live CSS variables rather than cached computed colors.
4. No component may snapshot theme colors into persistent inline style state during initial render.
5. The regression must prove the same mounted app root node remains in place while computed colors change through the registered theme `onChange`.

## Tests

Required coverage:

- settings registration exposes all six theme choices.
- theme normalization accepts all known ids and falls back to `fabricate` for unknown values.
- stylesheet contract covers all six theme blocks and verifies the complete canonical token surface resolves for each one.
- rendered validation covers representative Fabricate GM and player surfaces:
  - manager/admin shell
  - player crafting surface
  - player gathering surface
  - recipe/editor surface
- rendered validation exercises concrete app/container widths rather than only the browser viewport:
  - manager/admin shell at `900px` and `560px`
  - player crafting at `720px` and `520px`
  - player gathering at `720px` and `520px`
  - recipe/editor at `960px` and `620px`
- rendered validation checks long localized UI labels, focus states, clipping boundaries, and scroll containment at those widths.
- browser-backed live-update validation mounts an already-open themed surface with the real stylesheet, changes the theme through the registered `onChange`, and asserts both computed style changes and stable node identity without remounting.
- contrast checks require at least WCAG AA for:
  - primary and secondary text on app/surface backgrounds
  - `--fab-on-*` foregrounds on solid action fills
  - status/toggle/chip text on composited soft backgrounds
  - visible focus treatment across all six themes

Because theme names remain stable proper nouns in this slice, localization validation focuses on the surrounding setting copy and on existing longer localized UI strings used in the rendered app fixtures rather than on translated theme-name variants.

`npm test` and `npm run build` remain mandatory validation gates.
