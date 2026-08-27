---
layout: default
title: Startup & Preferences Cleanup
parent: Crafting Systems
nav_order: 2
---

# Startup & Preferences Cleanup

Each time the module loads, Fabricate automatically cleans up stale saved preferences that point to crafting systems or recipes that no longer exist.
You do not need to trigger this manually.
It runs while Fabricate starts up, before the module is ready for use.

## What is cleaned up

| Preference                           | Cleanup behaviour                                                                                           |
|:-------------------------------------|:------------------------------------------------------------------------------------------------------------|
| Last viewed system in GM admin       | Cleared if the remembered system is no longer one of the current crafting systems                           |
| Last selected gathering actor        | Cleared when the remembered actor no longer exists or is no longer selectable by the current user           |
| Progressive result order preferences | Any entry for a recipe or a salvageable component that no longer exists is removed                           |

## Why this matters

If you delete a crafting system, recipe, or component while a player has a session open in another browser tab, their saved preferences may still point to things that no longer exist.
The same can happen after restoring a world from a backup.
The cleanup pass on the next load prevents stale references from causing unexpected behaviour in the crafting UI.

The cleanup leaves things alone when nothing is stale, so nothing is written unless a stale entry needs clearing.
