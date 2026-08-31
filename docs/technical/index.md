---
layout: default
title: Technical Details
nav_order: 18
has_children: true
---

# Technical Details

This section is about how Fabricate is **built, released, and maintained**, rather than how you use it.

Nothing here is required reading to run a game.
It aims to inform those folks who are interested how the module treats their worlds, who decides what ships, and what stands between a change and their table.

It is written for GMs deciding whether to trust Fabricate with a campaign they care about, and for anyone who simply wants to see the inner workings.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Page                                                                     | What it covers                                                                                                          |
|:-------------------------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------|
| [AI Disclosure]({% link technical/ai-disclosure.md %})                   | How AI is used to build Fabricate, what it is never allowed to do, and why no AI runs in your game.                     |
| [Protecting Your Worlds]({% link technical/protecting-your-worlds.md %}) | How Fabricate looks after the data it stores, and the testing, review and release pipeline every change passes through. |
| [Architecture Decisions]({% link technical/adr/index.md %})              | The decision records behind choices that would be expensive to reverse, preserved with the evidence they were taken on. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

{: .note }
> Looking for the module's programmatic interface instead?
> That lives in the [API Reference]({% link api/index.md %}), alongside the rest of the documentation you would use while building a crafting system.

Everything described in this section is verifiable.
Fabricate's source, its test suite, its continuous integration configuration, and its development harness are all public in the [repository](https://github.com/mistersilver-uk/fabricate).
