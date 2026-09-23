<!--
  THE TOOL REPAIR SET, AT BOTH SCOPES: ONE EYEBROW WITH A COUNT, AND ONE EXPLAINER. It shipped with
  TWO heading levels and an explainer that stated the AND/OR algebra rather than what the block is
  for — algebra already drawn, since an `Any one of` group says OR in its own pill and everything
  else is AND by position, so the sentence restated the picture instead of answering "what is this
  list, and how do I add an alternative". THE COUNT IS THE DESIGN'S OWN, down to its empty face.

  THE ROW ANATOMY CONVERGED RATHER THAN FORKING. An earlier round recorded the design's per-row
  kind `<select>` as a deliberate divergence, on the ground that reshaping the shared row for one
  caller would be a second implementation of one persisted shape; the maintainer ruled the other
  way, and the reasoning is better — the answer to "three surfaces, one shape" is to change the ONE
  row all three render. The one thing that IS caller-specific is the note beside a choice group's
  `Any one of` pill: the recipe editor enumerates the kinds a crafter may pick between, and a
  repair set says what picking one DOES, which `anyOneOfHint` carries and no other call site sets.

  AND THE BLOCK ENDS IN A SENTENCE — the only place the whole set is stated as a cost rather than
  drawn as an editor, which is what a GM checking their own work reads. See `toolRepairSummary.js`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import RecipeIngredientSetCard from '../recipe/RecipeIngredientSetCard.svelte';
  import { repairSummarySentence } from './toolRepairSummary.js';

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

  // THE EMPHASISED TOKEN IS INTERPOLATED, NOT CONCATENATED: splitting the sentence into two
  // halves would hand a translator two fragments neither of which is a sentence. The key keeps the
  // whole sentence with a placeholder and this splits on it, so a translation may move the token
  // anywhere — or drop it, in which case the string renders whole and nothing is lost.
  const orToken = $derived(text('FABRICATE.Admin.Manager.Tools.Editor.RepairHintOr', 'or…'));
  const hintParts = $derived(
    text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairHint',
      'One ingredient set, no recipe needed. Everything listed is consumed to mend a broken copy. Use {or} on a row to accept an alternative in its place.'
    ).split('{or}')
  );

  // Every word of the sentence, resolved once. The module that assembles it is pure — see its
  // docblock for why it takes the strings rather than reaching for `localize` itself.
  const summaryLabels = $derived({
    lead: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummary', 'Mending consumes {list}.'),
    empty: text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryEmpty',
      'Nothing listed — a broken copy cannot be mended.'
    ),
    or: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryOr', ' or '),
    and: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryAnd', ' + '),
    anyOf: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryAnyOf', 'any of '),
    allOf: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryAllOf', 'all of '),
    essenceSuffix: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryEssence', ' essence'),
    unsetComponent: text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryUnsetComponent',
      'unset component'
    ),
    unsetTag: text('FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryUnsetTag', 'unset tag'),
    unsetEssence: text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryUnsetEssence',
      'unset essence'
    ),
    unsetCurrency: text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairSummaryUnsetCurrency',
      'unset currency'
    ),
  });
  const summary = $derived(
    repairSummarySentence(
      groups,
      { components: componentOptions, essences: essenceOptions, currencyUnits },
      summaryLabels
    )
  );
</script>

<section class="manager-tool-repair" data-tool-repair-requirements>
  <div class="manager-tool-repair-heading">
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Tools.Editor.Repair', 'Repair requirements')}
    </p>
    <!-- The count pill is `Chip`'s `list` density value for value; at the base scale it
         outweighed the eyebrow it counts. -->
    <Chip tone="neutral" density="list" data-tool-repair-count={groupCount}>{countLabel}</Chip>
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
  <p class="manager-muted manager-tool-repair-summary" data-tool-repair-summary>{summary}</p>
</section>

<style>
  /* THE EYEBROW AND THE COUNT ON ONE ROW; the bottom margin is the section's own `gap` and is not
     restated. `.manager-kicker`'s own bottom margin is zeroed here, or the chip sits high. */
  .manager-tool-repair-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-tool-repair-heading > .manager-kicker {
    margin: 0;
  }

  /* The block sets a control-sized type, so the explainer states its own rather than inherit it. */
  .manager-tool-repair-hint {
    margin: 0;
    font-size: 0.66rem;
    line-height: 1.5;
  }

  /* The emphasised token is one shade up from the sentence rather than an accent: it names a
     control the reader is about to look for, not a warning. */
  .manager-tool-repair-or {
    color: var(--fab-text-secondary);
  }

  /* A shade quieter than the explainer above the editor: it reads as a readback of what the GM
     just authored rather than as a second instruction. */
  .manager-tool-repair-summary {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    line-height: 1.45;
  }
</style>
