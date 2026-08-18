---
layout: default
title: Protecting Your Worlds
nav_order: 10
---

# Protecting Your Worlds

This page explains how Fabricate looks after the data it stores in your world, and the engineering practices and pipelines that sit between you, and every published version of Fabricate.
It's written for GMs and players who are deciding whether to trust the module with their game.
Primarily, I've written this document to address valid concerns GM's might have with unmoored agentic engineering.

{: .note }
> Fabricate's safeguards are about respecting the data it manages and failing safely when something is wrong.
> They are not a substitute for your own Foundry backups.
> Keep regular world backups, just as you would for any module.
> You can also export an individual crafting system to a file from its manager.
> See [Import & Export]({% link import-export.md %}).

---

## Staged, gated releases

A new build of Fabricate does not reach you the moment a change is written.
Every change has to pass a series of automated checks before any release exists, and a maintainer then has to choose to promote it.

The flow works like this.

1. Each change pushed to the main line of development runs the full automated test suite and a build.
2. If those pass, a real Foundry integration test boots an actual Foundry world and exercises the module end to end through the Foundry UI.
3. Only when both succeed is a release candidate cut and published to a closed beta channel for testers.
4. A maintainer reviews the candidate and, when satisfied, promotes it to a full release.
5. The full release is published to the official Foundry package registry, which is where your Foundry client downloads it from.

This means the version you install through Foundry has already passed the tests, the integration check, and a round of closed beta, and a human chose to ship it.

---

## Automated testing

Fabricate ships with a large automated test suite, currently over three thousand seven hundred fast-running unit tests.
These run on every proposed change and on every push to the main line of development.
They cover the data models, the rules that read and repair stored data, the startup migrations, the parts that talk to your world settings, and the logic behind the interface.

On top of the unit tests, Fabricate runs a real Foundry integration test.
It starts a genuine Foundry server in a container, loads a world, activates the module, and then drives it the way a GM would.
It creates actors and items, sets up a crafting system, and performs a real craft.

The integration test watches the browser console the whole time it runs.
If the module logs a single runtime error during that session, the test fails.
It also captures screenshots along the way, so a maintainer can see exactly what the module looked like when the test ran.
A release candidate cannot be cut unless this check passes.

---

## Static analysis & code quality

Beyond running the module, Fabricate's code is checked for quality before it can ship.
Automated formatting, linting, and style checks run on every proposed change.
A separate code quality gate tracks test coverage on new code, duplication, security hotspots, and long-term maintainability.

Two of these checks exist specifically to protect the rest of your Foundry setup, not just Fabricate.

Foundry loads every module's styling into the same shared page, so a careless module can change how another module or game system looks.
Fabricate has an automated check that refuses any styling rule that is not scoped to Fabricate's own windows.
This is there to stop Fabricate's appearance from leaking onto, for example, a Dungeons & Dragons 5e character sheet.

A second check forbids stray, hard-coded colours in the interface code, so Fabricate's styling stays consistent and theme friendly.

---

## Reversible data migrations

This is the safeguard that matters most when you are trusting a module with an existing world.

Over time, the way Fabricate stores its data sometimes has to change.
When that happens, Fabricate runs a migration once for your world, the next time it loads, to bring your stored data up to the new shape.
Migrations are versioned and run in order, and each one only writes anything back if it actually changed something.
They are also written to be safe to run more than once, so a repeated run does no harm.

The important part is what happens when a migration cannot finish.

Before a migration runs, Fabricate takes an in-memory checkpoint of your data.
If the migration hits a problem it cannot safely work around, Fabricate restores that checkpoint and writes nothing at all.
Your world's stored Fabricate settings are left exactly as they were before the load.
This is a clean abort, not a half-finished write that leaves your data in a broken middle state.

Because nothing was written, Fabricate also does not mark the migration as done.
The next time you reload your world, it will try again.
That gives you a chance to fix the underlying problem first, if it's with your world data, or me a chance to fix it if it's an error in the module.

When a migration aborts, Fabricate shows you a recovery dialog.
It tells you plainly that this pass saved nothing, and that your stored data is exactly as it was before the load.
It asks you to reload afterwards, because the half-migrated copy the module was working on lives only in that session and a reload throws it away.
When the problem comes down to specific recipes or systems, it lists them with the reason each one failed and what to do about it.
The dialog defaults to keeping your existing data, so the safe choice is the one already selected.

