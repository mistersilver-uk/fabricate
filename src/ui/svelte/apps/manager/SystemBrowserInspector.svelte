<!-- Svelte 5 runes mode -->
<!--
  The systems library inspector: the selected system's identity, counts, enabled features and
  per-system gathering condition shortcuts, or the loading, first-run and no-selection states
  when there is no system to show (issue 1721).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `store` | the admin store | — | its `updateGatheringConditions` is what a shortcut writes |
  | `selectedSystem` | system view or `null` | `null` | the shell's selected system |
  | `selectedSystemId` | `string` | `''` | the id a shortcut persists against |
  | `selectedCounts` | counts record | `{}` | the shell's counts, which the Counts card reads |
  | `systemsLoading` | `boolean` | `false` | startup is still pending |
  | `systems` | system rows or `null` | `[]` | an empty library draws the first-run card |
  | `gatheringConfig` | gathering config or `null` | `null` | the world conditions and vocabularies |
  | `resolutionModeLabel` | `(mode) => string` | — | the shell's label, which its titlebar shares |

  Invariants:
  - The top level is the branch chain itself, with no wrapper element and no `<style>`, so every
    card stays a direct flex child of the shell's `aside.manager-inspector`.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    store,
    selectedSystem = null,
    selectedSystemId = '',
    selectedCounts = {},
    systemsLoading = false,
    systems = [],
    gatheringConfig = null,
    resolutionModeLabel,
  } = $props();

  const selectedCountFacts = $derived(buildSelectedCountFacts(selectedCounts));
  const enabledFeatureLabels = $derived(featureLabels(selectedSystem));
  const selectedGatheringConditionShortcuts = $derived(
    buildSelectedGatheringConditionShortcuts(selectedSystem, gatheringConfig)
  );

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function updateSelectedGatheringCondition(kind, value) {
    if (!selectedSystemId || !kind) return;
    store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
  }

  function featureLabels(system) {
    if (!system?.features) return [];
    const featureMap = [
      ['gathering', 'FABRICATE.Admin.Manager.Feature.Gathering', 'Gathering'],
      ['essences', 'FABRICATE.Admin.Manager.Feature.Essences', 'Essences'],
      [
        'multiStepRecipes',
        'FABRICATE.Admin.Manager.Feature.MultiStepRecipes',
        'Multi-step recipes',
      ],
      ['craftingChecks', 'FABRICATE.Admin.Manager.Feature.CraftingChecks', 'Crafting checks'],
      ['outcomeRouting', 'FABRICATE.Admin.Manager.Feature.OutcomeRouting', 'Outcome routing'],
      ['effectTransfer', 'FABRICATE.Admin.Manager.Feature.EffectTransfer', 'Effect transfer'],
      ['propertyMacros', 'FABRICATE.Admin.Manager.Feature.PropertyMacros', 'Property macros'],
    ];
    return featureMap
      .filter(([key]) => system.features[key] === true)
      .map(([, key, fallback]) => text(key, fallback));
  }

  function buildSelectedCountFacts(counts) {
    const offLabel = text('FABRICATE.Admin.Manager.Off', 'Off');
    return [
      {
        id: 'components',
        label: text('FABRICATE.Admin.Manager.Column.Components', 'Components'),
        value: counts.components,
      },
      {
        id: 'recipes',
        label: text('FABRICATE.Admin.Manager.Column.Recipes', 'Recipes'),
        value: counts.recipes,
      },
      counts.environments == null
        ? {
            id: 'environments',
            label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
            value: offLabel,
            isOff: true,
          }
        : {
            id: 'environments',
            label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
            value: counts.environments,
          },
      {
        id: 'essences',
        label: text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences'),
        value: counts.essences,
      },
      {
        id: 'item-tags',
        label: text('FABRICATE.Admin.Manager.Feature.ItemTags', 'Item tags'),
        value: counts.itemTags,
      },
      {
        id: 'recipe-categories',
        label: text('FABRICATE.Admin.Manager.Feature.RecipeCategories', 'Recipe categories'),
        value: counts.recipeCategories,
      },
    ];
  }

  function buildSelectedGatheringConditionShortcuts(system, gatheringConfig) {
    if (system?.features?.gathering !== true) return [];
    const systemConditions = gatheringConfig?.systems?.[system.id]?.conditions || {};
    return [
      {
        kind: 'timeOfDay',
        icon: 'fas fa-clock',
        label: text('FABRICATE.Admin.Manager.CurrentTimeOfDay', 'Current time of day'),
        setting: systemConditions.timeOfDay || {
          enabled: true,
          current: gatheringConfig?.conditions?.timeOfDay || 'day',
          values: gatheringConfig?.vocabularies?.timeOfDay || [],
        },
      },
      {
        kind: 'weather',
        icon: 'fas fa-cloud-sun',
        label: text('FABRICATE.Admin.Manager.CurrentWeather', 'Current weather'),
        setting: systemConditions.weather || {
          enabled: true,
          current: gatheringConfig?.conditions?.weather || 'clear',
          values: gatheringConfig?.vocabularies?.weather || [],
        },
      },
    ].filter(
      (condition) =>
        condition.setting?.enabled !== false && conditionValues(condition.setting).length > 0
    );
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionValues(setting) {
    return Array.isArray(setting?.values) ? setting.values : [];
  }

  function countLabelParts(label) {
    const normalized = String(label ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const firstSpace = normalized.indexOf(' ');
    if (firstSpace === -1) return { lead: normalized, rest: '' };
    return {
      lead: normalized.slice(0, firstSpace),
      rest: normalized.slice(firstSpace + 1),
    };
  }
</script>

{#if selectedSystem}
  <section class="fabricate-card manager-inspector-card">
    <div class="manager-inspector-title-row is-hero-large">
      <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
        <i class="fas fa-layer-group"></i>
      </span>
      <div class="manager-inspector-copy">
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.Column.System', 'System')}
        </p>
        <h2 class="manager-inspector-name" title={selectedSystem.name}>
          {selectedSystem.name}
        </h2>
        <div class="manager-chip-row">
          <Chip tone="active">{resolutionModeLabel(selectedSystem.resolutionMode)}</Chip>
          <Chip tone={selectedSystem.enabled === false ? 'disabled' : 'active'}>
            {selectedSystem.enabled === false
              ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
              : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
          </Chip>
        </div>
      </div>
    </div>

    <p class="manager-muted">
      {selectedSystem.description ||
        text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
  </section>

  <section class="fabricate-card manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Counts', 'Counts')}</h3>
    <div class="manager-fact-grid">
      {#each selectedCountFacts as fact (fact.id)}
        {@const labelParts = countLabelParts(fact.label)}
        <div class="manager-fact" class:is-off={fact.isOff} data-count-id={fact.id}>
          {#if fact.isOff}
            <span class="manager-fact-line">
              <span class="manager-fact-label">{fact.label}</span>
              <strong class="is-disabled">{fact.value}</strong>
            </span>
          {:else}
            <!-- prettier-ignore -->
            <span class="manager-fact-line">
              <!-- `{' '}` is the separator between the leading span and the trailing label: -->
              <!-- a literal space is the first token inside the `{#if}` and Svelte trims -->
              <!-- block-leading whitespace, so the two would run together. -->
              <!-- The fence above preserves the LINE ANCHOR of the directive below, not -->
              <!-- the render (issue 923): Prettier splits the line below across three, -->
              <!-- which moves the mustache off the line the directive is anchored to, -->
              <!-- and the suppression stops applying. The durable guard for this whole -->
              <!-- class is `reportUnusedDisableDirectives: 'error'` in eslint.config.js. -->
              <!-- eslint-disable-next-line svelte/no-useless-mustaches -->
              <span class="manager-fact-leading"><strong>{fact.value}</strong> {labelParts.lead}</span>{#if labelParts.rest}{' '}<span class="manager-fact-label">{labelParts.rest}</span>{/if}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <section
    class="fabricate-card manager-inspector-card"
    aria-label={text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}
  >
    <h3 class="manager-card-title">
      {text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}
    </h3>
    {#if enabledFeatureLabels.length > 0}
      <div class="manager-feature-list">
        {#each enabledFeatureLabels as feature (feature)}
          <Chip tone="active">{feature}</Chip>
        {/each}
      </div>
    {:else}
      <p class="manager-muted">
        {text('FABRICATE.Admin.Manager.NoOptionalFeatures', 'No optional features enabled.')}
      </p>
    {/if}
  </section>

  {#if selectedGatheringConditionShortcuts.length > 0}
    <section
      class="fabricate-card manager-inspector-card manager-condition-shortcut-card"
      data-systems-gathering-conditions
      aria-label={text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}
    >
      <h3 class="manager-card-title">
        {text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}
      </h3>
      <div class="manager-condition-shortcut-list">
        {#each selectedGatheringConditionShortcuts as condition (condition.kind)}
          <label
            class="fabricate-field manager-field manager-condition-shortcut"
            data-systems-gathering-condition={condition.kind}
          >
            <span class="manager-condition-shortcut-label">
              <i class={condition.icon} aria-hidden="true"></i>
              <span>{condition.label}</span>
            </span>
            <select
              value={condition.setting.current}
              onchange={(event) =>
                updateSelectedGatheringCondition(condition.kind, event.currentTarget.value)}
            >
              {#each conditionValues(condition.setting) as option (conditionId(option))}
                <option value={conditionId(option)}>{conditionLabel(option)}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>
    </section>
  {/if}
{:else if systemsLoading}
  <section
    class="manager-setup-card"
    aria-label={text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}
  >
    <div class="manager-setup-card-header">
      <i class="fas fa-spinner" aria-hidden="true"></i>
      <div>
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.LoadingSystemsKicker', 'Startup')}
        </p>
        <h3>
          {text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}
        </h3>
      </div>
    </div>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.LoadingSystemsHint',
        'Fabricate is finishing startup before the system library is shown.'
      )}
    </p>
  </section>
{:else if (systems || []).length === 0}
  <section
    class="manager-setup-card"
    aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}
  >
    <div class="manager-setup-card-header">
      <i class="fas fa-compass" aria-hidden="true"></i>
      <div>
        <p class="manager-kicker">
          {text('FABRICATE.Admin.Manager.EmptySetup.Kicker', 'First run')}
        </p>
        <h3>
          {text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}
        </h3>
      </div>
    </div>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.EmptySetup.Hint',
        'Create a crafting system, add item-backed components, then build recipes from those components.'
      )}
    </p>
    <ol class="manager-setup-list">
      <li>
        {text(
          'FABRICATE.Admin.Manager.EmptySetup.StepSystem',
          'Create a system for one crafting discipline or ruleset.'
        )}
      </li>
      <li>
        {text(
          'FABRICATE.Admin.Manager.EmptySetup.StepComponents',
          'Import world or compendium items as reusable components.'
        )}
      </li>
      <li>
        {text(
          'FABRICATE.Admin.Manager.EmptySetup.StepRecipes',
          'Add recipes that consume components and award results.'
        )}
      </li>
    </ol>
    <div
      class="manager-setup-links"
      aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Resources', 'Resources')}
    >
      <ManagerButton
        tag="a"
        href="https://mistersilver-uk.github.io/fabricate/help/quickstart"
        target="_blank"
        rel="noreferrer"
      >
        <i class="fas fa-book-open" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.EmptySetup.Quickstart', 'Quickstart')}</span>
      </ManagerButton>
      <ManagerButton
        tag="a"
        href="https://mistersilver-uk.github.io/fabricate"
        target="_blank"
        rel="noreferrer"
      >
        <i class="fas fa-circle-question" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.EmptySetup.Docs', 'Docs')}</span>
      </ManagerButton>
    </div>
  </section>
{:else}
  <EmptyState
    icon="fas fa-arrow-pointer"
    title={text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}
    hint={text(
      'FABRICATE.Admin.Manager.InspectorHint',
      'The inspector shows counts, resolution mode, and enabled features for the selected system.'
    )}
  />
{/if}
