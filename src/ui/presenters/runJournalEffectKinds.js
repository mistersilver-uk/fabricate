/** The execution-effect kinds a Journal projection may name to an entitled viewer; any other kind
 *  projects as `other`. `awardRewards` is the reward step of issue 1773. */
export const SAFE_EXECUTION_EFFECT_KINDS = new Set([
  'executeCraftingStage',
  'consumeItems',
  'awardItems',
  'consumeIngredients',
  'consumeAlchemyExtras',
  'spendCurrency',
  'applyToolUsage',
  'awardResults',
  'awardRewards',
  'finalizeCraftingStage',
  'recordRecipeUse',
  'learnAlchemyRecipe',
  'fireComplications',
  'postCraftChat',
  'recordAlchemyDeadEnd',
  'consumeAlchemyItems',
  'createGatheredResults',
  'refundStageConsumption',
]);
