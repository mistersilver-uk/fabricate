# Fabricate Design System — reference

The **target** visual language for any Fabricate screen — the Player app and the GM
authoring app.
Colour is never hard-coded: everything is driven by `--fab-*` custom properties, and one
attribute chooses which of the six themes is live.
Build to this reference and the output drops into either app and reskins with every theme.

> **Ground truth wins.**
> `styles/fabricate.css` (the token and theme blocks) and `src/ui/theme.js`
> (`applyFabricateTheme`) are the source of truth.
> Where this document disagrees with them, they win — treat the disagreement as a bug in this
> file.
> Sections marked **aspirational** describe a target the shipped code has not reached yet;
> each names the tracked proposal that would make it true.

## 0. When to use this

- Any new Player-facing surface (Crafting, Gathering, Journal, Inventory) or GM-facing surface
  (browse lists, editors, settings, vocabulary, dashboard).
- Any component that must sit inside the existing shells and survive a theme swap.
- Reviewing or redlining a screen against the system.

The golden rule: never write a hex or `rgb()` literal in UI markup — reference `var(--fab-*)`.
Literals live in exactly one place: the per-theme blocks in `styles/fabricate.css`.
A literal outside a theme block fails `tests/components/theme-colour-contract.test.js`.

## 1. Theming architecture

### 1.1 The switch — one attribute

`applyFabricateTheme(id)` in `src/ui/theme.js` stamps `data-fabricate-theme` onto `<html>` and
every `.fabricate` app root.
Unknown ids fall back to the default (`fabricate`).

```html
<html data-fabricate-theme="fabricate">
  <div class="fabricate fabricate-app">…</div>          <!-- player -->
  <div class="fabricate crafting-system-manager">…</div> <!-- GM -->
```

The six theme ids are `fabricate`, `mythwright`, `ironblood-forge`, `hearth-herb`,
`starglass-arcana`, and `foundry-native`.

### 1.2 Two token layers

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Layer | Holds |
|---|---|
| **Base `:root`** | non-colour tokens (spacing `--fab-space-*`, radii, control heights) **and** the semantic colour-*alias* layer (`--fab-v2-*`, `--fab-status-*`, `--fab-editor-*`) that forwards via `var()` into the live theme |
| **`[data-fabricate-theme="…"]` block** | the colour *literals* only — bg, text, accent, semantics, tags, drop-rates, shadows |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Colour *literals* live only in the theme blocks.
The `:root` layer holds no literals, but it does hold the alias tokens that resolve to them —
so "base `:root` is colour-free" is about literals, not tokens.
Every theme block defines the **identical** token surface: the contract test asserts each theme
declares the same >100 token names plus its own palette anchors, and that no `var(--fab-*)`
reference is left dangling.
The `--fab-v2-*` aliases let legacy code migrate one token at a time.
Every theme is dark, so app roots set `color-scheme: dark` and native controls and `<select>`
popups match.

### 1.3 Base layer (theme-independent)

The non-colour tokens live in the base `:root` of `styles/fabricate.css`.
The spacing scale is canonically specified in `openspec/specs/ui-integration/spec.md`
("Spacing scale") — cite that spec for the numbers rather than re-deriving them here.

```css
:root{
  /* spacing — 4px base */
  --fab-space-2xs:2px; --fab-space-1:4px; --fab-space-chip:6px; --fab-space-2:8px;
  --fab-space-3:12px; --fab-space-4:16px; --fab-space-5:20px; --fab-space-6:24px;
  /* radius */
  --fab-v2-radius-control:5px;   /* inputs, selects, chips */
  --fab-v2-radius-panel:6px;     /* cards, panels, wells   */
  /* sizing rhythm */
  --fab-v2-control-height:34px; --fab-v2-icon-button:34px;
  --fab-v2-thumb-sm:40px; --fab-v2-thumb-md:58px; --fab-v2-row-height:72px;
}
```

### 1.4 The six themes

The palettes are **not** duplicated here — `styles/fabricate.css` is the single source of
truth for every colour literal, and copying them into this file only invites drift.
Read the `:root[data-fabricate-theme="…"]` blocks there for the live values, and ship all six.
The default `fabricate` block is reproduced once below as a shape reference; treat the file, not
this snippet, as authoritative.

