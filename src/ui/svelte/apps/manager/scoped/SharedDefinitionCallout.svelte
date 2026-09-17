<!-- Svelte 5 runes mode -->
<!--
  THE SHARED-DEFINITION CALLOUT (issue 1372): the entity's name, glyph and colour are WORLD
  vocabulary every crafting system resolves the same one of, and only what it does on craft is
  authored here. A CALLOUT WITH AN EXIT rather than a banner — `Edit shared definition` opens the
  world entry that owns those fields, and the medallion names the entity the sentence is about.
  Every prop is PRE-LOCALIZED; `onOpen()` navigates, because a page cannot route.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import Chip from '../../../components/Chip.svelte';

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
        <Chip tone="info" icon="fas fa-globe">{pillLabel}</Chip>
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
  /* INFO-TONED, as the browser inspector's twin is: the geometry is `.manager-edit-card`'s and
     only the tint is restated, so no second card shape enters the route. */
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

  /* The name TRUNCATES rather than wrapping: the pill is the shorter, fixed half, and a wrapped
     name would push it onto its own row and break the head into three lines. */
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

  /* SENTENCE CASE, AT FULL INK, IN THE DISPLAY FACE: `.manager-card-title` is the manager's
     UPPERCASE micro-label, wrong for a card that names an entity (the Checks Studio retired the
     same treatment). Compounded so the rule is (0,3,0) once Svelte stamps the scope class and
     beats the global `.fabricate-manager .manager-card-title` at (0,2,0) outright, rather than
     tying it and being decided by stylesheet injection order. */
  .manager-card-title.manager-scoped-entity-title {
    color: var(--fab-text);
    font-size: 0.95rem;
    letter-spacing: 0;
    text-transform: none;
  }

  /* The exit never wraps and never shrinks: a two-line label turns a 34px control into a 48px one
     and pushes the card taller than every other card on the route. */
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
