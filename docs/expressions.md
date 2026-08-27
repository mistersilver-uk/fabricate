---
layout: default
title: Expressions
nav_order: 3
---

# Expressions

Fabricate asks you to type a value into a lot of fields — a crafting check's roll, a tool's bonus, a stamina pool, a modifier, a prerequisite, a coin balance.
Most of those fields take more than a plain number, and the ones that do all share the same syntax.

This page is the reference for that syntax, wherever you meet it.

{: .note }
> Four different kinds of thing are covered here, and telling them apart is most of the battle.
> A **roll expression** can roll dice and do arithmetic.
> A **roll-data path** names one value on a character and does no arithmetic at all.
> A **document data path** names a field on an actor or an item.
> A **currency denomination** names one of your game system's own coin types and is none of the above.
> The field reference below says which one each field wants.

---

## Which fields take what

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Where | Field | Takes |
|:------|:------|:------|
| [Checks › Crafting / Salvage / Gathering]({% link checks/index.md %}) | **Expression**, in the **Roll expression** section | Roll expression |
| [Checks]({% link checks/index.md %}) | **DC** | A whole number, or a Dynamic DC macro — **not** an expression |
| [World › Rules & Resources › Modifiers]({% link world/rules/modifiers.md %}) | **Expression** | Roll expression |
| [World › Rules & Resources › Modifiers]({% link world/rules/modifiers.md %}) | **Minimum** and **Maximum** bounds | A whole number |
| [World › Rules & Resources › Character Prerequisites]({% link world/rules/character-prerequisites.md %}) | **Property path** | Roll-data path |
| [World › Rules & Resources › Currency]({% link world/rules/currency.md %}) | **Actor data path**, under that spend strategy only | Actor data path |
| [Tools]({% link tools.md %}) | **Bonus expression** | Roll expression, and the one field that adds `@` for you |
| [Tools]({% link tools.md %}) | **Dice expression** and **Break below** | Roll expression, and a number the roll must stay at or above |
| [Gathering › Settings]({% link gathering/settings.md %}) | **Maximum stamina**, **Starting stamina**, **Amount per interval** | Roll expression |
| [Gathering › Tasks]({% link gathering/tasks.md %}) | **Stamina cost** | A whole number, 0 or more — **not** an expression |
| [Gathering › Tasks]({% link gathering/tasks.md %}) | Per-cost **modifier reference** | A [modifier](#modifiers-and-modifier-references) from the library, an operator, and optional bounds |
| [Gathering › Tasks]({% link gathering/tasks.md %}) | **Visibility gate** formula and threshold | Roll expression, both halves |
| [Gathering › Tasks]({% link gathering/tasks.md %}) and [Events]({% link gathering/events.md %}) | Per-row **modifier reference**, and its expression override | A modifier from the library, or a roll expression that replaces it |
| [Components › Complications]({% link components/complications.md %}) | **A dice expression resolves true** (condition), and **Roll a dice expression** (effect) | Roll expression |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Everything in the roll-expression rows uses the syntax in the next section.
Numbers, character data, arithmetic and ordinary dice behave identically in all of them.
One shape is the exception, and it is called out where it appears: a [dice count taken from character data](#dice-counts-from-character-data).

---

## Roll expressions

A roll expression is whatever your game system's dice engine accepts.
Fabricate hands your text to that engine along with the acting character's roll data and uses the total, so **anything you can type into a `/r` chat command works here**, and anything that errors there errors here.

An expression can be any of these, alone or combined:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Kind | Example | Result |
|:-----|:--------|:-------|
| A whole number | `40` | Always 40 |
| Character data | `@abilities.con.mod` | That character's Constitution modifier |
| Dice | `2d6` | A fresh roll each time it is evaluated |
| Arithmetic | `10 + 4 * @abilities.con.mod` | Combines the above |
| A function | `floor(@details.level / 2)` | See math functions below |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Referencing character data

A term beginning with `@` is looked up on the acting character's **roll data** — the same prepared object your game system exposes to an inline chat roll.
The paths differ from one game system to the next.

When no character is resolved, every `@` term reads as **0** rather than erroring.
That matters in two places: a check preview with no actor selected shows every roll-data key as zero, and a gathering formula evaluated before a character is chosen does the same.

### The leading `@`, and the one field that adds it for you

Almost every expression field is a **plain text field**: what you type is stored byte for byte.
So a character-data path needs its own `@`, and a number or a die must not have one.

| You want | You type |
|:---------|:---------|
| A character's Medicine bonus | `@abilities.med.mod` |
| A flat +2 | `2` |
| A d4 | `1d4` |
| All three added together | `@abilities.med.mod + 2 + 1d4` |

{: .warning }
> **The Tool Studio's Bonus expression field is the exception.**
> It stores roll-data paths with `@` for you, so you enter the path **without** one — `abilities.str.mod`, not `@abilities.str.mod`.
> A number or a dice expression still goes in as-is.
> The field's own hint states this, and nowhere else in Fabricate behaves this way.

### Dice

Standard dice notation works, including the modifiers your game system's engine supports.

| What it does | Expression |
|:-------------|:-----------|
| Roll two six-sided dice | `2d6` |
| Roll a d6 and add 1 | `1d6 + 1` |
| Roll two d20 and keep the highest | `2d20kh1` |
| Roll a pool and keep the best of it | `{1d6,1d8}kh1` |
| Explode sixes | `4d6x6` |

A rolling expression is **rolled afresh every time the field is evaluated**, and that is not the same moment for every field.

### Math functions

`floor`, `ceil`, `round`, `abs`, `min` and `max` are all available.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| What it does | Expression |
|:-------------|:-----------|
| Five plus half your level, rounded down | `floor(@details.level / 2) + 5` |
| Half your level, rounded up | `ceil(@details.level / 2)` |
| Never lower than 10, but scales with Constitution | `max(10, 4 * @abilities.con.mod)` |
| Never higher than 50 | `min(50, 4d6 + 10)` |
| Between 1 and 6, whatever the roll | `min(max(1d8, 1), 6)` |
| Always positive | `abs(@abilities.con.mod)` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Functions nest, so a clamp around a scaled value is one expression:

```text
min(max(floor(@details.level / 2) + @abilities.wis.mod, 1), 10)
```

That reads as: half your level rounded down, plus your Wisdom modifier, never below 1 and never above 10.

{: .warning }
> **Function names are lowercase.**
> `MAX(1, 2)` is refused by the dice engine; `max(1, 2)` is accepted.

### Dice counts from character data

Wrapping a term in parentheses lets it decide **how many** dice to roll.

| What it does | Expression |
|:-------------|:-----------|
| One d6 per point of Constitution modifier | `(@abilities.con.mod)d6` |
| The same, but never fewer than one die | `(max(1, @abilities.con.mod))d6` |
| One d4 per character level | `(@details.level)d4` |

{: .warning }
> A dice count must resolve to a **non-negative whole number**.
> If the value behind it can reach 0 or go negative, guard it with `max(1, …)` as above, or the expression fails and contributes nothing.

{: .warning }
> **This is the one shape that is not safe everywhere.**
> The gathering fields evaluate it correctly.
> A check modifier is pre-checked for rollability by a stricter, non-rolling pass, and a parenthetical dice count can fail that pass — in which case the modifier is treated as unrollable and contributes nothing, silently.
> Test this shape in the field you actually mean to use it in before relying on it.

### What the dice engine refuses

Three mistakes are common enough to name, because each one silently costs you the whole expression:

- **A capitalised function name.** `MAX` instead of `max`.
- **More than 999 dice.** A count that resolves above the engine's cap is rejected outright.
- **A decimal without a leading zero.** Write `0.5`, never `.5`.

When a check modifier's expression is one Fabricate cannot roll, the check's Validation section says so by name, and the modifier contributes nothing until you fix it.

---

## Character data by game system

The `@` paths are **your game system's**, not Fabricate's.
Fabricate never invents them and never translates between systems, so the same expression is right in one world and wrong in another.

Fabricate ships preset bundles for two systems.
Open **World › Rules & Resources › Modifiers** and choose **Seed presets** to put them into your world, already written for the game system you are running.
Seeding delivers the ability and skill entries in the tables below, and nothing else on this page.

### D&D 5e

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Value | Path |
|:------|:-----|
| Ability modifier | `@abilities.str.mod`, and the same shape for `dex`, `con`, `int`, `wis`, `cha` |
| Ability score | `@abilities.str.value` |
| Skill total | `@skills.ath.total`, and the same shape for `acr`, `ste`, `prc`, `inv`, `nat`, `sur`, `his` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Two more paths appear in examples on this page and are **not** part of the seeded set: `@prof` for the proficiency bonus and `@details.level` for character level.
Both are real in D&D 5e, but verify them with `/r` before you rely on them, and note that `@details.level` is a **player-character** path — a D&D 5e NPC carries `@details.cr` instead, so an NPC crafter reads `@details.level` as 0.

### Pathfinder 2e

Pathfinder 2e reaches the same values through the actor document, so its paths are longer.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Value | Path |
|:------|:-----|
| Ability modifier | `@actor.system.abilities.str.mod`, and the same shape for `dex`, `con`, `int`, `wis`, `cha` |
| Skill modifier | `@actor.system.skills.athletics.totalModifier`, and the same shape for `acrobatics`, `stealth`, `nature`, `survival`, `occultism` |
| Perception | `@actor.system.perception.totalModifier` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .note }
> `@abilities.wis.mod` in D&D 5e is `@actor.system.abilities.wis.mod` in Pathfinder 2e.
> A world that changes game system needs its expressions rewritten; nothing migrates them.

### Any other game system

Fabricate works with any Foundry game system, and only the two bundles above are shipped.
Everywhere else, find the path once and reuse it:

1. Select a character you own.
2. Type `/r 1 + @some.path.here` in chat.
3. If it resolves to more than `1`, the path works, and it works in every Fabricate expression field.
   If it resolves to exactly `1`, the path is wrong and is being read as 0.

{: .tip }
> Your game system's own character sheet is the fastest map.
> Whatever a sheet displays, the system stores somewhere on the actor, and a system's documentation or its `template.json` names it.

---

## Modifiers and modifier references

Two things share the word "modifier", and the difference decides where you write an expression.

A **modifier** is an entry in the world's one shared library, at **World › Rules & Resources › Modifiers**.
It carries the expression, and optional **Minimum** and **Maximum** bounds.

A **modifier reference** is how something attaches that entry: a gathering drop row, an event, or a task's stamina cost.
A reference carries no expression of its own by default.
It names a library modifier, an **operator** of `+` or `-`, and its own optional bounds.

That operator is how you make an attachment subtract.
Write the expression positively in the library — `@abilities.str.mod` — and set the reference's operator to `-`.
Do not negate inside the expression: an expression of `-@abilities.str.mod` attached with a `-` operator cancels out to an increase, and it also breaks on a negative value, because a Strength modifier of −1 substitutes to `--1`.

A reference may override the library's expression for that one attachment.
That override is a full roll expression and replaces the library entry's own.

{: .warning }
> Bounds that cannot be satisfied make an entry contribute **nothing at all**, rather than clamping to the nearest one.
> A minimum above its maximum, or a bound too large for the dice grammar to express, is reported in the check's Validation section and the modifier is skipped.
> Leaving a bound empty means no limit; a bound of `0` is a real limit of zero.

---

## Roll-data paths

[Character prerequisites]({% link world/rules/character-prerequisites.md %}) do **not** take a roll expression.
A prerequisite is three separate fields — a **property path**, a **comparison** and a **value** — and the path is a plain dotted path with **no leading `@` and no arithmetic**.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Prerequisite | Path | Comparison | Value |
|:-------------|:-----|:-----------|:------|
| Proficient with Smith's Tools (D&D 5e) | `tools.smith.value` | at least | `1` |
| Proficient in Arcana (D&D 5e) | `skills.arc.value` | at least | `1` |
| Intelligence modifier of +2 or better (D&D 5e) | `abilities.int.mod` | at least | `2` |
| Strength score of 21 or better (D&D 5e) | `abilities.str.value` | at least | `21` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .warning }
> Fabricate also ships Pathfinder 2e prerequisite presets, and they are **not** listed here.
> Their paths are written in the short form (`skills.cra.rank`), while the Pathfinder 2e *modifier* presets reach the same actor through the long form (`@actor.system.skills.crafting.totalModifier`).
> Both are read off the same roll data, so they cannot both be right.
> Verify a Pathfinder 2e prerequisite path against your own actor with `/r` before relying on it, exactly as for `@prof` above.

