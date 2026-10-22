<!--
  The empty environment list's three first steps: create an environment, or open the Tasks or
  Events tab to prepare the building blocks an environment attaches.

  Props: onCreateEnvironment(), onReviewTasks(), onReviewEvents().
-->
<script>
  import Button from '../../../components/Button.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';

  let {
    onCreateEnvironment = () => {},
    onReviewTasks = () => {},
    onReviewEvents = () => {},
  } = $props();
</script>

<div class="manager-action-group">
  <Button role="primary" onclick={onCreateEnvironment}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    <span>{localizeOr('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span>
  </Button>
  <Button onclick={onReviewTasks}>
    <i class="fas fa-list-check" aria-hidden="true"></i>
    <span
      >{localizeOr(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenTasks',
        'Review tasks'
      )}</span
    >
  </Button>
  <Button onclick={onReviewEvents}>
    <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
    <span
      >{localizeOr(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenEvents',
        'Review events'
      )}</span
    >
  </Button>
</div>
