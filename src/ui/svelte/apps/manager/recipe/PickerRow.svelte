<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): PickerRow is promoted to a manager-only primitive at target, because the recipe ingredient card and the result card now both draw it (issue 1516) -->
<!--
  The one requirement row: a kind plate, a kind select, a name field that is a search until it is
  named and a pill after, an amount, and the caller's trailing controls. Its anatomy is specified in
  `openspec/specs/ui-entity-editors/spec.md` under "The requirement row".

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | `{ kind, id, tags, tagMatch, quantity, quantityFormula, label, reason }` | `{}` | `toValue(entry)` from `pickerRowKinds.js`. A `kind` the kind table does not name draws the misconfigured face. |
  | `kinds` | kinds | the four match types | What the kind select offers; the row's own kind is always listed too. |
  | `catalogue` | `{ [kind]: [{ id, label, icon, img, offered }] }` | `{}` | Suggestions list the entries whose `offered` is not `false`; the named pill resolves `value.id` against all of them. `catalogue.tags` is the tag picker's vocabulary. |
  | `readonlyKinds` | kinds | `[]` | Kinds drawn on the read-only face, `READONLY_FACES` in `pickerRowKinds.js`: a `currency` row while currency is off, and a `knowledge` row while learning is not observable. |
  | `disabled` | boolean | `false` | Forwarded to every control the row draws. The `trailing` snippet is the caller's own. |
  | `invalid` | `{ amount?: string }` | `{}` | Marks the amount control invalid and describes it with the message. |
  | `amount` | `false` \| `{ min, max, unit, inputProps, ariaLabel, … }` | `{}` | `false` draws no amount, and a `knowledge` row never draws one; the object's keys, which carry the amount slot's localized copy, are stated in `PickerRowAmount.svelte`. |
  | `rollable` / `removable` | booleans | `false` / `true` | The Fixed \| Rolled toggle on a `component` or `currency` row; and the remove button. |
  | `reward` | boolean | `false` | A result surface's row: a named currency row opens its naming body and a knowledge row its help line, `PickerRowRewardBody.svelte`, beneath it. A knowledge row naming a recipe absent from `catalogue` draws the missing face. |
  | `allowAny` | boolean | `false` | The `or…` kind menu, `PickerRowKindMenu.svelte`, after the amount and a divider, offering `kinds`. |
  | `menuHeading` / `menuHint` | localized strings | `''` | That menu's eyebrow and its trigger's tooltip; empty reads the ingredient side's. |
  | `clearable` / `removeHook` | boolean / string | `true` / `'alternative'` | The named pill's clear; and the remove's `data-recipe-remove` value. The remove is `Remove {name}` and the kind select `Kind of {name}`, `{name}` being the subject's or, unnamed, the kind's. |
  | `nameProps` / `removeProps` | attribute objects | `{}` | A caller's own hooks on the name field and on the remove, spread before the row's own. |

  Snippets:
  - `trailing` — the caller's own controls, before the remove button.

  Callbacks:
  - `onChange(value)` — the whole next `value`; the caller merges it with `fromValue(entry, value)`.
  - `onRemove()` — the remove button was pressed.
  - `onSelect(kind)` — a kind was chosen from the `or…` menu.

  Rest spread:
  - `{...rest}` lands on the root `<div>`, written after `class={…}` and `data-recipe-option`.
  - `class` is a named prop, because a rest key would replace the row's classes instead of
    extending them.

  Invariants:
  - The row imports nothing from `src/ui/model/`: the caller filters, and says so through `offered`.
  - The typed query is local to `PickerRowNameField.svelte` and never reaches `value`. Pinned by
    `tests/components/picker-row-matrix-mounted.test.js`.
  - The Fixed | Rolled state is per component instance, so a `rollable` caller keys its rows by
    stable entry identity, and a retype remounts it.
  - A pick on a row with no clear moves focus to the row's next control, never the document.
-->
<script module>
  // Alternatives carry no id, so the tag-match radio group's `name` is minted per INSTANCE here:
  // two tag rows sharing one `name` are ONE radio group to the browser.
  let tagMatchGroupSeq = 0;
</script>

