<!-- Svelte 5 runes mode -->
<!--
  The Component Rules editor's identity callout (issue 676; rebuilt to the design reference for
  issue 1371, maintainer parity round 4 — `rebuild-spec.md` D3, `proto:1309-1317`).

  ── ONE CALLOUT, WHERE THERE WERE TWO CARDS ───────────────────────────────────────────────
  This screen used to open with a `manager-component-identity-strip` — art, name, lock chip,
  source kebab, premise note and a drop target — and then a second `SharedDefinitionCallout`
  saying where identity is authored. Two stacked cards making one statement (gap-list row 129).
  The reference draws ONE info-soft callout: the chip, the name, a `World catalogue` pill, the
  attribution note, and an `Edit shared identity ↗` action.

  ── AND THE SOURCE ITEM IS NOT EDITED HERE ────────────────────────────────────────────────
  The drop target, the source kebab (Unlink / Copy source UUID) and the premise note are GONE
  from this screen, not moved within it. Name, image and description are world catalogue data
  under epic 1357, so the record that names the source Item is authored on the world entry —
  which is precisely what the one action below routes to. A system's rules editor offering to
  restamp the durable roles map was the last surface still treating identity as system-owned.

  THE TWO `data-component-edit-section` HOOKS ARE PRESERVED VERBATIM, and that is load-bearing
  rather than tidy: `scripts/foundry-test-run.mjs:10274-10275` hard-waits on "identity" AND on
  "source", and the "source" wait aborts Phase D0 before EVERY downstream frame. A failing smoke
  step is never waivable and none of it is visible to `npm test`. "identity" stays on the
  section; "source" moves onto the COPY COLUMN — the name, the `World catalogue` pill and the
  attribution sentence — because that block is what this screen now says about the source Item.
  It is deliberately NOT on the exit button: that control is withheld for a component with no
  catalogue entry, and a hard wait that resolves only in the common case is a Phase D0 abort
  waiting for a legacy world to arrive.
  `scripts/lib/managerLayoutGuards.js` requires `.manager-component-identity-strip` on the
  `component edit normal` case, so the root class is unchanged too.

  ── READ THE LIVE PROP, NEVER A SEEDED COPY ──────────────────────────────────────────────
  `ComponentEditView` re-seeds its drafts only when `componentKey` changes
  (`id|tagOptions.length|essenceOptions.length`), which a world-side identity edit does not
  move. Everything below is `$derived` off the live props so a catalogue edit re-renders here.
-->
<script>
  import Chip from '../Chip.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { componentAttributionNote } from '../scoped/componentScoped.js';

  let {
    component = null,
    // How many systems hold this component, and the one being edited. Both feed the attribution
    // sentence, which is the whole content of this card beyond the name.
    memberCount = 0,
    systemName = '',
    // `null` when the world corpus holds no record of this component at all. The card still
    // draws — the name and the chip are this screen's heading — but the pill, the note and the
    // exit are withheld rather than claiming a catalogue entry that does not exist.
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
  <!-- `proto:1310`: a 44px chip at radius 11. `Medallion` ships radius 9 and takes the size; the
       11 is the card rung and is stated on the card, not manufactured here. -->
  <Medallion src={component?.img} icon="fas fa-cube" size={44} tint={component?.color || ''} />

  <div class="manager-component-identity-copy" data-component-edit-section="source">
    <div class="manager-component-identity-name-row">
      <!-- NOT A BUTTON. The name used to open the linked item's sheet; identity is authored one
           route away now, and the card has exactly one exit rather than two that differ only in
           where they land. `data-component-edit-field="name"` rides the same element it always
           did. -->
      <span class="manager-component-identity-name" data-component-edit-field="name"
        >{component?.name || '—'}</span
      >
      {#if hasWorldEntry}
        <!-- `proto:1313`: the pill is `--fab-bg-1` INSIDE an info hairline, and it reads
             `World catalogue`. The shipped pill was an `info-soft` fill reading
             `World definition` (gap-list row 131). -->
        <Chip class="manager-component-world-pill" icon="fas fa-globe" data-component-world-pill>
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
    <!-- `proto:1316`: a 30px neutral control on `--fab-bg-1` behind a `border-strong` hairline.
         The card's ONE exit, and the only route from a system's rules to where this component's
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
