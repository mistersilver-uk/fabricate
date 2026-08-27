---
layout: default
title: Character Prerequisites
parent: Rules & Resources
grand_parent: World
nav_order: 2
---

# Character Prerequisites

Reusable pass/fail conditions, each one a property path on the character, a comparison and a value — "Smith's Tools proficiency is at least 1", say.

They gate three things: who may learn a recipe from a book or scroll, whether a required tool is usable, and whether a component complication fires.
A recipe item, a tool or a complication names the prerequisites it needs by id; the prerequisite itself is authored once here.

Read {% link crafting/settings.md %} for how learning gates use them, and {% link tools.md %} for tool requirements.

{% include screenshot.html case="world-prerequisites" caption="The prerequisite library, each entry naming the character property it tests." %}
