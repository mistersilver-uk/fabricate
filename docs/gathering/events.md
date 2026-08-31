---
layout: default
title: Events
parent: Gathering
nav_order: 3
---

# Gathering Events

Reusable **events** fire alongside a gathering attempt.
An environment composes them out of this library by matching biome and danger, exactly as it composes [tasks]({% link gathering/tasks.md %}).
See [Composition]({% link gathering/environments.md %}#composition).

## The event library

Reusable event records are edited from the Gathering **Events** tab.

{% include screenshot.html case="manager-gathering-event-editor-normal" caption="The Gathering Event editor, opened from the event browser." %}

Reusable event records support:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field                                 | Description                                                                                                                   |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------- |
| **Name, description, image, enabled** | GM-authored event identity and availability                                                                                   |
| **Danger, biomes**                    | Optional environment composition match tags. Empty means any. The environment matches events up to its single danger ceiling. |
| **Weather, time of day**              | Optional runtime availability gates. Empty means any                                                                          |
| **Trigger rate**                      | The event trigger rate from 1 to 100                                                                                          |
| **Modifier**                          | Optional event roll modifier formula                                                                                          |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Disabled Gathering Tasks and events never match for player gathering.

## How events are rolled

Matched, enabled events that pass their condition gates roll separately from the task's drop rows, each with its own modifier and trigger rate.

The system's Gathering Rules decide what a triggered event does: it can be recorded while the gathering still succeeds, or it can make the attempt fail, in which case no rewards are awarded.
See [Gathering Rules]({% link gathering/settings.md %}#gathering-rules).

If no events are enabled or matched, the environment is mechanically safe even when it has a danger level.

An environment's own event drop-rate adjustments can be kept on file but switched off by their apply toggles.
While an adjustment is switched off, its saved value is preserved but counts as zero.
