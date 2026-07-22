<!-- Svelte 5 runes mode -->
<!--
  Character prerequisites (issue 544) — a System Settings accordion of reusable,
  system-scoped pass/fail conditions (property path + comparison + value) the GM
  attaches to gate actions (learning a recipe today). One item open at a time.
  The collapsed header shows the name and a live `@path op value` preview; the
  expanded body edits name, then path + operator + value on one line. Valueless
  operators (is true / is false / exists) hide the value field.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import {
    PREREQUISITE_OPERATORS,
    DEFAULT_PREREQUISITE_ICON,
    isValuelessOperator,
    prerequisitePreview,
  } from '../../../../../systems/characterPrerequisites.js';

  let {
    library = [],
    presetsSupported = false,
    onAdd = async () => null,
    onUpdate = async () => {},
    onDelete = async () => {},
    onSeedPresets = async () => {},
    // Whole-section collapse (issue 768) — owned by the parent SystemEditView so
    // all three list sections share one session Set and one reset-on-switch. This
    // is distinct from the per-item accordion (`openId`) below.
    collapsed = false,
    onToggleCollapsed = () => {},
    // Cross-list copy (issue 768). When set (parent gates on `features.gathering`),
    // each row shows a "Copy to Modifiers" button that hands the entry back to the
    // parent, which owns the destination store add + the aria-live announcement.
    onCopyToModifier = null,
    // The parent requests opening a freshly-copied entry in edit mode; the nonce
    // forces the effect to re-fire even when the id-run is unchanged.
    requestOpenId = '',
    requestOpenNonce = 0,
  } = $props();

  let openId = $state('');

  // Open the parent-requested entry (a just-copied prerequisite) in edit mode.
  let appliedOpenNonce = $state(0);
  $effect(() => {
    if (requestOpenNonce !== appliedOpenNonce) {
      appliedOpenNonce = requestOpenNonce;
      if (requestOpenId) openId = requestOpenId;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function toggleOpen(id) {
    openId = openId === id ? '' : id;
  }

  async function handleAdd() {
    const entry = await onAdd();
    if (entry?.id) openId = entry.id;
  }

  async function handleDelete(id) {
    await onDelete(id);
    if (openId === id) openId = '';
  }
</script>

<section
  class="manager-edit-card manager-prerequisite-card"
  class:is-section-collapsed={collapsed}
  data-system-character-prerequisites
  aria-label={text('FABRICATE.Admin.Manager.CharacterPrerequisites.Title', 'Character prerequisites')}
>
  <header class="manager-character-modifier-card-header">
    <button
      type="button"
      class="manager-section-collapse-toggle"
      aria-expanded={!collapsed}
      aria-controls="manager-section-body-prerequisites"
      aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.ToggleSection', 'Collapse or expand this section')}
      data-section-collapse="prerequisites"
      onclick={() => onToggleCollapsed()}
    >
      <i class={`fa-solid ${collapsed ? 'fa-chevron-right' : 'fa-chevron-down'}`} aria-hidden="true"></i>
    </button>
    <div class="manager-character-modifier-card-header-copy">
      <h3 class="manager-card-title">
        <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Title', 'Character prerequisites')}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.CharacterPrerequisites.Hint',
          'Pass/fail conditions — a property path, comparison and value — that gate learning, crafting and tool usage.'
        )}
      </p>
    </div>
    <div class="manager-character-modifier-card-header-actions">
      <button type="button" class="manager-button is-primary" data-add-prerequisite onclick={handleAdd}>
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Add', 'Add prerequisite')}
      </button>
      <button
        type="button"
        class="manager-button"
        disabled={!presetsSupported}
        data-tooltip={!presetsSupported
          ? text(
              'FABRICATE.Admin.Manager.CharacterPrerequisites.SeedPresetsUnsupported',
              'Preset seeding is only available for dnd5e or pf2e worlds.'
            )
          : null}
        onclick={onSeedPresets}
      >
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.CharacterPrerequisites.SeedPresets', 'Seed presets')}
      </button>
    </div>
  </header>

  {#if !collapsed}
  <div id="manager-section-body-prerequisites" class="manager-section-body">
  {#if library.length === 0}
    <p class="manager-muted manager-prerequisite-empty">
      {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Empty', 'No character prerequisites yet.')}
    </p>
  {:else}
    <ul class="manager-prerequisite-list">
      {#each library as entry (entry.id)}
        {@const open = openId === entry.id}
        <li class="manager-prerequisite-item" class:is-open={open} data-system-character-prerequisite={entry.id}>
          <div class="manager-prerequisite-header">
            <button
              type="button"
              class="manager-prerequisite-summary"
              aria-expanded={open}
              aria-controls={`prerequisite-body-${entry.id}`}
              data-toggle-prerequisite
              onclick={() => toggleOpen(entry.id)}
            >
              <i
                class={`fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'} manager-prerequisite-chevron`}
                aria-hidden="true"
              ></i>
              <span class="manager-prerequisite-icon">
                <i class={entry.icon || DEFAULT_PREREQUISITE_ICON} aria-hidden="true"></i>
              </span>
              <span class="manager-prerequisite-name">{entry.name}</span>
              <span class="manager-prerequisite-preview" data-prerequisite-preview>
                <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
                {prerequisitePreview(entry)}
              </span>
            </button>
            {#if onCopyToModifier}
              <button
                type="button"
                class="manager-icon-button"
                aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.CopyToModifiers', 'Copy to modifiers')}
                data-copy-to-modifier={entry.id}
                onclick={() => onCopyToModifier(entry)}
              >
                <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
              </button>
            {/if}
            <button
              type="button"
              class="manager-icon-button is-danger"
              aria-label={text('FABRICATE.Admin.Manager.CharacterPrerequisites.Delete', 'Remove prerequisite')}
              data-delete-prerequisite
              onclick={() => handleDelete(entry.id)}
            >
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
          </div>

          {#if open}
            <div class="manager-prerequisite-body" id={`prerequisite-body-${entry.id}`}>
              <div class="manager-prerequisite-name-row">
                <div class="manager-field manager-prerequisite-icon-field" data-prerequisite-icon-field>
                  <span>{text('FABRICATE.Admin.Manager.CharacterPrerequisites.Icon', 'Icon')}</span>
                  <IconPicker
                    value={entry.icon || DEFAULT_PREREQUISITE_ICON}
                    buttonTitle={text('FABRICATE.Admin.Manager.CharacterPrerequisites.ChangeIcon', 'Change icon')}
                    triggerClass="manager-prerequisite-icon-trigger"
                    onChange={(iconClass) => onUpdate(entry.id, { icon: iconClass })}
                  />
                </div>
                <label class="manager-field manager-prerequisite-name-field">
                  <span>{text('FABRICATE.Admin.Manager.CharacterPrerequisites.Name', 'Name')}</span>
                  <input
                    type="text"
                    value={entry.name}
                    data-prerequisite-name
                    oninput={(event) => onUpdate(entry.id, { name: event.currentTarget.value })}
                  />
                </label>
              </div>

              <span class="manager-prerequisite-condition-label">
                {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Condition', 'Condition')}
              </span>
              <div class="manager-prerequisite-condition">
                <label class="manager-field manager-prerequisite-path">
                  <span class="visually-hidden">
                    {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Path', 'Property path')}
                  </span>
                  <div class="manager-prerequisite-path-input">
                    <span class="manager-prerequisite-at" aria-hidden="true">@</span>
                    <input
                      type="text"
                      value={entry.path}
                      placeholder="skills.cra.rank"
                      data-prerequisite-path
                      oninput={(event) => onUpdate(entry.id, { path: event.currentTarget.value })}
                    />
                  </div>
                </label>
                <label class="manager-field manager-prerequisite-operator">
                  <span class="visually-hidden">
                    {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Operator', 'Operator')}
                  </span>
                  <select
                    value={entry.op}
                    data-prerequisite-operator
                    onchange={(event) => onUpdate(entry.id, { op: event.currentTarget.value })}
                  >
                    {#each PREREQUISITE_OPERATORS as operator (operator.id)}
                      <option value={operator.id}>{operator.valueless ? operator.label : `${operator.symbol} · ${operator.label}`}</option>
                    {/each}
                  </select>
                </label>
                {#if !isValuelessOperator(entry.op)}
                  <label class="manager-field manager-prerequisite-value">
                    <span class="visually-hidden">
                      {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Value', 'Value')}
                    </span>
                    <input
                      type="text"
                      value={entry.value ?? ''}
                      placeholder="2"
                      data-prerequisite-value
                      oninput={(event) => onUpdate(entry.id, { value: event.currentTarget.value })}
                    />
                  </label>
                {/if}
              </div>
              <p class="manager-muted manager-prerequisite-note">
                {text(
                  'FABRICATE.Admin.Manager.CharacterPrerequisites.Note',
                  "Resolves against the character's roll data. Boolean comparisons (is true / is false / exists) hide the value field. Unknown paths fall back to 0 / false."
                )}
              </p>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  </div>
  {/if}
</section>