```css
:root, :root[data-fabricate-theme="fabricate"]{
  --fab-bg-0:#111A23; --fab-bg-1:#15212B; --fab-bg-2:#1B2833; --fab-bg-3:#2C3B49;
  --fab-border:rgb(217 184 156/18%); --fab-border-strong:rgb(217 184 156/32%);
  --fab-text:#F1D1B5; --fab-text-secondary:#D9B89C; --fab-text-muted:rgb(217 184 156/74%);
  --fab-accent:#E8C6A7; --fab-accent-strong:#D9B89C; --fab-on-accent:#111A23;
  --fab-success:#9AB89C; --fab-info:#B9D3DD; --fab-warning:#E7DBB1; --fab-danger:#B97C78;
  /* …plus -text / -soft / -border ramps, --fab-drop-rate-*, --fab-tag-*, --fab-shadow-* */
}
```

## 2. Colour token reference

Use the token, never the hex.
Each accent and semantic ships a base plus `-soft` (14–16% fill) plus `-border` (44–56%);
semantics also ship `-text` (readable on the soft fill), and accent ships `--fab-on-accent`.

**Surfaces (background ramp, darkest → tiles):**
`--fab-bg-0` app base / GM rail · `--fab-bg-1` panel / window · `--fab-bg-2` raised / cards ·
`--fab-bg-3` tiles / wells.

