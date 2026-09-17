<!--
  The manager's ONE essence chip: an essence drawn as a chip, in the colour the world Essence
  Catalogue gave it, carrying its glyph and — where the caller has one — its quantity.

  `Chip` owns the chip itself, `tint` included. What no primitive owned was the MAPPING from an
  essence to that chip, so every site wrote its own glyph fallback, `{name} {quantity}` name, count
  and — the half every site forgot — colour, which is how three surfaces came to draw grey chips
  while the world bulk panel drew the colour. This is that mapping, written once.

  IT IS A COMPOSITION, NOT A SECOND CHIP. Everything a caller can say to `Chip` it can say here and
  it lands on the same element, and this file carries no chip geometry of its own — which is what
  `manager-layout.test.js`'s hand-rolled-chip ratchet polices. The one style it declares is the
  count's face, because `Chip`'s own `mono` would put the NAME in that face too.

  Props: essence (`{id, name, icon?, colorToken?, quantity?}`, a row the projection publishes or a
  roster definition; `icon` falls back to the shared glyph and `colorToken` to no tint, so an
  uncoloured essence is the untinted chip and never an error); quantity (overrides
  `essence.quantity`; a non-finite value omits the count, so a roster chip is a name alone);
  showName (off by default — a row's badge carries the name in its accessible name and tooltip);
  density / tag / class, forwarded to `Chip`, as is every other attribute.
-->
<script>
  import Chip from '../../../components/Chip.svelte';

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
  // Pairs the two facts the chip states, in the order the reference's own `title` does.
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
  /* Numerals are mono everywhere in the manager. Declared on the COUNT alone, so a chip that also
     shows the name keeps the name in the chip's own face. */
  .fab-essence-chip-count {
    font-family: var(--fab-font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
</style>
