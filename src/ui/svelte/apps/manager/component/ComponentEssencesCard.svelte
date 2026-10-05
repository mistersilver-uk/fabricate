<!--
  The Component Rules editor's `Essence contribution` card: the inherit-or-override choice (M31) and
  the quantity grid over the essences this system offers. The view owns the draft and the switch.

  Callbacks:
  - `onInheritChange(nextInherit)` — the NEXT inherit value, never a toggle.
  - `onQuantityChange(essenceId, quantity)` — the stepper's clamped absolute value.
-->
<script>
  import InheritRow from '../scoped/InheritRow.svelte';
  // The shared essence quantity card (issue 772). It lives under `components/` because the
  // browser's bulk-edit panel renders it too, and the screenshot evidence map names it there.
  import EssenceQuantityCard from '../components/EssenceQuantityCard.svelte';
  import { clampComponentEssenceQuantity } from '../../../util/componentEditor.js';
  // The add-new offer projection (issue 1036): only what this grid RENDERS is narrowed. The draft
  // stays unfiltered — it is the sole source `buildComponentEditorUpdates` rebuilds essences from.
  import { visibleEssenceOptions } from '../../../../model/essenceValidation.js';

  let {
    text,
    format,
    systemLabel = '',
    saving = false,
    essenceDraft = [],
    essenceInheritOffered = false,
    essenceInheritStaged = false,
    essenceLocked = false,
    essenceNote,
    worldEssenceMap = {},
    onInheritChange = () => {},
    onQuantityChange = () => {},
  } = $props();

  // The rendered subset (issue 1036): every ENABLED essence plus any disabled one already carried
  // at a positive quantity. `essenceDraft` stays whole; narrowing it would delete those quantities.
  const offeredEssences = $derived(
    visibleEssenceOptions(
      essenceDraft,
      (option) => clampComponentEssenceQuantity(option?.quantity) > 0
    )
  );
</script>

<!--
  `Essence contribution`, whose subtitle states what a GM must know before authoring one: these
  values are keyed to the essences THIS system uses, and dropping an essence drops them with it.
-->
<section class="manager-component-rules-card" data-component-edit-section="essences">
  <div class="manager-component-rules-card-head">
    <i class="fas fa-flask-vial manager-component-rules-card-glyph is-info" aria-hidden="true"></i>
    <div>
      <h3>
        {text('FABRICATE.Admin.Manager.Component.EssencesEdit.Title', 'Essence contribution')}
      </h3>
      <p class="manager-component-rules-card-sub">
        {format(
          'FABRICATE.Admin.Manager.Component.EssencesEdit.Hint',
          'Keyed to the {count} essences {system} uses. A system that drops an essence drops these values with it.',
          { count: offeredEssences.length, system: systemLabel }
        )}
      </p>
    </div>
  </div>
  <!--
    THE INHERIT-OR-OVERRIDE CHOICE (M31): the shared `InheritRow`, filtered to the one
    section this card governs and drawn INSIDE the card beside the values it locks. ON is
    overridden. Withheld, with its note, while the world authored no map.
  -->
  {#if essenceInheritOffered}
    <InheritRow
      entityType="component"
      section="essences"
      inherited={{ essences: essenceInheritStaged }}
      disabled={saving}
      onToggle={(_section, nextInherit) => onInheritChange(nextInherit)}
    />
  {/if}
  <p
    class={`manager-component-cat-note is-${essenceNote.tone}`}
    data-component-edit-essence-note={essenceNote.state}
  >
    <i class={essenceNote.icon} aria-hidden="true"></i>
    <span>{essenceNote.text}</span>
  </p>
  <!-- THE COUNT AND THE GUARD READ THE ARRAY THE GRID DRAWS — `offeredEssences`, issue
     1036's enabled-plus-carried subset, not the whole roster. Reading the other array made
     the card miscount and the `No essences are defined …` empty state unreachable. -->
  {#if offeredEssences.length > 0}
    <div class="manager-component-essence-grid">
      {#each offeredEssences as option (option.id)}
        <!-- Its `Stepper` emits the already-clamped ABSOLUTE value for both adjuncts and typed
           input, so one `onQuantityChange` covers every path. -->
        <!-- LOCKED WHILE INHERITING (M31): the tile shows the WORLD value and its stepper
           is inert, exactly as the category select is pinned to the inherit option. -->
        <EssenceQuantityCard
          id={option.id}
          name={option.name}
          icon={option.icon}
          quantity={essenceLocked ? (worldEssenceMap[option.id] ?? 0) : option.quantity}
          disabled={saving || essenceLocked}
          ariaLabel={text(
            'FABRICATE.Admin.Items.Editor.QuantityLabel',
            'Quantity for {name}'
          ).replace('{name}', option.name)}
          decrementLabel={text(
            'FABRICATE.Admin.Items.Editor.DecrementEssence',
            'Decrement {name}'
          ).replace('{name}', option.name)}
          incrementLabel={text(
            'FABRICATE.Admin.Items.Editor.IncrementEssence',
            'Increment {name}'
          ).replace('{name}', option.name)}
          colorToken={option.colorToken || ''}
          onChange={(quantity) => onQuantityChange(option.id, quantity)}
        />
      {/each}
    </div>
  {:else if essenceDraft.length === 0}
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Component.EssencesEdit.NoEssences',
        'No essences are defined for this system yet.'
      )}
    </p>
  {:else}
    <!-- TWO EMPTY STATES, BECAUSE THE GRID IS EMPTY FOR TWO REASONS: the guard reads
       `offeredEssences`, so an all-DISABLED roster reaches it on a system that DOES define
       essences. The fork is the only fact a GM can act on differently. -->
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Component.EssencesEdit.NoEnabledEssences',
        'No essences are enabled for this system yet, and this component carries none.'
      )}
    </p>
  {/if}
</section>
