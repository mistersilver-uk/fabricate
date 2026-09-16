---
layout: default
title: Travel
parent: World
nav_order: 2
has_children: true
---

# Travel

Location-aware gathering lets a GM describe campaign geography as first-class **realms**, group actors into Fabricate-managed [parties]({% link world/parties.md %}), and make gathering environments available or unavailable based on where the party currently is.

Token-driven realm sensing from the travel actor's placed token is available.
Realm modifiers applied to gathering calculations remain planned.

**Travel** has two destinations: [Realms]({% link world/travel/realms.md %}), the realm library itself, and [Map Region Links]({% link world/travel/map-region-links.md %}), which pairs a realm with the Foundry Scene Regions that stand for it.
The group is initially collapsed when the Crafting System Manager opens.

{: .note }
> A **Gathering Realm** is the Fabricate gathering-geography concept.
> It is **not** a Foundry Scene Region drawn on the canvas.
> That is the distinct Foundry object a realm maps onto.
> Several Foundry Scene Regions can map onto one realm through the realm's scene mappings, so a single realm can span several drawn map areas.
> A realm **never** decides which tasks or events belong to an environment (that is biome, plus danger for events).
> It only decides location availability.

{: .gm }
> Realm-aware travel is **off by default** per crafting system and is enabled with the **Enable Travel & Realms** toggle in gathering Settings (see [Enabling Travel & Realms](#enabling-travel--realms)).
> Only GMs can manage realms and set current-realm overrides.
> Players experience locations through the gathering app's blocked reasons and the redaction-safe location API.

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
