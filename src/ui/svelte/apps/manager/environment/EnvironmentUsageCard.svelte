<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the existing InspectorCard member for exactly the gathering task and event inspectors (issue 1851); it adds no vocabulary of its own, so it is not a primitive candidate. -->
<!--
  The "Used in environments" card a gathering task or event inspector draws for its selected
  record: one tile per environment that references it, or a muted line when none does (issue 1851).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `subject` | `'task'` \| `'event'` | required | Selects one frozen hook family in `HOOKS`; every class and `data-*` hook the card draws comes from it. |
  | `environments` | array | `[]` | The environments that reference the record, each read by `environmentImage` and `environmentName`. |
  | `environmentImage` | `(environment) => string` | `() => ''` | Thumbnail URL for one tile. |
  | `environmentName` | `(environment) => string` | `() => ''` | Label for one tile, also its `title`. |
  | `titleKey` | lang key | required | The card heading's key; the caller spells it out so the localization scanner reads it. |
  | `emptyKey` | lang key | required | The empty-state line's key, with the same caller-side spelling rule. |

  Rest spread:
  - None. The card is a leaf; the surrounding inspector owns its placement and the selectors in
    `styles/fabricate-manager-rail-gathering.css` match the hooks in `HOOKS` by name.

  Invariants:
  - The `task` and `event` hook families are a frozen table, not interpolated names, so each
    hook is a literal that the stylesheet and the mounted tests can find by grep.
    Pinned by `tests/components/gathering-task-editor-summary.test.js` and
    `tests/components/gathering-events-browser.test.js`.
-->
<script>
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';

  const HOOKS = Object.freeze({
    task: Object.freeze({
      card: 'manager-task-environment-usage-card',
      cardAttr: 'data-task-environment-usage',
      emptyAttr: 'data-task-environment-usage-empty',
      chipsAttr: 'data-task-environment-usage-chips',
      grid: 'manager-task-environment-usage-grid',
      tile: 'manager-task-environment-usage-card',
      thumb: 'manager-task-environment-usage-thumb',
      name: 'manager-task-environment-usage-name',
    }),
    event: Object.freeze({
      card: 'manager-event-environment-usage-card',
      cardAttr: 'data-event-environment-usage',
      emptyAttr: 'data-event-environment-usage-empty',
      chipsAttr: 'data-event-environment-usage-chips',
      grid: 'manager-event-environment-usage-grid',
      tile: 'manager-event-environment-usage-card',
      thumb: 'manager-event-environment-usage-thumb',
      name: 'manager-event-environment-usage-name',
    }),
  });

  let {
    subject,
    environments = [],
    environmentImage = () => '',
    environmentName = () => '',
    titleKey,
    emptyKey,
  } = $props();

  const hooks = $derived(HOOKS[subject]);
  const cardAttrs = $derived({ [hooks.cardAttr]: '' });
  const emptyAttrs = $derived({ [hooks.emptyAttr]: '' });
  const chipsAttrs = $derived({ [hooks.chipsAttr]: '' });
</script>

<!-- ratchet-exempt(design-system): the spread carries exactly one `data-*` hook, the subject's `cardAttr` from the frozen HOOKS table, and nothing else. -->
<InspectorCard class={hooks.card} {...cardAttrs}>
  <h3 class="manager-card-title">
    {localizeOr(titleKey, 'Used in environments')}
  </h3>
  {#if environments.length === 0}
    <p class="manager-muted" {...emptyAttrs}>
      {localizeOr(emptyKey, 'Not used in any environments yet.')}
    </p>
  {:else}
    <div class={hooks.grid} {...chipsAttrs}>
      {#each environments as environment (environment.id)}
        <article class={hooks.tile}>
          <img class={hooks.thumb} src={environmentImage(environment)} alt="" />
          <span class={hooks.name} title={environmentName(environment)}
            >{environmentName(environment)}</span
          >
        </article>
      {/each}
    </div>
  {/if}
</InspectorCard>
