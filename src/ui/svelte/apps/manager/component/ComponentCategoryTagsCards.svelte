<!--
  The Component Rules editor's Category and Tags cards, side by side. The view owns both drafts and
  the inherit choice; this file draws them and reports each pick.

  Callbacks:
  - `onCategorySelect(value)` — the select's value, the inherit option included.
  - `onToggleTag(tag, checked)` — the tag and its next checked state.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import Select from '../../../components/Select.svelte';
  import { componentTagMergeNote } from '../scoped/componentScoped.js';

  let {
    text,
    format,
    systemLabel = '',
    saving = false,
    categorySelectValue = '',
    categorySelectOptions = [],
    categoryLocked = false,
    categoryNote,
    hasWorldEntry = false,
    worldTags = [],
    worldMutedTags = [],
    tagDraft = [],
    onCategorySelect = () => {},
    onToggleTag = () => {},
  } = $props();

  const ownTagLabel = $derived(
    format('FABRICATE.Admin.Manager.Component.TagsEdit.OwnGroup', '{system}’s tags', {
      system: systemLabel,
    })
  );
  // THE WORLD BRANCH STATES WHAT IS TRUE, WHICH IS NOT WHAT THE REFERENCE STATES: the runtime does
  // not merge world tags — `resolveComponentTags` computes the additive set and the read union's
  // trailing in-system re-spread discards it. `## GM World Component Screens` forbids asserting the
  // false half, so this is a licensed departure. The card still SHOWS the world run.
  const tagCardSubtitle = $derived(
    worldTags.length > 0
      ? format(
          'FABRICATE.Admin.Manager.Component.TagsEdit.SubtitleWorld',
          'The world record’s tags are listed here; {system}’s own are the ones in effect.',
          { system: systemLabel }
        )
      : format(
          'FABRICATE.Admin.Manager.Component.TagsEdit.SubtitleOwn',
          '{system}’s item tags. Another system’s tags are its own business.',
          { system: systemLabel }
        )
  );
</script>

<!--
  CATEGORY AND TAGS, SIDE BY SIDE in one `minmax(0,1fr) minmax(0,1.3fr)` grid, which is what
  fits the tag card's two labelled groups beside a control one line high.
-->
<div class="manager-component-rules-duo">
  <!-- ONE CONTROL, IN THE BODY, FULL WIDTH. The `InheritRow` it replaces is untouched for
  its other callers. -->
  <section class="manager-component-rules-card" data-component-edit-section="category">
    <div class="manager-component-rules-card-head">
      <i class="fas fa-folder-open manager-component-rules-card-glyph is-accent" aria-hidden="true"
      ></i>
      <div>
        <h3>{text('FABRICATE.Admin.Manager.Component.Category.Title', 'Category')}</h3>
        <p class="manager-component-rules-card-sub">
          {format(
            'FABRICATE.Admin.Manager.Component.Category.Sub',
            'World default, or a category from {system}.',
            { system: systemLabel }
          )}
        </p>
      </div>
    </div>
    <!-- The shared one-of-N picker since issue 1510, so the app draws the list. Both hooks
    ride `triggerProps` onto the trigger button; `class` lands on the picker root, which is
    where the sheet hangs the trigger's width and its `border-strong` hairline. No tick: the
    trigger states the value and the six rows are distinct names (design-system/spec.md, the
    configurable tick). -->
    <Select
      class="manager-component-category-select"
      value={categorySelectValue}
      options={categorySelectOptions}
      showTick={false}
      ariaLabel={text('FABRICATE.Admin.Manager.Component.Category.Label', 'Component category')}
      disabled={saving}
      triggerProps={{
        'data-component-edit-category': '',
        'data-validation-target': 'component-category',
        ...(categoryLocked ? { 'data-component-edit-category-locked': '' } : {}),
      }}
      onChange={onCategorySelect}
    />
    <!--
    THE NOTE IS DIRECTLY UNDER THE SELECT, with the model's own glyph and tone: `info` while
    inheriting, `warning` while overriding, subtle where the world authored nothing. The
    inheriting branch's raw literal maps to the info token (E-4) and is not quoted here,
    because the theme-colour contract scans prose as well as declarations. Its rules live in
    the sheet alone: a scoped copy would out-specify `.fabricate-manager .manager-component-cat-note`.
  -->
    <p
      class={`manager-component-cat-note is-${categoryNote.tone}`}
      data-component-edit-category-note={categoryNote.state}
    >
      <i class={categoryNote.icon} aria-hidden="true"></i>
      <span>{categoryNote.text}</span>
    </p>
  </section>

  <!--
  TWO LABELLED TAG GROUPS AND A MERGE NOTE, the world run first and the system's own beneath.
  THE WORLD GROUP IS READ-ONLY HERE, per D-r5: muting is authored on the world entry, where
  the list and its exceptions are visible together. Both PAINTS still apply, because a
  read-only chip must show which tags are muted. The route to the world record is the
  attribution banner at the top of this editor.
