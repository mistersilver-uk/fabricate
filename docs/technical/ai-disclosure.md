---
layout: default
title: AI Disclosure
parent: Technical Details
nav_order: 1
---

# AI Disclosure

Fabricate is built with the help of AI coding agents.
This page sets out exactly what that means, what it does not mean, and what every change has to survive before it can reach your world.

It is here because that deserves a straight answer on its own page, rather than a footnote at the bottom of another one.

{: .note }
> **The short version.**
> AI helps *write* Fabricate.
> No AI runs *inside* Fabricate.
> Nothing about your world, your players or your game is ever sent anywhere by this module.
> The agents work on Fabricate's code, never on your world.

---

## No AI runs in your game

Fabricate runs entirely on your Foundry server and in your players' browsers.
The shipped module has these properties, and they are the kind you can check rather than take on trust.

**No AI at runtime:**
Fabricate never calls a language model, an inference service, or any other AI system while your game is running.
There is no such feature to turn on or off, because there is no such feature.

**No network calls of its own:**
The module makes no HTTP requests.
The only network traffic it causes is Foundry's own socket, which carries messages between the GM and the players already sitting in your world.
The only other thing it can do is open a link in your browser at the moment you click it.
Those links are to this documentation site and, in the GM's Crafting System Manager, a dismissable advert for premium crafting icons that links to my Patreon page.

**No telemetry, no analytics, no phone-home:**
Nothing about your systems, recipes, actors, players or usage is counted, reported or uploaded.
No usage data leaves your server, because nothing in the module is capable of sending it.

**No separately installed runtime libraries:**
Fabricate loads nothing from the internet and needs no other module to run.
The one third-party piece that ships is the Svelte user-interface runtime, which is compiled into Fabricate's own bundle at build time from a version locked in this repository.
Everything else it executes in your game is code from this repository, built from a tagged commit.

---

## How Fabricate is built

I use AI coding agents - principally Claude and Codex - as a routine part of building this module.
They work inside a written, version-controlled development process that lives in the repository alongside the code, so the way they are governed is as public as the code they produce.

That process is deliberately unglamorous.

**Work is planned before it is written.**
A change starts as a written proposal against a specification, and that proposal is reviewed and revised before any code exists.

**Implementation is isolated.**
Each piece of work happens on its own branch in its own workspace, and reaches the main line only as a pull request.

**Review is independent, and there is more than one reviewer.**
Separate review roles look at a change for correctness, for test quality and regression risk, for whether it uses Foundry's own APIs the way Foundry intends, for whether it is faithful to the crafting domain, and for how it behaves as an interface.
A reviewer that finds a genuine problem sends the work back.

**I read what ships, and I merge it.**
No agent merges its own work, publishes a release, or decides that a version is fit for your table.
Those are my actions, taken deliberately, and I am accountable for them.

---

## What every change has to pass

Whether a line was typed by me or drafted by an agent, it faces exactly the same gates.
They run automatically, and a red one blocks the change or the release.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Gate                    | What it does                                                                                                                                                                                              |
|:------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Automated tests         | Over 20,000 automated tests run on every change. A single failure stops the change.                                                                                                                       |
| End-to-end Foundry test | A real Foundry server is started in a container, a real world is loaded, and Fabricate is driven through it in a real browser. Any runtime error in the console fails the run. It runs on Foundry 14 before every beta release, and the same test can be run on Foundry 13 on demand. |
| Static analysis         | Continuous code-quality and security analysis, on top of linting and formatting checks for JavaScript, Svelte, CSS and the documentation itself.                                                          |
| Interface evidence      | A pull request that changes the interface has to carry captured frames of the affected screens, so a visual regression is seen before it is merged rather than after. Only a maintainer can waive this, for a change that has no visible screen to capture. |
| Staged release          | Nothing goes straight to the public release. A version is exercised in a private beta, promoted to a closed early-access channel, and only then promoted to the public release channel.                   |
| Fail-safe migrations    | Anything that changes stored data takes a checkpoint first. If it cannot finish, the checkpoint is restored and nothing is written, so a failed migration cannot corrupt a world. Each is covered by its own tests. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

None of these gates knows or cares who wrote the code.
That is the point of them.
They are the reason I am comfortable using agents at the pace I do, and they are what actually stands between a mistake and your campaign.

[Protecting Your Worlds]({% link technical/protecting-your-worlds.md %}) describes this pipeline, and the data safeguards inside the module, in full detail.

---

## Documentation, screenshots, and artwork

This documentation site is written the same way as the module, with the same assistance and the same review.
If you find something here that is wrong, misleading, or out of date, [tell me](https://github.com/mistersilver-uk/fabricate/issues) and I will fix it.

The screenshots throughout this site are captures of the real interface, and no image on this site is AI-generated.
They are produced by the "View Lab", which mounts Fabricate's own application windows in a real browser, over real Foundry window chrome, and captures them one screen at a time using Fabricate's real API to drive state changes.
The interface they show is the interface you see in your game world, rendered from the same source.
What it is showing is fixture data rather than anyone's real campaign.
Each frame records the Foundry build whose chrome it was drawn over and a digest of the render it was encoded from.
A frame is published only when the run that captured it actually produced it.
Frames are regenerated when I run the generation step, not on every change, so a frame can lag behind the interface until the next run.
If you spot one that no longer matches what you see in your game, [tell me](https://github.com/mistersilver-uk/fabricate/issues).

The Fabricate logo is my own work.
I drew it in Adobe Illustrator in 2023, for the first version of the module.
If you want to take a look, that module is now archived as [fabricate-legacy](https://github.com/mistersilver-uk/fabricate-legacy).

---

## Why I work this way

I use these tools professionally, day in and day out, to deliver mission-critical platform infrastructure for a global finance company.
I am a Senior Staff Software Engineer with 20+ years of experience in software development, primarily in JavaScript, Java/Kotlin, and Golang.

I know how to write a harness for agents, prompt them effectively, automate guardrails around them, review their output, and feed corrections back so they keep improving.
I have applied that same discipline to Fabricate.

That discipline is the reason Fabricate has deep static code analysis, linting, expansive test coverage, and a complete end-to-end Foundry integration test.
Those safeguards are *rare* in Foundry modules, and they are exactly what an agent's output has to pass here before it can reach you.

Used responsibly, agents are a force multiplier.
If I had built all of that automation from scratch by hand, I would still be writing the automation instead of the module.
I work full time in a demanding job, and I have a family and a home to look after, so I do not have eight or more hours a day to pour into this.
The agents let the time I do have go into Fabricate itself, on top of guardrails I trust.

---

## Accountability

Whether a particular line of code was typed by me or drafted by an agent is not what keeps your data safe.
What keeps it safe is everything every change has to pass before it can reach you: the automated tests, the static analysis and quality checks, the real Foundry integration test that fails on any runtime error, the staged and closed-beta release process, and the migrations that restore a checkpoint rather than corrupt your data.
On top of that, I review what ships and I am accountable for it.

AI makes the work faster.
The engineering rigour and human governance I bring to the project are what protect your game.

---

## If you would rather not

Some people would prefer not to run AI-assisted software.
That's fine.
I understand, even if I don't agree.

What I can offer is that nothing here is hidden.
The [source](https://github.com/mistersilver-uk/fabricate) is public and so is every change that made it, along with the review it went through.
You can read the code before you install it, pin a version and stay on it, and raise anything that concerns you as an [issue](https://github.com/mistersilver-uk/fabricate/issues).
Issues are public, and the AI agents I work with may read them.
Please do not paste anything into one that you would not post publicly.
