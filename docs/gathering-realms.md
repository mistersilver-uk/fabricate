---
layout: default
title: Gathering Realms & Travel
nav_order: 8.3
---

# Gathering Realms & Travel

Location-aware gathering lets a GM describe campaign geography as first-class **realms**, group actors into Fabricate-managed **parties**, and make gathering environments available or unavailable based on where the party currently is.
This page covers World Parties, selected-system Travel navigation, realms, manual current-realm overrides, actor-scoped realm discovery, and location-gated environment availability.
Token-driven realm sensing from the travel actor's placed token is available.
Realm modifiers applied to gathering calculations remain planned.

{: .gm }
> Realm-aware travel is **off by default** per crafting system and is enabled with the **Enable Travel & Realms** toggle in gathering Settings (see [Enabling Travel & Realms](#enabling-travel--realms)).
> **World > Parties** is always available for global Party management.
> Only GMs can manage realms and parties and set current-realm overrides.
> Players experience locations through the gathering app's blocked reasons and the redaction-safe location API.

{: .note }
> A **Gathering Realm** is the Fabricate gathering-geography concept.
> It is **not** a Foundry Scene Region drawn on the canvas.
> That is the distinct Foundry object a realm maps onto.
> Several Foundry Scene Regions can map onto one realm through the realm's scene mappings, so a single realm can span several drawn map areas.
> A realm **never** decides which tasks or events belong to an environment (that is biome, plus danger for events).
> It only decides location availability.
> See [Concepts](#concepts) below.

## Concepts

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Concept | What it is |
|:--------|:-----------|
| **Realm** | Named geography (such as *The Verdant Expanse*) scoped to one crafting system. The single Fabricate geography concept, geography only. Distinct from a Foundry Scene Region |
| **Biome** | A descriptive terrain or ecology trait carried by a realm, such as forest, swamp, or coastal |
| **Environment** | A reusable gathering place that can belong to one or more realms and declare location-availability rules |
| **Party** | A world-level Fabricate record with actor members and exactly one travel actor |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Realms are geography, not environment containers.
Environments declare which realms they belong to and keep owning their own availability rules.

## Enabling Travel & Realms

The realm/travel/availability subsystem is **disabled by default** for every crafting system.
Enable it per system with the **Enable Travel & Realms** toggle on the Gathering **Settings** tab in the Crafting System Manager.

While the toggle is **off**, the system behaves as a non-location-aware system:

- **World > Parties** remains available for global Party management; current-realm overrides are unavailable.
- **World > Travel** also remains available: realms are world geography, so the toggle never hides the place you author them.
- The environment editor shows no realm selectors.
- No current-realm, availability, or discovery surfaces appear for that system.
- Every environment is available.
  Composition (biome and danger) is unaffected.

Turning the toggle on enables the selected system's current-realm override on **World > Parties** and reveals the environment editor's multi-realm selector.
It does not reveal a navigation destination: **World > Travel** is there whether or not any system has opted in.

## World Parties and World Travel

Choose **World > Parties** at any time for the world party list and editor (name, enabled state, members, and travel actor), including when no crafting system is selected.
Choose **World > Travel** the same way for **Realms** and **Map Region Links**.
**Travel** is initially collapsed when the Crafting System Manager opens.
Each party is a fully expanded card in a full-width content area, so its editing controls are available without selecting the party first.
When the list has more than one page, the pagination controls stay below the scrolling party cards and do not cover them.
When no parties exist yet, the panel shows a simple **No parties yet** empty state.
It does not render a setup checklist.

The `WORLD / every system` heading, Parties and Travel all remain visible when the toggle is off and when no system is selected.
Parties, realms and authored map links are all world-level and identical under every selection; only the current-realm override is gated on the selected crafting system.
Create realms under **World > Travel > Realms** before assigning environments to them.

## Realms

A realm belongs to the world rather than to a crafting system — Northreach Vale is the same valley whether a character is there to gather herbs or to quarry stone — and every crafting system that enables Travel & Realms shares the same library.
Each realm stores:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Description |
|:------|:------------|
| **Name** | Realm name shown to the GM, and to players once disclosed |
| **Description** | Free text shown to the GM |
| **Image** | Optional realm image |
| **Enabled** | Disabled realms are flagged in the UI. A manual override that includes a disabled realm still resolves it (marked **Disabled**) so GMs can preview or diagnose |
| **Secret** | A secret realm is never disclosed to players (not even its name) until the actor discovers it (see [Secret realms and discovery](#secret-realms-and-discovery)) |
| **Biomes** | Biome tags (from the system's biome list) used by environment biome availability rules |
| **Scene mappings** | Links from the realm to one or more Foundry Scene Regions, authored from **World > Travel > Map Region Links** and used by live token sensing |
| **Modifiers** | Adjustments to event chance, drop rate, yield, difficulty, stamina cost, and attempt limit (plus custom adjustments) are stored and checked now, and applied to gathering calculations in a later phase |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Realms vs Foundry Regions

A **Gathering Realm** is the Fabricate concept.
A **Foundry Scene Region** is a distinct canvas object that Foundry itself owns.
The two are bridged but not the same:

- A realm's **scene mappings** connect it to one or more Foundry Scene Regions.
  Several Foundry Scene Regions can map onto one realm, so a single realm can span multiple drawn map areas.
- Scene region automation senses which realm a travel actor occupies from its placed token's Region membership, with a position hit-test fallback.

### Authoring realms (World > Travel > Realms)

Realm create, edit, and delete live under **World > Travel > Realms**, as a realm list with a detail editor:

- Create a realm, then edit its **name, description, image, enabled** state, **secret** flag, and **biomes** (chosen from the system biome vocabulary).
- **Delete realm** goes through the standard confirmation dialog.
  If environments or party overrides still reference the realm, the confirmation surfaces referenced-by evidence (how many) before you confirm.
  Deletion never blocks.
  Dangling references become stale repair evidence instead.

{% include screenshot.html case="manager-world-travel-realms-normal" caption="The Realms page, with one realm expanded over the environments it can take." %}

Scene mappings are authored under **World > Travel > Map Region Links**, normalize and round-trip, and drive live token sensing.
Realm modifiers normalize, validate, and round-trip but are not yet authored in the UI or applied at runtime.
Existing modifier values are preserved untouched.

{% include screenshot.html case="manager-world-travel-map-normal" caption="Map Region Links, pairing one of the active scene's regions with a realm." %}

### Realm settings

The reveal mode and modifier visibility are **world** settings, shared by every crafting system, and are set through the API (see [API](#api)).
Only the **Enable Travel & Realms** toggle (off by default) is per system, set from that system's Settings tab:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setting | Values | Effect |
|:--------|:-------|:-------|
| Travel & Realms (per system) | off (default), on | Whether this system's environments are gated on where the party is, and whether they offer realm controls. Set from the Settings tab **Enable Travel & Realms** toggle (see [Enabling Travel & Realms](#enabling-travel--realms)) |
| Reveal mode | manual (default), on party token entry, always visible | "Always visible" discloses realm names to players even when secret and undiscovered. Automatic discovery on party-token entry remains a follow-up. Live realm sensing itself is already shipped |
| Modifier visibility | visible (default), GM only | Default disclosure for realm modifiers once modifiers apply during play |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Parties

Parties are **world-level** records shared across every crafting system.
A party stores a name, an enabled flag, member actor UUIDs, one optional travel actor UUID, and one current-realm override.
The override is single because a party is one set of tokens standing in one place: it used to be keyed by crafting system, which modelled a party as being in several places at once.

- **Members** can be added through the searchable picker, removed, or moved to another party.
  A move is a single persisted update, so a member never momentarily belongs to two parties mid-move.
- **Travel actor** is the actor that represents the party on a campaign map (for example, a banner or caravan actor whose token sits on an overworld or hexcrawl scene).
  Fabricate senses the party's realm presence from that actor's placed token and the selected system's map links.
  Set or clear it from **World > Parties**.
  The picker offers only actors whose type is listed under **Player Character Actor Types** in the module settings, which by default is the "Character" type alone.
  To pick a banner, caravan or group actor from the list, add its actor type there — noting that doing so also makes actors of that type eligible party members.
  Alternatively, drag the actor straight onto the travel-actor panel: a drop assigns any actor regardless of its type.
  An actor already assigned as a travel actor stays assigned and stays visible in the picker even if its type is not listed.
- **Enabling a party** does not require a travel actor.
  A party without one resolves to no current realm, which leaves its members exactly where an actor in no party stands: ungated environments stay open and location-gated ones stay out of reach.
  Assign a travel actor when you want that party's realm to resolve from its token on the map.
- **One enabled party per actor** means an actor may be associated with at most one *enabled* party in total, whether as a member, as the travel actor, or both (and when both, the same party).
  Disabled parties never count toward this limit.
  Violations are rejected at save time and shown inline next to the control that caused them.
- **Deleting a party** removes its members, travel actor, and current-realm overrides for every crafting system, after confirmation.

{% include screenshot.html case="manager-world-parties-normal" caption="The World Parties page, with each party expanded over its members and its travel actor." %}

### Stale references

Members or travel actors whose actor no longer exists, and override realm ids whose realm was deleted, are preserved verbatim rather than silently dropped.
A stale member's row is labeled **Stale member** and keeps its remove control.
A stale travel actor is labeled **Stale travel actor** on its tile and keeps its unlink control.
A stale override realm shows as **Unknown realm** on the override control until you choose **Auto** or a different realm.

## Setting A Party's Current Realm

A party's current realm is resolved **per crafting system**, in this order:

1. **GM manual override** is set from **World > Parties**.
2. **Travel actor token sensing** checks the travel actor's placed tokens against realm Scene Region mappings and reports the *Travel actor* source label when it resolves.
3. **Unresolved** means no current realm.

To set the override, choose a realm from the **Current realm override** picker on the party's card.
The picker's leading **Auto** option clears the override again and hands the party back to travel-actor sensing.
The control is available only while a Gathering-enabled crafting system is selected and **Enable Travel & Realms** is on.
Otherwise the party card explains the missing prerequisite in place of the picker and does not write an override.
Both writes are stamped with the updating user and time.
A disabled realm can still be chosen and still resolves, marked as disabled in the picker, and an override id whose realm was deleted surfaces as stale repair evidence and does not resolve.

The picker sits beneath the travel-actor panel in the right-hand column of each party card.

## Environment Realm Membership

An environment declares which realms it belongs to, and it can belong to **multiple** realms.
When **Enable Travel & Realms** is on, the environment editor shows a multi-select chip control (like the biome selector) listing the world's realms.
When the toggle is on but no realms exist yet, the selector shows an empty state pointing you to **World > Travel** to create realms first.
The selector is hidden while the toggle is off.

## Environment Location Rules

On top of realm membership, environments can declare explicit location availability rules.
All four are optional lists.
An empty (or absent) list means "no rule":

| Rule | Effect |
|:------|:-------|
| Included realms | Available only when a current realm is one of these realms |
| Excluded realms | Blocked while any current realm is one of these realms |
| Included biomes | Available when any current realm carries one of these biomes |
| Excluded biomes | Blocked when any current realm carries one of these biomes |

{: .note }
> Included realms are chosen in the environment editor's multi-realm selector (toggle on).
> The biome and exclusion rules are authored through the API or by system import and export.
> Saving checks that the chosen realms exist on the owning crafting system.
> These rules gate **location availability** only.
> The old single free-text region on an environment is **inert**.
> It is not a composition or availability input and is no longer shown in the editor.
> The migration moves it into the environment's included realms.

Availability is only evaluated when **Enable Travel & Realms** is on.
While the toggle is off, every environment is available regardless of these fields.
When on, availability follows these rules:

1. An environment with **no** location rules is never location-blocked.
   Existing environments behave exactly as before.
2. **Exclusions win.**
   A realm or biome exclusion matched by *any* current realm blocks the environment, even when an inclusion also matches.
3. An environment with inclusions is available when any current realm's id is included **or** any current realm carries an included biome.
4. An environment with inclusions and **no resolved current realm** is blocked with a *no current realm* reason.
5. An exclusion-only environment with no resolved current realm is available.

At attempt time the engine re-resolves location fresh.
A stale listing (for example, an override cleared between listing and clicking **Attempt**) can never start a location-gated attempt.

## What Players See

Location-gated environments stay listed but blocked, with a localized reason:

- *"Not available in the party's current realm."* when the environment is excluded or no inclusion matches.
- *"No party realm is set.
Ask the GM to set the party's current realm."* when the environment requires a realm and none is resolved.

Each listed environment also carries redaction-safe location information (whether it is gated, whether it is available, why, and disclosure-safe current-realm labels) and, on blocked rows, travel guidance.
That guidance covers the destination realms the viewer is allowed to see (non-secret or already discovered), plus a count of secret undiscovered destinations.
Macros and future player UI can use this to show travel goals such as "Travel to Ashen March" without leaking secret geography.

{% include screenshot.html case="player-gathering-realm-locked" caption="A realm-locked environment in the player's environment column, listed but out of reach." %}

### The actor bar's current-realm chip

The gathering app's actor selection bar carries a **current-realm chip** alongside the weather and time-of-day context.
The chip's current realm belongs to the **party and system**, not to any one environment, so it is shown for the selected actor's active realm-enabled gathering system whether or not an environment is selected.
The chip therefore appears whenever the realm subsystem is enabled, **including when every environment is locked** and none is selectable.
It shows **"No current realm"** when the party has no resolved current realm, giving the player a diagnostic signal explaining why every environment is locked.
When a current realm is resolved, the chip shows the realm name(s) with the same redaction behavior as everywhere else.
A secret, undiscovered realm reads as **Undiscovered realm**, and the chip never fabricates a realm name.
The chip carries an accessible name ("Realm: <value>") and announces its appearance and value changes through a polite live region.
When more than one realm-enabled gathering system is present in the listing, a single chip cannot honestly represent both systems' realm contexts, so the listing-level chip is omitted and falls back to the selected environment's value.
Its absence in that ambiguous case is intended.

### Secret realms and discovery

Realm knowledge is **actor-scoped**: it follows the character across party changes and is stored on the actor.
For a non-GM viewer, a *secret, undiscovered* realm never exposes its name anywhere.
It reads as **Undiscovered realm**.
GMs always see real names, non-secret realms are always disclosed, and the "always visible" reveal mode discloses every realm name.

GMs reveal or hide a realm for an actor through the API (see below).
Revealing a realm checks that it belongs to the right crafting system, and each discovery records when and how it was learned.

## API

Most realm and travel work is done in the UI described above.
For macro authors, Fabricate also exposes the same capabilities programmatically.
GM-facing entry points cover party management (members, travel actor, current-realm override) and world realm management and settings, including the few realm settings not surfaced in the UI.
A player-callable lookup returns a redaction-safe current-realm summary for an actor: a non-GM caller never receives a secret undiscovered realm's name.
GM-only calls set or clear a party's current-realm override and reveal or hide a realm's discovery for an actor.
Older macros that used the pre-rename names keep working.

See the [API Reference]({% link api/index.md %}) for exact signatures.

## Data Persistence

| What | Where it lives | Contents |
|:---------|:----|:---------|
| Realms and realm settings | On each crafting system | The realms and realm behavior settings for that system |
| Parties | At the world level | Fabricate-managed parties, members, travel actors, and per-system overrides |
| Realm discovery | On each actor | Which realms that character has discovered, per system |

Because realms live on the crafting system, they travel with the system when you export and import it (through the import dialog and the export API), automatically.
Import checks the realm data, warns about unnamed realms, accepts older exports, and re-homes each imported realm to the system you are importing into.
