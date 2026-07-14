<!-- Svelte 5 runes mode -->
<!--
  GM system-overview view. Renders the pure `evaluateSystemValidation` report
  (computed in the admin store from the selected system's recipes / environments
  / components) grouped by issue `kind`, with a per-row severity chip and a
  per-kind deep-link button. Each row deep-links to the entity's editor via the
  `onSelectIssue(issue)` callback the root wires to its existing selection
  helpers (`editRecipe` / `editEnvironment` / `editComponent`), mirroring the
  `RecipeValidationTab` deep-link pattern. GM-only by construction: the whole
  crafting manager admin is GM-scoped.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    // `{ issues, counts, blocksSystem }` from `evaluateSystemValidation`.
    report = { issues: [], counts: { critical: 0, warning: 0, info: 0, blockers: 0 }, blocksSystem: false },
    onSelectIssue = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Stable kind order so the system blockers surface first, then per-entity gaps.
  const KIND_ORDER = ['system', 'recipe', 'environment', 'task', 'event', 'salvage'];

  const KIND_LABELS = {
    system: ['GroupSystem', 'System blockers'],
    recipe: ['GroupRecipe', 'Recipes'],
    environment: ['GroupEnvironment', 'Gathering environments'],
    task: ['GroupTask', 'Gathering tasks'],
    event: ['GroupEvent', 'Gathering events'],
    salvage: ['GroupSalvage', 'Component salvage']
  };

  // Per-kind deep-link button labels. The `system` kind is the overview itself,
  // so it carries no deep-link button.
  const KIND_LINK_LABELS = {
    recipe: ['LinkRecipe', 'Open recipe'],
    environment: ['LinkEnvironment', 'Open environment'],
    task: ['LinkTask', 'Open gathering task'],
    event: ['LinkEvent', 'Open gathering event'],
    salvage: ['LinkSalvage', 'Open component']
  };

  // Per-issue-code message. The aggregator carries a stable default string for
  // headless callers; the UI layer maps the code to localized copy here. The
  // `…Task` / `…Event` split is kept distinct (no combined "task or event" copy).
  const ISSUE_LABELS = {
    noName: ['IssueNoName', 'The recipe needs a name.'],
    noIngredientSet: ['IssueNoIngredientSet', 'A step has no ingredient set.'],
    noResultGroup: ['IssueNoResultGroup', 'A step has no result set.'],
    duplicateAlternative: ['IssueDuplicateAlternative', 'An OR group repeats the same match.'],
    duplicateRequirement: ['IssueDuplicateRequirement', 'A set repeats the same ingredient requirement.'],
    requirementOverlap: ['IssueRequirementOverlap', 'Two requirements in a set can be satisfied by the same component.'],
    unroutedResultGroup: ['IssueUnroutedResultGroup', 'A result set is not assigned to any check outcome.'],
    unproducedOutcomeTier: ['IssueUnproducedOutcomeTier', 'A check outcome produces no result set.'],
    disabledIncomplete: ['IssueDisabledIncomplete', 'The recipe is disabled and cannot be enabled until its gaps are fixed.'],
    noAvailableTasks: ['IssueNoAvailableTasks', 'The environment composes no available gathering tasks.'],
    activeNoComposition: ['IssueActiveNoComposition', 'The environment is on but composes no available tasks.'],
    staleIncluded: ['IssueStaleIncluded', 'The environment includes a record that is no longer available.'],
    noScene: ['IssueNoScene', 'The environment has no linked scene.'],
    noEventsAtDanger: ['IssueNoEventsAtDanger', 'The environment carries danger but composes no events.'],
    taskNoDescription: ['IssueTaskNoDescription', 'A gathering task has no description.'],
    locallyExcluded: ['IssueLocallyExcluded', 'Some records are excluded for this environment.'],
    invalidSalvage: ['IssueInvalidSalvage', 'The component salvage is invalid for the current salvage mode.'],
    routedCheckNoFormula: ['IssueRoutedCheckNoFormula', 'This routed system has no crafting check roll formula; recipes that route by the check provider will not resolve until one is configured.'],
    salvageRoutedNoFormula: ['IssueSalvageRoutedNoFormula', 'Routed salvage has no roll formula; salvage will not resolve until one is configured.'],
    salvageRoutedNoTiers: ['IssueSalvageRoutedNoTiers', 'Routed salvage has no outcome tiers; configure salvage outcome tiers so salvage can be routed.'],
    progressiveNoCheck: ['IssueProgressiveNoCheck', 'Progressive mode requires a configured progressive crafting check.'],
    progressiveNoDifficulty: ['IssueProgressiveNoDifficulty', 'Progressive mode requires at least one component with a difficulty of 1 or more.'],
    multiStepInAlchemy: ['IssueMultiStepInAlchemy', 'Multi-step recipes cannot be used while the system is in alchemy mode.'],
    alchemyCheckNoFormula: ['IssueAlchemyCheckNoFormula', 'The alchemy check mode is Simple or Tiered but no crafting check roll formula is configured; no brew can resolve until one is set.'],
    alchemySignatureCollision: ['IssueAlchemySignatureCollision', 'Two recipes share an ingredient signature, so alchemy attempts are ambiguous.']
  };

  const issues = $derived(Array.isArray(report?.issues) ? report.issues : []);
  const counts = $derived(report?.counts || { critical: 0, warning: 0, info: 0, blockers: 0 });

  // Group issues by kind, preserving KIND_ORDER and dropping empty groups.
  const groups = $derived(
    KIND_ORDER
      .map((kind) => ({ kind, issues: issues.filter((issue) => issue.kind === kind) }))
      .filter((group) => group.issues.length > 0)
  );

  function groupLabel(kind) {
    const meta = KIND_LABELS[kind] || [kind, kind];
    return text(`FABRICATE.Admin.Manager.SystemOverview.${meta[0]}`, meta[1]);
  }

  function kindLinkLabel(kind) {
    const meta = KIND_LINK_LABELS[kind];
    if (!meta) return '';
    return text(`FABRICATE.Admin.Manager.SystemOverview.${meta[0]}`, meta[1]);
  }

  function issueMessage(issue) {
    const meta = ISSUE_LABELS[issue.code] || [issue.code, issue.message || issue.code];
    return text(`FABRICATE.Admin.Manager.SystemOverview.${meta[0]}`, meta[1]);
  }

  function severityClass(severity) {
    if (severity === 'critical') return 'is-danger';
    if (severity === 'warning') return 'is-warning';
    return 'is-neutral';
  }

  function severityLabel(severity) {
    return text(`FABRICATE.Admin.Manager.SystemOverview.Severity.${severity}`, severity);
  }

  // Environment-derived issues (environment/task/event) deep-link by selecting
  // the OWNING environment, so they need an `environmentId` to resolve; recipe
  // and salvage issues resolve via their own `entityId`. The `system` kind is
  // the overview itself, so it has no per-row deep link.
  const ENVIRONMENT_KINDS = new Set(['environment', 'task', 'event']);

  function canDeepLink(issue) {
    if (issue.kind === 'system' || !KIND_LINK_LABELS[issue.kind]) return false;
    if (ENVIRONMENT_KINDS.has(issue.kind)) return Boolean(issue.environmentId);
    return Boolean(issue.entityId);
  }
