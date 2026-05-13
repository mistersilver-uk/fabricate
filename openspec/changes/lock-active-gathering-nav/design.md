# Design: Lock Active Gathering Navigation

## Navigation State

Manager V2 should treat the Gathering rail group as locked open whenever the active route belongs to Gathering.
The active child route is represented by the existing `currentView` and `activeGatheringTab` state, so no new store state or persistence is needed.

## Parent Activation

The Gathering parent remains the default entry point from outside Gathering and opens the Environments child.
When already inside Gathering, parent activation is a no-op so it does not replace the current child page with Environments.

## Collapse Control

The chevron remains available for expanding/collapsing the group while the user is outside Gathering.
When a Gathering child is active, the handler leaves the group expanded and the ARIA state reports it as expanded.
