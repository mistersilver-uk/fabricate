# Design

## Data Model
Each system entry in `gatheringConfig.systems` stores:

```js
conditions: {
  weather: {
    enabled: true,
    current: 'clear',
    values: [
      { id: 'clear', label: 'Clear', icon: 'fas fa-sun' },
      { id: 'heavy-rain', label: 'Heavy Rain', icon: 'fas fa-cloud-showers-heavy' }
    ]
  },
  timeOfDay: {
    enabled: true,
    current: 'day',
    values: [
      { id: 'day', label: 'Day', icon: 'fas fa-sun' },
      { id: 'night', label: 'Night', icon: 'fas fa-moon' }
    ]
  }
}
```

It also stores per-system gathering vocabulary records:

```js
vocabularies: {
  regions: {
    values: [
      { id: 'north', label: 'North' }
    ]
  },
  biomes: {
    values: [
      { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' }
    ]
  }
}
```

Top-level `conditions` and `vocabularies` remain valid legacy inputs. Normalization uses those values when a per-system condition or vocabulary block is absent, converting string vocabularies into option records. Existing per-system string values are also normalized into option records. Matching fields on environments, tasks, and hazards remain normalized ids, not display labels.

## Matching
Runtime composition resolves the selected system's condition settings before matching reusable tasks and hazards. Enabled dimensions filter against the current option id; disabled dimensions ignore record tags for that dimension.

## UI
The Gathering Settings center panel renders four panels in a scrollable two-column grid that stacks at medium widths. The weather and time-of-day panels align content to the top and have a compact enable toggle, current-value selector, add control with an icon picker for the new value, and value pills with icon picker, label input, and remove affordance. Value pills render as two-per-row rectangular controls with modest rounded corners.

Regions and Biomes render below the condition panels. Each settings card includes a short hint that explains how the values are consumed by reusable tasks, hazards, or environment composition. Add rows keep placeholder text in the input and use a compact text `Add` button instead of a plus-only icon.

Regions are text-only labels with add, edit, and delete controls. Biomes use the same pill geometry but combine icon and colour editing into one coloured icon affordance at the left of each pill. Left click, Enter, and Space open the icon picker. Right click, ContextMenu, and Shift+F10 open the colour picker. Biome colours store theme token keys such as `sage`, `mist`, and `lavender`; a valid custom hex overrides the displayed token colour, while invalid or blank custom hex falls back to the token.

Default biome string records normalize to title-case labels with stable ids and curated icon/colour metadata. Explicit biome records preserve their stored labels, icons, colours, and custom hex values.

The Systems Library right inspector renders a compact `Global conditions` shortcut card only when the selected system enables gathering and at least one condition dimension is enabled. Time of day and weather selectors share the same card, and each selector appears only for its enabled dimension. Changing either selector reuses `updateGatheringConditions` with the selected `systemId`; vocabulary editing remains in Gathering Settings.

The Gathering Environments right inspector shows selected-environment identity, details, and draft state only. Row-level quick actions remain the control surface for edit, duplicate, enable/disable, move, and delete. In stacked responsive layouts, the environment row action cell keeps its quick-action button grid aligned to the right instead of inheriting the generic left-aligned action group layout. The hidden full-row move overlay remains anchored to the environment row.

The environment editor keeps only the Danger generic vocabulary CSV control. Weather, time-of-day, Regions, and Biomes are managed through Settings.

## Safety
Deleting the last time/weather value while a dimension is enabled returns `false`. Region and biome panels allow deleting the final value. When deletion succeeds, only selected-system environments, reusable tasks, and hazards have that id removed.
