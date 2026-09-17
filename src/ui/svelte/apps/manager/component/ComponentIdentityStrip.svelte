<!--
  The Component Rules editor's identity callout: ONE info-soft callout — the chip, the name, a
  `World catalogue` pill, the attribution note and an `Edit shared identity ↗` action — where this
  screen once stacked an identity strip and a second `SharedDefinitionCallout` making one statement.

  THE SOURCE ITEM IS NOT EDITED HERE. The drop target, the source kebab and the premise note are
  GONE from this screen rather than moved within it: name, image and description are world catalogue
  data, so the record naming the source Item is authored on the world entry, which is where the one
  action routes. A system's rules editor offering to restamp the durable roles map was the last
  surface still treating identity as system-owned.

  THE TWO `data-component-edit-section` HOOKS ARE PRESERVED VERBATIM, which is load-bearing:
  `scripts/foundry-test-run.mjs` hard-waits on "identity" AND on "source", and the "source" wait
  aborts its phase before every downstream frame — a failing smoke step is never waivable and none
  of it is visible to `npm test`. "identity" stays on the section and "source" moves onto the COPY
  COLUMN, which is what this screen now says about the source Item; it is deliberately NOT on the
  exit button, which is withheld for a component with no catalogue entry.
  `scripts/lib/managerLayoutGuards.js` requires `.manager-component-identity-strip`, so the root
  class is unchanged too.

  READ THE LIVE PROP, NEVER A SEEDED COPY: `ComponentEditView` re-seeds its drafts only when
  `componentKey` changes, which a world-side identity edit does not move, so everything below is
  `$derived` off the live props.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { componentAttributionNote } from '../scoped/componentScoped.js';

  let {
    component = null,
    // Both feed the attribution sentence, this card's whole content beyond the name.
    memberCount = 0,
    systemName = '',
    // `null` when the world corpus holds no record. The card still draws, since the name and chip
    // are this screen's heading, but the pill, note and exit are withheld.
    hasWorldEntry = false,
    saving = false,
    onOpenWorldEntry = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const attributionNote = $derived(
    componentAttributionNote(
      { surface: 'editor', memberCount: Number(memberCount) || 0, systemName },
      format
    )
  );
</script>

<section
  class="manager-component-identity-strip"
  data-component-edit-section="identity"
  aria-label={text('FABRICATE.Admin.Manager.Component.Identity.Label', 'Component identity')}
>
  <!-- `Medallion` takes the size; the card rung's radius is stated on the card, not here. -->
  <Medallion
    art={component?.img}
    alt=""
    icon="fas fa-cube"
    size={44}
    tint={component?.color || ''}
  />

  <div class="manager-component-identity-copy" data-component-edit-section="source">
    <div class="manager-component-identity-name-row">
      <!-- NOT A BUTTON: the name used to open the linked item's sheet, and the card has exactly
           one exit now. `data-component-edit-field="name"` rides the same element it always did. -->
      <span class="manager-component-identity-name" data-component-edit-field="name"
        >{component?.name || '—'}</span
      >
      {#if hasWorldEntry}
        <!-- The reference's MICRO pill reading `World catalogue`, where the shipped one was a
             default-scale chip. `density="list"` IS that micro scale, to within the one pixel
             `Chip.svelte` records, and is deliberately not a new `micro` value.

             THE PAINT IS TWO AXES, not one: the reference draws a FLAT plate inside an info
             hairline with info ink, so the pill reads as a separate surface from the `info-soft`
             callout it sits on. `tone="info"` alone would put an `info-soft` fill on an
             `info-soft` callout — measured equal, not estimated — and the badge would dissolve.
             So the family is `info` and `emphasis="outlined"` says it arrives as a PLATE: that
             emphasis states ONLY the fill, so the tone keeps the edge and the ink. It is the
             MIRROR of the same-named emphasis on the status pill that was retired, which
             superseded the edge and the ink and kept the fill; each matched its own reference.

             None of it can be stated from `styles/fabricate.css`: a rule there written against the
             primitive's own root class was INERT, because that sheet is imported at
             `layer(modules)` while the primitive's block is unlayered, so all six declarations
             lost. (Named in prose rather than quoted, because `manager-layout.test.js`'s
             hand-rolled-chip ratchet greps this file for the primitive's bare root token.) -->
        <Chip
          tone="info"
          emphasis="outlined"
          density="list"
          icon="fas fa-globe"
          data-component-world-pill
        >
          <span
            >{text('FABRICATE.Admin.Manager.Component.WorldCataloguePill', 'World catalogue')}</span
          >
        </Chip>
      {/if}
    </div>

    {#if hasWorldEntry}
      <p class="manager-component-identity-note" data-component-identity-note>
        {attributionNote}
      </p>
    {:else}
      <p class="manager-component-identity-note" data-component-identity-unlinked-hint>
        {format(
          'FABRICATE.Admin.Manager.Component.Identity.NoCatalogueEntry',
          'This component has no world catalogue entry, so its name, image and description are {system}’s own.',
          { system: systemName }
        )}
      </p>
    {/if}
  </div>

  {#if hasWorldEntry}
    <!-- The card's ONE exit, and the only route from a system's rules to where this component's
         name, image and description are authored. -->
    <ManagerButton
      class="manager-component-identity-exit"
      data-component-edit-action="open-world-entry"
      disabled={saving}
      onclick={() => onOpenWorldEntry(component?.id)}
    >
      <span
        >{text(
          'FABRICATE.Admin.Manager.Component.EditSharedIdentity',
          'Edit shared identity'
        )}</span
      >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </ManagerButton>
  {/if}
</section>
