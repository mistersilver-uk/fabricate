# Design

## Run Display Keys

The actor app needs two identities:

- `id`: the persisted run id used by managers and actions.
- `uiKey`: the render identity used by Svelte keyed each blocks.

Crafting run displays use `crafting-${run.id}` and salvage run displays use `salvage-${run.id}`. This preserves action payloads while preventing collisions between independent run domains.

## Deduplication Boundary

Run manager output is treated as untrusted UI input. After mapping raw runs to display records, each domain list is deduplicated by `uiKey`. The final merged active/history lists are also deduplicated by `uiKey` before render.

This keeps duplicate rows from corrupt/racy manager output out of the UI while allowing a crafting run and a salvage run with the same persisted id to coexist.

## Svelte Rendering

`RunBands.svelte` keys rows by `run.uiKey` with a conservative fallback for older display records. The fallback includes list scope and row index only when no persisted id exists, avoiding a render crash from malformed data without changing manager action ids.
