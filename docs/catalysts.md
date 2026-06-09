---
layout: default
title: Catalysts (retired)
nav_order: 99
---

# Catalysts have been retired

<meta http-equiv="refresh" content="0; url={{ '/tools.html' | relative_url }}">

The standalone **Catalyst** concept was removed in Fabricate `0.6.0`. Everything catalysts did — a required-but-not-consumed, optionally breakable prerequisite — is now handled by **Tools**, the single shared primitive for crafting recipes, gathering tasks, and salvage.

This page is kept only as a pointer. See [Tools]({% link tools.md %}) for the current model, including the automatic [migration from catalysts]({% link tools.md %}#migration-from-catalysts) that converts existing catalyst data into library Tools on upgrade.
