# Manager V2 Component Browser Polish Design

## Target State

The component browser remains a dense directory view. Rows should show:

- component image, name, and plain-text description
- tags, when component tags are enabled
- compact essence badges, when essences are enabled
- source origin as Compendium, Items Directory, Missing, or Unknown
- progressive difficulty, only for progressive systems with difficulty values
- row actions: copy source UUID when available, edit, delete

The table should not include a generic evidence column. Source origin is a visible, non-interactive, searchable column because it answers a common scan question without exposing long UUID strings.

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

## Source Origin

Item-card data should include `sourceOrigin`, `sourceOriginLabel`, and `sourceMissing`.

- `Compendium`: stored source UUID starts with `Compendium.`
- `Items Directory`: stored source UUID starts with `Item.`
- `Missing`: a stored source UUID is present but no longer resolves
- `Unknown`: no stored source UUID is available, or the UUID uses an unsupported shape

The table shows the origin label as plain text/chip content so existing browser search can match it. Source UUID copy remains an action button only when a stored UUID exists; the raw UUID belongs in the button tooltip/title.

## Search And Tags

When component tags are enabled, the component search should match component names, descriptions, tags, and source-origin labels. The tag select remains useful for exact filtering, but search must accept tag text directly.

## Folder Drops

Folder drops should import every direct and nested Item document under the dropped folder. Non-item documents are skipped. The import flow should call the existing `addItemFromUuid` behavior for each item, refresh the admin store once after the loop, and report added, updated, and skipped totals in one summary notification. Empty or non-item folders should show the existing empty-folder notification.

## Inspector

The right inspector should show selected component identity, tags, essences, and source UUID copy context. It should not duplicate row edit/delete actions. It should not show the usage evidence card.

For source UUID:

- do not print the raw UUID as standalone small text
- explain what the source ID represents
- keep the raw UUID in the copy button `title`
- show a warning/error callout only when the stored source UUID no longer resolves

## Risks

- Resolving source UUIDs during admin-store refresh adds async lookups to item-card preparation. Resolution failures must be treated as missing source state without blocking the manager.
- Progressive difficulty column must not appear for non-progressive systems, otherwise it wastes space.
- Table CSS grid variants must account for tags/essences/progressive combinations without overflow.
