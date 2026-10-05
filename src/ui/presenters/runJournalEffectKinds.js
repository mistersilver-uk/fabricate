/** The execution-effect kinds a Journal projection may name to an entitled viewer; any other kind
 *  projects as `other`. `awardRewards`, `awardChoice` and `settleAwardChoice` are issue 1773's. */
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
  'awardChoice',
  'settleAwardChoice',
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