The dialog's rollback advice depends on how this world stores its recipes AND its crafting components.
Under the original arrangements it simply names a Fabricate version you can roll back to and keep working.
Where either has been moved to its own records it tells you _not_ to roll back yet: an older Fabricate cannot read that arrangement at all, and would start writing over it.
In that case the dialog asks you to set every arrangement it names back to its original option, reload, and let the conversion finish first — that conversion only exists in the newer build, so once you have rolled back there is nothing left to run it with.
It names only the arrangements you actually have to change, so you get one instruction rather than one instruction and a no-op.

### When migrations do not run at all

There are three situations where Fabricate deliberately skips the whole migration pass rather than guessing.

If your recipes are part-way through a storage change, no single place holds all of them, so Fabricate refuses to read a partial collection and decide anything from it.
If it cannot read your recipes at all, it refuses too — an unreadable collection and an empty one look identical, and treating one as the other is exactly how a migration would confidently write the wrong answer.
And if a migration ran but its results could not be saved, Fabricate abandons the remaining writes rather than saving some of them.

In all three cases nothing is written, the world is not marked as migrated, and the migrations simply run again next time.
Fabricate tells you which of the three happened.
Only the third asks you to reload straight away: in that one the migrations have already transformed the copy held in this session, so continuing to work from it would save migrated data into a world still recorded as un-migrated.

### Changing how recipes or components are stored

**Settings → Fabricate → Recipe Storage Arrangement** decides whether your world keeps every recipe in one combined record or gives each recipe a record of its own.
The second option loads large recipe collections much faster, and it is a one-way door for any older Fabricate: an older version reads no recipes at all from it, reports no error, and starts writing over them.

So Fabricate asks before it makes that change.
The confirmation names the loss and names the way back — set the arrangement to "One combined record" and reload, and Fabricate moves your recipes back before you roll anything back.
The safe choice is the one already selected, and closing the dialog without choosing counts as declining.
Nothing is changed until you say so.

The prompt appears on the GM client that will perform the change, which is the first GM connected to the world.
If an assistant GM changes the setting while no full GM is connected, the change is simply held until a GM loads the world and confirms it.

A few things Fabricate does around that change, so nothing goes missing:

<!-- markdownlint-disable markdownlint-sentences-per-line -->
- **It waits a load if it updated your data on the same load.** When a Fabricate update changes your stored data on start-up, the storage change is postponed to the next time a GM loads the world, and Fabricate tells you so. Two GMs loading at once can produce slightly different updated data, and the storage change has to work from one settled starting point.
<!-- markdownlint-enable markdownlint-sentences-per-line -->
- **It moves your recipes exactly as they are.** Nothing is re-read or re-interpreted on the way across, so a field a newer Fabricate has not learned about yet still arrives intact.
- **It checks every recipe arrived before it records the change.** If any recipe did not land, Fabricate leaves your world exactly as it found it and reports the problem, rather than recording a change it did not finish.
- **It never deletes a leftover recipe record it cannot account for.** If Fabricate finds a per-recipe record that the combined record does not describe, it leaves it alone and tells you, because that record is the only place a recipe could be hiding.
<!-- markdownlint-disable markdownlint-sentences-per-line -->
- **It tells you if the old combined record survived.** That can happen if the last step of the change did not complete. If the leftover copy matches, Fabricate clears it up; if it does not — which is what a round trip through an older version looks like — Fabricate leaves it alone and reports both counts rather than discarding work you may have done.
<!-- markdownlint-enable markdownlint-sentences-per-line -->

#### Components have their own arrangement, and their own confirmation

**Settings → Fabricate → Component Storage Arrangement** does the same job for your crafting components, and it is completely independent of the recipe one.
Its original option is **Nested inside each crafting system**, because that is literally where a component lives today — inside the crafting system that owns it, rather than in a combined record of its own.
Choosing **One record per component** gives each component a record of its own, which loads large component libraries much faster.

