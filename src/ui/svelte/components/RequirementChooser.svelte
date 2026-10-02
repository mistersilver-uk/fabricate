<!--
  The player-side requirement chooser: one row of slot tiles, and beneath it the single open
  slot's panel — its alternatives as tiles, then whatever the caller draws for that slot.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `slots` | ordered slot records | `[]` | Each carries `key`, `slotId` (null opens nothing), `kind` `fixed` \| `choice` \| `essence`, `state` `met` \| `partial` \| `short`, `name`, `label` (the whole accessible sentence), `art` / `icon` / `tint`, `pip` (already formatted; empty draws none), `affordance`, `description`, `tileId` and optional `alternatives`. |
  | `openSlotId` | slot id | `null` | The one open slot. The caller owns it and this component never writes it, so two open choosers cannot be represented. |
  | `readOnly` | boolean | `false` | Renders every slot as a labelled image and opens no panel. |
  | `panelId` | DOM id | `null` | The open panel's id, which the open tile names through `aria-controls`. |
  | `ariaLabel` / `alternativesLabel` | localized strings | `''` | The accessible names of the tile group and of the alternatives group. |
  | `class` | class string | `''` | An extra class on the root. |

  An alternative carries `id`, `name`, `label`, `art` / `icon` / `tint`, `pip`, `selected`, `short`,
  `reading`, the shortfall stated in words, and `wrapperProps`, the caller's hooks spread on its wrapper
  with any `class` appended to the wrapper's own.

  Snippets:
  - `panel(slot)` — the caller's content for the open slot, such as an essence pool; it lands in
    the panel region after the alternatives. The region renders only when it has content to hold.

  Callbacks:
  - `onToggle(slotId, open)` — a selectable tile was pressed; `open` says what the press asks
    for, and nothing opens until the caller passes that slot back as `openSlotId`.
  - `onChoose(slot, alternative)` — the only selection event. There is no add and no remove.

  Rest spread:
  - `{...rest}` lands on the root `div`, written after `class={…}`.

  Invariants:
  - A `partial` choice slot is one the player has not picked from, a to-do and never an error:
    it paints the shared tile's `open` face. Any other `partial` slot paints as `short`, because
    the tile has no partial face; `label` and `data-slot-state` carry the difference.
  - A short alternative is dimmed and stays a pressable button; its `reading` is rendered as text
    its button names through `aria-describedby`.
  - `pip` is caller-formatted, so a face that states an amount rather than a held-against-needed
    pair supplies its own text and this component draws nothing extra for it.
  - Pinned by `tests/components/requirement-chooser-mounted.test.js`.
-->
<script>
  import SlotTile from './SlotTile.svelte';

  let {
    slots = [],
    openSlotId = null,
    readOnly = false,
    panelId = null,
    ariaLabel = '',
    alternativesLabel = '',
    class: extraClass = '',
    onToggle = null,
    onChoose = null,
    panel = null,
    ...rest
  } = $props();

  const uid = $props.id();
  const items = $derived(Array.isArray(slots) ? slots : []);
  const classes = $derived(['fab-requirement-chooser', extraClass].filter(Boolean).join(' '));

  function selectable(slot) {
    return !readOnly && slot.kind !== 'fixed' && Boolean(slot.slotId);
  }

  function isOpen(slot) {
    return selectable(slot) && slot.slotId === openSlotId;
  }

  // Several tiles may share one slot id (every plain essence tile opens one pool), so the
  // first of them owns the panel.
  const opened = $derived(items.find(isOpen) ?? null);
  const alternatives = $derived(Array.isArray(opened?.alternatives) ? opened.alternatives : []);
  const shortfalls = $derived(alternatives.filter((entry) => entry.short && entry.reading));
  const hasPanel = $derived(Boolean(opened) && (alternatives.length > 0 || Boolean(panel)));

  function tileState(slot) {
    if (slot.state === 'met') return 'met';
    return slot.kind === 'choice' && slot.state === 'partial' ? 'open' : 'short';
  }

  function toggle(slot) {
    onToggle?.(slot.slotId, slot.slotId !== openSlotId);
  }

  function shortfallId(alternative) {
    return `${uid}-short-${alternative.id}`;
  }

  // The shared tile forwards no ARIA attribute, so the reading is tied to its button from here.
  function describedBy(node, id) {
    const apply = (value) => {
      const button = node.querySelector('button');
      if (value) button?.setAttribute('aria-describedby', value);
      else button?.removeAttribute('aria-describedby');
    };
    apply(id);
    return { update: apply };
  }
</script>

