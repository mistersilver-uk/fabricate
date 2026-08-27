---
layout: default
title: System Overview
parent: Crafting Systems
nav_order: 1
---

# System Overview

{: .gm }
> The System Overview is GM-only.
> The whole crafting manager is GM-scoped.

The **Overview** is a single place to see every validation issue across a crafting system and jump straight to whatever owns each one.
Open it from the **Overview** button in the manager rail when a system is selected.
The button shows a count badge of the open critical and warning issues, so you can tell at a glance whether a system needs attention.

The Overview lists each issue with a severity chip (critical, warning, or note), the name of the thing it affects, and a short description of the problem.
Issues are grouped by what they affect:

- **System blockers** are problems that make the whole system unusable.
  They have no deep-link of their own because the Overview is where you resolve them.
- **Recipes** lists per-recipe problems, such as a recipe with no name or a result set that is not assigned to any check outcome.
- **Gathering environments**, **Gathering tasks**, and **Gathering events** list problems with your gathering setup.
- **Component salvage** lists components whose salvage setup is invalid for the current salvage mode.

Each issue that affects an editable thing has an **Open** button (such as **Open recipe**, **Open environment**, or **Open component**) that takes you straight to that editor, with the right tab selected, so you can fix the problem without hunting for it.

When a system has no issues, the Overview says everything is ready to use.

## System Blockers

A **system blocker** is a problem serious enough to make the entire system unusable until you fix it.
Examples include:

- The system is in Routed by check mode but has no routed crafting check, so no recipe can resolve.
- Progressive mode with no progressive crafting check, or no component with a difficulty of 1 or more.
- Multi-step recipes are still enabled while the system is in Alchemy mode.
- Two recipes share an ingredient signature in Alchemy mode, so attempts are ambiguous.

When a system has a blocker, the System Overview shows a banner at the top.
The **System settings** page shows a matching banner with an **Open system overview** link, so you are warned wherever you are working.

While a blocker is present, players cannot see or use any of the system's recipes.
See [How Players See a Broken System](#how-players-see-a-broken-system).

Blockers are worked out live and are never stored.
The moment you fix the underlying gap, the blocker clears and the system becomes usable again on its own.
You never have to re-enable recipes by hand.

## How Players See a Broken System

Fabricate keeps players from running into broken setups, while still letting GMs see everything so they can fix them.

- **A system blocker hides the whole system.**
  While a system has a blocker, players see none of its recipes or gathering, and any attempt to craft in it is refused.
  GMs still see the system and all of its recipes.
- **A per-entity problem hides only that entity.**
  When a single recipe or component is broken but the system as a whole is fine, only that one recipe or component is hidden from players.
  The rest of the system stays visible and usable.
- **GMs always see everything.**
  A GM is never hidden from a broken system or a broken recipe, so you can always reach what needs fixing.

Because these checks run live, hidden recipes reappear for players the moment you resolve the problem.
Nothing is permanently disabled behind the scenes.