The comparisons are equals, not equals, greater than, at least, less than, at most, is true, is false, and exists.
The last three take no value, so the value field is hidden when you choose one.

An unknown or mistyped path never throws.
It falls back to `0` for a numeric comparison and to `false` for a boolean or existence one, which means a typo reads as a prerequisite that is simply never met.

{: .note }
> D&D 5e stores proficiency as a multiplier, not a flag: `0` is not proficient, `0.5` is half, `1` is proficient and `2` is expertise.
> "Proficient or better" is therefore **at least 1**, not **is true**.
> Pathfinder 2e stores proficiency as a rank from 0 to 4, so "trained or better" is **at least 1** there too.

---

## Document data paths

Two settings name a field on an **actor or item document** rather than on prepared roll data.
These are also plain dotted paths with no `@`, and they usually begin with `system.` because that is where a game system keeps its own data.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Setting | Resolved against | Example |
|:--------|:-----------------|:--------|
| [Currency]({% link world/rules/currency.md %}) unit **Actor data path** | The acting actor | `system.currency.gp` |
| **Item Stack Quantity Field**, in the module settings | Each item | `system.quantity` for D&D 5e, Pathfinder 2e and most systems |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .warning }
> A currency unit only carries an actor data path under the **Actor data path** spend strategy.
> Choose a different strategy and a unit names something else entirely: under a provider it carries a **denomination**, one of your game system's own coin types, and under a macro it carries neither.
> Fabricate's shipped D&D 5e currency preset uses paths; its Pathfinder 2e preset uses denominations, because Pathfinder 2e keeps coins as items rather than as a number on the actor.
> See [Currency]({% link world/rules/currency.md %}) for the three strategies.