</script>

<main class="manager-main manager-system-overview-main" data-system-overview aria-label={text('FABRICATE.Admin.Manager.SystemOverview.Title', 'System overview')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.SystemOverview.Kicker', 'System overview')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.SystemOverview.Heading', 'Validation overview')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.SystemOverview.Subtitle', 'Review every validation issue across this crafting system and jump straight to the editor that owns each one.')}</p>
    </div>
    <div class="manager-chip-row" data-system-overview-counts>
      <span class="manager-chip is-danger" data-overview-count="critical">{counts.critical} {text('FABRICATE.Admin.Manager.SystemOverview.CountCritical', 'critical')}</span>
      <span class="manager-chip is-warning" data-overview-count="warning">{counts.warning} {text('FABRICATE.Admin.Manager.SystemOverview.CountWarning', 'warnings')}</span>
      <span class="manager-chip is-neutral" data-overview-count="info">{counts.info} {text('FABRICATE.Admin.Manager.SystemOverview.CountInfo', 'notes')}</span>
    </div>
  </section>

  {#if report?.blocksSystem === true}
    <div class="manager-environment-comp-callout manager-system-overview-blocker" role="note" data-system-overview-blocker>
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.SystemOverview.BlockerNote', 'This system has a blocker: players cannot see or use any of its recipes until it is resolved.')}</span>
    </div>
  {/if}

  {#if groups.length === 0}
    <section class="manager-task-core-card" data-system-overview-empty>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.SystemOverview.Empty', 'No validation issues detected. Everything in this system is ready to use.')}</p>
    </section>
  {:else}
    {#each groups as group (group.kind)}
      <section class="manager-task-core-card manager-system-overview-group" data-system-overview-group={group.kind}>
        <h3 class="manager-card-title">{groupLabel(group.kind)} <span class="manager-chip is-neutral">{group.issues.length}</span></h3>
        <ul class="manager-system-overview-list">
          {#each group.issues as issue, index (issue.code + ':' + (issue.entityId ?? '') + ':' + index)}
            <li class="manager-system-overview-row" data-overview-issue={issue.code} data-overview-kind={issue.kind}>
              <span class={`manager-chip ${severityClass(issue.severity)}`} data-overview-severity={issue.severity}>{severityLabel(issue.severity)}</span>
              <span class="manager-system-overview-entity">{issue.entityName}</span>
              <span class="manager-system-overview-message">{issueMessage(issue)}</span>
              {#if canDeepLink(issue)}
                <button
                  type="button"
                  class="manager-button manager-system-overview-link"
                  data-overview-link={issue.kind}
                  onclick={() => onSelectIssue(issue)}
                >
                  {kindLinkLabel(issue.kind)}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</main>