{#snippet tile(slot)}
  <SlotTile
    label={slot.name}
    ariaLabel={slot.label}
    art={slot.art || ''}
    icon={slot.icon || 'fas fa-circle'}
    tint={slot.tint || ''}
    state={tileState(slot)}
    pip={slot.pip || ''}
    pipKind={tileState(slot) === 'open' ? 'candidate' : 'ratio'}
  />
{/snippet}

<div class={classes} {...rest}>
  <div class="fab-requirement-slots" role="group" aria-label={ariaLabel || undefined}>
    {#each items as slot (slot.key)}
      {#if selectable(slot)}
        <button
          type="button"
          class="fab-requirement-slot is-{slot.state}"
          class:is-open={isOpen(slot)}
          id={slot.tileId ?? undefined}
          data-requirement-slot={slot.key}
          data-slot-kind={slot.kind}
          data-slot-state={slot.state}
          data-keyboard-focus="true"
          aria-expanded={isOpen(slot)}
          aria-controls={isOpen(slot) && hasPanel && panelId ? panelId : undefined}
          aria-label={slot.label || undefined}
          title={slot.description || undefined}
          onclick={() => toggle(slot)}
        >
          {@render tile(slot)}
          {#if slot.affordance}
            <span class="fab-requirement-slot-affordance" aria-hidden="true">
              <i class="fas fa-chevron-down"></i>{slot.affordance}
            </span>
          {/if}
        </button>
      {:else}
        <div
          class="fab-requirement-slot is-static is-{slot.state}"
          data-requirement-slot={slot.key}
          data-slot-kind={slot.kind}
          data-slot-state={slot.state}
          title={slot.description || undefined}
        >
          {@render tile(slot)}
        </div>
      {/if}
    {/each}
  </div>

  {#if hasPanel}
    <div
      class="fab-requirement-panel"
      id={panelId ?? undefined}
      role="region"
      aria-labelledby={opened.tileId ?? undefined}
      data-requirement-panel={opened.slotId}
    >
      {#if alternatives.length > 0}
        <div
          class="fab-requirement-alternatives"
          role="group"
          aria-label={alternativesLabel || undefined}
        >
          {#each alternatives as alternative (alternative.id)}
            {@const { class: hookClass = '', ...hooks } = alternative.wrapperProps ?? {}}
            <div
              class={['fab-requirement-alternative', hookClass]}
              class:is-short={alternative.short === true}
              data-requirement-alternative={alternative.id}
              data-alternative-state={alternative.short ? 'short' : 'met'}
              use:describedBy={shortfalls.includes(alternative) ? shortfallId(alternative) : null}
              {...hooks}
            >
              <SlotTile
                label={alternative.name}
                ariaLabel={alternative.label}
                art={alternative.art || ''}
                icon={alternative.icon || 'fas fa-circle'}
                tint={alternative.tint || ''}
                state={alternative.short ? 'short' : 'met'}
                pip={alternative.pip || ''}
                interactive
                pressed={alternative.selected === true}
                onActivate={() => onChoose?.(opened, alternative)}
              />
            </div>
          {/each}
        </div>
        {#each shortfalls as alternative (alternative.id)}
          <p
            class="fab-requirement-shortfall"
            id={shortfallId(alternative)}
            data-requirement-shortfall={alternative.id}
          >
            {alternative.reading}
          </p>
        {/each}
      {/if}
      {@render panel?.(opened)}
    </div>
  {/if}
</div>

<style>
  .fab-requirement-chooser,
  .fab-requirement-panel {
    display: grid;
    gap: var(--fab-space-2);
  }

  /* Tiles wrap onto a further row rather than shrinking: nothing in the row may flex. */
  .fab-requirement-slots,
  .fab-requirement-alternatives {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
  }

  /* Foundry's global button chrome pins a height and centres content, so the box is reset. */
  .fab-requirement-slot {
    appearance: none;
    box-sizing: border-box;
    flex: 0 0 auto;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: var(--fab-space-1);
    width: auto;
    height: auto;
    min-height: 0;
    padding: var(--fab-space-2) var(--fab-space-1) var(--fab-space-1);
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.2;
  }

  button.fab-requirement-slot {
    cursor: pointer;
  }

  button.fab-requirement-slot:hover {
    background: var(--fab-surface-soft);
  }

  /* Open is a fill, never a ring: the focus ring is already an accent outline. */
  .fab-requirement-slot.is-open {
    background: var(--fab-accent-soft);
  }

  .fab-requirement-slot-affordance {
    display: flex;
    align-items: center;
    gap: calc(var(--fab-space-chip) / 2);
    color: var(--fab-accent);
    font-size: 8px;
    font-weight: 600;
  }

  .fab-requirement-slot-affordance i {
    font-size: 6px;
  }

  .fab-requirement-alternative {
    flex: 0 0 auto;
  }

  .fab-requirement-alternative.is-short {
    opacity: 0.6;
  }

  .fab-requirement-shortfall {
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 10.5px;
  }
</style>
