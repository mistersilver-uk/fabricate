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

Top-level `conditions` and `vocabularies` remain valid legacy inputs. Normalization uses those values when a per-system condition block is absent, converting string vocabularies into option records. Existing per-system string values are also normalized into option records. Matching fields on tasks and hazards remain normalized condition ids, not display labels.

## Matching
Runtime composition resolves the selected system's condition settings before matching reusable tasks and hazards. Enabled dimensions filter against the current option id; disabled dimensions ignore record tags for that dimension.

## UI
The Gathering Settings center panel renders two equal-height panels in a two-column grid that stacks at medium widths. Each panel aligns its content to the top and has a compact enable toggle, current-value selector, add control, and value pills with icon picker, label input, and remove affordance.

The environment editor keeps region, biome, and danger generic vocabulary CSV controls. Weather and time-of-day are managed through Settings.

## Safety
Deleting the last value while a dimension is enabled returns `false`. When deletion succeeds, only selected-system reusable tasks and hazards have that tag removed.
