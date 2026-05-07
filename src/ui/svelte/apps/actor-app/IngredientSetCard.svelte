<!-- Svelte 5 runes mode -->
<!--
  IngredientSetCard renders a single ingredient-set "path" in the complex
  recipe inspector. AND across groups (stacked blocks); OR across options
  inside a group (compact rows). Each option row shows a read-only source
  allocation badge — the user cannot reassign sources from here. The badge is
  derived display data only; the canonical craft() path aggregates inventory
  across all source actors.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { path = null } = $props();
</script>

{#if path}
  <article class="ingredient-set-card" data-testid="ingredient-set-card" class:is-satisfiable={path.isSatisfiable}>
    <header class="ingredient-set-card__header">
      <h5 class="ingredient-set-card__name">{path.name}</h5>
      <span
        class="ingredient-set-card__status"
        class:satisfiable={path.isSatisfiable}
        class:unsatisfiable={!path.isSatisfiable}
      >
        {path.isSatisfiable
          ? localize('FABRICATE.ActorApp.CraftPlan.PathSatisfiable')
          : localize('FABRICATE.ActorApp.CraftPlan.PathMissing')}
      </span>
    </header>

    {#if path.groups?.length === 0}
      <p class="ingredient-set-card__empty">
        {localize('FABRICATE.ActorApp.CraftPlan.NoGroups')}
      </p>
    {:else}
      <div class="ingredient-set-card__groups">
        {#each path.groups as group, gi (group.id ?? gi)}
          <div class="ingredient-set-card__group">
            {#if group.options.length > 1}
              <span class="ingredient-set-card__group-label">
                {localize('FABRICATE.ActorApp.CraftPlan.OrChooseOne')}
              </span>
            {/if}
            <ul class="ingredient-set-card__options">
              {#each group.options as option, oi (option.id ?? oi)}
                <li
                  class="ingredient-set-card__option"
                  class:satisfied={option.satisfied}
                  class:unsatisfied={!option.satisfied}
                >
                  <span class="ingredient-set-card__option-type-badge ingredient-set-card__option-type-badge--{option.type}">
                    {#if option.type === 'tag'}
                      {localize('FABRICATE.ActorApp.CraftPlan.OptionTypeTag')}
                    {:else if option.type === 'essence'}
                      {localize('FABRICATE.ActorApp.CraftPlan.OptionTypeEssence')}
                    {:else}
                      {localize('FABRICATE.ActorApp.CraftPlan.OptionTypeComponent')}
                    {/if}
                  </span>
                  <i
                    class={option.satisfied ? 'fas fa-check-circle' : 'fas fa-times-circle'}
                    aria-hidden="true"
                  ></i>
                  <span class="ingredient-set-card__option-label">{option.label}</span>
                  <span class="ingredient-set-card__option-counts">{option.have} / {option.need}</span>
                  {#if option.source}
                    <span
                      class="ingredient-set-card__source"
                      title={localize('FABRICATE.ActorApp.CraftPlan.SourceTooltip').replace('{name}', option.source.actorName)}
                    >
                      <i class="fas fa-user" aria-hidden="true"></i>
                      {option.source.actorName}
                    </span>
                  {:else}
                    <span class="ingredient-set-card__source ingredient-set-card__source--missing">
                      <i class="fas fa-question" aria-hidden="true"></i>
                      {localize('FABRICATE.ActorApp.CraftPlan.SourceMissing')}
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}

    {#if path.essences?.length > 0}
      <div class="ingredient-set-card__essences">
        <span class="ingredient-set-card__group-label">
          {localize('FABRICATE.ActorApp.CraftPlan.RequiredEssences')}
        </span>
        <ul class="ingredient-set-card__options">
          {#each path.essences as ess, ei (ess.type ?? ei)}
            <li class="ingredient-set-card__option ingredient-set-card__option--essence">
              <span class="ingredient-set-card__option-type-badge ingredient-set-card__option-type-badge--essence">
                {localize('FABRICATE.ActorApp.CraftPlan.OptionTypeEssence')}
              </span>
              <span class="ingredient-set-card__option-label">{ess.type}</span>
              <span class="ingredient-set-card__option-counts">{ess.need}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if path.catalysts?.length > 0}
      <div class="ingredient-set-card__catalysts">
        <span class="ingredient-set-card__group-label">
          {localize('FABRICATE.ActorApp.CraftPlan.Catalysts')}
        </span>
        <ul class="ingredient-set-card__options">
          {#each path.catalysts as cat, ci (cat.id ?? ci)}
            <li class="ingredient-set-card__option ingredient-set-card__option--catalyst">
              <span class="ingredient-set-card__option-type-badge ingredient-set-card__option-type-badge--catalyst">
                {localize('FABRICATE.ActorApp.CraftPlan.OptionTypeCatalyst')}
              </span>
              <span class="ingredient-set-card__option-label">{cat.name}</span>
              <span class="ingredient-set-card__option-counts">x{cat.need}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </article>
{/if}

<style>
  .ingredient-set-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface-soft);
  }

  .ingredient-set-card.is-satisfiable {
    border-color: var(--fab-accent);
  }

  .ingredient-set-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .ingredient-set-card__name {
    margin: 0;
    color: var(--fab-text);
    font-size: 13px;
    font-weight: 700;
  }

  .ingredient-set-card__status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .ingredient-set-card__status.satisfiable {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .ingredient-set-card__status.unsatisfiable {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
  }

  .ingredient-set-card__empty {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 12px;
  }

  .ingredient-set-card__groups,
  .ingredient-set-card__essences,
  .ingredient-set-card__catalysts {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .ingredient-set-card__group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  }

  .ingredient-set-card__group + .ingredient-set-card__group {
    border-top: 1px dashed var(--fab-border);
    padding-top: var(--fab-space-1);
  }

  .ingredient-set-card__group-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .ingredient-set-card__options {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ingredient-set-card__option {
    display: grid;
    grid-template-columns: auto 16px 1fr auto auto;
    align-items: center;
    gap: var(--fab-space-2);
    padding: 2px 4px;
    font-size: 12px;
  }

  .ingredient-set-card__option--essence,
  .ingredient-set-card__option--catalyst {
    grid-template-columns: auto 1fr auto;
  }

  .ingredient-set-card__option.satisfied i.fa-check-circle {
    color: var(--fab-accent);
  }

  .ingredient-set-card__option.unsatisfied i.fa-times-circle {
    color: var(--fab-warning);
  }

  .ingredient-set-card__option-type-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ingredient-set-card__option-type-badge--essence {
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }

  .ingredient-set-card__option-type-badge--tag {
    background: var(--fab-purple-soft);
    color: var(--fab-purple);
  }

  .ingredient-set-card__option-type-badge--catalyst {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
  }

  .ingredient-set-card__option-label {
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ingredient-set-card__option-counts {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .ingredient-set-card__source {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--fab-text-muted);
    border: 1px solid var(--fab-border);
    border-radius: 3px;
    padding: 1px 4px;
    background: var(--fab-surface-raised);
  }

  .ingredient-set-card__source--missing {
    color: var(--fab-warning);
    border-color: var(--fab-warning);
    background: var(--fab-warning-soft);
  }
</style>
