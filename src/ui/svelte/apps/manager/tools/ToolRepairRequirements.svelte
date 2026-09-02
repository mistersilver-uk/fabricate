<!-- Svelte 5 runes mode -->
<!--
  THE TOOL REPAIR SET, AT BOTH SCOPES.

  == ONE EYEBROW WITH A COUNT, AND ONE EXPLAINER (issue 1373, maintainer round 2, E4) =========
  `proto:2232`-`2237` heads this block with a SINGLE uppercase `Repair requirements` and a count
  chip beside it on the same row (`display: flex; align-items: center; gap: 9px;
  margin-bottom: 4px`), then one explainer at `400 10.5px/1.5 var(--sans); color: var(--muted);
  margin-bottom: 10px`.

  It shipped with TWO heading levels - an uppercase `REPAIR MATERIALS` over a serif
  `Ingredient groups` - and an explainer that stated the AND/OR algebra rather than what the
  block is for. The algebra is already drawn: an `Any one of` group says OR in its own pill and
  everything else is AND by position, so the sentence spent itself restating the picture instead
  of answering "what is this list, and how do I add an alternative".

  THE COUNT IS THE DESIGN'S OWN, down to its empty face: `rows.length + ' requirement(s)'`, or
  `none yet` when there are none (`countLabel` in the design's state object).

  == WHAT IS DELIBERATELY NOT MATCHED =========================================================
  The design puts a kind `<select>` on every ingredient ROW (`proto:2217`). We render the shipped
  `RecipeIngredientSetCard`, the same primitive the recipe editor and the downtime reward editor
  author their ingredient sets through, and its row anatomy is not reshaped for this one caller:
  three surfaces authoring one persisted shape through two implementations is how a record and
  its editors drift. The divergence is a recorded decision, not an oversight.

  The one thing that IS caller-specific is the note beside a choice group's `Any one of` pill.
  The recipe editor enumerates the four kinds a crafter may pick between; a repair set says what
  picking one DOES (`any one of these mends it`, `proto:2242`). `anyOneOfHint` carries it, and it
  is empty at every other call site.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import RecipeIngredientSetCard from '../recipe/RecipeIngredientSetCard.svelte';

  let {
    groups = [],
    componentOptions = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    disabled = false,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const repairSet = $derived({ id: 'tool-repair-materials', ingredientGroups: groups });
  const groupCount = $derived(Array.isArray(groups) ? groups.length : 0);
  const countLabel = $derived(
    groupCount === 0
      ? text('FABRICATE.Admin.Manager.Tools.Editor.RepairCountNone', 'none yet')
      : groupCount === 1
        ? text('FABRICATE.Admin.Manager.Tools.Editor.RepairCountOne', '1 requirement')
        : formattedText(
            'FABRICATE.Admin.Manager.Tools.Editor.RepairCount',
            { count: groupCount },
            `${groupCount} requirements`
          )
  );

  // THE EMPHASISED TOKEN IS INTERPOLATED, NOT CONCATENATED. The design sets `or…` in
  // `var(--text2)` inside the sentence, and splitting the sentence into a before-half and an
  // after-half would hand a translator two fragments neither of which is a sentence. The key
  // keeps the whole sentence with a `{or}` placeholder and this splits on it, so a translation
  // is free to move the token anywhere in its own word order - or to drop the placeholder, in
  // which case the whole string renders as the leading half and nothing is lost.
  const orToken = $derived(text('FABRICATE.Admin.Manager.Tools.Editor.RepairHintOr', 'or…'));
  const hintParts = $derived(
    text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairHint',
      'One ingredient set, no recipe needed. Everything listed is consumed to mend a broken copy. Use {or} on a row to accept an alternative in its place.'
    ).split('{or}')
  );
</script>

<section class="manager-tool-repair" data-tool-repair-requirements>
  <div class="manager-tool-repair-heading">
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Tools.Editor.Repair', 'Repair requirements')}
    </p>
    <Chip tone="neutral" data-tool-repair-count={groupCount}>{countLabel}</Chip>
  </div>
  <p class="manager-muted manager-tool-repair-hint" data-tool-repair-hint>
    {hintParts[0]}{#if hintParts.length > 1}<b class="manager-tool-repair-or">{orToken}</b
      >{hintParts.slice(1).join('{or}')}{/if}
  </p>
  <fieldset class="manager-tool-repair-content" {disabled}>
    <RecipeIngredientSetCard
      set={repairSet}
      chromeless
      showSetName={false}
      {componentOptions}
      {itemTags}
      {essenceOptions}
      {currencyUnits}
      {currencyEnabled}
      anyOneOfHint={text(
        'FABRICATE.Admin.Manager.Tools.Editor.RepairAnyOneOfHint',
        'any one of these mends it'
      )}
      onChange={(nextSet) => onChange(nextSet.ingredientGroups || [])}
    />
  </fieldset>
</section>

<style>
  /* THE EYEBROW AND THE COUNT ON ONE ROW - `proto:2233`: `display: flex; align-items: center;
     gap: 9px; margin-bottom: 4px`. 9 rounds to `--fab-space-2` on the 4px scale; the bottom
     margin is the section's own `gap` and is not restated. `.manager-kicker` carries its own
     `margin-bottom`, which has to go here or the chip sits two pixels high against it. */
  .manager-tool-repair-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-tool-repair-heading > .manager-kicker {
    margin: 0;
  }

  /* `400 10.5px/1.5 var(--sans); color: var(--muted)` at `proto:2237`, which is 0.66rem against
     the 16px root. `.manager-tool-repair` sets 0.78rem for the block, so the explainer states
     its own size rather than inheriting a control-sized one. */
  .manager-tool-repair-hint {
    margin: 0;
    font-size: 0.66rem;
    line-height: 1.5;
  }

  /* The emphasised token: `--text2` in the design, which is `--fab-text-secondary` here. It is
     one shade up from the sentence around it rather than an accent - it names a control the
     reader is about to look for, not a warning. */
  .manager-tool-repair-or {
    color: var(--fab-text-secondary);
  }
</style>
