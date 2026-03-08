# Fabricate Monetisation Assessment
_Last updated: 2026-03-07_

This report evaluates monetisation options for Fabricate, a system-agnostic crafting module for FoundryVTT. It is written for MisterPotts as a solo developer making strategic decisions about sustainability, pricing, and competitive positioning.

---

## 1. Revenue Model Options

### 1.1 Fully Premium (Paid-Only) Module

**What it would take.** Fabricate would need to be distributed exclusively through the FoundryVTT Premium Content system or Patreon-gated manifest URLs. The module already uses a restrictive community license (`LicenseRef-Fabricate-Community-1.0`) that prohibits commercial redistribution, so the legal groundwork exists.

**Market tolerance.** Mastercrafted (TheRipper93) demonstrates that a Patreon-gated crafting module can succeed -- but only as part of a bundle of 30+ modules at approximately EUR 10/month. No standalone FVTT crafting module charges individually. Charging for Fabricate alone would require the module to be demonstrably superior in features, polish, and content to every free alternative. Fabricate is not there yet: the UI migration is incomplete (Phase 3-4 still pending), there is no visual recipe editor for players, and the pre-built content library is limited to a single Alchemist's Supplies pack.

**Verdict: Not recommended in the short term.** The feature gap versus free alternatives like Beaver's Crafting is not large enough to justify a hard paywall. Adoption would likely drop sharply.

### 1.2 Freemium Model (Free Core + Paid Premium Features via Patreon)

**How it works.** The core module remains free and open. Premium features are gated behind a Patreon subscription that provides an activation key or unlocks additional module content. This is the dominant model in the FVTT ecosystem.

**Strengths.** Preserves the existing user base and discovery funnel. Allows incremental monetisation as premium features are built. Aligns with FVTT community norms -- users expect free base modules with optional paid extras. TheRipper93's success (5,453 paid patrons, approximately USD 51,500/month across 30+ modules) proves the Patreon model works at scale in this ecosystem.

**Weaknesses.** Requires engineering effort to implement feature gating (checking Patreon tier or activation key at runtime). As a solo developer, maintaining two tiers of feature support adds complexity. The revenue per individual module in a freemium model is likely modest unless bundled.

**Verdict: The strongest option for Fabricate's current position.** Free core attracts users; premium features convert a fraction to paying supporters.

### 1.3 Donation / Tip-Jar Model (Ko-fi, GitHub Sponsors)

**Current state.** Fabricate already has a Patreon, but with 14 total members and GBP 4.17/month in pledges. This suggests the tip-jar approach alone is insufficient.

**Why it underperforms.** Fabricate is a niche module (crafting) in a niche platform (FoundryVTT). Pure goodwill donations only work when a module has high visibility and daily use (e.g., Dice So Nice!, Token Magic FX). Crafting modules are used occasionally, reducing emotional attachment.

**Verdict: Keep Patreon active but do not rely on it as the primary model.** It supplements other revenue but will not sustain development.

### 1.4 Commissioned Features (Paid Feature Requests)

**How it works.** GMs or communities pay for specific features to be built (e.g., "add PF2e crafting check adapter for USD X"). Some FVTT creators accept bounties through Open Collective or direct invoicing.

**Strengths.** Directly funds needed work. Validates demand before building.

**Weaknesses.** Unpredictable income. Creates obligation to a single patron's vision. As a solo developer, it can distort the roadmap toward niche requests rather than broadly useful features.

**Verdict: Worth offering as a side channel (e.g., a "Sponsor a Feature" tier on Patreon at GBP 50-100) but not a primary model.**

### 1.5 Recommended Approach

**Primary model: Freemium via Patreon with a content-first premium strategy.**

The core Fabricate module stays free. Revenue comes from two premium streams:

1. **Premium recipe packs / compendiums** sold as content (not code gating). These are separate FVTT modules containing pre-built crafting systems with recipes, items, and macros for specific game systems or genres. They require Fabricate but are distributed as premium content through Patreon or the FoundryVTT marketplace.

