<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE essence chip (issue 1371 r18-colour, maintainer ruling M29): an essence drawn
  as a chip, in the colour the world Essence Catalogue gave it, carrying its glyph and — where the
  caller has one — its quantity.

  WHAT IT OWNS. `Chip` owns the chip: the pill, the scales, the tones, and since this revision the
  `tint`. What no primitive owned was the mapping from an ESSENCE to that chip, so every site wrote
  its own: the glyph fallback, the `{name} {quantity}` a screen reader and a tooltip both read, the
  count, and — the half every site forgot — the colour. The maintainer's third live test found the
  rules library's row chips, the rules editor's tiles and the inspector's essence line all grey
  while the world bulk panel alone drew the colour. This component is that mapping written once:
  a caller hands it the essence row a projection already publishes and gets the reference's essence
  dot (`proto:5502`) with nothing to restate.

  IT IS A COMPOSITION, NOT A SECOND CHIP. Everything a caller can say to `Chip` — `density`, `tag`,
  `class`, every `data-*` hook, `title` — it can say here, and it lands on the same element;
  `manager-layout.test.js`'s hand-rolled-chip ratchet is what stops a second pill from existing,
  and this file carries no chip geometry of its own for exactly that reason. The one style it
  declares is the count's face: the reference draws a row's essence count in the mono numerals
  every count in the manager uses, and `Chip`'s own `mono` would put the NAME in that face too.

  Props:
   - essence: `{id, name, icon?, colorToken?, quantity?}` — a row of `component.essences` as the
     row projection publishes it, or a definition from the essence roster. `icon` falls back to
     the shared essence glyph and `colorToken` to no tint, so an essence with no authored colour
     is the untinted chip and never an error.
   - quantity: overrides `essence.quantity`. A finite number renders the count; anything else
     omits it, so a roster chip is a name alone.
   - showName: draws the essence's name before the count (the inspector's run); off by default,
     because a row's badge carries the name in its accessible name and its tooltip only.
   - density / tag / class: forwarded to `Chip`.
  Every other attribute is forwarded through the rest spread.
-->
<script>
  import Chip from '../Chip.svelte';

  const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

  let {
    essence = null,
    quantity = undefined,
    showName = false,
    density = 'default',
    tag = 'span',
    class: extraClass = '',
    ...rest
  } = $props();

  const id = $derived(String(essence?.id ?? ''));
  const name = $derived(String(essence?.name || id));
  const icon = $derived(String(essence?.icon || '').trim() || DEFAULT_ESSENCE_ICON);
  const count = $derived.by(() => {
    const raw = quantity === undefined ? essence?.quantity : quantity;
    if (raw === null || raw === undefined || raw === '') return null;
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  });
  // The accessible name pairs the two facts the chip states, in the order the reference's own
  // `title` does (`e.name + ' ' + qty`, `proto:5501`).
  const accessibleName = $derived(count === null ? name : `${name} ${count}`);
</script>

<!-- Without internal whitespace between the parts, for the reason `Chip` gives: a newline is a
     text node, and callers assert on the count's exact `textContent`. -->
<Chip
  {tag}
  {density}
  tint={essence?.colorToken || ''}
  {icon}
  class={['fab-essence-chip', extraClass].filter(Boolean).join(' ')}
  title={accessibleName}
  aria-label={accessibleName}
  data-essence-chip={id}
  {...rest}
  >{#if showName}<span class="fab-essence-chip-name">{name}</span>{/if}{#if count !== null}<span
      class="fab-essence-chip-count">{count}</span
    >{/if}</Chip
>

<style>
  /* Numerals are mono everywhere in the manager, at the face's 500 rung: `proto:5502` draws the
     count in `var(--mono)` and this repo's mono ships 400/500. Declared on the COUNT alone so a
     chip that also shows the name keeps the name in the chip's own face. */
  .fab-essence-chip-count {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
</style>
