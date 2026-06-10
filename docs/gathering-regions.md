---
layout: default
title: Gathering Regions & Travel
nav_order: 8.3
---

# Gathering Regions & Travel

Location-aware gathering lets a GM describe campaign geography as first-class **regions**, group actors into Fabricate-managed **parties**, and make gathering environments available or unavailable based on where the party currently is. This page covers the first, manual slice of the feature: regions, parties, the GM **Travel** route, manual current-region overrides, actor-scoped region discovery, and location-gated environment availability. Token-driven region sensing from the travel actor's placed token and region modifiers applied to gathering calculations arrive in later phases.

{: .gm }
> Only GMs can manage regions and parties and set current-region overrides. Players experience locations through the gathering app's blocked reasons and the redaction-safe location API.

## Concepts

| Concept | What it is |
|:--------|:-----------|
| **Region** | Named geography (such as *The Verdant Expanse*) scoped to one crafting system |
| **Biome** | A descriptive terrain/ecology trait carried by a region, such as `forest`, `swamp`, or `coastal` |
| **Environment** | A reusable gathering place that can declare availability in explicit regions, or in any region with matching biomes |
| **Party** | A world-level Fabricate record with actor members and exactly one travel actor |

Regions are geography, not environment containers — environments keep owning their own availability rules and simply reference regions and biomes.

## The Travel Route

Open the Crafting System Manager, select a crafting system with the `gathering` feature enabled, and choose the **Travel** tab in the Gathering section. The center column shows the party list, the selected party's editor (name, enabled state, members, travel actor, and current-region override), and a collapsible **Regions** quick list. The right-hand inspector echoes the selected party's read-only current-region evidence. When no parties exist yet, the panel shows a setup checklist: create a region, create a party, add members, assign a travel actor, then set the party's current region.

## Regions

Each region belongs to one crafting system and stores:

| Field | Description |
|:------|:------------|
| **Name** | Region name shown to the GM, and to players once disclosed |
| **Enabled** | Disabled regions are flagged in the UI; a manual override that includes a disabled region still resolves it (marked **Disabled**) so GMs can preview or diagnose |
| **Secret** | A secret region is never disclosed to players — not even its name or id — until the actor discovers it (see [Secret regions and discovery](#secret-regions-and-discovery)) |
| **Biomes** | Lowercase biome tags used by environment biome availability rules |
| **Description, Image** | Stored on the record; a dedicated full region editor is planned |
| **Scene mappings** | Foundry Scene / Scene Region UUID pairs reserved for the scene-automation phase; stale UUIDs are preserved for repair |
| **Modifiers** | Region modifiers (`hazardChance`, `dropRate`, `yield`, `difficulty`, `staminaCost`, `attemptLimit`, `custom` with `add`/`multiply`/`set`/`min`/`max` operations) are stored and validated now, and applied to gathering calculations in a later phase |

### Creating regions (Travel quick list)

The Travel route hosts a lightweight **Regions** quick list until the dedicated Regions route ships:

- Type a name and click **Add region** to create a region.
- Rename inline, or toggle a region's enabled state from its row.
- **Delete region** asks for confirmation; if environments or party overrides still reference the region, the confirmation warns how many. Deletion never blocks — dangling references become stale repair evidence instead.

The quick list round-trips only **name** and **enabled**. Description, image, secret, biomes, scene mappings, and modifiers on an existing region are preserved untouched by quick-list edits.

### Region settings (per system)

Each crafting system stores two region behavior settings, currently set through the API (`game.fabricate.getGatheringRegionStore().updateRegionSettings(systemId, { ... })`):

| Setting | Values | Effect |
|:--------|:-------|:-------|
| `revealMode` | `manual` (default), `onPartyTokenEntry`, `alwaysVisible` | `alwaysVisible` discloses region names to players even when secret and undiscovered; `onPartyTokenEntry` is reserved for the scene-automation phase |
| `modifierVisibility` | `visible` (default), `gmOnly` | Default disclosure for region modifiers once modifiers apply at runtime |

## Parties

Parties are **world-level** records shared across every crafting system — only the current-region override is per system. A party stores a name, an enabled flag, member actor UUIDs, one optional travel actor UUID, and per-system current-region overrides.

- **Members** — add actors through the searchable picker, remove them, or move a member to another party. A move is a single persisted update, so a member never momentarily belongs to two parties mid-move.
- **Travel actor** — the actor that represents the party on a campaign map (for example, a banner or caravan actor whose token sits on an overworld or hexcrawl scene). In this slice it is an identity slot and an enablement requirement; a later phase senses the party's region presence from its placed token. Set or clear it from the Travel route.
- **Enabling a party** — a party can only be enabled once it has a travel actor assigned; the toggle stays disabled (with a hint) until one is set.
- **One enabled party per actor** — an actor may be associated with at most one *enabled* party in total, whether as a member, as the travel actor, or both (and when both, the same party). Disabled parties never count toward this limit. Violations are rejected at save time and shown inline next to the control that caused them.
- **Deleting a party** removes its members, travel actor, and current-region overrides for every crafting system, after confirmation.

### Stale references

Members or travel actors whose actor no longer exists, and override region ids whose region was deleted, are preserved verbatim rather than silently dropped. The party row shows a **Needs repair** badge and the panel lists each stale reference with a one-click repair action (remove the stale member, clear the stale travel actor, drop the stale override region).

## Setting A Party's Current Region

A party's current region is resolved **per crafting system**, in this order:

1. **GM manual override** — set from the Travel route.
2. **Travel actor token sensing** — a later phase; the inspector already reserves the *Travel actor* source label with an "Automation not yet available" note.
3. **Unresolved** — no current region.

To set the override, select one or more region chips in the **Current region override** section and click **Set current region** (a party can be in several regions at once, e.g. overlapping geography). **Clear current region** records an explicit "no override". Both writes are stamped with the updating user and time. Including a disabled region still resolves it — the UI marks it **Disabled** — and override ids referencing deleted regions surface as stale repair evidence and do not resolve.

The inspector echoes the resulting evidence: the resolution source (**GM override**, **Travel actor**, or **No current region**) and the resolved region list.

## Environment Location Rules

Environments can declare explicit location availability rules. All four fields are optional id/tag lists; empty (or absent) lists mean "no rule":

| Field | Effect |
|:------|:-------|
| `includedRegionIds` | Available only when a current region is one of these regions |
| `excludedRegionIds` | Blocked while any current region is one of these regions |
| `includedBiomeIds` | Available when any current region carries one of these biomes |
| `excludedBiomeIds` | Blocked when any current region carries one of these biomes |

{: .note }
> This slice does not add environment-editor controls for these fields — author them through the gathering environment store API or system import/export. Saving validates that included/excluded region ids exist on the owning crafting system. The legacy environment **Region** / **Biomes** fields are unchanged: they remain matching/display tags for tasks and hazards, not availability gates.

Availability follows these rules:

1. An environment with **no** location rules is never location-blocked — existing environments behave exactly as before.
2. **Exclusions win.** A region or biome exclusion matched by *any* current region blocks the environment, even when an inclusion also matches.
3. An environment with inclusions is available when any current region's id is included **or** any current region carries an included biome.
4. An environment with inclusions and **no resolved current region** is blocked with a *no current region* reason.
5. An exclusion-only environment with no resolved current region is available.

At attempt time the engine re-resolves location fresh — a stale listing (for example, an override cleared between listing and clicking **Attempt**) can never start a location-gated attempt.

## What Players See

Location-gated environments stay listed but blocked, with a localized reason:

- *"Not available in the party's current region."* when the environment is excluded or no inclusion matches.
- *"No party region is set. Ask the GM to set the party's current region."* when the environment requires a region and none is resolved.

The listing payload also carries a redaction-safe `location` field per environment (whether it is gated, available, the resolution source, and disclosure-safe current-region labels) and, on blocked rows, travel guidance data: the destination regions whose identity the viewer is allowed to see (non-secret or already discovered), plus a count of secret undiscovered destinations. Macros and future player UI can use this to render travel goals such as "Travel to Ashen March" without leaking secret geography.

### Secret regions and discovery

Region knowledge is **actor-scoped** — it follows the character across party changes — and is stored on the actor as a Fabricate flag. For a non-GM viewer, a *secret, undiscovered* region never exposes its name or id anywhere; it reads as **Undiscovered region**. GMs always see real names, non-secret regions are always disclosed, and the `alwaysVisible` reveal mode discloses every region name.

GMs reveal or hide a region for an actor through the API (see below). Reveal writes validate that the region belongs to the referenced crafting system, and each discovery entry records when and from what source (`manual`, `partyToken`, `import`, or `api`) it was learned.

## API

All methods are available on `game.fabricate` after the `fabricate.ready` hook, with shorter aliases on the `game.fabricate.gathering` facade:

| Method | Alias on `game.fabricate.gathering` | Access | Purpose |
|:-------|:------------------------------------|:-------|:--------|
| `getGatheringPartyStore()` | `getPartyStore()` | GM-facing store | Party CRUD, members, travel actor, overrides |
| `getGatheringRegionStore()` | `getRegionStore()` | GM-facing store | Per-system region CRUD and region settings |
| `getGatheringLocationService()` | `getLocationService()` | Service | Current-region resolution for a party or actor |
| `getGatheringLocationForActor({ actorId or actor, systemId })` | `getLocationForActor(options)` | **Player-callable** | Redaction-safe current-region summary for an actor |
| `setGatheringPartyRegionOverride({ partyId, systemId, regionIds })` | `setPartyRegionOverride(options)` | GM-only | Set the manual current-region override |
| `clearGatheringPartyRegionOverride({ partyId, systemId })` | `clearPartyRegionOverride(options)` | GM-only | Clear the override (stamped, explicit none) |
| `revealGatheringRegionForActor({ actorId or actor, systemId, regionId, source?, partyId? })` | `revealRegionForActor(options)` | GM-only | Record region discovery on an actor |
| `hideGatheringRegionForActor({ actorId or actor, systemId, regionId })` | `hideRegionForActor(options)` | GM-only | Remove a region discovery entry |

```javascript
Hooks.once('fabricate.ready', async () => {
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;

  // Create a region and a party, then put the party in that region.
  const regionStore = game.fabricate.getGatheringRegionStore();
  const region = await regionStore.create(systemId, { name: 'The Verdant Expanse', biomes: ['forest'] });

  const partyStore = game.fabricate.getGatheringPartyStore();
  const party = await partyStore.create({ name: 'The Wayfarers' });
  await partyStore.addMember(party.id, game.user.character?.uuid);
  await partyStore.setTravelActor(party.id, 'Actor.someTravelActorId');
  await partyStore.setEnabled(party.id, true);

  await game.fabricate.setGatheringPartyRegionOverride({
    partyId: party.id,
    systemId,
    regionIds: [region.id]
  });

  // Player-callable, redaction-safe read.
  const summary = game.fabricate.getGatheringLocationForActor({
    actor: game.user.character,
    systemId
  });
  // -> { resolved: true, source: 'manualOverride', regions: [{ id, label, ... }], ... }
});
```

`getGatheringLocationForActor` resolves the actor's enabled party, then routes every region through the disclosure policy: a non-GM caller never receives a secret undiscovered region's id or name, and the raw `regionIds` / `staleRegionIds` arrays are returned empty for non-GM callers.

## Data Persistence

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | Regions and region settings live on each crafting system (`gatheringRegions[]`, `gatheringRegionSettings`) |
| World setting | `fabricate.gatheringParties` | Fabricate-managed parties, members, travel actors, and per-system overrides |
| Actor flag | `fabricate.discoveredGatheringRegions` | Per-system region discovery entries for the actor |

Because regions live on the crafting system, they ride along with crafting system export and import (`game.fabricate.exportSystem(systemId)` and the import dialog) automatically. Import validates that `gatheringRegions` is an array (warning on unnamed regions), and each imported region's owning system id is self-healed to the importing system.
