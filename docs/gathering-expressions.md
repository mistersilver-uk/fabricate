---
layout: default
title: Gathering Formulas
nav_order: 8.1
---

# Gathering Formulas

Several gathering fields accept a **formula** instead of a plain number:

- **Maximum stamina** and **Starting stamina** (system Settings → Stamina mode)
- **Amount per interval** (stamina regeneration)
- **Stamina cost** modifiers on a gathering task
- **Character modifier** library entries (used by drop chances and costs)

Every one of these uses the **same syntax**, so an example that works in one field works in the others.

{: .note }
> Formulas are evaluated with your game system's dice engine, against the **selected character's** roll data — the same values you'd reference in an inline chat roll. So a formula that works in `/r` works here.

---

## How formulas are evaluated

- The result is **rounded to a whole number**.
- For **Maximum stamina**, **Starting stamina**, and **Amount per interval**, the result is **floored at 0** — a negative result becomes `0`. Starting stamina is also clamped to be no greater than the rolled maximum.
- **Cost and character modifiers** may be **negative** to *reduce* a cost or chance; the final cost is floored at 0 after everything is summed.

**When each field is evaluated matters for dice:**

| Field | Evaluated | Dice behaviour |
|:------|:----------|:---------------|
| Maximum stamina | Once per character, when the pool is first rolled (or via the GM **Roll/Reset** button) | A dice result is **fixed** for that character until re-rolled |
| Starting stamina | Once, at the same time as the maximum | Fixed for that character |
| Amount per interval | Every time stamina regenerates as world time passes | Dice **re-roll each tick**, so regen can vary |
| Stamina cost / character modifiers | Every gathering attempt | Dice re-roll each attempt |

---

## Useful data paths

Reference your character's stats with `@…` paths. The paths differ per game system:

| Value | D&D 5e (`dnd5e`) | Pathfinder 2e (`pf2e`) |
|:------|:-----------------|:-----------------------|
| Constitution modifier | `@abilities.con.mod` | `@actor.system.abilities.con.mod` |
| Strength modifier | `@abilities.str.mod` | `@actor.system.abilities.str.mod` |
| Survival (skill total) | `@skills.sur.total` | `@actor.system.skills.survival.totalModifier` |
| Character level | `@details.level` | `@actor.level` |
| Proficiency bonus | `@prof` | _(use level/skill totals instead)_ |

{: .tip }
> Not sure of a path? Select a character and run `/r 1 + @abilities.con.mod` (5e) or `/r 1 + @actor.system.abilities.con.mod` (pf2e) in chat. If it resolves, it works in a gathering field too. Swap `con` for `str`, `dex`, `int`, `wis`, or `cha`.

---

## Examples by category

The examples below are framed for **Maximum stamina** and **Amount per interval**, but the same formulas work in every gathering formula field.

### Fixed

A plain number. Identical for every game system.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| A flat pool of 40 | `40` | `40` |
| Regenerate 1 per interval | `1` | `1` |
| A flat pool of 10 | `10` | `10` |

### Modifier-based

Combine a base value with an ability modifier or level.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| 10 plus the Con modifier | `10 + @abilities.con.mod` | `10 + @actor.system.abilities.con.mod` |
| Four times the Con modifier | `4 * @abilities.con.mod` | `4 * @actor.system.abilities.con.mod` |
| Regenerate the Con modifier each interval | `@abilities.con.mod` | `@actor.system.abilities.con.mod` |
| 8 plus the character level | `8 + @details.level` | `8 + @actor.level` |
| Regenerate 1 plus the Con modifier | `1 + @abilities.con.mod` | `1 + @actor.system.abilities.con.mod` |

### Negative

Subtract to reduce a value. On stamina **max / starting / regen amount** a negative total is floored to `0`; on a **cost or chance modifier** a negative value *reduces* the total.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| Con modifier minus 4 (floors at 0 for stamina) | `@abilities.con.mod - 4` | `@actor.system.abilities.con.mod - 4` |
| Reduce a stamina cost by 2 | `-2` | `-2` |
| Reduce cost by the Str modifier (strong miners pay less) | `-@abilities.str.mod` | `-@actor.system.abilities.str.mod` |

### Dice

Roll dice, optionally added to a fixed value or modifier. Remember: in **Maximum/Starting** these roll **once**; in **Amount per interval** they roll **each tick**.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| Roll 2d6 | `2d6` | `2d6` |
| Roll 4d6 and add 10 | `4d6 + 10` | `4d6 + 10` |
| Roll 4d6 plus the Con modifier | `4d6 + @abilities.con.mod` | `4d6 + @actor.system.abilities.con.mod` |
| Regenerate 1d4 per interval | `1d4` | `1d4` |
| Regenerate 1d6 + 1 per interval | `1d6 + 1` | `1d6 + 1` |

### Dice count from a modifier

Use a modifier as the **number of dice** by wrapping it in parentheses.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| Roll d6 once per point of Con modifier | `(@abilities.con.mod)d6` | `(@actor.system.abilities.con.mod)d6` |
| Same, but never fewer than one die | `(max(1, @abilities.con.mod))d6` | `(max(1, @actor.system.abilities.con.mod))d6` |
| Roll d4 once per character level | `(@details.level)d4` | `(@actor.level)d4` |

{: .warning }
> The number of dice must resolve to a **non-negative whole number**. If a modifier can be 0 or negative, guard it with `max(1, …)` (as above) so the formula always rolls at least one die.

### Math functions

You can use `floor`, `ceil`, `round`, `abs`, `min`, and `max`.

| What it does | D&D 5e | Pathfinder 2e |
|:-------------|:-------|:--------------|
| 5 plus half your level (rounded down) | `floor((@details.level)/2) + 5` | `floor((@actor.level)/2) + 5` |
| At least 10, scaling with Con | `max(10, 4 * @abilities.con.mod)` | `max(10, 4 * @actor.system.abilities.con.mod)` |
| Cap a dice pool at 50 | `min(50, 4d6 + 10)` | `min(50, 4d6 + 10)` |

---

## Tips

- **Test first.** Select a character and run your formula in chat with `/r` before saving it. If it errors there, it will error in the gathering field.
- **Use your system's paths.** D&D 5e uses `@abilities.con.mod`; Pathfinder 2e uses `@actor.system.abilities.con.mod`. The [character-modifier presets](https://github.com/mistersilver-uk/fabricate/blob/main/src/config/gatheringCharacterModifierPresets.js) ship the common paths for both.
- **Stamina rounds and floors.** Maximum, Starting, and Amount-per-interval results are rounded and never go below 0.
- **Dice timing.** Dice in Maximum/Starting are rolled once per character (re-roll them with the GM **Roll/Reset** button). Dice in Amount-per-interval re-roll every time stamina regenerates.
