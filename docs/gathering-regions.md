---
layout: default
title: Gathering Regions & Travel
nav_order: 8.3
---

# Gathering Regions & Travel

Location-aware gathering lets a GM describe campaign geography as first-class **regions**, group actors into Fabricate-managed **parties**, and make gathering environments available or unavailable based on where the party currently is. This page covers regions, parties, the GM **Travel** route, manual current-region overrides, actor-scoped region discovery, and location-gated environment availability. Token-driven region sensing from the travel actor's placed token and region modifiers applied to gathering calculations arrive in later phases.

{: .gm }
> The whole region and travel subsystem is **off by default** and is enabled per crafting system with the **Enable Travel & Regions** toggle in gathering Settings (see [Enabling Travel & Regions](#enabling-travel--regions)). Only GMs can manage regions and parties and set current-region overrides. Players experience locations through the gathering app's blocked reasons and the redaction-safe location API.

{: .note }
> A **region** is the single region concept in Fabricate — it is geography only. There is no separate "region vocabulary" or region match tag any more. Region **never** decides which tasks or hazards belong to an environment (that is biome, plus danger for hazards); it only decides location availability. See [Composition](#composition-no-longer-uses-region) below.

## Concepts

| Concept | What it is |
|:--------|:-----------|
| **Region** | Named geography (such as *The Verdant Expanse*) scoped to one crafting system. The single region concept — geography only |
| **Biome** | A descriptive terrain/ecology trait carried by a region, such as `forest`, `swamp`, or `coastal` |
| **Environment** | A reusable gathering place that can belong to one or more regions and declare location-availability rules |
| **Party** | A world-level Fabricate record with actor members and exactly one travel actor |

Regions are geography, not environment containers — environments declare which regions they belong to (`includedRegionIds`) and keep owning their own availability rules.

## Enabling Travel & Regions

The region/travel/availability subsystem is **disabled by default** for every crafting system. Enable it per system with the **Enable Travel & Regions** toggle on the Gathering **Settings** tab in the Crafting System Manager. The toggle reads and writes the per-system `gatheringRegionSettings.enabled` flag.

While the toggle is **off**, the system behaves as a non-location-aware system:

- The **Travel** nav item is hidden, and a stale `travel` active tab falls back to **Environments**.
- The environment editor shows no region selectors.
- No current-region, availability, party, or discovery surfaces appear, and the location API is inert (returns `null` / `false` / no-ops).
- Every environment is available; composition (biome + danger) is unaffected.

The **Settings** tab itself stays visible while disabled, since it hosts the toggle. Turning the toggle on reveals the **Travel** tab (where regions are authored), the environment editor's multi-region selector, and the rest of the location-aware surfaces described below.

## The Travel Route

With **Enable Travel & Regions** turned on, open the Crafting System Manager, select the crafting system, and choose the **Travel** tab in the Gathering section. The center column shows the party list, the selected party's editor (name, enabled state, members, travel actor, and current-region override), and the **Regions** authoring surface (a region list and detail editor). The right-hand inspector echoes the selected party's read-only current-region evidence. When no parties exist yet, the panel shows a setup checklist: create a region, create a party, add members, assign a travel actor, then set the party's current region.

The Travel tab is hidden whenever the toggle is off; create regions here before assigning environments to them.

## Regions

Each region belongs to one crafting system and stores:

| Field | Description |
|:------|:------------|
| **Name** | Region name shown to the GM, and to players once disclosed |
| **Description** | Free text shown to the GM |
| **Image** | Optional region image |
| **Enabled** | Disabled regions are flagged in the UI; a manual override that includes a disabled region still resolves it (marked **Disabled**) so GMs can preview or diagnose |
| **Secret** | A secret region is never disclosed to players — not even its name or id — until the actor discovers it (see [Secret regions and discovery](#secret-regions-and-discovery)) |
| **Biomes** | Lowercase biome tags (from the system biome vocabulary) used by environment biome availability rules |
| **Scene mappings** | Foundry Scene / Scene Region UUID pairs reserved for the scene-automation phase; stale UUIDs are preserved for repair |
| **Modifiers** | Region modifiers (`hazardChance`, `dropRate`, `yield`, `difficulty`, `staminaCost`, `attemptLimit`, `custom` with `add`/`multiply`/`set`/`min`/`max` operations) are stored and validated now, and applied to gathering calculations in a later phase |

### Authoring regions (Travel tab)

Region create, edit, and delete all live in the **Travel** tab, as a region list with a detail editor:

- Create a region, then edit its **name, description, image, enabled** state, **secret** flag, and **biomes** (chosen from the system biome vocabulary).
- **Delete region** goes through the standard confirmation dialog; if environments or party overrides still reference the region, the confirmation surfaces referenced-by evidence (how many) before you confirm. Deletion never blocks — dangling references become stale repair evidence instead.

Scene mappings and modifiers normalize, validate, and round-trip but are not yet authored in the UI or applied at runtime; existing values on a region are preserved untouched.

### Region settings (per system)

Each crafting system stores region behavior settings. The **Enable Travel & Regions** toggle (`enabled`, default `false`) is set from the Settings tab; the remaining settings are set through the API (`game.fabricate.getGatheringRegionStore().updateRegionSettings(systemId, { ... })`):

| Setting | Values | Effect |
|:--------|:-------|:-------|
| `enabled` | `false` (default), `true` | Gates the whole region/travel/availability subsystem for the system. Set from the Settings tab **Enable Travel & Regions** toggle (see [Enabling Travel & Regions](#enabling-travel--regions)) |
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

## Composition No Longer Uses Region

Region is **not** a composition axis. Which reusable tasks and hazards belong to an environment is decided by **biome** (and, for hazards, **danger**) only — never by region. Tasks and hazards no longer carry a `region` / `regions` match tag; geography lives entirely in `GatheringRegion`. See [Gathering Environments]({% link gathering-environments.md %}#composition) for how composition matching works.

## Environment Region Membership

An environment declares which regions it belongs to through `includedRegionIds`, a list of `GatheringRegion` ids — an environment can belong to **multiple** regions. When **Enable Travel & Regions** is on, the environment editor shows a multi-select chip control (mirroring the biome selector) bound to `includedRegionIds`, with options sourced from the system's regions. When the toggle is on but no regions exist yet, the selector shows an empty state pointing you to the **Travel** tab to create regions first. The selector is hidden while the toggle is off.

## Environment Location Rules

On top of region membership, environments can declare explicit location availability rules. All four fields are optional id/tag lists; empty (or absent) lists mean "no rule":

| Field | Effect |
|:------|:-------|
| `includedRegionIds` | Region membership: available only when a current region is one of these regions |
| `excludedRegionIds` | Blocked while any current region is one of these regions |
| `includedBiomeIds` | Available when any current region carries one of these biomes |
| `excludedBiomeIds` | Blocked when any current region carries one of these biomes |

{: .note }
> `includedRegionIds` is authored in the environment editor's multi-region selector (toggle on); the biome and exclusion fields are authored through the gathering environment store API or system import/export. Saving validates that included/excluded region ids exist on the owning crafting system. These fields gate **location availability** only. The legacy single `environment.region` string is **inert** — it is not a composition or availability input and is no longer surfaced in the editor; the migration moves it into `includedRegionIds`.

Availability is only evaluated when **Enable Travel & Regions** is on. While the toggle is off, every environment is available regardless of these fields. When on, availability follows these rules:

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

## Migrating From The Legacy Region Vocabulary

Earlier versions modeled regions two ways: a per-system **region vocabulary** (a match tag on tasks, hazards, and environments) and the first-class `GatheringRegion`. These are now unified — `GatheringRegion` is the only region concept. A one-time, idempotent startup migration upgrades existing worlds automatically:

- Each legacy region-vocabulary entry becomes a `GatheringRegion` record on its crafting system (keyed by the vocabulary id; distinct ids with duplicate labels stay distinct regions).
- Each environment's legacy single `region` is mapped to `includedRegionIds` when a matching region exists; a free-text region with no match is left inert (no data loss, no stale reference).
- The `region` / `regions` match tags are stripped from tasks and hazards.
- The per-system region vocabulary is cleared.
- `gatheringRegionSettings.enabled` is left off, so migrated systems keep the subsystem **disabled by default** — re-enable it per system with the **Enable Travel & Regions** toggle.

A one-time GM notice names the systems that had regions. Because region is no longer a composition axis, **region-scoped tasks and hazards may now appear in more environments**: a record that was previously narrowed only by a region tag (with no biome) now matches any biome. Review composition on affected environments after upgrading, and add biome (or danger, for hazards) constraints where you want to keep records out of an environment.

## Data Persistence

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | Regions and region settings live on each crafting system (`gatheringRegions[]`, `gatheringRegionSettings`) |
| World setting | `fabricate.gatheringParties` | Fabricate-managed parties, members, travel actors, and per-system overrides |
| Actor flag | `fabricate.discoveredGatheringRegions` | Per-system region discovery entries for the actor |

Because regions live on the crafting system, they ride along with crafting system export and import (`game.fabricate.exportSystem(systemId)` and the import dialog) automatically. Import validates that `gatheringRegions` is an array (warning on unnamed regions), and each imported region's owning system id is self-healed to the importing system.