Currency amounts themselves are **plain numbers**.
A recipe's currency cost is an amount and a unit; it is not an expression and cannot roll.
What varies per game system is only where the coins live.

{: .warning }
> The item stack quantity field is the one setting here with teeth.
> If it points somewhere your items do not keep a count, crafting and salvage delete a whole stack instead of reducing it.
> Fabricate checks the field against your world's items and warns you when it does not resolve.
> See [Troubleshooting]({% link help/troubleshooting.md %}#crafting-salvage-or-alchemy-deletes-a-whole-stack-instead-of-reducing-it).

---

## When each field is evaluated

This only matters when your expression rolls dice, but when it does it matters a lot: the same `1d6` is a fixed value in one field and a fresh roll every few minutes in another.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Evaluated | What dice do |
|:------|:----------|:-------------|
| **Maximum stamina** | Once per character, when the pool is first rolled or re-rolled from the GM's Roll/Reset button | Fixed for that character until re-rolled |
| **Starting stamina** | Once, at the same moment as the maximum | Fixed for that character |
| **Amount per interval** | Once per regeneration pass, then multiplied by however many whole intervals have elapsed | Rolled once per pass, not once per interval — advancing eight hours on an hourly interval gives `1d4 × 8`, not eight separate `1d4` rolls |
| **Modifier references** on a cost, a drop row or an event | Every gathering attempt, and again to show the cost in the player listing | Re-rolled each time, so a **rolling** cost modifier can display one number and charge another. Use a flat expression for a cost you want a player to be able to trust. The task's own stamina cost is a fixed number and never rolls |
| **Visibility gate** | Whenever a task's visibility is tested for a character | Re-rolled each test |
| **Check roll expression** | Every attempt that rolls | Re-rolled each attempt |
| **Check modifiers** | Every attempt, appended to the check's own roll | Rolled once, with the check, and shown on the chat card |
| **Tool bonus** | Every eligible **crafting or salvage** check — gathering checks do not apply Tool bonuses | Resolved to a single number first, then added as one flat term, so its dice never appear in the check's own breakdown |
| **Tool breakage dice** | Every time breakage is tested | Re-rolled each test |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Rounding, floors and clamps

Different fields treat the number your expression produces differently.

- **Stamina maximum, starting stamina and regeneration amount** are **rounded to a whole number and floored at 0**, so a negative result becomes `0`.
  Starting stamina is additionally capped at the rolled maximum.
- **Modifier references** may reduce as well as increase, through their `-` operator rather than through a negative expression.
  A cost is floored at 0 only after everything has been summed, so a reducing modifier really does reduce it.
  A **check** modifier has no reference and so no operator, which is why a negative expression such as `1d4 - 2` is the only way for one to subtract from a roll.
- **Check modifier bounds** clamp what a modifier contributes, **after it rolls**.
  A `1d8` modifier with a maximum of `+6` contributes 6 on a roll of 7 and 3 on a roll of 3.
  Leaving a bound empty means no limit, and empty is not the same as zero.
- **A gathering stamina cost** is summed from its base and every modifier reference, then **rounded and floored at 0**.
  A task whose base cost is 0 stays free whatever its modifiers say.

---

## Worked examples

Three crafting systems, each leaning on expressions differently.
The paths are D&D 5e's unless stated; substitute your own game system's.

### A blacksmithing system

Skill-driven and tool-gated, with no randomness in the setup itself.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Expression | Why |
|:------|:-----------|:----|
| Crafting check roll | `1d20 + @prof` | Proficiency only; everything else arrives as a named modifier |
| Modifier "Strength" | `@abilities.str.mod` | Applied by the smithing check |
| Modifier "Smith's Tools" | `2` | A flat bonus the GM grants for good equipment |
| Tool bonus on a masterwork hammer | `1` | A plain number is a plain number, `@` or no `@` |
| Gate on who may wield the forge | A **character prerequisite**, picked on the Tool's Requirements tab | Tools gate on prerequisites, not on a typed expression |
| Prerequisite to learn a recipe | `tools.smith.value` at least `1` | Proficient with Smith's Tools |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### An alchemy system

Volatile on purpose, so dice appear in the modifiers and not just the roll.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Expression | Why |
|:------|:-----------|:----|
| Crafting check roll | `1d20 + @skills.arc.total` | Arcana carries the whole roll |
| Modifier "Unstable reagents" | `1d4 - 2` | Swings either way; give it bounds if that is too wild |
| Modifier "Alchemist's supplies", maximum `+3` | `floor(@details.level / 4) + 1` | Scales with level, capped by the bound rather than by the expression |
| Complication condition | `1d6` against a threshold | The brew goes wrong on a low roll |
| Prerequisite to learn a formula | `skills.arc.value` at least `1` | Proficient in Arcana |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### A herbalism and gathering system

The one that uses the stamina economy, so evaluation timing does real work.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Expression | Why |
|:------|:-----------|:----|
| Maximum stamina | `10 + 2 * @abilities.con.mod` | Rolled once per character, so hardy characters forage longer |
| Starting stamina | `floor((10 + 2 * @abilities.con.mod) / 2)` | Characters begin a session half-rested |
| Amount per interval | `1d4` | Rolled once per regeneration pass, so a long time skip pays one roll covering every elapsed hour, not one roll each |
| Stamina cost on a difficult task | `3` | A plain number — this field is a spinner, not an expression |
| Drop-row modifier "Survival" | `@skills.sur.total`, attached with a `+` operator | Shifts the drop chance on a `d100` gather |
| Cost modifier "Strong back" | `@abilities.str.mod`, attached with a `-` operator | The reference subtracts, so a strong character pays less stamina |
| Visibility gate on a rare herb | `@skills.nat.total`, with a threshold of `15` | Both halves are expressions; the task shows at or above the threshold |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Test before you save

The dice engine that evaluates a Fabricate expression is the same one behind `/r`, so chat is a complete test bench.

1. Select the character the expression should resolve against.
2. Run it, for example `/r floor(@details.level / 2) + @abilities.wis.mod`.
3. If it produces the number you expected, paste it into the field.

Two Fabricate surfaces will also tell you before you commit:

- The [Checks]({% link checks/index.md %}) editor's roll section shows **What actually gets rolled** under the formula field, with every applied modifier beside it and the rule that combines them.
- Each Checks activity page counts its own issues, and its Validation section states each one in full — including an expression the engine cannot roll, and a modifier bound too large to appear in a formula.

---

## When an expression is not doing what you expect

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Symptom | Likely cause |
|:--------|:-------------|
| The expression contributes nothing at all | The dice engine refused it. Check for a capitalised function name, a decimal without its leading zero, or a dice count above 999 |
| A character-data term behaves as 0 | The path is wrong for this game system, or no character is resolved yet. Test it with `/r` |
| A prerequisite is never met | The same cause. An unknown path falls back to `0` or `false`, so a typo reads as an unmet condition rather than an error |
| A tool bonus silently contributes 0 | The Tool Studio adds `@` only to a **bare path**. A compound entry such as `abilities.str.mod + 2` gets none, so its path term reads as 0. Write the compound with its own `@` |
| Stamina always starts at 0 | The expression resolved negative, and stamina is floored at 0 |
| A dice-count expression fails intermittently | The count reached 0 or went negative. Guard it with `max(1, …)` |
| A modifier never exceeds a small number | It has a maximum bound set. Empty means no limit, but a bound of 0 is a real limit of zero |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

For anything not listed here, see [Troubleshooting]({% link help/troubleshooting.md %}).
