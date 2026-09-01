<!-- Svelte 5 runes mode -->
<!--
  THE SHARED-DEFINITION CALLOUT (issue 1372, maintainer parity round 7).

  The first thing a system-scope rules editor says, and the reason the screen has the shape it
  has: the entity's name, glyph and colour are WORLD vocabulary that every crafting system holding
  it resolves the same one of, and only what it does on craft is authored here.

  It is a CALLOUT WITH AN EXIT, not a banner. The shipped screen stated the fact in a bare
  paragraph and offered no way to act on it, so a GM who wanted to fix a typo in the name had
  nowhere to go and the screen's own identity form — which this change removes — was the nearest
  thing to an answer. `Edit shared definition` opens the world entry editor that owns those
  fields, which is the only surface allowed to write them.

  ── IT NAMES THE ENTITY, AND THAT IS THE POINT OF THE MEDALLION ───────────────────────────────
  The reference leads the card with the entity's own tile and name (`proto:5091`). Without them
  the callout is a sentence about "the shared definition" of something it never identifies, one
  screen away from a list where every row looks the same.

  Props are all PRE-LOCALIZED by the caller, because the sentence is counted and system-named and
  this component holds neither the roster size nor the selected system.
   - name / icon / tint: the entity's identity, from the WORLD record.
   - pillLabel: the layer marker, `World definition`.
   - note: the counted sentence.
   - actionLabel: the exit's words.
   - onOpen(): performs the navigation; the shell owns it, because a page cannot route.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';

  let {
    name = '',
    icon = '',
    tint = '',
    pillLabel = '',
    note = '',
    actionLabel = '',
    disabled = false,
    onOpen = null,
  } = $props();
</script>

<section class="manager-edit-card manager-scoped-shared-card" data-scoped-shared-definition>
  <div class="manager-scoped-shared-head">
    <Medallion {icon} {tint} size={40} glyph={20} />
    <div class="manager-scoped-shared-copy">
      <div class="manager-scoped-shared-title-row">
        <h3 class="manager-card-title manager-scoped-entity-title" title={name}>{name}</h3>
        <StatusPill tone="info" icon="fas fa-globe" label={pillLabel} />
      </div>
      <p class="manager-muted manager-scoped-shared-note" data-scoped-shared-definition-note>
        {note}
      </p>
    </div>
    {#if onOpen}
      <ManagerButton {disabled} data-scoped-shared-definition-open onclick={() => onOpen()}>
        <span>{actionLabel}</span>
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </ManagerButton>
    {/if}
  </div>
</section>

<style>
  /* INFO-TONED, exactly as the browser inspector's twin of this block is: it is the one card on
     the screen that explains a layer rather than authoring one. The geometry is
     `.manager-edit-card`'s; only the tint is restated, so no second card shape enters the route. */
  .manager-scoped-shared-card {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  .manager-scoped-shared-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-scoped-shared-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
    flex: 1 1 auto;
  }

  /* The name and its layer pill share a line, and the name TRUNCATES rather than wrapping: the
     pill is the shorter, fixed half and a wrapped name would push it onto its own row and break
     the head into three lines for a long entity name. */
  .manager-scoped-shared-title-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-shared-title-row .manager-card-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* SENTENCE CASE, AT FULL INK, IN THE DISPLAY FACE. `.manager-card-title` is the manager's
     UPPERCASE micro-label, which is right for a flat section heading and wrong for a card that
     names an entity: the reference reads `Earth`, not `EARTH`. The Checks Studio retired the same
     treatment from its own cards for the same reason (`.manager-checks-card-title`); this is that
     precedent applied to the scoped-entity cards rather than a second global edit.

     Compounded with `.manager-card-title` so the rule is (0,3,0) once Svelte stamps this
     component's scope class, and therefore beats the global `.fabricate-manager
     .manager-card-title` at (0,2,0) outright rather than tying it and being decided by
     stylesheet injection order. */
  .manager-card-title.manager-scoped-entity-title {
    color: var(--fab-text);
    font-size: 0.95rem;
    letter-spacing: 0;
    text-transform: none;
  }

  /* The exit never wraps and never shrinks. `Edit shared definition` broke onto two lines the
     moment the sentence beside it needed a second, which turned a 34px control into a 48px one
     and pushed the card taller than every other card on the route. */
  .manager-scoped-shared-head :global(.manager-button) {
    flex: none;
    white-space: nowrap;
  }

  .manager-scoped-shared-note {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.5;
  }
</style>
