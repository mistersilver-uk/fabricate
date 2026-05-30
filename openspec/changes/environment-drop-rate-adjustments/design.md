# Environment Drop Rate Adjustments Design

## Data Shape
Persist additive integer adjustments on gathering environments:

```js
taskDropRateAdjustments: {
  [taskId]: {
    [dropRowId]: number // -100..100, zero omitted
  }
},
hazardDropRateAdjustments: {
  [hazardId]: number // -100..100, zero omitted
}
```

Normalization removes blank ids, non-finite values, non-integers, zero values, and empty task maps. Validation rejects original non-integer or out-of-range values.

## Runtime
When composing an environment, library tasks and hazards receive environment-local adjustments before rolls are resolved. Roll math remains additive:

- Task row final rate: `row.dropRate + environment row adjustment + condition modifiers + character modifiers`, clamped to `0..100`.
- Hazard final rate: `hazard.dropRate + environment hazard adjustment + character modifiers`, clamped to `0..100`.

The source library records are cloned and never rewritten.

## UI
The Environment Editor composition `Override` column becomes a drop-rate adjustment indicator:

- `On`: at least one effective non-zero adjustment exists for that task or hazard.
- `Off`: no effective adjustment exists.

The inspector replaces the disabled "coming soon" override card with active drop-rate adjustment controls. Hazards expose one adjustment. Tasks expose one adjustment control per drop row, and the task row indicator turns `On` if any drop row is adjusted.

## Compatibility
Existing environments without adjustment fields normalize to no adjustments. Stale adjustment entries for missing records or missing task drop rows are ignored by runtime and UI.
