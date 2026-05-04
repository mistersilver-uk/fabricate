# Manager V2 Component Browser Polish Design

## Target State

The component browser remains a dense directory view. Rows should show:

- component image, name, and plain-text description
- tags, when component tags are enabled
- compact essence badges, when essences are enabled
- progressive difficulty, only for progressive systems with difficulty values
- row actions: copy source UUID when available, edit, delete

The table should not include source-state or generic evidence columns. The component image is the visual source cue, and usage/salvage facts are not needed in this browser slice.

## Description Text

Manager-v2 item cards should always receive a string description. Object-shaped Foundry descriptions must pass through the existing plain-text normalization helper before rendering. This prevents `[object Object]` from appearing in rows or the inspector.

## Compact Essences

Essences in component rows and inspector cards should be icon-first:

- show the essence icon and quantity only
- keep the essence name in `title` and `aria-label`
- avoid wrapping long names inside the badge

This preserves scan density without losing discoverability.

## Progressive Difficulty

Progressive difficulty is useful only when the selected system is in `resolutionMode: "progressive"`. In that state, and only when at least one visible component exposes `difficulty`, add a dedicated table column. Do not keep progressive difficulty in a generic Evidence column.

## Search And Tags

When component tags are enabled, the component search should match component names, descriptions, and tags. The tag select remains useful for exact filtering, but search must accept tag text directly.

## Inspector

The right inspector should show selected component identity, tags, essences, and source UUID copy context. It should not duplicate row edit/delete actions. It should not show the usage evidence card.

For source UUID:

- do not print the raw UUID as standalone small text
- explain what the source ID represents
- keep the raw UUID in the copy button `title`

## Risks

- Removing the source column reduces explicit source state visibility. The row image and inspector source card remain enough for this slice; the copy source action only appears when source evidence exists.
- Progressive difficulty column must not appear for non-progressive systems, otherwise it wastes space.
- Table CSS grid variants must account for tags/essences/progressive combinations without overflow.