The loss it causes is quieter than the recipe one rather than louder, and it is worth reading carefully.
An older Fabricate does not fail or complain: every crafting system simply shows an **empty component library**, exactly as if you had never authored a component.
Recipes, tools, essences, categories and everything else keep working, which is what makes it easy to miss.

So the same confirmation appears, naming that loss and naming the way back — set the arrangement to "Nested inside each crafting system" and reload, and Fabricate moves your components back before you roll anything back.
Declining one arrangement's confirmation never declines the other: they are separate choices, and answering one says nothing about the other.

Two more things apply only to components:

<!-- markdownlint-disable markdownlint-sentences-per-line -->
- **A crafting system with an unusual id blocks the change for the whole world.** A component's record is filed under its crafting system's id, so a system whose id contains a dot cannot be filed at all. Fabricate refuses the change outright, names the systems involved, and changes nothing — rather than moving some components and leaving others behind, which would leave your world half in each arrangement with no way to describe it. Recreate or re-import those crafting systems with a valid id and the change goes ahead.
- **The crafting systems themselves are not moved.** Only the components are. Your crafting systems keep their essences, tools, item tags, categories, checks, realms and character prerequisites in the same place they have always been, which is why a rolled-back Fabricate still shows you the system and only loses sight of the components.
<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .warning }
> This is a safe-abort and recovery design, not a full backup of your world.
> Fabricate protects the data it manages and refuses to corrupt it, but it cannot restore data it never stored.
> Always keep your own Foundry world backups as well.

---

## Other ways Fabricate respects your data

A few more everyday safeguards are worth calling out.

**You are asked before anything destructive happens.**
When an action in the Crafting System Manager would discard unsaved edits or delete something, Fabricate asks you to confirm first through a standard Foundry confirmation dialog.
The one known exception is a recipe item you have open for editing in Books & Scrolls — despite the name, that surface manages every recipe item regardless of its Foundry item type, not just books and scrolls.
If another connected GM changes this system's visibility mode away from Item or Knowledge mode while you have unsaved edits open there, Fabricate can navigate you away and discard those edits without asking first.
Changing the visibility mode yourself does not trigger this, because that setting lives on the Crafting Settings screen, and leaving unsaved changes there always asks first.
Save your changes promptly to avoid losing them this way.

**Malformed data is repaired or ignored, not crashed on.**
Whenever Fabricate reads your stored configuration, it validates and cleans it up as it loads.
If part of the stored data is malformed, Fabricate repairs what it safely can and skips what it cannot, rather than failing to start.
Fabricate also tidies up stale saved preferences on startup, such as a remembered system or actor that no longer exists, so leftover references do not cause odd behaviour later.

**Fabricate's styling stays inside Fabricate's windows.**
As described above, an automated check keeps Fabricate's appearance from bleeding into other modules and game systems on the same page.

---

## Built with AI as a force multiplier

I will be upfront about this.
I build Fabricate with the help of AI coding agents, including Claude and Codex, and I understand why that gives some people pause.

I use these tools professionally, day in and day out, to deliver mission-critical platform infrastructure for a global finance company.
I know how to write a harness for them, prompt them effectively, automate guardrails around them, review their output, and feed corrections back so they keep improving.
I have applied that same discipline to Fabricate.

That discipline is the reason Fabricate has deep static code analysis, linting, expansive test coverage, and a complete end-to-end Foundry integration test.
Those safeguards are rare in Foundry modules, and they are exactly what an agent's output has to pass here before it can reach you.

Used responsibly, agents are a force multiplier.
If I had built all of that automation from scratch by hand, I would still be writing the automation instead of the module.
I work full time in a demanding job, and I have a family and a home to look after, so I do not have eight or more hours a day to pour into this.
The agents let the time I do have go into Fabricate itself, on top of guardrails I trust.

Here is the part that matters for your world.
Whether a particular line of code was typed by me or drafted by an agent is not what keeps your data safe.
What keeps it safe is everything every change has to pass before it can reach you, the automated tests, the static analysis and quality checks, the real Foundry integration test that fails on any runtime error, the staged and closed-beta release process, and the reversible migrations that refuse to corrupt your data.
On top of all of that, I review what ships and _I_ am **accountable** for it.

AI makes the work faster.
The engineering rigour and human governance I bring to the project are what protect your game.
