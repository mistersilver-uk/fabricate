# Gathering And Harvesting Spec Delta

## Modified Requirements

### Gathering Task Tools

Tool presence matching and the per-tool display state are clarified so that owned items
linked to a tool's component only by `_stats.duplicateSource` are recognized, and so that a
held `replaceWith` broken-variant component is displayed as broken while the attempt remains
blocked.

The existing requirements are retained. The following are clarified or added:

1. (Clarified) Tool presence matching reuses the shared component source-reference matcher
   (`itemMatchesComponentSource`). That matcher MUST honor an owned item's
   `_stats.duplicateSource` as an item identity reference (see `data-models` *Component
   Source Reference Matching*), so a tool item that was duplicated (for example dragged) from
   the tool component's source world item is recognized as present even when
   `_stats.compendiumSource` is absent and there is no `flags.core.sourceId`. Tool matching
   MUST NOT depend on importer/pack bookkeeping ids such as `flags.fabricate.mythwrightId`.

2. (Added) Required-tool **display state** is classified for the player "Required tools"
   panel into `present`, `damaged` (rendered as "Broken"), or `missing`:
   - `present` when the actor holds a matching item that is not flagged broken.
   - `damaged` when the only matching item(s) carry `flags.fabricate.toolBroken === true`,
     OR when no working item matches and the tool's `onBreak.mode === 'replaceWith'` with a
     `replacementComponentId` and the actor holds an item matching that replacement component.
   - `missing` otherwise.
   The working-item match takes precedence: an actor holding both the working tool and a
   spare broken variant is classified `present`.

3. (Added) Recognition of a held `replaceWith` broken-variant component is **display-only**.
   It MUST NOT make a broken tool satisfy a gathering attempt. The start-attempt tool gate
   (attempt validation) is unchanged: an actor holding only the broken variant still fails
   the gate, and the attempt remains blocked with `TOOL_BLOCKED`. The display state exists to
   tell the player the tool is broken and repairable rather than missing and reacquirable.

## Testing Requirements

- Unit test: required-tool display classification returns `damaged` when the actor holds only
  the tool's `replaceWith` `replacementComponentId` component, `present` when the actor holds
  the working tool component, and `missing` when the actor holds neither.
- Unit test: required-tool display classification returns `present` when the actor holds both
  the working tool and the broken variant.
- Unit test: attempt validation still reports the tool as `missing` (attempt blocked,
  `TOOL_BLOCKED`) when the actor holds only the `replaceWith` broken variant.
- Unit test: a tool item linked to its component only by `_stats.duplicateSource` is
  recognized as present by tool matching.
