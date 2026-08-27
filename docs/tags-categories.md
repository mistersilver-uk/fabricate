---
layout: default
title: Tags & Categories
nav_order: 6
---

# Tags & Categories

The **Tags & Categories** screen holds three separate vocabularies for the selected system: recipe categories, component categories, and item tags.
Each vocabulary has its own tab, so you work on one at a time.
Each tab shows a count of its custom entries, its own search box, and an add form that checks your entry as you type.
As you type, the add form tells you whether the name is ready to add, already taken, or reserved, and for a tag it previews the lowercase text that will be stored.

A panel on the right of the screen gives an at-a-glance count of each vocabulary and the total number of references across all three.
It also carries a **Reference-safe by default** note, because removing a referenced entry reassigns or strips the records that use it rather than leaving them pointing at something that no longer exists.

## Recipe categories

Custom recipe categories organize recipe browsing and authoring.
The reserved **General** recipe category is always present and is not stored in the custom category list.
Each recipe category can carry an icon.
Set it from the **Icon** field when you add the category, or change it later from the icon button on the category's row.

In the player recipe browser, each recipe that belongs to a custom category shows that category as a small label on its row.
Recipes in the reserved **General** category show no label, so the default bucket does not tag every row.
A **Category** filter, placed above the crafting-system filter, lets players narrow the list to a single category.
The filter offers only the categories that appear in the player's visible recipes, sorted alphabetically with **General** pinned last, and its default **All categories** option shows the full list.

Removing a custom recipe category is reference-safe.
Fabricate asks you to confirm on the row and tells you how many recipes will be reassigned to **General**.
Confirming reassigns those recipes to **General** so none is left pointing at a category that no longer exists.

## Component categories

Component categories group your components in the component browser.
They are managed in the **Component categories** section of the same screen, and they are a **separate vocabulary from recipe categories**.
The two never mix.
A component category such as **Reagent** is never offered as a recipe category, and a recipe category is never offered as a component category.
Keeping them apart is deliberate, so that adding a way to group your components does not add clutter to the recipe browser your players use.

Add a category by typing a name and clicking **Add component category**.
Each component category can also carry an icon, set from the **Icon** field when you add it or changed later from its row.
The reserved **General** category is always available and is not stored in your custom list, so you cannot add or remove it.
Every component belongs to exactly one category, and a component you have never categorised is in **General**.
There is no uncategorised state.

Removing a custom component category is reference-safe.
Fabricate asks you to confirm on the row and tells you how many components will be reassigned to **General**.
Confirming moves those components to **General** rather than leaving them pointing at a category that no longer exists.

## Item tags

Item tags allow component labeling plus tag-based ingredient matching.
Tags are many-valued, so a component can carry as many as you like.
Tags are always stored in lowercase, so the add form previews the exact text it will save.
Tags are assigned to components in the component editor only.
They are not shown on component browser rows and they do not filter the browser, because grouping is what categories are for.

A tag's reference count on this screen includes both the components that carry it and the recipe ingredients that filter on it.
Removing a tag is reference-safe.
Fabricate asks you to confirm on the row and tells you how many references will lose the tag.
Confirming strips the tag from every component that carries it and from every recipe ingredient that filters on it, so nothing is left pointing at a tag that no longer exists.
