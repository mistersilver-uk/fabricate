# Mythwright import and live admin refresh

## Summary

The Mythwright bootstrap currently seeds Fabricate systems and recipes through direct manager calls. Open Manager V2 admin windows also keep stale store state after external mutations, so a GM only sees script-created Mythwright data after closing and reopening the UI.

This change routes Mythwright system and recipe seeding through Fabricate's import API and makes Admin V2 refresh when Fabricate data changes outside the open window.

## Goals

- Have the Mythwright bootstrap build a Fabricate import payload and call the existing import API once for system and recipe persistence.
- Preserve world item provisioning because generated components depend on stable world item UUIDs.
- Refresh open GM Admin V2 state after external system or recipe mutations.

## Non-Goals

- Do not replace world `Item` creation/update with Fabricate import logic.
- Do not alter Mythwright content, recipes, gathering tasks, or generated item payload semantics.
- Do not introduce new npm dependencies.
