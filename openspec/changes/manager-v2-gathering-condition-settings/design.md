# Design

## Data Model
Each system entry in `gatheringConfig.systems` stores:

```js
conditions: {
  weather: { enabled: true, current: 'clear', values: ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'wind'] },
  timeOfDay: { enabled: true, current: 'day', values: ['dawn', 'day', 'dusk', 'night'] }
}
```

Top-level `conditions` and `vocabularies` remain valid legacy inputs. Normalization uses those values when a per-system condition block is absent, then writes normalized per-system settings when the selected system is edited.

## Matching
Runtime composition resolves the selected system's condition settings before matching reusable tasks and hazards. Enabled dimensions filter against the current value; disabled dimensions ignore record tags for that dimension.

## UI
The Gathering Settings center panel renders two content-height panels in a two-column grid that stacks at medium widths. Each panel has a compact enable toggle, current-value selector, add control, and removable value pills.

The environment editor keeps region, biome, and danger generic vocabulary CSV controls. Weather and time-of-day are managed through Settings.

## Safety
Deleting the last value while a dimension is enabled returns `false`. When deletion succeeds, only selected-system reusable tasks and hazards have that tag removed.
