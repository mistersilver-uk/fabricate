---
layout: default
title: Recipe Import/Export
parent: How-To Guides
nav_order: 6
---

# Recipe Import/Export

## Problem

How do I export recipes from one world and import them into another?

## Short answer

Use the **Export Recipes** macro to copy all recipes as JSON to your clipboard, then paste them into the **Import Recipes** macro in the target world.

## Steps

1. In the source world, create a new Script macro and paste the Export Recipes example macro code.
2. Run the macro. All recipes are serialised to JSON and copied to your clipboard. Check the browser console (F12) to see the output.
3. In the target world, create a new Script macro and paste the Import Recipes example macro code.
4. Paste your clipboard JSON into the `recipesJson` variable in the macro.
5. Run the macro. Choose **Overwrite Existing** to replace recipes with the same ID, or **Skip Existing** to keep the target world's versions.

## Learn more

- [Example Macros -- Export Recipes]({% link macros/examples.md %}#export-recipes)
- [Example Macros -- Import Recipes]({% link macros/examples.md %}#import-recipes)
- [Recipe Manager API]({% link api/recipe-manager.md %})
