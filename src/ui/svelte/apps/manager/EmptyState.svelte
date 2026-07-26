<!-- Svelte 5 runes mode -->
<!--
  The manager's no-state primitive: one dashed panel, one rounded icon tile, a serif
  title and a capped body line. Matched to the reference prototype
  (padding 44px 20px · 1.5px dashed · radius 12px · no fill · 9px gap · 46px tile holding
  an 18px subtle glyph · 13px/600 serif title · 11px/1.5 subtle body).

  It renders the GLOBAL `.manager-empty` contract rather than carrying scoped styles, so
  the appearance lives in exactly one place (`styles/fabricate.css`) and converting a
  hand-rolled site to this component is a no-op visually. That also means the outer
  element MUST keep the `<div class="manager-empty"><div>…</div></div>` shape: the icon,
  title and body rules are written as `> div > i` / `h3` / `p` descendants, so flattening
  the wrapper silently drops the icon tile and the stack gap.

  `compact` is for a sidebar or an inline panel where a 44px-padded hero is too much
  furniture — it keeps the same vocabulary at a smaller scale rather than inventing a
  second look.

  A component wearing `.manager-*` classes belongs under `apps/manager/` (not the
  import-free `components/` leaf directory), which is why it lives here. The player app's
  own empties (`salvage-empty`, `alchemy-*-empty`, `inventory-detail-empty-note`) are a
  different area shell with their own scoped styles and are NOT this primitive's remit.

  Props:
   - icon: Font Awesome classes for the glyph (required for the tile to render).
   - title: the short statement of what is absent.
   - hint: the optional explanatory sentence beneath it.
   - compact: smaller tile and tighter padding for sidebars and inline panels.
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-knowledge-learned-empty"`.
-->
<script>
  let {
    icon = '',
    title = '',
    hint = '',
    compact = false,
    dataAttr = '',
    dataValue = '',
  } = $props();

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<div class="manager-empty" class:is-compact={compact} {...hookAttributes}>
  <div>
    {#if icon}
      <i class={icon} aria-hidden="true"></i>
    {/if}
    {#if title}
      <h3>{title}</h3>
    {/if}
    {#if hint}
      <p>{hint}</p>
    {/if}
  </div>
</div>
