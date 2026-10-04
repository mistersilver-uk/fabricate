<!-- Svelte 5 runes mode -->
<script>
  import { localize, viewScene } from '../../../util/foundryBridge.js';
  import Chip from '../../../components/Chip.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { countReadiness, evaluateEnvironmentReadiness } from './environmentReadiness.js';
  import { linkedScene } from './linkedScene.svelte.js';

  let { environment = null, composition = { counts: {} } } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const counts = $derived(composition?.counts || {});
  const active = $derived(environment?.enabled !== false);
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');
  const compositionMode = $derived(
    environment?.compositionMode === 'manual' ? 'manual' : 'automatic'
  );
  const readiness = $derived(evaluateEnvironmentReadiness(environment || {}, composition || {}));
  // THE SAME TWO NUMBERS THE VALIDATION TAB AND THE TAB BADGE REPORT (issue 1517), through the
  // one accessor all three read. Counting severities here made this card the third answer to one
  // question: an `info` note appeared in the tab's Warnings tile and nowhere on this chip.
  const validationCounts = $derived(countReadiness(readiness));
  const critical = $derived(validationCounts.blocking);
  const warning = $derived(validationCounts.warnings);

  const sceneUuid = $derived(String(environment?.sceneUuid || ''));
  // Read-only (issue 1522): the link is authored on the Overview tab's Linked scene card.
  const scene = linkedScene(() => sceneUuid);
  const sceneLabel = $derived(scene.name || sceneUuid);
</script>

<InspectorCard data-environment-summary-inspector="">
  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.Summary', 'Environment summary')}
  </p>
  <h2 class="manager-inspector-name" title={environment?.name || ''}>
    {environment?.name ||
      text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Unnamed', 'Unnamed environment')}
  </h2>
  <div class="manager-chip-row">
    <Chip tone={active ? 'active' : 'neutral'}
      >{active
        ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
        : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</Chip
    >
    <Chip tone="info"
      >{selectionMode === 'blind'
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind')
        : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}</Chip
    >
    <Chip tone="info"
      >{compositionMode === 'manual'
        ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual')
        : text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic',
            'Automatic'
          )}</Chip
    >
  </div>
</InspectorCard>

<InspectorCard data-environment-summary-scene="">
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Scene', 'Linked scene')}
  </h3>
  {#if sceneUuid}
    <div class="manager-environment-scene-linked is-readonly" data-environment-summary-scene-linked>
      {#if scene.thumb}
        <img class="manager-environment-scene-thumb" src={scene.thumb} alt="" />
      {:else}
        <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"
          ><i class="fas fa-map"></i></span
        >
      {/if}
      <button
        type="button"
        class="manager-environment-scene-name"
        data-rail-route-out
        onclick={() => viewScene(sceneUuid)}
        title={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.OpenScene', 'Open scene')}
        >{sceneLabel}</button
      >
    </div>
  {:else}
    <p class="manager-muted" data-environment-summary-scene-empty>
      {text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.NoLinkedScene', 'No linked scene')}
    </p>
  {/if}
</InspectorCard>

<InspectorCard>
  <h3 class="manager-card-title">
    {text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.ValidationSummary',
      'Validation summary'
    )}
  </h3>
  <!-- THE CHIPS NAME THE POPULATION THEY COUNT (issue 1517). They read `Critical` and `Warning`,
       the domain's SEVERITY words, while counting two severities out of three — so an `info` note
       appeared in neither chip and the Validation tab's own rail contradicted this card. They now
       report the same two numbers the rail and the tab badge do, through the one accessor, and
       take that vocabulary's words: what a GM is being told is how many things BLOCK enabling and
       how many are worth a look, which is not a severity ranking. -->
  <div class="manager-chip-row">
    <Chip tone={critical > 0 ? 'danger' : 'positive'}
      >{text('FABRICATE.Admin.Manager.Validation.CountBlocking', 'Blocking')}: {critical}</Chip
    >
    <Chip tone={warning > 0 ? 'warning' : 'neutral'}
      >{text('FABRICATE.Admin.Manager.Validation.CountWarnings', 'Warnings')}: {warning}</Chip
    >
  </div>
</InspectorCard>

<InspectorCard>
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.RuntimePreview', 'Runtime preview')}
  </h3>
  <div class="manager-fact-grid manager-environment-runtime-grid">
    <div class="manager-fact" data-runtime-fact="available-tasks">
      <span class="manager-fact-line"
        ><strong>{counts.availableTasks || 0}</strong>
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableTasks',
            'Available tasks'
          )}</span
        ></span
      >
    </div>
    <div class="manager-fact" data-runtime-fact="excluded-tasks">
      <span class="manager-fact-line"
        ><strong>{counts.excludedTasks || 0}</strong>
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedTasks',
            'Excluded tasks'
          )}</span
        ></span
      >
    </div>
    <div class="manager-fact" data-runtime-fact="candidate-tasks">
      <span class="manager-fact-line"
        ><strong>{counts.candidateTasks || 0}</strong>
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.CandidateTasks',
            'Task candidates'
          )}</span
        ></span
      >
    </div>
    <div class="manager-fact" data-runtime-fact="available-events">
      <span class="manager-fact-line"
        ><strong>{counts.availableEvents || 0}</strong>
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Inspector.AvailableEvents',
            'Available events'
          )}</span
        ></span
      >
    </div>
    <div class="manager-fact" data-runtime-fact="excluded-events">
      <span class="manager-fact-line"
        ><strong>{counts.excludedEvents || 0}</strong>
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ExcludedEvents',
            'Excluded events'
          )}</span
        ></span
      >
    </div>
    <div class="manager-fact" data-runtime-fact="included-not-matching">
      <span class="manager-fact-line"
        ><strong
          >{(counts.includedNotMatchingTasks || 0) +
            (counts.includedNotMatchingEvents || 0)}</strong
        >
        <span class="manager-fact-label"
          >{text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.IncludedNotMatching',
            'Included, not matching'
          )}</span
        ></span
      >
    </div>
  </div>
</InspectorCard>
