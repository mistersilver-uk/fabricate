<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
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

  const repairSet = $derived({ id: 'tool-repair-materials', ingredientGroups: groups });
</script>

<section class="manager-tool-repair" data-tool-repair-requirements>
  <div class="manager-tool-editor-card-heading">
    <div>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Tools.Editor.Repair', 'Repair materials')}
      </p>
      <h3>{text('FABRICATE.Admin.Manager.Tools.Editor.RepairTitle', 'Ingredient groups')}</h3>
    </div>
  </div>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Tools.Editor.RepairHint',
      'Every group is required (AND); any one option inside a group can satisfy it (OR).'
    )}
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
      onChange={(nextSet) => onChange(nextSet.ingredientGroups || [])}
    />
  </fieldset>
</section>
