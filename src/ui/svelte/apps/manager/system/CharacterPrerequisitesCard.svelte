<!-- Svelte 5 runes mode -->
<!--
  Character prerequisites (issue 544) — the editor for the world's library of reusable
  pass/fail conditions (property path + comparison + value) the GM attaches to gate
  actions: learning a recipe, wielding a tool. One item open at a time. The collapsed
  header shows the name and a live `@path op value` preview; the expanded body edits
  name, then path + operator + value on one line. Valueless operators (is true / is
  false / exists) hide the value field.

  It is the whole body of World > Rules & Resources > Character prerequisites, whose page
  shell (`world/WorldPrerequisitesTab.svelte`) adds only the reorder live region. It was a
  collapsible card on the System Settings tab until issue 1311; the collapse toggle went
  with the move, because on that tab collapsing yielded space to the sibling cards below it
  and as a whole route there is nothing to make room for. The "every system" scope chip went
  the same way: the World rail states the scope itself now.
-->
<script>
  import { tick } from 'svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
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
    // Manual reorder (issue 768). Called with (fromIndex, toIndex, name); the caller
    // owns the store op and the polite announcement of the new position, which belongs
    // to the route rather than to this card. Array order IS the persisted order, so no
    // new field is threaded.
    onReorder = async () => {},
    onSeedPresets = async () => {},
    // Cross-library copy (issue 768). When set, each row shows a "Copy to Modifiers"
    // button that hands the RAW entry back to the caller, which owns the mapping, the
    // destination store add and — since the destination became a sibling route in issue
    // 1311 — the navigation to it.
    onCopyToModifier = null,
    // The caller requests opening a freshly-copied entry in edit mode; the nonce
    // forces the effect to re-fire even when the id-run is unchanged.
    requestOpenId = '',
    requestOpenNonce = 0,
  } = $props();

  let openId = $state('');
  let cardRoot = $state(null);

  // Open (and SHOW) the requested entry — the prerequisite a GM just copied out of the
  // modifier library. Opening alone is not enough: a copy is appended to the end of the
  // library, so on any list worth this feature the new row lands below the fold and the GM
  // sees an unchanged screen. Scoped to this card's own root so a query never crosses into
  // another mounted manager instance.
  let appliedOpenNonce = $state(0);
  $effect(() => {
    if (requestOpenNonce === appliedOpenNonce) return;
    appliedOpenNonce = requestOpenNonce;
    if (!requestOpenId) return;
    openId = requestOpenId;
    void revealEntry(requestOpenId);
  });

  async function revealEntry(entryId) {
    await tick();
    const row = cardRoot?.querySelector?.(`[data-world-character-prerequisite="${entryId}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row.querySelector?.('input, select, textarea')?.focus?.();
  }

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
  data-world-character-prerequisites
  bind:this={cardRoot}
  aria-label={text(
    'FABRICATE.Admin.Manager.CharacterPrerequisites.Title',
    'Character prerequisites'
  )}
>
  <header class="manager-character-modifier-card-header">
    <div class="manager-character-modifier-card-header-copy">
      <h2 class="manager-card-title">
        <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Title', 'Character prerequisites')}
      </h2>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.CharacterPrerequisites.Hint',
          'Pass/fail conditions — a property path, comparison and value — that gate learning, crafting and tool usage.'
        )}
      </p>
    </div>
    <div class="manager-character-modifier-card-header-actions">
      <ManagerButton role="primary" data-add-prerequisite onclick={handleAdd}>
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.CharacterPrerequisites.Add', 'Add prerequisite')}
      </ManagerButton>
      <ManagerButton
        data-seed-prerequisite-presets
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
      </ManagerButton>
    </div>
  </header>

  <div id="manager-section-body-prerequisites" class="manager-section-body">
    {#if library.length === 0}
      <p class="manager-muted manager-prerequisite-empty">
        {text(
          'FABRICATE.Admin.Manager.CharacterPrerequisites.Empty',
          'No character prerequisites yet.'
        )}
      </p>
    {:else}
      <ul class="manager-prerequisite-list">
        {#each library as entry, index (entry.id)}
          {@const open = openId === entry.id}
          <li
            class="manager-prerequisite-item"
            class:is-open={open}
            data-world-character-prerequisite={entry.id}
          >
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
              <button
                type="button"
                class="manager-icon-button"
                aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                data-tooltip={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                data-move-prerequisite-up={entry.id}
                disabled={index === 0}
                onclick={() => onReorder(index, index - 1, entry.name)}
              >
                <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="manager-icon-button"
                aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.MoveDown', 'Move down')}
                data-tooltip={text('FABRICATE.Admin.Manager.ListErgonomics.MoveDown', 'Move down')}
                data-move-prerequisite-down={entry.id}
                disabled={index === library.length - 1}
                onclick={() => onReorder(index, index + 1, entry.name)}
              >
                <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
              {#if onCopyToModifier}
                <button
                  type="button"
                  class="manager-icon-button"
                  aria-label={text(
                    'FABRICATE.Admin.Manager.ListErgonomics.CopyToModifiers',
                    'Copy to modifiers'
                  )}
                  data-tooltip={text(
                    'FABRICATE.Admin.Manager.ListErgonomics.CopyToModifiers',
                    'Copy to modifiers'
                  )}
                  data-copy-to-modifier={entry.id}
                  onclick={() => onCopyToModifier(entry)}
                >
                  <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
                </button>
              {/if}
              <button
                type="button"
                class="manager-icon-button is-danger"
                aria-label={text(
                  'FABRICATE.Admin.Manager.CharacterPrerequisites.Delete',
                  'Remove prerequisite'
                )}
                data-delete-prerequisite
                onclick={() => handleDelete(entry.id)}
              >
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>

            {#if open}
              <div class="manager-prerequisite-body" id={`prerequisite-body-${entry.id}`}>
                <div class="manager-prerequisite-name-row">
                  <div
                    class="manager-field manager-prerequisite-icon-field"
                    data-prerequisite-icon-field
                  >
                    <span
                      >{text('FABRICATE.Admin.Manager.CharacterPrerequisites.Icon', 'Icon')}</span
                    >
                    <IconPicker
                      value={entry.icon || DEFAULT_PREREQUISITE_ICON}
                      buttonTitle={text(
                        'FABRICATE.Admin.Manager.CharacterPrerequisites.ChangeIcon',
                        'Change icon'
                      )}
                      triggerClass="manager-prerequisite-icon-trigger"
                      onChange={(iconClass) => onUpdate(entry.id, { icon: iconClass })}
                    />
                  </div>
                  <label class="manager-field manager-prerequisite-name-field">
                    <span
                      >{text('FABRICATE.Admin.Manager.CharacterPrerequisites.Name', 'Name')}</span
                    >
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
                        <option value={operator.id}
                          >{operator.valueless
                            ? operator.label
                            : `${operator.symbol} · ${operator.label}`}</option
                        >
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
                        oninput={(event) =>
                          onUpdate(entry.id, { value: event.currentTarget.value })}
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
</section>
