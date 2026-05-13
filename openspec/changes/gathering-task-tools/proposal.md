# Gathering Task Tools

## Summary

Gathering tasks today accept catalysts (carried over from the recipe-side model) but have no first-class concept of a **tool** — a piece of equipment an actor must wield to attempt the task, that can break across attempts, and that may have an actor-side requirement (e.g. a dnd5e proficiency flag) to be usable. This change introduces a Tool model alongside Catalyst, surfaces it in the environment task editor, runs presence and requirement gates at attempt start, applies breakage on attempt resolution, and adds a system-level policy for whether broken tools fail the attempt.

## Goals

- Multiple tools per gathering task, all required (catalyst-style): every listed tool must be present and pass its requirement before an attempt may start.
- Per-tool optional requirement expression evaluated against the actor's Foundry roll data (system-agnostic).
- Per-tool breakage with exactly one mechanic: limited uses (counter on the item), flat breakage chance percent, or a dice expression compared against a threshold.
- Per-tool on-break action: destroy, flag as broken, or replace with a designated managed component that recipes can consume to repair.
- System-level `toolBreakagePolicy` in `GatheringRules` controlling whether a tool break fails the attempt or merely reports the breakage.
- Backwards compatible: legacy tasks normalize to an empty tools array; no migration runner entry required.

## Out of Scope

- Changes to recipe-side catalysts.
- Per-system adapter changes (dnd5e/pf2e). Tools rely on the existing system-agnostic expression adapter only.
- An in-app UI for clearing the `toolBroken` flag. GMs use Foundry's item flag editor; documented in the how-to.
- Party-wide tool sharing semantics.
