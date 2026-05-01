# Design: Admin Environment Card Media Overflow

## Boundary Decision

This is a CSS layout containment bug in the admin environment-card grid. Keep the implementation at the stylesheet boundary unless tests reveal a missing class or DOM structure problem.

The expected fix is to add shrink permission to:

```css
.fabricate-admin .environment-card-media
```

The likely property is `min-width: 0`, matching the existing grid/flex containment pattern already used on `.environment-card` and `.environment-list.environment-card-grid`. Do not change runtime Svelte behavior to solve a CSS minimum-size issue.

## Current Structure

`EnvironmentList.svelte` renders each environment as:

- `.environment-card`
- `.environment-card-media`
- `.environment-card-image-frame`
- `.environment-card-image-action`
- `.environment-card-actions`

The stylesheet currently gives `.environment-card-media`:

- `position: relative`
- `overflow: visible`
- `width: 100%`
- `aspect-ratio: 3 / 2`
- `min-height: 0`
- `border-radius: 6px`

The image frame is absolutely positioned inside the media wrapper and owns image clipping through `overflow: hidden`.

## Required Preservation

- Keep `.environment-card-media` as the overlay positioning context.
- Keep `.environment-card-media { overflow: visible; }` so overlay buttons and overflow-menu affordances are not clipped at the media wrapper.
- Keep `.environment-card-image-frame { overflow: hidden; }` so real scene imagery remains clipped to the visual image frame.
- Keep `aspect-ratio: 3 / 2` unless implementation proves it is the direct cause after shrink permission is added.
- Preserve existing card action pointer behavior; layout tests should not require DOM event rewrites.

## Test Strategy

Use two layers of coverage:

1. Source/contract coverage that asserts `.environment-card-media` keeps `overflow: visible`, gains explicit shrink permission, and `.environment-card-image-frame` keeps `overflow: hidden`.
2. Browser coverage that measures rendered bounding boxes for normal and narrow GM `Environments` grid layouts.

The browser check should include at least one environment with a linked scene image so the frame is validated with real image content. Fallback-image-only validation is insufficient for this bug because actual imagery is what GM users inspect in the card.

## Browser Assertions

For each checked viewport/container width:

- `media.right <= card.right` and `media.left >= card.left`, allowing a tiny sub-pixel tolerance.
- `imageFrame.right <= card.right` and `imageFrame.left >= card.left`, allowing a tiny sub-pixel tolerance.
- Overlay action buttons are visible and have non-zero hit areas.
- Opening the card overflow menu leaves the menu visible and not clipped by `.environment-card-media`.
- Pointer activation still routes image/name/edit controls into the editor and keeps non-edit card actions on their existing handlers.

## Risks

- Moving clipping from `.environment-card-image-frame` to `.environment-card-media` would hide overlay controls or menus.
- Fixing only the normal-width grid could leave the narrow container layout with the same overflow.
- Source-level CSS assertions alone could pass while real browser layout still overflows due to image intrinsic sizing or container behavior.
- Broad card redesign would increase regression risk for a narrow layout bug.
