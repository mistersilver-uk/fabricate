# Design: Admin Environment Card Hover States

## Boundary Decision

This is a stylesheet-level interaction polish fix in the GM admin `Environments` card grid. Keep the implementation at the CSS boundary unless testing proves the current DOM cannot support an accessible non-border focus affordance.

The relevant DOM is rendered by `src/ui/svelte/apps/environments/EnvironmentList.svelte`:

- `.environment-card`
- `.environment-card-media`
- `.environment-card-image-frame`
- `.environment-card-image-action`
- `.environment-card-actions`
- `.environment-card-name-action`
- `.environment-action-menu-trigger`
- `.environment-card-actions .btn-icon`

The relevant stylesheet region is `styles/fabricate.css` around the environment-card and action-menu selectors.

## Current Behavior

The image and name edit targets share this hover/focus rule:

```css
.fabricate-admin .environment-card-image-action:hover,
.fabricate-admin .environment-card-image-action:focus-visible,
.fabricate-admin .environment-card-name-action:hover,
.fabricate-admin .environment-card-name-action:focus-visible {
  outline: 1px solid rgba(120, 160, 255, 0.72);
  outline-offset: 2px;
}
```

That rule creates the reported transient border around the card image and the name/summary block.

Environment-card icon buttons currently start with a darker chip:

```css
background: rgba(8, 9, 14, 0.78);
```

Their hover/focus rule changes the fill to:

```css
background: rgba(255, 255, 255, 0.1);
```

Over bright or detailed scene artwork, that can read as clear and reduce icon contrast.

## Expected Approach

- Remove border/outline hover treatment from `.environment-card-image-action` and `.environment-card-name-action`.
- Preserve keyboard focus visibility for those controls with a non-border visual treatment that does not outline the image frame or text block. Acceptable approaches include a text underline/tint for the name target, a subtle non-geometric image overlay/tint, or a shadow/inset treatment that does not appear as a border around content.
- Keep icon-button hover/focus backgrounds filled and high contrast. Prefer a slightly stronger dark fill, accent-tinted dark fill, or stable filled chip with changed border/shadow/foreground, rather than a transparent white overlay.
- Keep disabled button behavior intact; do not make disabled controls look active on hover.
- Keep `.environment-action-menu-item:hover` behavior separate. Menu item hover is not part of the reported card overlay problem.

## Accessibility Constraints

- `:focus-visible` must remain visibly distinguishable from default, hovered, disabled, and active-card states.
- Do not remove focus indication outright.
- Do not rely on color alone when a simple accompanying treatment such as shadow, underline, or icon contrast can help.
- Maintain pointer hit areas for edit, toggle, delete, and menu buttons.

## Browser Validation Requirements

Run live pointer checks when feasible rather than relying only on DOM/source assertions:

- Use representative cards with both linked scene imagery and fallback icons.
- Check the first visible grid state before hover so screenshots prove baseline alignment and clipping.
- Hover the card overlay icon buttons and inspect rendered pixels or screenshots to ensure the filled chip remains visible over imagery.
- Hover image and name/summary edit targets and confirm no border, outline, or ring appears around those target bounds.
- Move the pointer between image, card action buttons, card body, and menu items to confirm hover states do not leave stale outlines.
- Use keyboard tab/focus checks to verify focus indication remains visible after border removal.

## Responsive/Scroll Constraints

Validate at normal and narrow admin main widths. The card grid is scrollable inside `.environment-foundation`; hover treatments must not introduce layout shift, clipping, or scrollbars beyond the existing grid scroll region.

## Risks

- Removing the outline without replacing focus visibility would regress keyboard accessibility.
- A hover fill that works on dark images may still fail over bright linked scene images unless verified with real imagery.
- Broad selector changes could affect row-level environment/task actions outside the card grid.
- Changing card media overflow or image-frame clipping would conflict with the separate media-overflow plan.
