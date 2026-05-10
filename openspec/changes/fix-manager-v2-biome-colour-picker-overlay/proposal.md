# Fix Manager V2 Biome Colour Picker Overlay

## Summary
Fix the Manager V2 biome colour picker popover so it is rendered in the nearest Manager V2 overlay scope and positioned with the shared icon-picker popover layout rules. The change keeps all biome colour behavior, callback payloads, labels, and stored data unchanged.

## Motivation
The Gathering Settings Biomes panel uses compact coloured icon affordances inside a bounded Manager V2 main region. The colour picker popover must escape local pill/card clipping while still staying visually constrained to the Manager V2 main panel. Without explicit portal scoping and layout constraints, the picker can appear in the wrong overlay context, drift horizontally, or be clipped near lower settings rows.

## Scope
- Scope `ManagerV2ColorPicker` popover portal rendering to the nearest `.fabricate-manager-v2` shell.
- Position the colour popover with `computeIconPickerPopoverLayout`.
- Use left horizontal alignment so the 36px colour trigger anchors the 220px picker predictably.
- Keep the picker width fixed through layout options by setting `minWidth` and `maxWidth` to `220`.
- Constrain horizontal layout to the nearest `.manager-v2-main` bounds.
- Flip the popover above the trigger when there is insufficient usable space below.
- Preserve current token/custom-hex behavior and `onChange({ colorToken, customColor })` payloads.
- Add focused regression coverage in `manager-v2-layout` and `manager-v2-mounted`.

## Out Of Scope
- Changing biome vocabulary persistence, normalization, labels, icons, colour tokens, or custom hex validation.
- Changing the shared `computeIconPickerPopoverLayout` algorithm unless a direct defect blocks this picker.
- Changing `IconPicker`, `EssenceSourceSelector`, recipe image picker, or non-Manager V2 popovers.
- Adding dependencies or new Foundry API requirements.

## Owning Contract
Durable product behavior remains owned by:

- `openspec/specs/ui-integration/spec.md` Manager V2 shell and Gathering Settings requirements.
- `openspec/changes/manager-v2-gathering-condition-settings/design.md` biome vocabulary and colour picker design.

This change is an implementation-planning slice for the still-open overlay task in the active Gathering Condition Settings change.
