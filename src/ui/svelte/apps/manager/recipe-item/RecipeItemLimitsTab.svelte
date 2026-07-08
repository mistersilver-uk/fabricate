<!-- Svelte 5 runes mode -->
<!--
  Limits tab of the recipe-item editor. MODE-DEPENDENT via `visibilityMode`: the item
  ("uses") card and the knowledge ("learning") card never appear together.

   - item      → Uses card. A "Limited use" toggle (caps.item.limitUses); when on, a
                 "Uses per copy" stepper (caps.item.maxUses, min 1) and a "When the
                 last use is spent" SegmentedControl (caps.item.whenSpent).
   - knowledge → Learning card. A "Limited learning" toggle (caps.learn.limitLearning);
                 when on, a "Learning limit" SegmentedControl (caps.learn.learningMode:
                 once/ntimes/party), a "Learns allowed" stepper (caps.learn.learnsAllowed,
                 forced to 1 + disabled when mode='once'), a "Prerequisite to learn"
                 selector (a recipe id from linkedRecipes/availableRecipes, or None),
                 and a live plain-English explanation.

  CONTROLLED: every change emits a nested partial patch via `onPatch`; the router
  deep-merges it into the draft.

  Props:
   - recipeItem: the draft `{ caps: { item, learn } }`.
   - visibilityMode: 'item' | 'knowledge'.
   - linkedRecipes / availableRecipes: `[{ id, name }]` for the prerequisite selector.
   - onPatch(patch).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SegmentedControl from '../SegmentedControl.svelte';

  let {
    recipeItem = null,
    visibilityMode = 'item',
    linkedRecipes = [],
    availableRecipes = [],
    onPatch = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const modeItem = $derived(visibilityMode === 'item');
  const modeKnowledge = $derived(visibilityMode === 'knowledge');

  const itemCaps = $derived(recipeItem?.caps?.item || {});
  const learnCaps = $derived(recipeItem?.caps?.learn || {});

  const limitUses = $derived(itemCaps.limitUses === true);
  const maxUses = $derived(Number.isFinite(itemCaps.maxUses) ? itemCaps.maxUses : 1);
  const whenSpent = $derived(itemCaps.whenSpent === 'inert' ? 'inert' : 'destroyed');

  const limitLearning = $derived(learnCaps.limitLearning === true);
  const learningMode = $derived(['once', 'ntimes', 'party'].includes(learnCaps.learningMode) ? learnCaps.learningMode : 'once');
  const learnsAllowed = $derived(Number.isFinite(learnCaps.learnsAllowed) ? learnCaps.learnsAllowed : 1);
  const prerequisite = $derived(learnCaps.prerequisite ? String(learnCaps.prerequisite) : '');

  // In 'once' mode the learns count is meaningless (each reader learns exactly once),
  // so the stepper is disabled and pinned to 1.
  const learnsActive = $derived(learningMode !== 'once');
  const learnsDisplay = $derived(learningMode === 'once' ? 1 : learnsAllowed);

  const WHEN_SPENT_OPTIONS = [
    { value: 'destroyed', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.Destroyed', fallback: 'Destroyed' },
    { value: 'inert', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.Inert', fallback: 'Becomes inert' }
  ];
  const LEARNING_MODE_OPTIONS = [
    { value: 'once', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.ModeOnce', fallback: 'Once per reader', icon: 'fas fa-user-check' },
    { value: 'ntimes', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.ModeNTimes', fallback: 'N times per reader', icon: 'fas fa-repeat' },
    { value: 'party', labelKey: 'FABRICATE.Admin.Manager.RecipeItem.Limits.ModeParty', fallback: 'Party-wide', icon: 'fas fa-users' }
  ];

  // Prerequisite options: prefer the recipes already linked to this item, then any
  // other available recipe, de-duplicated by id.
  const prerequisiteOptions = $derived.by(() => {
    const seen = new Set();
    const options = [];
    for (const recipe of [...(linkedRecipes || []), ...(availableRecipes || [])]) {
      const id = String(recipe?.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      options.push({ id, name: String(recipe?.name || id) });
    }
    return options;
  });

  const learnExplain = $derived.by(() => {
    if (learningMode === 'once') {
      return text('FABRICATE.Admin.Manager.RecipeItem.Limits.ExplainOnce', 'Each eligible character can learn the recipes in this item once. Re-reading grants nothing.');
    }
    const times = `${learnsDisplay} ${learnsDisplay === 1
      ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.Time', 'time')
      : text('FABRICATE.Admin.Manager.RecipeItem.Limits.Times', 'times')}`;
    if (learningMode === 'ntimes') {
      return text('FABRICATE.Admin.Manager.RecipeItem.Limits.ExplainNTimes', 'Each eligible character can learn from this item up to {times}.').replace('{times}', times);
    }
    return text('FABRICATE.Admin.Manager.RecipeItem.Limits.ExplainParty', 'The party as a whole can learn from this item {times}, no matter who reads it.').replace('{times}', times);
  });

  function patchItem(patch) {
    onPatch({ caps: { item: patch } });
  }
  function patchLearn(patch) {
    onPatch({ caps: { learn: patch } });
  }

  function toggleLimitUses() {
    patchItem({ limitUses: !limitUses });
  }
  function stepUses(delta) {
    const next = Math.max(1, maxUses + delta);
    if (next !== maxUses) patchItem({ maxUses: next });
  }
  function selectWhenSpent(value) {
    patchItem({ whenSpent: value });
  }

  function toggleLimitLearning() {
    patchLearn({ limitLearning: !limitLearning });
  }
  function selectLearningMode(value) {
    patchLearn({ learningMode: value });
  }
  function stepLearns(delta) {
    if (!learnsActive) return;
    const next = Math.max(1, learnsAllowed + delta);
    if (next !== learnsAllowed) patchLearn({ learnsAllowed: next });
  }
  function selectPrerequisite(event) {
    const value = String(event.currentTarget.value || '');
    patchLearn({ prerequisite: value || null });
  }
</script>

<section class="manager-recipe-item-tab manager-recipe-item-limits" data-recipe-item-tab="limits" data-visibility-mode={visibilityMode} aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Title', 'Limits')}>
  {#if modeItem}
    <div class="manager-recipe-item-limits-section" data-recipe-item-limits-card="item">
      <div class="manager-recipe-item-limits-heading">
        <i class="fas fa-rotate" aria-hidden="true"></i>
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesTitle', 'Uses')}</h3>
      </div>
      <p class="manager-muted manager-recipe-item-limits-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesHint', 'How many times a single copy of this item can be read before it’s spent.')}</p>

      <div class="manager-recipe-item-limits-panel">
        <div class="manager-recipe-item-limits-toggle-row">
          <div class="manager-recipe-item-limits-toggle-copy">
            <span class="manager-recipe-item-limits-toggle-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUse', 'Limited use')}</span>
            <span class="manager-recipe-item-limits-toggle-sub">{limitUses
              ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUseOn', 'On — a copy is spent as it’s read.')
              : text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUseOff', 'Off — this item can be read any number of times.')}</span>
          </div>
          <button
            type="button"
            class={`manager-status-toggle ${limitUses ? 'is-on' : 'is-off'}`}
            data-recipe-item-limit-uses
            aria-pressed={limitUses}
            aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedUse', 'Limited use')}
            onclick={toggleLimitUses}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{limitUses ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </div>

        {#if limitUses}
          <div class="manager-recipe-item-limits-detail">
            <div class="manager-recipe-item-stepper-group">
              <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.UsesPerCopy', 'Uses per copy')}</span>
              <div class="manager-recipe-item-stepper" data-recipe-item-uses-stepper>
                <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-uses-dec aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Decrement', 'Decrease')} onclick={() => stepUses(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                <span class="manager-recipe-item-stepper-value" data-recipe-item-uses-value>{maxUses}</span>
                <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-uses-inc aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Increment', 'Increase')} onclick={() => stepUses(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="manager-recipe-item-limits-divider" aria-hidden="true"></div>
            <div class="manager-recipe-item-when-spent">
              <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.WhenSpent', 'When the last use is spent')}</span>
              <SegmentedControl
                options={WHEN_SPENT_OPTIONS}
                value={whenSpent}
                onChange={selectWhenSpent}
                groupName="recipe-item-when-spent"
                ariaLabel={text('FABRICATE.Admin.Manager.RecipeItem.Limits.WhenSpent', 'When the last use is spent')}
                dataAttr="data-recipe-item-when-spent"
                optionDataAttr="data-recipe-item-when-spent-option"
              />
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if modeKnowledge}
    <div class="manager-recipe-item-limits-section" data-recipe-item-limits-card="knowledge">
      <div class="manager-recipe-item-limits-heading">
        <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningTitle', 'Learning')}</h3>
      </div>
      <p class="manager-muted manager-recipe-item-limits-hint">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningHint', 'How often a reader may learn the recipes inside — independent of how many times the item can be opened.')}</p>

      <div class="manager-recipe-item-limits-panel">
        <div class="manager-recipe-item-limits-toggle-row">
          <div class="manager-recipe-item-limits-toggle-copy">
            <span class="manager-recipe-item-limits-toggle-title">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearning', 'Limited learning')}</span>
            <span class="manager-recipe-item-limits-toggle-sub">{limitLearning
              ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearningOn', 'On — a reader can only learn from this a set number of times.')
              : text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearningOff', 'Off — readers can learn from this freely.')}</span>
          </div>
          <button
            type="button"
            class={`manager-status-toggle ${limitLearning ? 'is-on' : 'is-off'}`}
            data-recipe-item-limit-learning
            aria-pressed={limitLearning}
            aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LimitedLearning', 'Limited learning')}
            onclick={toggleLimitLearning}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{limitLearning ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </div>

        {#if limitLearning}
          <div class="manager-recipe-item-limits-detail is-column">
            <div class="manager-recipe-item-learning-limit">
              <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningLimit', 'Learning limit')}</span>
              <SegmentedControl
                options={LEARNING_MODE_OPTIONS}
                value={learningMode}
                onChange={selectLearningMode}
                groupName="recipe-item-learning-mode"
                ariaLabel={text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearningLimit', 'Learning limit')}
                dataAttr="data-recipe-item-learning-mode"
                optionDataAttr="data-recipe-item-learning-mode-option"
              />
            </div>

            <div class="manager-recipe-item-learning-row">
              <div class="manager-recipe-item-stepper-group">
                <span class="manager-recipe-item-stepper-label">{learningMode === 'party'
                  ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.PartyLearns', 'Party learns')
                  : text('FABRICATE.Admin.Manager.RecipeItem.Limits.LearnsAllowed', 'Learns allowed')}</span>
                <div class={`manager-recipe-item-stepper ${learnsActive ? '' : 'is-disabled'}`} data-recipe-item-learns-stepper>
                  <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-learns-dec disabled={!learnsActive} aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Decrement', 'Decrease')} onclick={() => stepLearns(-1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <span class="manager-recipe-item-stepper-value" data-recipe-item-learns-value>{learnsDisplay}</span>
                  <button type="button" class="manager-recipe-item-stepper-button" data-recipe-item-learns-inc disabled={!learnsActive} aria-label={text('FABRICATE.Admin.Manager.RecipeItem.Limits.Increment', 'Increase')} onclick={() => stepLearns(1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                  <span class="manager-recipe-item-stepper-unit">{learningMode === 'party'
                    ? text('FABRICATE.Admin.Manager.RecipeItem.Limits.UnitTotal', 'total')
                    : text('FABRICATE.Admin.Manager.RecipeItem.Limits.UnitPerReader', 'per reader')}</span>
                </div>
              </div>
              <div class="manager-recipe-item-limits-divider is-vertical" aria-hidden="true"></div>
              <div class="manager-recipe-item-prereq">
                <span class="manager-recipe-item-stepper-label">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.Prerequisite', 'Prerequisite to learn')}</span>
                <label class="manager-field">
                  <span class="sr-only">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.Prerequisite', 'Prerequisite to learn')}</span>
                  <select data-recipe-item-prerequisite value={prerequisite} onchange={selectPrerequisite}>
                    <option value="">{text('FABRICATE.Admin.Manager.RecipeItem.Limits.PrerequisiteNone', 'None')}</option>
                    {#each prerequisiteOptions as option (option.id)}
                      <option value={option.id}>{option.name}</option>
                    {/each}
                  </select>
                </label>
              </div>
            </div>

            <div class="manager-recipe-item-learn-explain" data-recipe-item-learn-explain>
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              <span>{learnExplain}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .manager-recipe-item-limits {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-limits-heading {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-accent);
  }

  .manager-recipe-item-limits-heading .manager-card-title {
    margin: 0;
  }

  .manager-recipe-item-limits-hint {
    margin: var(--fab-space-1) 0 var(--fab-space-3);
  }

  .manager-recipe-item-limits-panel {
    border: 1px solid var(--fab-accent-border);
    border-radius: 11px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  .manager-recipe-item-limits-toggle-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
  }

  .manager-recipe-item-limits-toggle-copy {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    flex: 1;
    min-width: 0;
  }

  .manager-recipe-item-limits-toggle-title {
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-limits-toggle-sub {
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-limits-detail {
    display: flex;
    align-items: center;
    gap: var(--fab-space-4);
    padding: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
  }

  .manager-recipe-item-limits-detail.is-column {
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-learning-row {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-4);
  }

  .manager-recipe-item-stepper-group,
  .manager-recipe-item-when-spent,
  .manager-recipe-item-learning-limit,
  .manager-recipe-item-prereq {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-prereq {
    flex: 1.4;
  }

  .manager-recipe-item-stepper-label {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-recipe-item-stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-recipe-item-stepper.is-disabled {
    opacity: 0.4;
  }

  .manager-recipe-item-stepper-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-2);
    color: var(--fab-text-secondary);
    cursor: pointer;
  }

  .manager-recipe-item-stepper-button:hover:not(:disabled) {
    border-color: var(--fab-accent-border);
  }

  .manager-recipe-item-stepper-button:disabled {
    cursor: not-allowed;
  }

  .manager-recipe-item-stepper-value {
    min-width: 26px;
    text-align: center;
    font-family: var(--fab-font-mono, monospace);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--fab-text);
  }

  .manager-recipe-item-stepper-unit {
    font-size: 0.66rem;
    color: var(--fab-text-subtle);
    margin-left: var(--fab-space-1);
  }

  .manager-recipe-item-limits-divider {
    width: 1px;
    align-self: stretch;
    background: var(--fab-border);
  }

  .manager-recipe-item-limits-divider.is-vertical {
    min-height: 40px;
  }

  .manager-recipe-item-learn-explain {
    display: flex;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 9px;
    background: var(--fab-info-soft);
    font-size: 0.68rem;
    line-height: 1.5;
    color: var(--fab-text-muted);
  }

  .manager-recipe-item-learn-explain > i {
    color: var(--fab-info);
    margin-top: 1px;
  }
</style>
