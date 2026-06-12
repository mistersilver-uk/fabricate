# UI Integration Spec Delta

## Renamed Surface

### Gathering Hazard Library → Gathering Event Library

The GM authoring surface formerly titled **Gathering Hazard Library** is renamed **Gathering Event
Library**. Its route, components, test hooks, CSS classes, and i18n keys/values are renamed from
`hazard` to `event`; its capabilities are unchanged.

Requirements:

1. When `features.gathering === true`, Manager exposes reusable **event** library authoring as a
   dedicated route or nested reusable library surface (renamed from the hazard library route).
2. Event library authoring supports name, image, description, enabled state, danger/match tags,
   d100 drop rate, and modifier provider evidence — unchanged from hazard authoring. Deletion
   confirmation when an Event is used by environments or tasks is unchanged.
3. The Environments editor exposes Gathering Task and **event** library rows with per-environment
   automatic/manual composition; the Included / Excluded / Non-matching sections and the
   `disabled*Ids` / `enabled*Ids` / `forced*Ids` wiring are renamed to the event equivalents.
4. The manager `Environments` browser empty state guides GMs to prepare Gathering Tasks plus
   **event** options before composing environments (rename of "encounter/hazard options").
5. Renamed UI identifiers: components `GatheringEventEditView`, `GatheringEventsBrowserView`,
   `GatheringEventRow`, `GatheringEventDetail`, `EventChanceBar`, `EnvironmentEventsTab`; route
   `gathering-event-edit`; `data-gathering-event-*` / `data-event-*` hooks; `.gathering-event-*` /
   `.manager-gathering-event-*` CSS classes.

## Neutralized Copy

Player-facing copy that framed the concept as danger-first is reworded so an Event reads as a
neutral encounter (a travelling merchant as readily as an eruption), while the danger axis itself is
retained:

1. "When & where it strikes" → "When & where it happens".
2. "This area carries a risk of hazards." → "This area has events in store."
3. "The hazards here are hidden until you gather." → "The events here are hidden until you gather."
4. "If a hazard strikes, your gather still succeeds." / "…the gather fails." →
   "If an event occurs, your gather still succeeds." / "…the gather fails."
5. Copy that legitimately describes the danger axis (e.g. "Danger tags let environments opt in…")
   is retained.

## Unchanged

The d100 result-group validation copy still reserves the failure aliases (including the former
miss/`hazard` terms) and forbids them as result-group names — this is the failure-keyword concept,
not the Gathering Event concept.