2. **Patreon-gated advanced features** (longer-term). Once the UI migration is complete and Fabricate has a stable v2.0, specific advanced features (see Section 2) can be gated behind a Patreon subscription.

This approach avoids the engineering overhead of code-level feature gating in the short term, while the recipe pack model can begin generating revenue immediately after v2.0 ships.

---

## 2. Premium Feature Candidates

Ranked by monetisation potential (the ability to justify a paywall) and development effort.

### Tier 1: High Value, Moderate Effort -- Content Packs

| Feature                                       | Monetisation Potential | Notes                                                                                                                                                          |
|:----------------------------------------------|:-----------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **D&D 5e Alchemy & Herbalism pack**           | High                   | 50-100 recipes, forageable ingredients, DC-scaled checks. Extends the existing Alchemist's Supplies starter pack that already ships with Fabricate.            |
| **D&D 5e Blacksmithing & Armorsmithing pack** | High                   | Weapon/armor upgrade trees with progressive crafting. High demand in the 5e community.                                                                         |
| **D&D 5e Enchanting pack**                    | High                   | Effect transfer showcase. Requires essences feature -- demonstrates Fabricate's unique strength versus every competitor.                                       |
| **PF2e Crafting Rules pack**                  | Medium-High            | PF2e has native crafting rules (Earn Income + downtime, 4-day minimum). A pack that faithfully implements these in Fabricate would serve an underserved niche. |
| **Generic "Survival Crafting" pack**          | Medium                 | System-agnostic wilderness survival recipes (torches, shelters, traps). Appeals to OSR and system-agnostic GMs.                                                |

Content packs are the fastest path to revenue because they require no feature gating engineering. They are distributed as separate FVTT modules or sold through the FoundryVTT marketplace.

### Tier 2: High Value, Higher Effort -- Advanced Features

| Feature                                   | Monetisation Potential | Gating Complexity | Notes                                                                                                                                                                                                                                                         |
|:------------------------------------------|:-----------------------|:------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Visual recipe builder (drag-and-drop)** | High                   | Medium            | The current recipe editor is functional but utilitarian. A visual node-graph or card-based builder would be a strong differentiator. Mastercrafted is praised for UI polish; Fabricate could leapfrog it.                                                     |
| **Experimentation / "Cauldron" mode**     | High                   | Medium            | Mastercrafted's Cauldron lets players drop items together to discover recipes without knowing them in advance. Fabricate's knowledge mode supports recipe item discovery, but free-form "drop items and see what happens" experimentation is a crowd-pleaser. |
| **Recipe marketplace / sharing hub**      | High                   | High              | Allow GMs to export, share, and import recipe packs. The `importStarterPack()` API already exists; a community hub would multiply content. Premium tier = curated/verified packs.                                                                             |
| **Crafting journal integration**          | Medium                 | Medium            | Automatically log crafting history, material costs, and outcomes to a journal entry. Appeals to bookkeeping-minded GMs.                                                                                                                                       |
| **Batch crafting**                        | Medium                 | Low               | Craft N copies of a recipe at once with proportional ingredient consumption. Simple feature but frequently requested in crafting UIs across all platforms.                                                                                                    |

### Tier 3: Niche Value -- Not Worth Gating

| Feature                              | Why Not Gate It                                                                                                           |
|:-------------------------------------|:--------------------------------------------------------------------------------------------------------------------------|
| **API access for module developers** | Gating the API would kill the ecosystem. Keep it free to encourage integrations.                                          |
| **Custom theming / branding**        | Too niche to justify the engineering overhead.                                                                            |
| **Priority support**                 | Solo developer cannot offer SLA-backed support at Patreon prices. Offer Discord channel access instead as a Patreon perk. |

---

## 3. Competitive Landscape -- Premium and Freemium Modules

### 3.1 Monetisation Patterns in the FVTT Ecosystem

The FVTT module economy operates primarily through three channels:

