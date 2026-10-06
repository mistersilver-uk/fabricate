<!--
  The player-side requirement chooser: one row of slot tiles, and beneath it the single open
  slot's panel — its alternatives as tiles in a `Well`, then whatever the caller draws for that slot.
  An `award` slot is a reward pick (issue 1773): it draws no tile in the row and its panel is
  always open.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `slots` | ordered slot records | `[]` | Each carries `key`, `slotId` (null opens nothing), `kind` `fixed` \| `choice` \| `essence` \| `award`, `state` `met` \| `partial` \| `short`, `name`, `label` (the whole accessible sentence), `art` / `icon` / `tint`, `pip` (already formatted; empty draws none), `affordance`, `description`, `tileId` and optional `alternatives`. An `award` slot has no `state`: its `name` is the kicker naming its alternatives and its `status` the ceiling sentence, empty below the ceiling. |
  | `openSlotId` | slot id | `null` | The one open slot. The caller owns it and this component never writes it, so two open choosers cannot be represented. |
  | `readOnly` | boolean | `false` | Renders every slot as a labelled image and opens no panel; an `award` panel stays drawn, its tiles as images. |
  | `panelId` | DOM id | `null` | The open panel's id, which the open tile names through `aria-controls`. |
  | `ariaLabel` / `alternativesLabel` | localized strings | `''` | The accessible name of the tile group, and the visible kicker that names the alternatives' `Well`. |
  | `class` | class string | `''` | An extra class on the root. |

  An alternative carries `id`, `name`, `label`, `art` / `icon` / `tint`, `pip`, `selected`, `short`,
  `reading`, the shortfall stated in words, an optional `disabled`, and `wrapperProps`, the caller's
  hooks spread on its wrapper with any `class` appended to the wrapper's own.

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
    it paints the shared tile's `open` face. Any other `partial` slot, a partly delivered
    essence, paints the tile's `partial` face.
  - A short alternative is dimmed and stays a pressable button; its `reading` is rendered as text
    its button names through `aria-describedby`.
  - `pip` is caller-formatted, so a face that states an amount rather than a held-against-needed
    pair supplies its own text and this component draws nothing extra for it.
  - An award tile is a native `disabled` button when its alternative is; its `reading`, a whole
    sentence, and the slot's `status`, a visible `role="status"` sentence, are named through
    `aria-describedby`. Award and choice alternatives share one Well snippet.
  - Pinned by `tests/components/requirement-chooser-mounted.test.js`.