-->
  <section class="manager-component-rules-card" data-component-edit-section="tags">
    <div class="manager-component-rules-card-head">
      <i class="fas fa-tags manager-component-rules-card-glyph is-tag" aria-hidden="true"></i>
      <div>
        <h3>{text('FABRICATE.Admin.Manager.Component.TagsEdit.Title', 'Tags')}</h3>
        <p class="manager-component-rules-card-sub">{tagCardSubtitle}</p>
      </div>
    </div>

    {#if hasWorldEntry && worldTags.length > 0}
      <div class="manager-component-tag-group" data-component-edit-section="world-tags">
        <p class="manager-micro-label">
          {text('FABRICATE.Admin.Manager.Component.WorldTags.GroupLabel', 'From the world')}
        </p>
        <div class="manager-component-tag-run" data-component-edit-world-tags>
          {#each worldTags as tag (tag)}
            <!-- `struck` is the MUTED paint. NOT `disabled` — `Chip` joins `is-disabled`
               to the WARNING family, which would paint a muted tag amber and read as a
               hazard. `density="tag-run"` is the scale of a chip that is a control rather
               than a badge, and composes with both paints so every tag renders at one size.
               `info` rather than `tag` inks the WORLD run blue; the run below is purple. -->
            <Chip
              density="tag-run"
              tone={worldMutedTags.includes(tag) ? 'muted' : 'info'}
              struck={worldMutedTags.includes(tag)}
              icon={worldMutedTags.includes(tag) ? 'fas fa-eye-slash' : 'fas fa-earth-americas'}
              data-component-edit-world-tag={tag}
              data-component-world-tag-muted={worldMutedTags.includes(tag)}>{tag}</Chip
            >
          {/each}
        </div>
      </div>
    {/if}

    <div class="manager-component-tag-group">
      <p class="manager-micro-label" data-component-own-tags-label>{ownTagLabel}</p>
      {#if tagDraft.length > 0}
        <!-- The pill IS the shared `Chip` (issue 772), with `aria-pressed` as the state
           rather than a class, and written without internal whitespace because call sites
           assert on exact `textContent`. THE LABEL ALONE, with no leading glyph and no
           trailing state circle (UX F-F): the pair roughly doubled each chip's width, and
           `aria-pressed` is what a screen reader reads. -->
        <div class="manager-component-tag-run" data-component-edit-tags>
          {#each tagDraft as option (option.tag)}
            <Chip
              tag="button"
              type="button"
              density="tag-run"
              tone={option.checked ? 'tag' : 'neutral'}
              aria-pressed={option.checked === true}
              data-component-edit-tag-toggle={option.tag}
              data-component-tag-checked={option.checked === true}
              onclick={() => onToggleTag(option.tag, option.checked !== true)}
              disabled={saving}>{option.tag}</Chip
            >
          {/each}
        </div>
      {:else}
        <p class="manager-muted">
          {text(
            'FABRICATE.Admin.Manager.Component.TagsEdit.NoTags',
            'This system defines no item tags.'
          )}
        </p>
      {/if}
    </div>

    <!-- `proto:1338`: the merge note under BOTH groups, at 9.5px in the subtle ink. -->
    <p class="manager-component-tag-merge-note" data-component-edit-world-tags-note>
      {componentTagMergeNote(
        {
          effective: tagDraft.filter((option) => option.checked).length,
          muted: worldMutedTags.length,
        },
        format
      )}
    </p>
  </section>
</div>
