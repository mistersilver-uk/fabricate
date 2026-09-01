<!-- Svelte 5 runes mode -->
<!--
  THE `Reuse these rules` CARD (issue 1372, maintainer parity round 7).

  The reference closes the system-scope rules editor with a card offering to copy what this
  system authored for the entity into another system's own rules, and the sentence beside it is
  the whole contract: a ONE-TIME shortcut, not a live link. `worldScopeActions.copyMembership`
  is a structural clone, so neither side can reach the other afterwards, and the copy says so
  rather than leaving a GM to discover it by editing one and watching the other not move.

  ── THE DESTINATION PICKER IS IN THE CARD, AND THAT IS WHY THE ACTION EXISTS AT ALL ───────────
  `EntityCatalogueShell` records why it renders NO copy control: `copyMembership(entityId,
  fromSystemId, toSystemIds)` needs a source and a list of destinations, and a per-system row on
  that screen knows only its own id — so the button there would either call the action short one
  argument, which it refuses silently, or guess the source and write the wrong system's overrides.

  This screen has the opposite shape. The SOURCE is the system whose rules are on screen, which is
  never ambiguous, and the destinations are what a GM chooses — so the chooser belongs here and the
  action is answerable. It is an inline disclosure rather than a dialog: `design-system/spec.md`
  reserves dialogs for destructive and bulk confirmations, and this writes a record into systems
  that mostly do not have one yet rather than overwriting authored work.

  ── NOTHING IS COPIED UNTIL A DESTINATION IS TICKED ───────────────────────────────────────────
  `Copy rules` is disabled while the selection is empty, because `copyMembership` returns `false`
  for an empty target list and reports nothing — a control that silently did nothing on every
  press is exactly the failure the catalogue shell refused to ship.

  Props:
   - systems: the crafting-system roster, `{id, name}`. The current system is filtered out here
     rather than by the caller, because `copyMembership` drops it anyway and a destination list
     containing the source reads as an offer to copy a thing onto itself.
   - currentSystemId: the SOURCE.
   - title / blurb / actionLabel: pre-localized by the caller, because the copy names the entity
     kind ("effect source and macro") which this component has no vocabulary for.
   - onCopy(targetIds): answers whether the write landed, so the card can report it.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    systems = [],
    currentSystemId = '',
    icon = 'fas fa-copy',
    title = '',
    blurb = '',
    actionLabel = '',
    disabled = false,
    onCopy = async () => false,
  } = $props();

  let open = $state(false);
  let selectedIds = $state([]);
  let busy = $state(false);
  let outcome = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function formatted(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  const targets = $derived(
    (Array.isArray(systems) ? systems : []).filter(
      (system) => system?.id && system.id !== currentSystemId
    )
  );

  // A NEW ARRAY on every toggle rather than a mutated one: Svelte 5 proxies `$state`, but the
  // reader here is a `$derived` over the array's contents and an in-place `push` on a value that
  // has crossed a component boundary is the mutation this repository has been bitten by before.
  function toggle(systemId) {
    outcome = '';
    selectedIds = selectedIds.includes(systemId)
      ? selectedIds.filter((id) => id !== systemId)
      : [...selectedIds, systemId];
  }

  async function copy() {
    if (busy || selectedIds.length === 0) return;
    busy = true;
    outcome = '';
    try {
      const landed = await onCopy([...selectedIds]);
      outcome = landed === false ? 'failed' : 'done';
      if (landed !== false) {
        open = false;
        selectedIds = [];
      }
    } finally {
      busy = false;
    }
  }
</script>

<section class="manager-edit-card" data-scoped-copy-rules>
  <div class="manager-scoped-copy-head">
    <span class="manager-scoped-copy-glyph" aria-hidden="true"><i class={icon}></i></span>
    <div class="manager-scoped-copy-copy">
      <h3 class="manager-card-title manager-scoped-entity-title">{title}</h3>
      <p class="manager-muted manager-scoped-copy-blurb">{blurb}</p>
    </div>
    <ManagerButton
      data-scoped-copy-rules-open
      disabled={disabled || targets.length === 0}
      onclick={() => {
        outcome = '';
        open = !open;
      }}
    >
      <span>{actionLabel}</span>
    </ManagerButton>
  </div>

  {#if open}
    <div class="manager-scoped-copy-picker" data-scoped-copy-rules-picker>
      <ul class="manager-scoped-copy-list" role="list">
        {#each targets as system (system.id)}
          <li class="manager-scoped-copy-option">
            <SelectionCheckbox
              size="sm"
              checked={selectedIds.includes(system.id)}
              ariaLabel={formatted(
                'FABRICATE.Admin.Manager.Scoped.CopyRules.SelectSystem',
                'Copy these rules into {system}',
                { system: system.name || system.id }
              )}
              data-scoped-copy-rules-target={system.id}
              onChange={() => toggle(system.id)}
            />
            <span class="manager-scoped-copy-option-name">{system.name || system.id}</span>
          </li>
        {/each}
      </ul>
      <div class="manager-scoped-copy-actions">
        <ManagerButton
          role="primary"
          data-scoped-copy-rules-confirm
          disabled={disabled || busy || selectedIds.length === 0}
          onclick={copy}
        >
          <i class={busy ? 'fas fa-spinner fa-spin' : 'fas fa-copy'} aria-hidden="true"></i>
          <span
            >{busy
              ? text('FABRICATE.Admin.Manager.Scoped.CopyRules.Copying', 'Copying…')
              : text('FABRICATE.Admin.Manager.Scoped.CopyRules.Confirm', 'Copy rules')}</span
          >
        </ManagerButton>
      </div>
    </div>
  {/if}

  {#if outcome}
    <p
      class={outcome === 'failed' ? 'manager-validation-error' : 'manager-muted'}
      role="status"
      data-scoped-copy-rules-outcome={outcome}
    >
      {outcome === 'failed'
        ? text(
            'FABRICATE.Admin.Manager.Scoped.CopyRules.Failed',
            'Nothing was copied. Check that this system still has rules for it and try again.'
          )
        : text('FABRICATE.Admin.Manager.Scoped.CopyRules.Done', 'Copied.')}
    </p>
  {/if}
</section>

<style>
  /* The card head is the reference's three-part row: glyph, copy, trailing action. It is not
     `.manager-edit-card-heading`, which is a two-child `space-between` row with no glyph slot and
     would push the sentence under the title into the same line as the button. */
  .manager-scoped-copy-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-scoped-copy-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-secondary);
  }

  .manager-scoped-copy-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
    flex: 1 1 auto;
  }

  /* SENTENCE CASE, AT FULL INK — the same retirement of the manager's uppercase micro-label that
     `SharedDefinitionCallout.svelte` documents in full, compounded to (0,3,0) for the same
     reason. */
  .manager-card-title.manager-scoped-entity-title {
    color: var(--fab-text);
    font-size: 0.86rem;
    letter-spacing: 0;
    text-transform: none;
  }

  .manager-scoped-copy-head :global(.manager-button) {
    flex: none;
    white-space: nowrap;
  }

  .manager-scoped-copy-blurb {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .manager-scoped-copy-picker {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-1);
  }

  .manager-scoped-copy-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-scoped-copy-option {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    margin: 0;
  }

  .manager-scoped-copy-option-name {
    font-size: 0.78rem;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-scoped-copy-actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