-->
<script>
  import SlotTile from './SlotTile.svelte';
  import Well from './Well.svelte';

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
  const rowSlots = $derived(items.filter((slot) => slot.kind !== 'award'));
  const awardSlots = $derived(items.filter((slot) => slot.kind === 'award'));
  const classes = $derived(['fab-requirement-chooser', extraClass].filter(Boolean).join(' '));

  function selectable(slot) {
    return !readOnly && !['fixed', 'award'].includes(slot.kind) && Boolean(slot.slotId);
  }

  function isOpen(slot) {
    return selectable(slot) && slot.slotId === openSlotId;
  }

  // Several tiles may share one slot id (every plain essence tile opens one pool), so the
  // first of them owns the panel.
  const opened = $derived(items.find(isOpen) ?? null);
  const alternatives = $derived(Array.isArray(opened?.alternatives) ? opened.alternatives : []);
  const hasPanel = $derived(Boolean(opened) && (alternatives.length > 0 || Boolean(panel)));

  function tileState(slot) {
    if (slot.kind === 'choice' && slot.state === 'partial') return 'open';
    return ['met', 'partial'].includes(slot.state) ? slot.state : 'short';
  }

  function toggle(slot) {
    onToggle?.(slot.slotId, slot.slotId !== openSlotId);
  }

  function shortfallId(alternative) {
    return `${uid}-short-${alternative.id}`;
  }

  function statusId(slot) {
    return `${uid}-status-${slot.slotId}`;
  }

  function alternativeState(alternative, award) {
    if (award) return alternative.disabled ? 'disabled' : 'open';
    return alternative.short ? 'short' : 'met';
  }

  // An award tile names its reading and the slot's status; a choice tile only its shortfall.
  function describedIds(slot, alternative, award, reasons) {
    const ids = [
      reasons.includes(alternative) ? shortfallId(alternative) : '',
      award && slot.status ? statusId(slot) : '',
    ];
    return ids.filter(Boolean).join(' ') || null;
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

<!-- A slot's alternatives as tiles in a Well, each reading stated as a sentence beneath: an
     award slot's disabled tiles and ceiling status, or a choice panel's shortfalls. -->
{#snippet alternativesWell(slot, entries, award)}
  {@const reasons = entries.filter((entry) => entry.reading && (award || entry.short))}
  <Well label={award ? slot.name : alternativesLabel}>
    <div class="fab-requirement-alternatives">
      {#each entries as alternative (alternative.id)}
        {@const { class: hookClass = '', ...hooks } = alternative.wrapperProps ?? {}}
        <div
          class={['fab-requirement-alternative', hookClass]}
          class:is-short={!award && alternative.short === true}
          class:is-disabled={award && alternative.disabled === true}
          data-requirement-alternative={alternative.id}
          data-alternative-state={alternativeState(alternative, award)}
          use:describedBy={describedIds(slot, alternative, award, reasons)}
          {...hooks}
        >
          <SlotTile
            label={alternative.name}
            ariaLabel={alternative.label}
            art={alternative.art || ''}
            icon={alternative.icon || 'fas fa-circle'}
            tint={alternative.tint || ''}
            state={!award && alternative.short ? 'short' : 'met'}
            pip={alternative.pip || ''}
            interactive={!award || !readOnly}
            pressed={alternative.selected === true}
            disabled={award && alternative.disabled === true}
            onActivate={() => onChoose?.(slot, alternative)}
          />
        </div>
      {/each}
    </div>
    {#each reasons as alternative (alternative.id)}
      <p
        class={award ? 'fab-requirement-reason' : 'fab-requirement-shortfall'}
        id={shortfallId(alternative)}
        data-requirement-reason={award ? alternative.id : undefined}
        data-requirement-shortfall={award ? undefined : alternative.id}
      >
        {alternative.reading}
      </p>
    {/each}
    {#if award}
      <p
        class="fab-requirement-status"
        class:is-empty={!slot.status}
        role="status"
        id={statusId(slot)}
        data-award-status
      >
        {slot.status ?? ''}
      </p>
    {/if}
  </Well>
{/snippet}

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
  {#if rowSlots.length > 0}<div
      class="fab-requirement-slots"
      role="group"
      aria-label={ariaLabel || undefined}
    >
      {#each rowSlots as slot (slot.key)}
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
    </div>{/if}

  {#each awardSlots as slot (slot.key)}
    <div class="fab-requirement-panel" data-requirement-panel={slot.slotId} data-slot-kind="award">
      {@render alternativesWell(slot, slot.alternatives ?? [], true)}
    </div>
  {/each}

  {#if hasPanel}
    <div
      class="fab-requirement-panel"
      id={panelId ?? undefined}
      role="region"
      aria-labelledby={opened.tileId ?? undefined}
      data-requirement-panel={opened.slotId}
    >
      {#if alternatives.length > 0}
        {@render alternativesWell(opened, alternatives, false)}
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
    margin: var(--fab-space-2) 0 0;
    color: var(--fab-danger-text);
    font-size: 10.5px;
  }

  .fab-requirement-alternative.is-disabled {
    opacity: 0.55;
  }

  .fab-requirement-reason,
  .fab-requirement-status {
    margin: var(--fab-space-2) 0 0;
    color: var(--fab-text-muted);
    font-size: 10.5px;
  }

  /* Kept in the tree while empty, because a live region must exist before what it announces;
     core's `p:empty { min-height: 1rem }` would otherwise keep a line's height. */
  .fab-requirement-status.is-empty {
    height: 0;
    min-height: 0;
    margin: 0;
    overflow: hidden;
  }
</style>