<script>
  import Chip from '../../../components/Chip.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Select from '../../../components/Select.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import PickerRowAmount from './PickerRowAmount.svelte';
  import PickerRowKindMenu from './PickerRowKindMenu.svelte';
  import PickerRowNameField from './PickerRowNameField.svelte';
  import PickerRowRewardBody from './PickerRowRewardBody.svelte';
  // The ONE kind table: the plate's glyph and tint and the kind select's words are read from it
  // rather than restated here.
  import {
    INGREDIENT_KINDS,
    KIND_ORDER,
    READONLY_FACES,
    isKnownKind,
    kindMeta,
    kindWord as wordOfKind,
    subjectName as nameOfSubject,
  } from './pickerRowKinds.js';

  tagMatchGroupSeq += 1;
  const tagMatchGroupId = tagMatchGroupSeq;

  let {
    value = {},
    kinds = INGREDIENT_KINDS,
    catalogue = {},
    readonlyKinds = [],
    disabled = false,
    invalid = {},
    amount = {},
    rollable = false,
    removable = true,
    clearable = true,
    removeHook = 'alternative',
    nameProps = {},
    removeProps = {},
    class: className = '',
    allowAny = false,
    menuHeading = '',
    menuHint = '',
    reward = false,
    trailing = null,
    onChange = () => {},
    onRemove = () => {},
    onSelect = () => {},
    ...rest
  } = $props();

  const matchType = $derived(value?.kind ?? 'component');
  const misconfigured = $derived(!isKnownKind(matchType));
  const tags = $derived(Array.isArray(value?.tags) ? value.tags : []);
  const tagMatch = $derived(value?.tagMatch === 'all' ? 'all' : 'any');
  const readonly = $derived(
    Object.hasOwn(READONLY_FACES, matchType) && readonlyKinds.includes(matchType)
  );
  const face = $derived(readonly ? READONLY_FACES[matchType] : null);
  const faceWord = (pair) => localizeOr(...pair);
  const hintId = `picker-row-hint-${tagMatchGroupId}`;

  // Every entry of this row's kind, and the ones a GM may newly choose. `chosen` resolves against
  // all of them, so a requirement on a since-withheld subject still reads back by name.
  const entries = $derived(Array.isArray(catalogue?.[matchType]) ? catalogue[matchType] : []);
  const chosen = $derived(
    value?.id ? entries.find((entry) => entry.id === value.id) || null : null
  );
  const subjectName = $derived(nameOfSubject(value, catalogue, localizeOr));
  // A taught recipe its system no longer holds: named as missing rather than drawn unnamed.
  const missing = $derived(!readonly && matchType === 'knowledge' && Boolean(value?.id) && !chosen);

  // The tag picker offers system tags not already on this option.
  const tagPickerOptions = $derived(
    entries
      .filter((entry) => !tags.includes(entry.id))
      .map(({ id, label, icon }) => ({ id, label, icon }))
  );

  const kindWord = (kind) => wordOfKind(kind, localizeOr);
  // The caller's kinds in table order, plus this row's own kind always.
  const kindOptions = $derived(
    [...KIND_ORDER, ...(misconfigured ? [matchType] : [])]
      .filter((kind) => kinds.includes(kind) || kind === matchType)
      .map((kind) => ({ value: kind, label: kindWord(kind) }))
  );

  function emit(next) {
    onChange({ ...value, ...next });
  }

  // Retype this row. The subject and the tags leave with the old kind.
  function setKind(kind) {
    if (kind === matchType) return;
    emit({ kind, id: '', tags: [], tagMatch: 'any' });
  }

  let rowRoot = $state(null);
  const NEXT_AFTER_PICK = [
    '[data-recipe-option-amount-mode] input:checked',
    '[data-recipe-reward-label]',
    '.manager-recipe-option-controls :is(input, button):not([disabled])',
  ];

  // Naming a row with no clear swaps its search for a pill holding nothing focusable, so focus moves
  // on to the toggle, else the naming body, else the row's next control, once the pill renders.
  function choose(id) {
    emit({ id });
    if (clearable || !id) return;
    setTimeout(() => {
      const next = NEXT_AFTER_PICK.map((selector) => rowRoot?.querySelector(selector));
      next.find(Boolean)?.focus();
    }, 0);
  }

  function addTag(tag) {
    const next = String(tag || '').trim();
    if (!next || tags.includes(next)) return;
    emit({ tags: [...tags, next] });
  }

  function removeTag(tag) {
    emit({ tags: tags.filter((t) => t !== tag) });
  }

  // The kind's own tint, on the glyph and never the tile; a misconfigured row draws a warning
  // in no kind's tint.
  const leadTone = $derived(misconfigured ? 'unknown' : kindMeta(matchType).tone);
  const leadIcon = $derived(
    misconfigured ? 'fa-solid fa-triangle-exclamation' : kindMeta(matchType).icon
  );
  const extraClass = $derived(className ? ` ${className}` : '');

  const forSubject = (key, fallback) => localizeOr(key, fallback, { name: subjectName });
  const removeName = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.RemoveNamed', 'Remove {name}')
  );
  const clearName = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.ClearNamed', 'Clear {name}')
  );
  const unknownHint = $derived(
    localizeOr(
      'FABRICATE.Admin.Manager.Recipe.UnknownKindHint',
      'Fabricate does not recognise the kind "{kind}". Remove this row or correct the data.',
      { kind: matchType }
    )
  );
  const missingHint = $derived(
    localizeOr(
      'FABRICATE.Admin.Manager.Recipe.MissingRecipeHint',
      'The recipe this row teaches is no longer in this system, so no craft can award it. Remove this row.'
    )
  );
  const tagPolicyWord = $derived(
    tagMatch === 'all'
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.TagMatchAll', 'All of')
      : localizeOr('FABRICATE.Admin.Manager.Recipe.TagMatchAny', 'Any of')
  );
  const kindLabel = $derived(
    forSubject('FABRICATE.Admin.Manager.Recipe.KindFor', 'Kind of {name}')
  );
  const searchTagsWord = localizeOr(
    'FABRICATE.Admin.Manager.Recipe.TagSearchPlaceholder',
    'Search tags...'
  );

  // The SAME two strings the policy word above reads, so the control and the sentence it writes
  // can never disagree.
  const TAG_MATCH_OPTIONS = [
    { value: 'any', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAny', fallback: 'Any of' },
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.TagMatchAll', fallback: 'All of' },
  ];
  const tagMatchOptions = $derived(
    disabled
      ? TAG_MATCH_OPTIONS.map((option) => ({ ...option, disabled: true }))
      : TAG_MATCH_OPTIONS
  );
</script>

{#snippet remove()}
  <button
    {...removeProps}
    type="button"
    class="manager-recipe-option-remove"
    data-recipe-remove={removeHook}
    data-keyboard-focus="true"
    aria-label={removeName}
    title={removeName}
    {disabled}
    onclick={() => onRemove()}><i class="fas fa-xmark" aria-hidden="true"></i></button
  >
{/snippet}

<!-- The hook is written empty and first: a bare attribute beside a spread serializes as "true". -->
<div
  data-recipe-option=""
  class={`manager-recipe-ingredient-option-row is-${leadTone}${extraClass}`}
  {...rest}
  bind:this={rowRoot}
>
  <span class={`manager-recipe-option-lead is-${leadTone}`} aria-hidden="true">
    <i class={leadIcon}></i>
  </span>

  <!-- A one-of-N picker: four mutually exclusive values, no search, no imagery.
       The tooltip rides `triggerTitle`. -->
  <Select
    class="manager-recipe-option-kind"
    size="inline"
    value={matchType}
    options={kindOptions}
    ariaLabel={kindLabel}
    triggerTitle={kindLabel}
    triggerProps={{ 'data-recipe-option-kind': '' }}
    onChange={setKind}
    readonly={misconfigured}
    ariaDescribedBy={misconfigured || missing ? `picker-row-unknown-${tagMatchGroupId}` : ''}
    {disabled}
  />

  {#if matchType === 'tags'}
    <!-- ONE LINE: the policy word, the chosen tags, `+ Tag`, and the Any of / All of control that
         sets the word. No empty state — an unfilled row already says `Any of` with nothing
         after it. -->
    <span class="manager-recipe-option-tags" data-recipe-option-tags>
      <span class="manager-recipe-tag-policy" data-recipe-tag-policy>{tagPolicyWord}</span>
      {#each tags as tag (tag)}
        <Chip tag="span" tone="tag" class="manager-recipe-tag-chip" data-recipe-tag={tag}>
          <span>{tag}</span>
          <button
            type="button"
            class="manager-recipe-tag-remove"
            data-recipe-remove="tag"
            aria-label={localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
            title={localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveTag', 'Remove tag')}
            {disabled}
            onclick={() => removeTag(tag)}><i class="fas fa-times" aria-hidden="true"></i></button
          >
        </Chip>
      {/each}
      <SearchablePopover
        options={tagPickerOptions}
        pickerClass="manager-recipe-tag-picker"
        triggerClass="manager-recipe-tag-trigger"
        triggerIcon="fa-solid fa-plus"
        triggerLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.TagTypeLabel', 'Tag')}
        triggerProps={{ 'data-recipe-add-tag': '' }}
        ariaLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        triggerTitle={localizeOr('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        panelLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddTag', 'Add tag')}
        searchPlaceholder={searchTagsWord}
        searchLabel={searchTagsWord}
        emptyHint={localizeOr('FABRICATE.Admin.Manager.Recipe.NoTagsDefined', 'No tags defined')}
        showChevron={false}
        {disabled}
        onSelect={(tag) => addTag(tag)}
      />
    </span>
    <!-- `tone="tag"` and NO `density`: the tone carries this control's scale as well as its
         colour. It is the only thing a tag row carries that the other three kinds do not, so its
         size decides whether an empty tag row stands level with its siblings. -->
    <SegmentedControl
      options={tagMatchOptions}
      value={tagMatch}
      tone="tag"
      groupName={`tag-match-${tagMatchGroupId}`}
      ariaLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.TagMatch', 'Tag match')}
      optionDataAttr="data-recipe-tag-match"
      onChange={(mode) => emit({ tagMatch: mode === 'all' ? 'all' : 'any' })}
    />
  {:else if misconfigured}
    <!-- A kind the table does not name: stated, never drawn as a component. -->
    <span class="manager-recipe-option-name-field" data-recipe-option-misconfigured={matchType}>
      <span class="manager-recipe-req-tag is-disabled" title={unknownHint}
        >{localizeOr('FABRICATE.Admin.Manager.Recipe.UnknownKind', 'Unknown kind')}</span
      >
      <span id={`picker-row-unknown-${tagMatchGroupId}`} hidden>{unknownHint}</span>
    </span>
  {:else if face}
    <!-- A kind its system cannot honour: a static label rather than a searchable field, flagged
         inert, with the value still visible so nothing the recipe holds is hidden. -->
    <span class="manager-recipe-option-name-field" {...face.field}>
      <span class="manager-recipe-currency-unit is-readonly" {...face.subject}
        >{chosen?.label || value?.id || faceWord(face.fallback)}</span
      >
      <span class="manager-recipe-req-tag is-disabled" {...face.marker} title={faceWord(face.hint)}
        >{faceWord(face.tag)}</span
      >
    </span>
  {:else if missing}
    <span
      class="manager-recipe-option-name-field"
      data-recipe-option-knowledge
      data-recipe-option-missing={value.id}
    >
      <span class="manager-recipe-req-tag is-disabled" title={missingHint}
        >{localizeOr('FABRICATE.Admin.Manager.Recipe.MissingRecipe', 'Missing recipe')}</span
      >
      <span id={`picker-row-unknown-${tagMatchGroupId}`} hidden>{missingHint}</span>
    </span>
  {:else}
    {#key matchType}
      <PickerRowNameField
        kind={matchType}
        {chosen}
        {entries}
        tone={leadTone}
        {clearable}
        {disabled}
        {clearName}
        {nameProps}
        describedBy={reward && matchType === 'knowledge' ? hintId : ''}
        onChoose={choose}
      />
    {/key}
  {/if}

  <div class="manager-recipe-option-controls">
    {#if amount !== false && !misconfigured && matchType !== 'knowledge'}
      {#key matchType}
        <PickerRowAmount
          {value}
          {amount}
          name={subjectName}
          {rollable}
          {readonly}
          {disabled}
          invalid={invalid?.amount || ''}
          onChange={emit}
        />
      {/key}
    {/if}

    {#if allowAny}
      <span class="manager-recipe-option-divider" aria-hidden="true"></span>
      <PickerRowKindMenu {kinds} {disabled} heading={menuHeading} hint={menuHint} {onSelect} />
    {/if}

    <!-- One line, so a row with no `trailing` gains no text node. -->
    {@render trailing?.()}{#if removable}{@render remove()}{/if}
  </div>

  {#if reward && (matchType === 'knowledge' || (matchType === 'currency' && chosen))}
    <PickerRowRewardBody
      kind={matchType}
      label={value?.label}
      reason={value?.reason}
      unitName={chosen?.label}
      disabled={disabled || readonly}
      {hintId}
      offHint={readonly && matchType === 'knowledge' ? faceWord(face.hint) : ''}
      onChange={emit}
    />
  {/if}
</div>
