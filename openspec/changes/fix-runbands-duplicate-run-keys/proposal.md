# Proposal

## Summary

Fix the actor crafting app crash caused by duplicate Svelte keys in `RunBands.svelte` when rendered run lists contain duplicate run ids.

## Problem

`RunBands.svelte` keys active and history rows by run id. The store already deduplicates crafting runs before render, but the final actor-app lists also merge salvage runs. Duplicate salvage rows, or a salvage run id matching a crafting run id, can still produce duplicate keys in the same rendered list and abort Foundry Application rendering.

## Scope

- Add a stable UI key to crafting and salvage run display records.
- Deduplicate the final active/history lists by the same key shape used by `RunBands.svelte`.
- Update tests to cover merged crafting/salvage duplicate-key cases.

## Non-goals

- Change persisted run ids.
- Change crafting or salvage run manager storage semantics.
- Add new dependencies or Foundry API requirements.
