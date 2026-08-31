<!-- Svelte 5 runes mode -->
<!--
  World > Rules & Resources > Modifiers.

  The modifier library is WORLD scope (issue 1308), not per crafting system: one pool of
  reusable actor-driven modifiers that every system's checks, gathering drop rows and events
  select from. It is the ONE authoring surface for that pool — the Checks screen only chooses
  which of these apply and how — and it is NOT gated on any feature flag, because a check
  modifier feeds a crafting or salvage roll and gating the only place they can be written on
  an unrelated flag would make them unauthorable.

  This markup is the accordion that used to live inside SystemEditView's Settings tab, moved
  wholesale rather than redesigned (issue 1311), exactly as the currency editor moved before
  it. Two things did NOT come with it. The whole-section collapse toggle is gone: on the
  Settings tab collapsing yielded space to the sibling cards below it, and as a whole route
  there is nothing to make room for, so the same control would only blank the page. And the
  "every system" scope chip is gone with it, because the World rail now states the scope
  itself rather than the card having to admit it.

  GM-only by construction: the whole crafting manager admin is GM-scoped.
-->
<script>
  import { tick } from 'svelte';
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { localize } from '../../../util/foundryBridge.js';
  import { reorderAnnouncementText } from '../../../util/listReorderAnnouncement.js';
  import {
    isRollExpression,
    resolveModifierBounds,
  } from '../../../../../systems/checkModifierResolver.js';
  import {
    appendModifierExpressionTerm,
    getModifierExpressionSuggestions,
  } from '../../../../../config/modifierExpressionSuggestions.js';

  let {
    library = [],
    presetsSupported = false,
    // The active Foundry game system id (`game.system.id`). Drives the SYSTEM-SPECIFIC half
    // of the expression suggestion chips: a roll-data path is only meaningful in the world
    // that defines it, so an unknown id yields the agnostic chips alone rather than a
    // `dnd5e` row offered to a world that has no `@abilities`.
    foundrySystemId = '',
    onAdd = async () => null,
    onUpdate = async () => {},
    onDelete = async () => {},
    // Called with (fromIndex, toIndex, name). Array order IS the persisted order, so no new
    // field is threaded; this page announces the move once the store op resolves.
    onReorder = async () => {},
    onSeedPresets = async () => {},
    // Cross-library copy (issue 768, re-seated by issue 1311). The RAW entry goes out and
    // nothing else happens here: the destination list is a sibling ROUTE now, so completing
    // the copy is a navigation, which only the router above this page can perform. It owns
    // the mapping, the destination add, the route change and the announcement.
    onCopyToPrerequisite = () => {},
    // The router requests opening a freshly-copied entry in edit mode; the nonce forces the
    // effect to re-fire even when the same id is requested twice.
    requestOpenId = '',
    requestOpenNonce = 0,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let editingId = $state('');
  let pageRoot = $state(null);

  // Manual reorder (issue 768). The chevrons reflow the list, so without sight of it the move
  // is only observable through this polite live region — it travels with the list it serves
  // rather than staying behind on the Settings tab.
  let reorderAnnouncement = $state('');
  async function reorderEntry(index, delta, name) {
    const toIndex = index + delta;
    await onReorder(index, toIndex, name);
    reorderAnnouncement = reorderAnnouncementText(name, toIndex + 1, library.length);
  }

  // Open (and SHOW) the router-requested entry — the modifier a GM just copied out of the
  // character-prerequisite library. Opening alone is not enough on a fresh route: a copy is
  // appended to the end of the library, so on any list worth this feature the new row lands
  // below the fold and the GM sees an unchanged screen. Scoped to this page's own root so a
  // query never crosses into another mounted manager instance.
  let appliedOpenNonce = $state(0);
  $effect(() => {
    if (requestOpenNonce === appliedOpenNonce) return;
    appliedOpenNonce = requestOpenNonce;
    if (!requestOpenId) return;
    editingId = requestOpenId;
    void revealEntry(requestOpenId);
  });

  async function revealEntry(entryId) {
    await tick();
    const row = pageRoot?.querySelector?.(`[data-world-modifier="${entryId}"]`);
    if (!row) return;
    row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row.querySelector?.('input, select, textarea')?.focus?.();
  }

  // Asked of the SHARED predicate (issue 1117), not of a local pattern. Two patterns lived
  // in the repo while two libraries did, and they were complementary rather than
  // duplicates — one matched `1d6` and missed `d20`, the other the reverse — so one library
  // with two readers would have disagreed about whether the same entry rolls. The
  // normalizer derives `isRollExpression` from the same function, so the chip below and the
  // persisted flag can never differ.
  function modifierIsRoll(entry) {
    return Boolean(entry?.expression) && isRollExpression(entry.expression);
  }

  // The read-only bounds chip, e.g. `-1 to +5`. Signed on BOTH ends: a modifier is a signed
  // contribution, so a bare `5` reads as a value rather than as a bonus. The two
  // half-bounded readings are separate sentences because "at most" and "at least" are not
  // the same promise, and an unbounded entry renders no chip rather than the word
  // "unbounded" on every row of a library that mostly is.
  function modifierBoundsChip(entry) {
    const { min, max } = resolveModifierBounds(entry);
    if (min === null && max === null) return '';
    const signed = (value) => (value < 0 ? `${value}` : `+${value}`);
    if (min !== null && max !== null) return `${signed(min)} to ${signed(max)}`;
    if (max !== null) {
      return `${text('FABRICATE.Admin.Manager.Modifiers.BoundsAtMost', 'At most')} ${signed(max)}`;
    }
    return `${text('FABRICATE.Admin.Manager.Modifiers.BoundsAtLeast', 'At least')} ${signed(min)}`;
  }

  // Which BLOCKING bounds fault this entry has, or `''`. Both make the entry contribute 0 to
  // a check until repaired, matching the refuse posture gathering's drop modifiers already
  // take; the Checks Validation section reports the same two facts as
  // `modifierBoundsInverted` / `modifierBoundsUnsafe`, both `critical`. TWO CAUSES, TWO
  // SENTENCES: "your minimum is above your maximum" and "this number cannot appear in a roll
  // formula" need different repairs, and `1e21` is not an inversion.
  function modifierBoundsFault(entry) {
    const bounds = resolveModifierBounds(entry);
    if (bounds.inverted) return 'inverted';
    return bounds.unsafe ? 'unsafe' : '';
  }

  // VERBATIM, sigil included. An earlier reading stripped the leading `@` while the editor
  // below rendered that sigil as a separate cap, so the list and the field agreed. The field
  // is a plain input now (maintainer ruling) and the GM writes the `@` themselves, so a list
  // that hid it would be showing a value nobody typed — and hiding, on the one screen that
  // teaches the requirement, exactly the character the requirement is about.
  function modifierExpressionDisplay(entry) {
    return String(entry?.expression ?? '').trim();
  }

  async function handleAdd() {
    const entry = await onAdd();
    if (entry?.id) editingId = entry.id;
  }

  async function handleDelete(entryId) {
    await onDelete(entryId);
    if (editingId === entryId) editingId = '';
  }

  // `Stepper` reports a clamped number, or `null` when an `allowUnset` field is cleared.
  // `null` is written as an EXPLICIT key rather than dropped, because absence IS the
  // "unbounded" value: clearing the field has to be able to REMOVE an existing bound, and a
  // patch that omitted the key would leave the old one in place. The normalizer attaches the
  // key only for a finite number, so a `null` round-trips to key-absent.
  function handleBound(entryId, key, next) {
    onUpdate(entryId, { [key]: next });
  }

  // The expression field's roll-data suggestion chips (issue 1096). Derived from the ACTIVE
  // world rather than written out here — see `modifierExpressionSuggestions.js` for why a
  // hard-coded row would be wrong in every system but one.
  const expressionSuggestions = $derived(getModifierExpressionSuggestions(foundrySystemId));

  // Appending, not replacing: the chips build up a compound expression. The caret is left at
  // the end of the field the GM is editing so the next keystroke continues the expression
  // instead of landing wherever focus happened to be — a chip that silently steals focus to
  // nowhere is worse than no chip. The DOM lookup is scoped to the clicked chip's OWN editor
  // body, so an open second row is never touched.
  async function handleSuggestion(event, entry, term) {
    const input = event.currentTarget
      ?.closest('[data-world-modifier-editor]')
      ?.querySelector('[data-world-modifier-field="expression"]');
    await onUpdate(entry.id, {
      expression: appendModifierExpressionTerm(entry.expression, term),
    });
    await tick();
    if (!input) return;
    input.focus();
    const caret = input.value.length;
    input.setSelectionRange?.(caret, caret);
  }

  // The bounds field labels, derived once: `stepperLabels` composes the two adjunct names
  // from the input's own name, so the three must come from one string rather than three
  // call-site literals that could drift.
  const minLabel = $derived(text('FABRICATE.Admin.Manager.Modifiers.Min', 'Minimum'));
  const maxLabel = $derived(text('FABRICATE.Admin.Manager.Modifiers.Max', 'Maximum'));
  const unboundedLabel = $derived(
    text('FABRICATE.Admin.Manager.Modifiers.BoundsUnbounded', 'Unbounded')
  );
</script>

<div class="manager-world-modifiers" data-world-modifiers-page bind:this={pageRoot}>
  <div class="visually-hidden" role="status" aria-live="polite" data-list-reorder-announcement>
    {reorderAnnouncement}
  </div>
  <section
    class="manager-edit-card manager-character-modifier-card"
    data-world-modifiers
    aria-label={text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
  >
    <header class="manager-character-modifier-card-header">
      <div class="manager-character-modifier-card-header-copy">
        <h2 class="manager-card-title">
          <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
        </h2>
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Modifiers.Hint',
            'Reusable actor-driven modifiers. Each expression resolves against the acting character (e.g. @abilities.med.mod). Checks add them to the roll; gathering drop rows and events shift the drop chance.'
          )}
        </p>
      </div>
      <!-- Both header verbs go through the shared primitive (issue 1096). `Add modifier`
           keeps its primary role; `Seed presets` stays NEUTRAL, which is what its bare
           `manager-button` already rendered. -->
      <div class="manager-character-modifier-card-header-actions">
        <ManagerButton role="primary" onclick={handleAdd}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Modifiers.Add', 'Add modifier')}
        </ManagerButton>
        <ManagerButton
          disabled={!presetsSupported}
          data-tooltip={!presetsSupported
            ? text(
                'FABRICATE.Admin.Manager.Modifiers.SeedPresetsUnsupported',
                'Preset seeding is only available for dnd5e or pf2e worlds.'
              )
            : null}
          onclick={onSeedPresets}
        >
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          {text('FABRICATE.Admin.Manager.Modifiers.SeedPresets', 'Seed presets')}
        </ManagerButton>
      </div>
    </header>

    <div id="manager-section-body-modifiers" class="manager-section-body">
      {#if library.length === 0}
        <EmptyState
          compact
          icon="fas fa-sliders"
          title={text('FABRICATE.Admin.Manager.Modifiers.Empty', 'No modifiers yet.')}
        />
      {:else}
        <ul class="manager-character-modifier-list">
          {#each library as entry, index (entry.id)}
            {@const modifierOpen = editingId === entry.id}
            {@const modifierExpression = modifierExpressionDisplay(entry)}
            {@const boundsChip = modifierBoundsChip(entry)}
            {@const boundsFault = modifierBoundsFault(entry)}
            <li
              class="manager-modifier-item"
              class:is-open={modifierOpen}
              data-world-modifier={entry.id}
            >
              <div class="manager-modifier-header">
                <button
                  type="button"
                  class="manager-modifier-summary"
                  aria-expanded={modifierOpen}
                  aria-controls={`world-modifier-body-${entry.id}`}
                  data-toggle-modifier
                  onclick={() => (editingId = modifierOpen ? '' : entry.id)}
                >
                  <i
                    class={`fa-solid ${modifierOpen ? 'fa-chevron-down' : 'fa-chevron-right'} manager-modifier-chevron`}
                    aria-hidden="true"
                  ></i>
                  <span class="manager-modifier-icon"
                    ><i class={entry.icon || 'fa-solid fa-user'} aria-hidden="true"></i></span
                  >
                  <span class="manager-modifier-label">{entry.label}</span>
                  {#if modifierIsRoll(entry)}
                    <Chip class="manager-character-modifier-roll-tag"
                      >{text('FABRICATE.Admin.Manager.Modifiers.RollTag', 'Roll')}</Chip
                    >
                  {/if}
                  {#if boundsChip}
                    <Chip tone="neutral" mono class="manager-modifier-bounds-chip"
                      >{boundsChip}</Chip
                    >
                  {/if}
                  {#if modifierExpression}
                    <span class="manager-modifier-expression" data-modifier-expression>
                      <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
                      {modifierExpression}
                    </span>
                  {/if}
                </button>
                <button
                  type="button"
                  class="manager-icon-button"
                  aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                  data-tooltip={text('FABRICATE.Admin.Manager.ListErgonomics.MoveUp', 'Move up')}
                  data-move-modifier-up={entry.id}
                  disabled={index === 0}
                  onclick={() => reorderEntry(index, -1, entry.label)}
                >
                  <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="manager-icon-button"
                  aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.MoveDown', 'Move down')}
                  data-tooltip={text(
                    'FABRICATE.Admin.Manager.ListErgonomics.MoveDown',
                    'Move down'
                  )}
                  data-move-modifier-down={entry.id}
                  disabled={index === library.length - 1}
                  onclick={() => reorderEntry(index, 1, entry.label)}
                >
                  <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="manager-icon-button"
                  aria-label={text(
                    'FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites',
                    'Copy to prerequisites'
                  )}
                  data-tooltip={text(
                    'FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites',
                    'Copy to prerequisites'
                  )}
                  data-copy-to-prerequisite={entry.id}
                  onclick={() => onCopyToPrerequisite(entry)}
                >
                  <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="manager-icon-button is-danger"
                  aria-label={text('FABRICATE.Admin.Manager.Modifiers.Delete', 'Delete modifier')}
                  onclick={() => handleDelete(entry.id)}
                >
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                </button>
              </div>

              {#if boundsFault}
                <!-- Reported on the COLLAPSED row too, not only inside the open editor: an
                     entry that contributes nothing is a fault the GM has to be able to see
                     while scanning the list, and the Checks Validation section reports the
                     same two ids. -->
                <p
                  class="manager-modifier-bounds-error"
                  role="note"
                  data-world-modifier-bounds-invalid={entry.id}
                  data-world-modifier-bounds-cause={boundsFault}
                >
                  {#if boundsFault === 'inverted'}
                    {text(
                      'FABRICATE.Admin.Manager.Modifiers.BoundsInverted',
                      'This modifier’s minimum is above its maximum, so it contributes nothing at all until you fix the two values.'
                    )}
                  {:else}
                    {text(
                      'FABRICATE.Admin.Manager.Modifiers.BoundsUnsafe',
                      'This modifier’s bound is too large or too small to appear in a roll formula, so it contributes nothing until you fix it.'
                    )}
                  {/if}
                </p>
              {/if}

              {#if modifierOpen}
                <div
                  class="manager-modifier-body manager-character-modifier-editor"
                  id={`world-modifier-body-${entry.id}`}
                  data-world-modifier-editor={entry.id}
                >
                  <!-- Icon, label, minimum and maximum on ONE line, ahead of the expression
                       (issue 1096, maintainer round). The four are the entry's short scalars;
                       the expression is the one field whose content is long, so it gets the
                       full width below them rather than competing with three neighbours for
                       it. The row wraps at narrow manager widths — the bounds pair wraps as a
                       UNIT, because a min separated from its max reads as two unrelated
                       fields. -->
                  <div class="manager-modifier-name-row">
                    <div class="manager-field manager-modifier-icon-field">
                      <span>{text('FABRICATE.Admin.Manager.Modifiers.Icon', 'Icon')}</span>
                      <IconPicker
                        value={entry.icon || 'fa-solid fa-user'}
                        buttonTitle={text(
                          'FABRICATE.Admin.Manager.Modifiers.ChangeIcon',
                          'Change icon'
                        )}
                        onChange={(iconClass) => onUpdate(entry.id, { icon: iconClass })}
                      />
                    </div>
                    <label class="manager-field manager-modifier-label-field">
                      <span>{text('FABRICATE.Admin.Manager.Modifiers.Label', 'Label')}</span>
                      <input
                        type="text"
                        data-world-modifier-field="label"
                        value={entry.label}
                        oninput={(event) =>
                          onUpdate(entry.id, { label: event.currentTarget.value })}
                      />
                    </label>
                    <!-- The bounds pair rides the SAME line as icon and label since issue
                         1096. It keeps its own wrapper — and its own bounds hook — so the two
                         steppers stay one flex item and wrap together, and so the View Lab
                         case that anchors on that hook still resolves. -->
                    <div class="manager-modifier-bounds-row" data-world-modifier-bounds={entry.id}>
                      <div class="manager-field manager-modifier-bound-field">
                        <span class="manager-recipe-micro-label">{minLabel}</span>
                        <Stepper
                          value={resolveModifierBounds(entry).min}
                          allowUnset
                          fill
                          placeholder={unboundedLabel}
                          {...stepperLabels(minLabel)}
                          inputProps={{ 'data-world-modifier-field': 'min' }}
                          onChange={(next) => handleBound(entry.id, 'min', next)}
                        />
                      </div>
                      <div class="manager-field manager-modifier-bound-field">
                        <span class="manager-recipe-micro-label">{maxLabel}</span>
                        <Stepper
                          value={resolveModifierBounds(entry).max}
                          allowUnset
                          fill
                          placeholder={unboundedLabel}
                          {...stepperLabels(maxLabel)}
                          inputProps={{ 'data-world-modifier-field': 'max' }}
                          onChange={(next) => handleBound(entry.id, 'max', next)}
                        />
                      </div>
                    </div>
                  </div>
                  <!-- The bounds hint sits DIRECTLY under the bounds it explains (issue 1096,
                       maintainer round). Below the expression and its suggestion chips it read
                       as a note about the expression, which is the one thing it says nothing
                       about. -->
                  <p class="manager-muted manager-modifier-bounds-hint">
                    {text(
                      'FABRICATE.Admin.Manager.Modifiers.BoundsHint',
                      'Optional. These clamp the resolved value when a check uses this modifier. Leave them empty for no limit — empty is not zero.'
                    )}
                  </p>
                  <label class="manager-field">
                    <span>{text('FABRICATE.Admin.Manager.Modifiers.Expression', 'Expression')}</span
                    >
                    <!-- A PLAIN input: no `@` cap, no stripping, no re-prepending (maintainer
                         ruling). The affix was written when an expression was always a
                         roll-data path; dice made it wrong, because a cap that prepends `@` to
                         whatever is typed turns `1d4` into `@1d4`. So the leading `@` is the
                         GM's to write, and the PLACEHOLDER has to teach that. -->
                    <RollDataExpressionInput
                      dataField="world-modifier"
                      inputAttrs={{ 'data-world-modifier-field': 'expression' }}
                      value={entry.expression}
                      placeholder="@abilities.med.mod"
                      sigil={false}
                      onChange={(expression) => onUpdate(entry.id, { expression })}
                    />
                    <small class="manager-muted" data-world-modifier-expression-hint>
                      {text(
                        'FABRICATE.Admin.Manager.Modifiers.ExpressionHint',
                        'A character-data path needs its leading @ — for example @abilities.med.mod. A number or a dice expression does not: write 2 or 1d4 as-is.'
                      )}
                    </small>
                  </label>
                  {#if expressionSuggestions.length > 0}
                    <!-- Roll-data suggestion chips (issue 1096). Each APPENDS its term to the
                         expression above rather than replacing it, so a GM builds
                         `@abilities.wis.mod + 1d4` by clicking twice. The system-specific chips
                         come from the active world's preset bundle — the same derivation `Seed
                         presets` uses — so a chip can never offer a path this world does not
                         define. -->
                    <div
                      class="manager-modifier-expression-suggestions"
                      data-world-modifier-suggestions={entry.id}
                      aria-label={text(
                        'FABRICATE.Admin.Manager.Modifiers.SuggestionsLabel',
                        'Add a term to this expression'
                      )}
                    >
                      {#each expressionSuggestions as suggestion (suggestion.id)}
                        <button
                          type="button"
                          class="manager-tag-suggestion manager-modifier-expression-suggestion"
                          data-world-modifier-suggestion={suggestion.id}
                          title={suggestion.label}
                          onclick={(event) => handleSuggestion(event, entry, suggestion.expression)}
                        >
                          <i class="fa-solid fa-plus" aria-hidden="true"></i>
                          <span>{suggestion.expression}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                  {#if modifierIsRoll(entry)}
                    <!-- A roll-shaped expression is legal EVERYWHERE (issue 1118): a drop row
                         applies its result and a check appends the dice to its formula. The
                         note stays because two consequences are worth stating where the
                         expression is authored — the dice are rolled once with the check and
                         shown on the card, and a competing rule ranks this entry by its
                         average. It carries the shared muted note class rather than the fault
                         class the two BLOCKING bounds problems use, because nothing here is
                         wrong. -->
                    <p class="manager-muted" role="note" data-world-modifier-roll-note={entry.id}>
                      {text(
                        'FABRICATE.Admin.Manager.Modifiers.RollNote',
                        'This expression rolls dice. Every activity can use it: a gathering drop row applies its result, and a check appends the dice to its roll formula so the roll is made once and shows on the card. Where modifiers compete — Highest, or Player picks — this one is ranked by its average.'
                      )}
                    </p>
                  {/if}
                  <!-- Both verbs carried a BARE `manager-button` before issue 1096: `Delete
                       modifier` was painted as a neutral action while the identical verb in
                       the Tool Studio is danger. The roles are copied from `ToolEditView`'s
                       header rather than chosen here. -->
                  <div class="manager-character-modifier-actions">
                    <ManagerButton
                      role="ghost"
                      data-world-modifier-done={entry.id}
                      onclick={() => (editingId = '')}
                      >{text('FABRICATE.Admin.Manager.Done', 'Done')}</ManagerButton
                    >
                    <ManagerButton
                      role="danger"
                      data-world-modifier-delete={entry.id}
                      onclick={() => handleDelete(entry.id)}
                      >{text(
                        'FABRICATE.Admin.Manager.Modifiers.Delete',
                        'Delete modifier'
                      )}</ManagerButton
                    >
                  </div>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
</div>