**Overlays (tint fills over the theme's light channel):**
`--fab-surface-soft` ~5% · `--fab-surface-raised` ~8% · `--fab-surface-active` ~12% ·
`--fab-border` 18% · `--fab-border-strong` 32%.

**Text:**
`--fab-text` primary · `--fab-text-secondary` emphasised · `--fab-text-muted` body ·
`--fab-text-subtle` labels/meta · `--fab-text-disabled` inert.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Token family | Meaning |
|---|---|
| `--fab-accent` / `-strong` / `-soft` / `-border` / `--fab-on-accent` | primary actions, selection |
| `--fab-success` / `-text` / `-soft` / `-border` | ready, craftable, succeeded |
| `--fab-info` / `-text` / `-soft` / `-border` | world-time, notes, neutral hints |
| `--fab-warning` / `-text` / `-soft` / `-border` | waiting, stamina, missing |
| `--fab-danger` / `-text` / `-soft` / `-border` | hazard, failed, broken, blocked |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Rarity / drop-rate ramp** (`--fab-drop-rate-*`, theme-constant):
`guaranteed` `common` `uncommon` `rare` `very-rare` `legendary`.

**Essence tags** (`--fab-tag-*`, per-theme tinted dots):
`sage` `mist` `lavender` `rose` `peach` `butter` `aqua` `mauve`.

## 3. Typography — aspirational

> **Aspirational.**
> The shipped app inherits Foundry's `--font-primary` (Signika in practice) for everything and
> has no serif or mono token: `--fab-font-mono` is referenced once but never defined, so it
> falls back to generic `monospace`.
> The type ramp below is the target.
> Adopting it is a tracked proposal — add `@font-face` for Spectral and JetBrains Mono, define
> `--fab-font-serif` / `--fab-font-sans` / `--fab-font-mono` tokens, and apply serif to
> entity/name surfaces and mono to dice/IDs.
> Until then, style names and prose with the inherited `--font-primary`.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Role | Font (target) | Weight / size / lh |
|---|---|---|
| Page title | Spectral (serif) | 600 · 40px / 1.05 |
| Section heading | Spectral | 600 · 30px / 1.1 |
| Panel / entity title | Spectral | 600 · 20–22px / 1.15 |
| Card / item name | Spectral | 600 · 13–14px |
| Big value | Spectral | 700 · 28–30px · semantic colour |
| Body copy | Signika (sans) | 400 · 13–14px / 1.5 |
| Control / button label | Signika | 600–700 · 12–14px |
| Section kicker | Signika | 700 · 10–11px · UPPER · tracking .12–.16em |
| Dice / IDs | JetBrains Mono | 400–500 · 10–12px |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The intent: **serif names, sans explains.**
If it names a thing (item, recipe, page) it takes the serif; UI, prose, and labels take the
sans; mono is only for dice formulas and run IDs.

## 4. Space, radius and elevation

- **Spacing** (`--fab-space-*`, 4px base): the canonical scale is in
  `openspec/specs/ui-integration/spec.md`; prefer flex/grid with `gap`.
- **Radius:** `--fab-v2-radius-control` **5px** (inputs, chips) · `--fab-v2-radius-panel` **6px**
  (cards, panels) · **999px** pills.
  Player-app cards commonly ride 8–12px; keep to 5 / 8 / 10 / 12 / 999.
- **Sizing rhythm:** control and icon-button **34** · thumb-sm **40** · thumb-md **58** ·
  row **72**.
- **Elevation** (`--fab-shadow-*`): `-sm` 0 8 18 · `-md` 0 10 24 · `-lg` 0 14 38 (windows).
  Shadow tint is theme-scoped, keyed off each theme's darkest channel rather than fixed black.
- **Focus ring:** the Foundry orange ring is overridden per app-area in `styles/fabricate.css`,
  not in scoped Svelte `<style>` — see the "Foundry vs Fabricate CSS overrides" section of
  `CONTRIBUTING.md` and the focus-ring rule in the UX-designer `SKILL.md`.

## 5. Components (copy-paste)

All examples reference `var(--fab-*)` via short local aliases (`--sans` etc.); substitute the
full token names in product.
Assume a Font Awesome 6 `<link>` is present.
These are illustrative shapes — a component's own runtime colour may be applied inline via
`style=`, but never a source colour literal.

### 5.1 Buttons

Primary = accent + on-accent text · Confirm = success · Secondary = surface-soft + border ·
icon-only 38×38.
Height **42px**, radius **8**, gap **8**.

```html
<button style="height:42px;padding:0 18px;border:1px solid var(--fab-accent-border);border-radius:8px;background:var(--fab-accent);color:var(--fab-on-accent);font:700 14px var(--sans);display:inline-flex;align-items:center;gap:8px;cursor:pointer"><i class="fa-solid fa-screwdriver-wrench"></i>Primary</button>

<button style="height:42px;padding:0 16px;border:1px solid var(--fab-success-border);border-radius:8px;background:var(--fab-success);color:var(--fab-on-accent);font:700 14px var(--sans);display:inline-flex;align-items:center;gap:8px;cursor:pointer"><i class="fa-solid fa-hand-sparkles"></i>Confirm</button>

<button style="height:42px;padding:0 16px;border:1px solid var(--fab-border);border-radius:8px;background:var(--fab-surface-soft);color:var(--fab-text-secondary);font:600 13px var(--sans);display:inline-flex;align-items:center;gap:8px;cursor:pointer"><i class="fa-solid fa-star"></i>Secondary</button>

<button style="width:38px;height:38px;border:1px solid var(--fab-border);border-radius:8px;background:var(--fab-surface-soft);color:var(--fab-text-secondary);cursor:pointer"><i class="fa-solid fa-forward"></i></button>
```

### 5.2 Filter chips and tabs

Active chip = accent-soft fill + accent-border.
Inactive = surface-soft + border.
Count shown at `opacity:.7`.

```html
<span style="display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--fab-accent-soft);border:1px solid var(--fab-accent-border);font:600 11px var(--sans);color:var(--fab-accent)"><i class="fa-solid fa-layer-group" style="font-size:10px"></i>All <span style="opacity:.7">27</span></span>

<span style="display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);font:500 11px var(--sans);color:var(--fab-text-muted)"><i class="fa-solid fa-cube" style="font-size:10px"></i>Components <span style="opacity:.7">14</span></span>
```

Underline tabs: the active tab gets a 2px accent underline sitting on the divider via
`margin-bottom:-1px`.

### 5.3 Status badges — icon + word, always

Never colour alone.
Fill = `-soft`, ring = `-border`, text = `-text`, `font:700 10px`.

```html
<span style="display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--fab-success-soft);border:1px solid var(--fab-success-border);font:700 10px var(--sans);color:var(--fab-success-text)"><i class="fa-solid fa-circle-check" style="font-size:9px"></i>Ready</span>

<span style="display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--fab-warning-soft);border:1px solid var(--fab-warning-border);font:700 10px var(--sans);color:var(--fab-warning-text)"><i class="fa-solid fa-hourglass-half" style="font-size:9px"></i>Waiting</span>

<span style="display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--fab-danger-soft);border:1px solid var(--fab-danger-border);font:700 10px var(--sans);color:var(--fab-danger-text)"><i class="fa-solid fa-circle-xmark" style="font-size:9px"></i>Failed</span>
```

### 5.4 Inputs and select

Search **36px**, select **34px**.
Leading icon, subtle placeholder, focus → accent ring.

```html
<div style="display:flex;align-items:center;gap:8px;padding:0 12px;height:36px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:8px"><i class="fa-solid fa-magnifying-glass" style="color:var(--fab-text-subtle);font-size:12px"></i><input placeholder="Search items, essences, tags…" style="border:0;background:none;outline:none;font:400 12.5px var(--sans);color:var(--fab-text);width:100%"></div>

<div style="display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:34px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:8px"><span style="font:500 12px var(--sans);color:var(--fab-text-secondary)">All systems</span><i class="fa-solid fa-chevron-down" style="color:var(--fab-text-subtle);font-size:11px"></i></div>
```

### 5.5 Item tile

Thumb **56px** tinted well · qty pill top-right · essence dot bottom-left · serif name under ·
selected → accent border.
The dot's outline ring uses a token, not an inline literal.

```html
<div style="width:130px;border:1px solid var(--fab-border);border-radius:10px;background:var(--fab-bg-2);padding:11px;position:relative">
  <span style="position:absolute;top:8px;right:8px;padding:2px 7px;border-radius:999px;background:var(--fab-bg-0);border:1px solid var(--fab-border);font:700 9.5px var(--sans);color:var(--fab-text)">×6</span>
  <span style="display:flex;height:56px;border-radius:8px;background:var(--fab-bg-3);align-items:center;justify-content:center;color:var(--fab-drop-rate-common);margin-bottom:8px;position:relative"><i class="fa-solid fa-bars-staggered" style="font-size:18px"></i><span style="position:absolute;bottom:5px;left:5px;width:7px;height:7px;border-radius:50%;background:var(--fab-tag-mist);box-shadow:0 0 0 1.5px var(--fab-bg-0)"></span></span>
  <div style="font:600 11.5px var(--sans);color:var(--fab-text);text-align:center">Iron Ingot</div>
</div>
```

### 5.6 List row

40px icon + serif name + sans meta.
Selected/hover → `accent-border` + `surface-soft`.

```html
<div style="display:flex;gap:11px;align-items:center;padding:11px 12px;border:1px solid var(--fab-accent-border);border-radius:10px;background:var(--fab-surface-soft)">
  <span style="width:40px;height:40px;border-radius:8px;background:var(--fab-bg-3);display:flex;align-items:center;justify-content:center;color:var(--fab-tag-peach)"><i class="fa-solid fa-fire" style="font-size:13px"></i></span>
  <div style="flex:1;min-width:0"><div style="font:600 13px var(--serif);color:var(--fab-text)">Alloy Bronze</div><div style="font:400 10.5px var(--sans);color:var(--fab-text-subtle);margin-top:2px">Mythwright</div></div>
  <span style="color:var(--fab-text-subtle);font-size:12px"><i class="fa-solid fa-star"></i></span>
</div>
```

### 5.7 Bars and meters

Track = `surface-active`.
Fill 5–8px, pill-round.
The success bar gradients to guaranteed; loot bars take the rarity colour.

```html
<div style="height:8px;border-radius:999px;background:var(--fab-surface-active);overflow:hidden"><div style="width:90%;height:100%;background:linear-gradient(90deg,var(--fab-success),var(--fab-drop-rate-guaranteed))"></div></div>
<div style="height:5px;border-radius:999px;background:var(--fab-surface-active);overflow:hidden"><div style="width:40%;height:100%;background:var(--fab-drop-rate-uncommon)"></div></div>
```

### 5.8 Nav rail item (Player, 60–84px)

Active = accent-soft fill + accent-border.
Count badge = success pill, top-right.

```html
<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:60px;padding:10px 0;border-radius:8px;background:var(--fab-accent-soft);border:1px solid var(--fab-accent-border);color:var(--fab-accent)"><i class="fa-solid fa-hammer" style="font-size:16px"></i><span style="font:600 10px var(--sans)">Crafting</span></div>

<div style="display:flex;flex-direction:column;align-items:center;gap:4px;width:60px;padding:10px 0;border-radius:8px;color:var(--fab-text-muted);position:relative"><i class="fa-solid fa-book-open" style="font-size:16px"></i><span style="font:500 10px var(--sans)">Journal</span><span style="position:absolute;top:6px;right:8px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--fab-success);border:1px solid var(--fab-success-border);color:var(--fab-on-accent);font:700 9px/16px var(--sans);text-align:center">2</span></div>
```

### 5.9 Stat box

Icon · serif number · tiny label.
The border turns **danger** when the count is a problem.

```html
<div style="flex:1;padding:12px 8px;background:var(--fab-bg-1);border:1px solid var(--fab-border);border-radius:9px;text-align:center"><i class="fa-solid fa-scroll" style="color:var(--fab-accent);font-size:13px"></i><div style="font:700 17px/1.1 var(--serif);color:var(--fab-text);margin-top:6px">1</div><div style="font:500 9px var(--sans);color:var(--fab-text-subtle);margin-top:2px">Planned</div></div>
```

### 5.10 Labeled cell (world conditions / run meta)

An uppercase micro-label over a value or meter.

```html
<div style="display:inline-flex;flex-direction:column;gap:3px;padding:6px 12px;background:var(--fab-warning-soft);border:1px solid var(--fab-warning-border);border-radius:8px">
  <span style="font:700 9px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--fab-text-subtle)">Stamina</span>
  <div style="display:flex;align-items:center;gap:7px"><span style="width:60px;height:6px;border-radius:999px;background:var(--fab-surface-active);overflow:hidden"><span style="display:block;width:100%;height:100%;background:var(--fab-warning)"></span></span><span style="font:700 11px var(--sans);color:var(--fab-warning-text)">10/10</span></div>
</div>
```

## 6. Patterns

### 6.1 Player shell — three-column triptych

Dark titlebar → actor + conditions bar → **84px icon rail · browse · detail · inspector**.
Left and right are fixed, the middle flexes.
Rail **84px** · browse **300–340px** · inspector **300–336px** · min-window **1024×640**.
Panels step darker left → right: bg-1 · bg-1 · **bg-2**.

```html
<div style="display:grid;grid-template-columns:84px 320px minmax(0,1fr) 320px;min-height:100vh">
  <nav style="background:var(--fab-bg-0);border-right:1px solid var(--fab-border)">…rail…</nav>
  <section style="background:var(--fab-bg-1);border-right:1px solid var(--fab-border)">…browse…</section>
  <main style="background:var(--fab-bg-1);border-right:1px solid var(--fab-border)">…detail…</main>
  <aside style="background:var(--fab-bg-2)">…inspector…</aside>
</div>
```

### 6.2 Empty / first-run hero — never a dead end

Circle icon · serif title · muted line · a **single** primary CTA that is always a door out.

```html
<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 10px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:10px">
  <span style="width:48px;height:48px;border-radius:13px;background:var(--fab-surface-raised);border:1px solid var(--fab-border);display:flex;align-items:center;justify-content:center;color:var(--fab-text-subtle);font-size:18px;margin-bottom:12px"><i class="fa-solid fa-box-open"></i></span>
  <div style="font:600 16px/1.2 var(--serif);color:var(--fab-text);margin-bottom:6px">Short, human title</div>
  <div style="font:400 11.5px/1.45 var(--sans);color:var(--fab-text-muted);max-width:240px;margin-bottom:12px">One line on what belongs here and how it arrives.</div>
  <span style="padding:7px 14px;border-radius:8px;background:var(--fab-accent);color:var(--fab-on-accent);font:700 11.5px var(--sans)">One primary CTA</span>
</div>
```

### 6.3 Callout / info strip

Leading icon + text; the palette matches the intent; one idea per strip.

```html
<div style="display:flex;gap:10px;padding:11px 13px;background:var(--fab-info-soft);border:1px solid var(--fab-info-border);border-radius:9px"><i class="fa-solid fa-lightbulb" style="color:var(--fab-info);font-size:12px;margin-top:1px"></i><span style="font:400 11.5px/1.5 var(--sans);color:var(--fab-text-muted)">Info / tip — neutral guidance.</span></div>

<div style="display:flex;gap:10px;padding:11px 13px;background:var(--fab-danger-soft);border:1px solid var(--fab-danger-border);border-radius:9px"><i class="fa-solid fa-triangle-exclamation" style="color:var(--fab-danger-text);font-size:12px;margin-top:1px"></i><span style="font:400 11.5px/1.5 var(--sans);color:var(--fab-text-muted)">Blocker — names the problem <em>and</em> the fix.</span></div>
```

## 7. GM authoring surface

Reuses every token, type ramp, and semantic above — no re-theme.
It adds a denser manager shell plus authoring primitives that repeat across the GM views.

### 7.1 Manager shell — `.fabricate-manager`

Header (breadcrumb · title/subtitle · primary action) → **220px labelled rail** · flexing main
· fixed **300px inspector**.
Grid `220px · minmax(0,1fr) · 300px`, container-query responsive, min-window **1024×640**.
Panels darker left → right: bg-0 rail · bg-1 main · **bg-2** inspector.
The rail collapses to 56px.
Five archetypes ride this shell: browse · tabbed editor · long-form editor · rules/config ·
vocabulary.

```html
<div style="display:grid;grid-template-columns:220px minmax(0,1fr) 300px;min-height:100vh">
  <nav style="background:var(--fab-bg-0);border-right:1px solid var(--fab-border)">…rail + counts…</nav>
  <main style="background:var(--fab-bg-1)">…browse or editor…</main>
  <aside style="background:var(--fab-bg-2)">…inspector / context…</aside>
</div>
```

### 7.2 Row-card — the library primitive

Icon · **serif** name + mode pill · sans desc · **On/Off** toggle · labelled actions.
Selected → accent-border + surface-soft.
Supports a compact density and a bulk-select checkbox.

```html
<div style="display:flex;gap:12px;align-items:center;padding:12px 13px;border:1px solid var(--fab-accent-border);border-radius:10px;background:var(--fab-surface-soft)">
  <span style="width:38px;height:38px;border-radius:8px;background:var(--fab-bg-3);display:flex;align-items:center;justify-content:center;color:var(--fab-accent)"><i class="fa-solid fa-scroll" style="font-size:14px"></i></span>
  <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px"><span style="font:600 13.5px var(--serif);color:var(--fab-text)">Alloy Bronze Ingot</span><span style="padding:1px 8px;border-radius:999px;background:var(--fab-info-soft);border:1px solid var(--fab-info-border);font:600 9px var(--sans);color:var(--fab-info)">Multi-step</span></div><div style="font:400 10.5px var(--sans);color:var(--fab-text-subtle);margin-top:2px">Smelt tin &amp; copper over a forge · 3 components</div></div>
  <span style="display:flex;align-items:center;gap:5px;font:600 10px var(--sans);color:var(--fab-success-text)"><span style="width:26px;height:15px;border-radius:999px;background:var(--fab-success-soft);border:1px solid var(--fab-success-border);position:relative"><span style="position:absolute;right:2px;top:1.5px;width:10px;height:10px;border-radius:50%;background:var(--fab-success)"></span></span>On</span>
</div>
```

### 7.3 Filter bar (config-driven, identical on every library screen)

**34px** search + 2–4 dropdowns + a count chip.
Never bespoke per view.

```html
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:8px;padding:0 12px;height:34px;flex:1;min-width:130px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:8px"><i class="fa-solid fa-magnifying-glass" style="color:var(--fab-text-subtle);font-size:11px"></i><span style="font:400 12px var(--sans);color:var(--fab-text-subtle)">Search…</span></div>
  <div style="display:flex;align-items:center;gap:7px;padding:0 11px;height:34px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:8px;font:500 11.5px var(--sans);color:var(--fab-text-secondary)">Category <i class="fa-solid fa-chevron-down" style="font-size:9px;color:var(--fab-text-subtle)"></i></div>
  <span style="padding:4px 10px;border-radius:999px;background:var(--fab-accent-soft);border:1px solid var(--fab-accent-border);font:600 10.5px var(--sans);color:var(--fab-accent)">105</span>
</div>
```

### 7.4 Segmented selector (binary/tertiary mode switch — not radio-cards)

Track = surface-soft, active thumb = **accent** on on-accent text.
Radius 7 inner / 9 outer.

```html
<div style="display:inline-flex;padding:3px;background:var(--fab-surface-soft);border:1px solid var(--fab-border);border-radius:9px;gap:2px">
  <span style="padding:6px 14px;border-radius:7px;background:var(--fab-accent);color:var(--fab-on-accent);font:600 11.5px var(--sans)">Single-step</span>
  <span style="padding:6px 14px;border-radius:7px;color:var(--fab-text-muted);font:500 11.5px var(--sans)">Multi-step</span>
</div>
```

### 7.5 Editor tab bar

Count badges on tabs (surface-active).
Validation errors turn the tab and its badge **danger**.
Pair with a sticky save + dirty-state footer.

```html
<div style="display:flex;gap:20px;border-bottom:1px solid var(--fab-border)">
  <div style="padding-bottom:9px;border-bottom:2px solid var(--fab-accent);color:var(--fab-accent);font:600 12px var(--sans);margin-bottom:-1px">Overview</div>
  <div style="display:flex;align-items:center;gap:7px;padding-bottom:9px;color:var(--fab-text-muted);font:500 12px var(--sans)">Check <span style="min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--fab-surface-active);font:700 9px/15px var(--sans);text-align:center;color:var(--fab-text-secondary)">3</span></div>
  <div style="display:flex;align-items:center;gap:7px;padding-bottom:9px;color:var(--fab-danger-text);font:500 12px var(--sans)">Validation <span style="min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--fab-danger-soft);border:1px solid var(--fab-danger-border);font:700 9px/13px var(--sans);text-align:center;color:var(--fab-danger-text)">2</span></div>
</div>
```

### 7.6 Modifier block (one component for biome / time / weather / character)

Uppercase label · "+" · attached removable pills.

```html
<div style="border:1px solid var(--fab-border);border-radius:9px;background:var(--fab-surface-soft);padding:12px 13px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><span style="font:700 10px var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--fab-text-subtle)">Biome modifiers</span><span style="width:24px;height:24px;border-radius:6px;background:var(--fab-accent-soft);border:1px solid var(--fab-accent-border);display:flex;align-items:center;justify-content:center;color:var(--fab-accent);font-size:11px"><i class="fa-solid fa-plus"></i></span></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">
    <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--fab-success-soft);border:1px solid var(--fab-success-border);font:600 10.5px var(--sans);color:var(--fab-success-text)"><i class="fa-solid fa-tree" style="font-size:9px"></i>Forest +2 <i class="fa-solid fa-xmark" style="font-size:8px;opacity:.6"></i></span>
  </div>
</div>
```

### 7.7 Validation surface (one system)

Critical/Warning count pills + a green-check / red-x checklist.

```html
<div style="display:flex;gap:8px;margin-bottom:12px">
  <span style="display:flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:var(--fab-danger-soft);border:1px solid var(--fab-danger-border);font:700 10px var(--sans);color:var(--fab-danger-text)"><i class="fa-solid fa-circle-exclamation" style="font-size:9px"></i>2 Critical</span>
  <span style="display:flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:var(--fab-warning-soft);border:1px solid var(--fab-warning-border);font:700 10px var(--sans);color:var(--fab-warning-text)"><i class="fa-solid fa-triangle-exclamation" style="font-size:9px"></i>1 Warning</span>
</div>
<div style="display:flex;flex-direction:column;gap:7px">
  <div style="display:flex;align-items:center;gap:8px;font:400 11.5px var(--sans);color:var(--fab-text-muted)"><i class="fa-solid fa-circle-check" style="color:var(--fab-success);font-size:11px"></i>Recipe has at least one outcome</div>
  <div style="display:flex;align-items:center;gap:8px;font:400 11.5px var(--sans);color:var(--fab-danger-text)"><i class="fa-solid fa-circle-xmark" style="font-size:11px"></i>Check formula references an unset ability</div>
</div>
```

## 8. Working rules (checklist before shipping)

1. **Serif names, sans explains.**
   Serif for the names of things, sans for UI and prose, mono only for dice and IDs — subject to
   the typography adoption in §3; until then everything uses the inherited `--font-primary`.
2. **Colour carries meaning, not decoration.**
   Reserve semantic hues for status; keep surfaces neutral.
3. **Tint, don't fill.**
   Chips are 14–16% `-soft` fills plus a `-border`, never solid blocks — the exception is the
   primary and confirm buttons.
4. **Icon + word, always.**
   Every status pairs a glyph with a label so it survives colour-blindness and greyscale.
5. **One loud thing per panel.**
   The primary number and its action win; everything else supports.
6. **Snap to the scale.**
   Space in 4px steps; radius 5 / 8 / 10 / 12 / 999; controls on the 34 / 40 / 42 rhythm.
7. **No colour literals in UI.**
   Only `var(--fab-*)`; verify the screen reskins under all six themes before calling it done.