| Channel                    | How It Works                                                                                                                              | Examples                                                                                       |
|:---------------------------|:------------------------------------------------------------------------------------------------------------------------------------------|:-----------------------------------------------------------------------------------------------|
| **Patreon bundle**         | Monthly subscription unlocks access to all of a creator's premium modules. Manifest URL requires linked Patreon account.                  | TheRipper93 (EUR 10-50/month, 5,453 paid patrons), IronMonk (Monk's modules), Material Foundry |
| **FoundryVTT Marketplace** | One-time purchase through `foundryvtt.store`. No activation code needed -- downloads directly in Foundry Setup screen. Launched Feb 2025. | 500+ modules from 60+ creators. Revenue share terms negotiated per publisher.                  |
| **External storefront**    | Sold through DriveThruRPG, Itch.io, or creator's own site. Buyer receives a content key to enter in Foundry.                              | Wyrmworks Publishing (USD 5+ per adventure), various map packs                                 |

**FoundryVTT marketplace details.** The marketplace launched on 12 February 2025 and now hosts 500+ products from 60+ creators, representing 40% of all FVTT premium content. Revenue share terms are negotiated individually with Foundry rather than published as a flat rate. The marketplace does not charge up-front fees -- publishers are billed quarterly for activated content keys.

### 3.2 TheRipper93 -- The Benchmark

TheRipper93 is the largest FVTT module creator by revenue, earning approximately USD 51,500/month from 5,453 paid Patreon subscribers across 30+ premium modules (source: Graphtreon).

| Tier               | Price            | Patrons | Access                                                                  |
|:-------------------|:-----------------|:--------|:------------------------------------------------------------------------|
| Free               | EUR 0            | 10,558  | Free modules only                                                       |
| Supporter          | ~EUR 10/month    | 4,125   | All 30+ premium modules, exclusive dice sets, priority feature requests |
| Early Access       | ~EUR 12.50/month | 934     | Premium + early access to new modules one month ahead                   |
| Master             | ~EUR 20/month    | 128     | All above + adventure content, exclusive wiki access                    |
| Creator Commercial | ~EUR 50/month    | 6       | Commercial licensing rights                                             |

**Key insight.** TheRipper93's model works because of the bundle effect -- EUR 10/month for 30+ modules is less than EUR 0.35/module. No individual module justifies EUR 10/month alone. Mastercrafted succeeds as a premium module because it rides alongside Levels, 3D Canvas, Splatter, and dozens of other popular modules.

**Implication for Fabricate.** A standalone Patreon at EUR 10/month for one crafting module is not viable. If Fabricate were to adopt Patreon gating, it would need to be priced much lower (EUR 2-5/month) or bundled with significant content packs that justify the subscription.

### 3.3 Other Monetised FVTT Modules (Non-Crafting)

