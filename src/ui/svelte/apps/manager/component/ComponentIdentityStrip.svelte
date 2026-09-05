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
        <!-- `proto:1313`: the reference's MICRO pill — `padding: 2px 8px`, a stadium corner and
             `600 9px` — reading `World catalogue`. The shipped pill was a default-scale chip
             reading `World definition` (gap-list row 131).

             `density="list"` IS that micro scale, to within the one pixel of vertical padding
             `Chip.svelte` records: `1px 8px`, radius 999, 9px/600. It is deliberately not a new
             `micro` value, for the reason that component's docblock gives.

             AND THE PAINT IS TWO AXES, not one. The reference draws a FLAT `--bg1` plate
             inside an info hairline with info ink, so the pill reads as a separate surface from
             the `info-soft` callout it sits on. `tone="info"` ALONE cannot say that: it would
             put an `info-soft` fill on an `info-soft` callout — a `compare` run measured those
             two equal rather than estimating them equal — and the badge would dissolve into the
             card, which is the very defect gap-list row 131 records. So the family is `info` and
             `emphasis="outlined"` says that family arrives as a PLATE: `Chip`'s outlined
             emphasis states ONLY the fill, so the tone keeps the edge and the ink, and the three
             colours land as `--fab-info-border` / `--fab-info-text` on `--fab-bg-1`.

             Note that this is the MIRROR of `StatusPill`'s emphasis of the same name, which
             supersedes the edge and the ink and keeps the fill. Each matches its own reference;
             `Chip.svelte`'s emphasis rule carries the note, and a test pins the inversion.

             None of it can be stated from `styles/fabricate.css`. A
             `manager-component-world-pill` rule there, written against the primitive's own root
             class, said these very colours and was INERT — that sheet is imported at
             `layer(modules)` while the primitive's block is unlayered, so all six of its
             declarations lost, and a `compare` run measured every one of them landing on the
             default. It was deleted, not carried, and the paint arrives through the primitive's
             own vocabulary instead. (The rule is named in prose rather than quoted, because
             `manager-layout.test.js`'s hand-rolled-chip ratchet greps this file for the
             primitive's bare root token and must stay at empty.) -->
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
