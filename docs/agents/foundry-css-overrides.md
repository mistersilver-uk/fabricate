# Foundry vs Fabricate CSS Overrides

Foundry core ships global styles for `button`, `input`, `select`, `textarea`, and `[tabindex]` controls. These frequently win over — or fight with — Fabricate's own styling. The override almost always belongs in **global per-area CSS in `styles/fabricate.css`**, not in a scoped Svelte component `<style>`. Two recurring instances are documented here; both share the same root cause (Foundry's global selectors) and the same fix location.

## Why global, not scoped

- `styles/fabricate.css` is served directly by Foundry, so edits take effect on reload with no Svelte rebuild. A scoped component `<style>` only ships after the Vite bundle is rebuilt — a stale bundle silently keeps the old behavior.
- Scoped component rules race the global stylesheet on specificity in ways that are easy to get wrong (see the specificity ladder below). Centralizing the override in one per-area block keeps the cascade predictable.
- The areas are keyed by the root application classes (`SvelteFabricateApp` → `['fabricate', 'fabricate-app']`; the manager → `.fabricate-manager`; the admin shell → `.fabricate-admin`).

## Instance 1 — button layout

Foundry's global `button` styles center content (`justify-content: center`) and pin a fixed height. A Svelte component rendering a `<button>` with custom content (icon+label triggers, portrait+name option rows) must set `justify-content: flex-start`, `height: auto`, and an explicit `min-height`, or content centers and taller children (e.g. actor portraits) clip. Verify in real Foundry, not just compiled source.

## Instance 2 — the orange focus ring

Foundry paints an orange focus ring on focusable controls. Each app-area neutralizes it with a **paired block** in `styles/fabricate.css`:

```css
/* strip Foundry's orange ring (mouse focus) */
.fabricate-app button:focus,
.fabricate-app input:focus,
.fabricate-app select:focus,
.fabricate-app textarea:focus,
.fabricate-app [tabindex]:focus {
  outline: none;
  box-shadow: none;
}

/* repaint an intentional accent ring (keyboard focus) */
.fabricate-app button:focus-visible,
.fabricate-app input:focus-visible,
.fabricate-app select:focus-visible,
.fabricate-app textarea:focus-visible,
.fabricate-app [tabindex]:focus-visible {
  outline: 2px solid var(--fab-accent);
  outline-offset: 2px;
}
```

`.fabricate-admin` and `.fabricate-manager` have had this block for a while; `.fabricate-app` (the player window) originally shipped with only a partial `:focus:not(:focus-visible)` rule and leaked the orange ring — fixed by giving it the full paired block above.

### `:focus` vs `:focus-visible` is load-bearing

Handle `:focus-visible` **explicitly**. A button lands in the `:focus-visible` state after a sibling/panel re-render — for example the player nav's tab panel swapping content on click. A `:focus:not(:focus-visible)` rule alone strips the ring on a plain mouse click but leaves it in exactly that "clicked-away, panel re-rendered" state, which is the symptom that originally got reported. The `:focus` block strips the mouse-focus ring; the `:focus-visible` block replaces Foundry's orange with the Fabricate accent for keyboard users.

### Specificity ladder

Keep area blocks at **single area-class** specificity so per-component focus rings still win:

| Selector | Specificity | Role |
| --- | --- | --- |
| `.fabricate-app button:focus-visible` | 0,2,1 | area default — strips/repaints Foundry's ring |
| `.some-widget:focus-visible` (scoped Svelte, `+ .svelte-hash`) | 0,3,0 | per-component ring (custom offset, inset, color) |
| `.fabricate.fabricate-app button:focus-visible` | 0,3,1 | ❌ clobbers the per-component ring |

Using the doubled root class (`.fabricate.fabricate-app …`) raises the area default to 0,3,1, which overrides component-scoped rings (e.g. gathering rows that intentionally use `outline-offset: -2px`). Use the single class (`.fabricate-app …`) — matching how `.fabricate-admin`/`.fabricate-manager` are written — so component rings at 0,3,0 stay authoritative.

## Checklist when adding/auditing a control or surface

- New top-level app surface (new root application class)? It needs its own paired focus block — a partial `:focus:not(:focus-visible)` rule reads as "handled" but isn't.
- Don't add scoped `:focus`/`:focus-visible` CSS in a component to fight Foundry — put it in the area block. Reserve scoped focus CSS for genuinely per-widget rings, and keep them at component specificity (0,3,0) so the area default doesn't fight them.
- Custom-content button clipping? Apply the layout fix in Instance 1.
- Verify both in real Foundry (`npm run test:foundry`) — Foundry's global cascade is not reproduced by compiled-source inspection or unit tests.