| Creator / Module                  | Channel               | Price Range     | Gating Method                                                       | Estimated Patrons |
|:----------------------------------|:----------------------|:----------------|:--------------------------------------------------------------------|:------------------|
| **TheRipper93** (30+ modules)     | Patreon               | EUR 10-50/month | Patreon-linked manifest URL via Foundry Premium Content system      | 5,453 paid        |
| **Moulinette** (asset management) | Patreon               | ~USD 2/month    | Patreon tier unlocks cloud asset access                             | Unknown (smaller) |
| **Baileywiki** (maps/scenes)      | Patreon + Marketplace | Varies          | Multiple tiers, Moulinette integration, Foundry Patreon integration | Unknown           |
| **IronMonk** (Monk's modules)     | Patreon               | Varies          | Patreon-gated modules                                               | Unknown           |
| **Canvas Quest** (maps)           | Patreon + Marketplace | Varies          | "Map Adventurer" tier and up                                        | Unknown           |

**Pattern.** The most successful FVTT monetisation strategies share three traits: (1) a large free offering that builds trust and user base, (2) premium content/features that add value without removing existing functionality, and (3) Patreon as the primary payment rail with FoundryVTT's Premium Content system handling activation.

### 3.4 Crafting Module Competitors -- Feature and Price Comparison

| Module                          | Price                  | Model             | Skill Checks                          | Multi-Step                             | Salvage                           | System Agnostic                    | Pre-Built Content                         | UI Polish                                                      |
|:--------------------------------|:-----------------------|:------------------|:--------------------------------------|:---------------------------------------|:----------------------------------|:-----------------------------------|:------------------------------------------|:---------------------------------------------------------------|
| **Fabricate**                   | Free                   | Community license | Yes (built-in D&D 5e + macro)         | Yes (sequential steps with time gates) | Yes (simple, tiered, progressive) | Yes                                | 1 pack (Alchemist's Supplies, 17 recipes) | Svelte migration in progress (Phases 1-2 done)                 |
| **Mastercrafted**               | ~EUR 10/month (bundle) | Patreon-gated     | Yes (custom condition checks)         | No                                     | No                                | Yes                                | Community-shared recipe books             | Polished; praised for UX. "Cauldron" experimentation UI.       |
| **Beaver's Crafting**           | Free                   | Open source       | Yes (multi-step with pass/fail tests) | Yes (steps with configurable failure)  | No                                | Yes (via beavers-system-interface) | Beaver's Potions companion pack           | Functional; actively developed; described as "one of the best" |
| **Furukai's Simple Crafting**   | Free                   | Open              | No                                    | No                                     | No                                | Yes                                | None                                      | Minimal; JSON-based recipe definition                          |
| **Item Piles** (crafting angle) | Free                   | MIT               | No (not a crafting module)            | No                                     | No                                | Yes                                | N/A                                       | Excellent (for loot/economy, not crafting)                     |

### 3.5 Where Fabricate Clearly Exceeds Free Alternatives

Fabricate has the deepest feature set of any FVTT crafting module, free or premium:

1. **Four resolution modes** (simple, mapped, tiered, progressive). No competitor offers mapped or progressive resolution. Beaver's Crafting has multi-step with pass/fail, but not outcome-routed result groups or difficulty-budget-based allocation.

2. **Essence system.** No competitor has abstract ingredient properties with flexible matching. This enables "3 Fire + 2 Arcane" style recipes where any combination of items can satisfy the requirement -- a design pattern drawn from games like Minecraft and Monster Hunter.

3. **Salvage with full check pipeline.** No competitor offers dismantling items into components with tiered/progressive outcomes and configurable consumption-on-failure policies.

4. **Effect transfer.** Automated active effect transfer from essence source items to crafted results. No competitor does this.

5. **Item Piles integration.** Currency costs, merchant stock as ingredient source, container inventory for multi-step crafting -- all zero-macro setup.

6. **Built-in crafting check mode.** D&D 5e ability/skill checks without writing a macro. Extensible adapter registry for other systems. Beaver's Crafting has skill tests but requires more manual configuration.

7. **Recipe visibility and knowledge gating.** Three modes (global, player, knowledge) with recipe item discovery, drag-and-drop learning, consumable recipe scrolls, and multi-recipe matching. More sophisticated than any competitor.

8. **Engineering quality.** 875 automated tests across 54 test files. Svelte 5 UI with reactive stores and a clean service-injection architecture. Far exceeds any competitor's engineering maturity.

### 3.6 Where Fabricate Trails

1. **UI polish.** Mastercrafted is consistently praised for its visual design. Fabricate's Svelte migration is in progress (CraftingApp and RecipeManagerApp done, RecipeEditorApp still on legacy Handlebars). The Recipe Editor -- the most complex, GM-facing UI surface -- is still legacy code.

2. **"Cauldron" / free-form experimentation.** Mastercrafted's Cauldron lets players experiment by dropping items together without knowing recipes in advance. Fabricate's knowledge mode supports recipe discovery via items and learning, but not free-form "drop items and see what happens" experimentation.

3. **Pre-built content library.** One Alchemist's Supplies pack (17 recipes) versus community-shared recipe books in Mastercrafted and the Beaver's Potions companion pack.

4. **Adoption and mindshare.** Fabricate has lower visibility than Mastercrafted (bundled with TheRipper93's hugely popular module suite) and Beaver's Crafting (free, actively discussed on Reddit and Discord, described by users as "absolutely amazing"). Crafting modules are notably absent from all major "must-have FVTT modules" lists -- none of them appear in the top recommendation compilations, which means discovery is purely word-of-mouth or search-driven.

5. **Community content ecosystem.** Beaver's Crafting has a companion module (Beaver's Potions) and system-specific adaptation modules (bsa-dnd5e, bsa-wfrp4e). Fabricate has no third-party extension modules.

---

## 4. Market Size and Willingness to Pay

### 4.1 FoundryVTT User Base

Foundry does not publish absolute license counts. The following proxy metrics are drawn from the official Year in Review 2025 report:

| Metric                                   | Value                                                           | Source              |
|:-----------------------------------------|:----------------------------------------------------------------|:--------------------|
| Discord members                          | ~107,000 (approaching 100K at time of report, ~1,500 new/month) | Year in Review 2025 |
| Reddit members                           | ~75,000                                                         | Year in Review 2025 |
| License owner growth                     | +22% year-over-year                                             | Year in Review 2025 |
| Users with at least one premium purchase | 33% of license owners                                           | Year in Review 2025 |
| Premium packages available               | 862 (85% YoY growth)                                            | Year in Review 2025 |
| Marketplace modules                      | 500+ from 60+ creators                                          | Year in Review 2025 |
| Average playtime per user                | 377 hours                                                       | Year in Review 2025 |
| Analytics opt-in rate                    | 51% of license owners                                           | Year in Review 2025 |
| Ember Kickstarter backers                | 3,808 backers, USD 710,981 pledged                              | Year in Review 2025 |

**Estimated total license owners.** Discord membership typically represents 30-50% of a software product's active user base. With ~107,000 Discord members and accounting for inactive members, a reasonable estimate is **150,000-250,000 total license owners**, with perhaps 80,000-120,000 active in any given year.

### 4.2 Crafting Module Market Subset

Crafting is a niche within FVTT. Not every table uses crafting rules, and those that do often use minimal homebrew rather than a dedicated module.

- **10-15% of active FVTT users** run games where crafting is relevant (D&D 5e, PF2e, survival-genre systems).
- That yields approximately **8,000-18,000 potential crafting module users**.
- Of those, perhaps **20-30%** would evaluate Fabricate specifically (awareness, system compatibility, willingness to install another module).
- **Realistic addressable market: 2,000-5,000 active Fabricate users** at maturity.

### 4.3 Willingness to Pay

| Data Point                               | Value                                     | Source              |
|:-----------------------------------------|:------------------------------------------|:--------------------|
| TheRipper93 free-to-paid conversion rate | 34% (5,453 paid / 15,978 total)           | Graphtreon          |
| FVTT users owning premium content        | 33% of all license owners                 | Year in Review 2025 |
| 36-49 age bracket TTRPG premium spending | 39% of all premium TTRPG purchases        | Industry survey     |
| 42% of younger TTRPG players             | Subscribe to paid tools or Patreons       | Industry survey     |
| Typical FVTT Patreon price point         | EUR 3-12/month for module bundles         | Market observation  |
| One-time content purchase range          | USD 5-15 for content packs on marketplace | Market observation  |

**Key insight.** FVTT users are accustomed to paying for content -- 33% already own at least one premium purchase. The bottleneck for Fabricate is not willingness to pay but (a) perceived value relative to free alternatives and (b) awareness that Fabricate exists.

### 4.4 Revenue Projections (Conservative)

**Scenario A: Content packs only (marketplace, one-time purchase)**
- 3 premium recipe packs at USD 5-8 each
- 500-1,000 sales per pack over 2 years
- Revenue: USD 7,500-24,000 total (before marketplace fees)
- Monthly equivalent: USD 300-1,000/month

**Scenario B: Patreon freemium only (GBP 3-5/month)**
- Convert 3-5% of active users to paid (60-250 patrons)
- Revenue: GBP 180-1,250/month (USD 230-1,600/month)

**Scenario C: Combined (recommended)**
- Patreon for advanced features + marketplace for content packs
- Year 1 target: USD 500-1,000/month
- Year 2 target: USD 1,000-2,500/month (as content library grows)

These are modest numbers. Fabricate will not replicate TheRipper93's scale as a single module. The goal is sustainable side income that funds continued development, not full-time salary replacement. For context, MisterPotts' current Patreon earns GBP 4.17/month -- any of these scenarios represents a 50x-300x improvement.

---

## 5. Strength of Value Proposition

### 5.1 Current State Assessment

Fabricate's feature set is the most comprehensive of any FVTT crafting module. The gap in raw capability is significant:

| Capability              | Fabricate                                     | Best Free Alternative                              | Gap      |
|:------------------------|:----------------------------------------------|:---------------------------------------------------|:---------|
| Resolution modes        | 4 (simple, mapped, tiered, progressive)       | 1-2 (Beaver's: simple + multi-step with pass/fail) | Large    |
| Essence-based matching  | Yes                                           | None                                               | Unique   |
| Salvage pipeline        | Full (simple, tiered, progressive with check) | None                                               | Unique   |
| Effect transfer         | Automated via essences                        | None                                               | Unique   |
| Built-in skill checks   | Yes (D&D 5e adapter, extensible registry)     | Beaver's (via beavers-system-interface)            | Moderate |
| Item Piles integration  | Native (currency, merchants, containers)      | None as integrated crafting feature                | Unique   |
| Recipe visibility modes | 3 modes with knowledge gating + recipe items  | Beaver's (basic role permissions)                  | Large    |
| Automated test coverage | 875 tests, 54 test files                      | Unknown (likely minimal)                           | Large    |
| Pre-built content       | 1 pack (17 recipes)                           | Beaver's Potions (separate module)                 | Small    |
| UI polish               | Migration in progress                         | Mastercrafted (premium, praised)                   | Trails   |

**However, feature depth alone does not justify a paywall.** Most GMs use simple crafting -- they want "put ingredients in, get item out" with maybe a skill check. Fabricate's advanced features (essences, progressive mode, effect transfer, salvage) serve a small subset of power users who need sophisticated crafting simulation. This is simultaneously Fabricate's greatest strength and its monetisation challenge: the features that justify charging are the ones fewest users need.

### 5.2 Is the Gap Large Enough to Justify Charging?

**For the core module: No.** Beaver's Crafting covers 80% of what most GMs need, is free, and is actively maintained. Charging for Fabricate's core would drive users to Beaver's Crafting.

**For content packs: Yes.** Pre-built, balanced, playtested recipe sets save GMs hours of work. This is content, not code -- users are accustomed to paying for content in the FVTT ecosystem.

**For advanced features (visual builder, Cauldron mode, batch crafting): Yes, if bundled.** No single advanced feature justifies a subscription. A bundle of 3-4 premium features at GBP 3-6/month is viable once they exist.

### 5.3 What Would Strengthen the Premium Case

1. **Complete the Svelte UI migration.** The Recipe Editor (Phase 3) is the most user-facing surface. Shipping a polished, modern editor is a prerequisite for any premium positioning. Users will not pay for a module whose most complex screen looks dated.

2. **Build 3-5 high-quality content packs.** The Alchemist's Supplies pack proves the concept and the import pipeline works (`game.fabricate.importStarterPack()`). A D&D 5e crafting compendium with 50+ recipes across alchemy, blacksmithing, and enchanting would be a compelling premium product.

3. **Add a "Cauldron" / experimentation mode.** This is Mastercrafted's most talked-about feature and one that generates organic word-of-mouth. Fabricate's knowledge mode gets partway there with recipe item discovery, but free-form "drop items and see what happens" experimentation is a crowd-pleaser that drives adoption.

4. **Publish a "Fabricate in 5 Minutes" video.** Visibility is Fabricate's weakest point. A polished demo video showing the full workflow -- creating a system, adding recipes, crafting as a player -- would drive adoption more than any new feature. Crafting modules are absent from every major "must-have FVTT modules" list; changing that starts with discoverability.

5. **Build system-specific adapter modules.** Following Beaver's pattern (bsa-dnd5e, bsa-wfrp4e), create companion modules that wire Fabricate into specific game systems' native crafting rules. These serve as both free adoption drivers and proof of system-agnosticism.

---

## 6. Risks and Recommendations

### 6.1 Risks of Charging

| Risk                                           | Likelihood | Severity | Mitigation                                                                                                                                                                                                                  |
|:-----------------------------------------------|:-----------|:---------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Community backlash** ("module went premium") | Medium     | High     | Never paywall existing free features. Only gate new premium content and new advanced features. Communicate the change transparently. The community license already signals commercial intent.                               |
| **Reduced adoption**                           | Medium     | Medium   | Keep the core free forever. Premium content is additive, not subtractive. Free users remain first-class citizens.                                                                                                           |
| **Competition undercuts**                      | Low-Medium | Medium   | Beaver's Crafting is free and actively developed, but lacks Fabricate's depth. The risk is that "good enough for most tables" beats "comprehensive for power users."                                                        |
| **Solo developer burnout**                     | High       | High     | Revenue must fund time savings (e.g., commissioning content creation, hiring for recipe pack design) not just reward effort. If monetisation adds obligation without reducing workload, it backfires.                       |
| **Platform dependency**                        | Medium     | Medium   | Patreon billing changes (they eliminated per-creation billing in Dec 2024), FoundryVTT marketplace terms, or Foundry version breaking changes could disrupt revenue. Diversify across Patreon + marketplace + direct sales. |
| **Content pack maintenance burden**            | Medium     | Medium   | Each new Foundry version or game system update may require content pack updates. Scope packs to stable systems (D&D 5e, PF2e) and design them to be data-only with minimal code dependencies.                               |

### 6.2 Recommended Monetisation Strategy -- Phased Rollout

#### Phase 1: Foundation (Now through v2.0 release)

- Complete the Svelte UI migration (Phases 3-4: RecipeEditorApp + legacy cleanup)
- Ship v2.0 as a free, polished release with strong documentation
- Restructure Patreon tiers to reflect the premium roadmap (see tier structure below)
- Create a "Fabricate in 5 Minutes" demo video and post to Reddit, Discord, and Foundry Hub
- Write a Foundry Hub package listing with screenshots and endorsement quotes
- **Cost:** Time only. No revenue expected yet.

#### Phase 2: Content Monetisation (v2.0 + 1-3 months)

- Release 2-3 premium recipe packs as separate FVTT modules:
  - **D&D 5e Alchemy Expanded** -- extends the existing Alchemist's Supplies with 40+ additional recipes, rare ingredients, and tiered outcomes
  - **D&D 5e Blacksmithing & Armorsmithing** -- weapon/armor crafting with progressive resolution mode showcasing upgrade trees
  - **Generic Survival Crafting** -- system-agnostic wilderness recipes (torches, shelters, traps, rations)
- Sell through FoundryVTT marketplace (one-time purchase, USD 5-8 each) and include in Patreon GBP 4.50+ tier
- Keep Fabricate core free
- **Expected revenue:** USD 200-800/month

#### Phase 3: Feature Monetisation (v2.0 + 6-12 months)

- Add **visual recipe builder** (premium feature, Patreon-gated)
- Add **experimentation / "Cauldron" mode** (premium feature)
- Add **batch crafting** (premium feature)
- **Expected revenue:** USD 500-2,000/month (at 100-300 paid patrons)

#### Phase 4: Ecosystem Growth (v2.0 + 12+ months)

- Open recipe pack creation tools to community contributors (curated marketplace with revenue share)
- List curated community packs on FoundryVTT marketplace
- Explore PF2e, WFRP 4e, and other system-specific packs
- **Target:** USD 1,500-3,000/month

### 6.3 Suggested Patreon Tier Structure

| Tier                  | Price                        | Includes                                                                                                             |
|:----------------------|:-----------------------------|:---------------------------------------------------------------------------------------------------------------------|
| **Free**              | GBP 0                        | Core Fabricate module, Alchemist's Supplies starter pack, public Discord, documentation                              |
| **Supporter**         | GBP 3/month                  | All premium recipe packs (current and future), early access to new packs, Discord supporter channel, name in credits |
| **Artisan**           | GBP 6/month                  | All above + premium features (visual builder, Cauldron, batch crafting when available), priority bug reports         |
| **Sponsor a Feature** | GBP 50 (one-time or monthly) | All above + direct input on roadmap priorities, credited as feature sponsor                                          |

**Rationale for these prices:**
- GBP 3/month is below the "impulse purchase" threshold and competitive with Moulinette (USD 2/month) while offering tangible content.
- GBP 6/month is well below TheRipper93's EUR 10/month bundle and justified by premium features.
- The gap between free and GBP 3 is small enough that users who find Fabricate useful will convert without friction.

### 6.4 Key Principles

1. **Never paywall existing free features.** Everything in the current codebase stays free forever. This is non-negotiable for community trust. The community license already permits this -- it allows free non-commercial use.

2. **Content before code gating.** Recipe packs are easier to produce, easier to sell, and generate no community friction. Start here. Code-level feature gating (checking activation keys, managing entitlements) is engineering work that delays revenue.

3. **Price modestly.** GBP 3-6/month is the sweet spot for a single-module Patreon in the FVTT ecosystem. Anything above GBP 8/month competes directly with TheRipper93's 30+ module bundle and loses on perceived value per pound.

4. **Invest in visibility before monetisation.** Fabricate's biggest problem is not feature depth -- it is that potential users do not know it exists. A demo video, a Reddit showcase post, a Foundry Hub listing with screenshots, and a Discord presence would do more for revenue than any new feature. You cannot monetise users who have never heard of you.

5. **Protect your time.** As a solo developer building Fabricate in spare time, the risk is not that monetisation fails -- it is that monetisation obligations consume the time needed for development. Structure premium offerings so they scale without proportional effort. Content packs are write-once, sell-many. Feature gating adds ongoing maintenance. Commissioned features add per-customer obligations. Choose accordingly.

---

## Sources

- [FoundryVTT Year in Review 2025](https://foundryvtt.com/article/year-in-review-2025/)
- [FoundryVTT Premium Content](https://foundryvtt.com/article/premium-content/)
- [FoundryVTT Publisher Handbook](https://foundryvtt.com/article/publisher-handbook/)
- [FoundryVTT Marketplace](https://www.foundryvtt.store)
- [TheRipper93 Patreon](https://www.patreon.com/theripper93)
- [TheRipper93 Mastercrafted Wiki](https://wiki.theripper93.com/premium/mastercrafted)
- [Graphtreon: TheRipper93 Statistics](https://graphtreon.com/creator/theripper93)
- [Beaver's Crafting Module (FoundryVTT)](https://foundryvtt.com/packages/beavers-crafting)
- [Beaver's Crafting GitHub](https://github.com/AngryBeaver/beavers-crafting)
- [Furukai's Simple Crafting](https://foundryvtt.com/packages/furu-sc)
- [Item Piles](https://foundryvtt.com/packages/item-piles)
- [MisterPotts Patreon](https://www.patreon.com/misterpotts)
- [Fabricate GitHub](https://github.com/misterpotts/fabricate)
- [FoundryVTT Year in Review 2024](https://foundryvtt.com/article/year-in-review-2024/)
- [Foundry VTT Discord](https://discord.com/invite/foundryvtt)
