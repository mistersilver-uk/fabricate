<!-- Svelte 5 runes mode -->
<!--
  What an essence DOES — the editor's live preview panel, and the browser inspector's
  ON CRAFT list (issue 1036).

  ONE component for both, because they are one list. The delta is explicit that
  `EssenceBrowserInspector` renders this rather than re-authoring the same three facts a
  second time; the difference between the two sites is the surrounding CHROME (the "How it
  appears" header, the two sample previews and the live-update note), which the inspector
  suppresses through `showIdentity` / `showLiveNote`.

  ── SUPPRESSION IS RENDERED, NOT REMOVED ──────────────────────────────────────────
  For a DISABLED essence each behaviour row still renders and states that it will not run.
  A removed row would say "this essence has no macro", which is a different and false fact.
  The arithmetic row comes first and is never suppressed: a disabled essence still matches,
  accumulates and is consumed, which is the one thing the behaviour gate does not change.

  This panel deliberately says NOTHING about stacking. The two suppressions differ in
  exactly one observable way — `transfersEffects` is computed before the essence walk and
  is not narrowed by enabled-ness, so an all-disabled craft on a transferring recipe still
  declines to stack — and claiming the outcomes are identical would be untrue.
-->
<script>
  import Chip from '../Chip.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { managerColorTokenLabel } from '../../../util/managerColorTokens.js';
  import { projectEssenceBehaviourFacts } from './essenceStudio.js';

  let {
    essence = null,
    effectTransferEnabled = false,
    propertyMacrosEnabled = false,
    sourceName = '',
    macroName = '',
    sampleComponentName = '',
    showIdentity = true,
    showLiveNote = true,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data)) {
      result = result.replace(`{${token}}`, String(value));
    }
    return result;
  }

  const disabled = $derived(essence?.enabled === false);
  const name = $derived(
    essence?.name || text('FABRICATE.Admin.Manager.Essence.Untitled', 'Untitled essence')
  );
  const colourName = $derived(
    essence?.colorToken
      ? managerColorTokenLabel(essence.colorToken, localize)
      : text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')
  );
  const facts = $derived(
    projectEssenceBehaviourFacts(
      essence,
      { effectTransferEnabled, propertyMacrosEnabled, sourceName, macroName },
      text,
      format
    )
  );
</script>

<aside
  class="manager-essence-preview"
  class:is-embedded={!showIdentity}
  data-essence-behavior-preview
  aria-label={text('FABRICATE.Admin.Manager.Essence.Preview.Label', 'Essence behaviour preview')}
>
  {#if showIdentity}
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Essence.Preview.Kicker', 'How it appears')}
    </p>
    <div class="manager-essence-preview-identity" data-essence-preview-identity>
      <Medallion
        icon={essence?.icon || 'fas fa-mortar-pestle'}
        tint={essence?.colorToken || ''}
        size={44}
      />
      <div class="manager-essence-preview-copy">
        <h3 title={name}>{name}</h3>
        <p class="manager-muted">{colourName}</p>
      </div>
      {#if disabled}
        <StatusPill
          tone="neutral"
          icon="fas fa-circle-pause"
          label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
        />
      {/if}
    </div>

    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Essence.Preview.OnAComponent', 'On a component')}
    </p>
    <!-- A sample of what the essence looks like where a GM meets it most: as a quantity
         chip on a component. The chip carries the essence's own colour, which is the
         change's whole visual point. -->
    <div class="manager-essence-preview-sample" data-essence-preview-component>
      <Chip tone="neutral" swatch={essence?.colorToken || ''} icon={essence?.icon || undefined}>
        {format('FABRICATE.Admin.Manager.Essence.Preview.SampleQuantity', '{name} ×2', {
          name,
        })}
      </Chip>
      <span class="manager-muted"
        >{sampleComponentName ||
          text(
            'FABRICATE.Admin.Manager.Essence.Preview.SampleComponent',
            'a carrying component'
          )}</span
      >
    </div>
  {/if}

  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Essence.Preview.Effective', 'Effective behaviour')}
  </p>
  <ul class="manager-essence-preview-rules">
    {#each facts as fact (fact.id)}
      <li data-essence-preview-rule={fact.id} data-essence-preview-suppressed={fact.suppressed}>
        <IconFactRow icon={fact.icon} title={fact.title} subtitle={fact.subtitle} />
      </li>
    {/each}
  </ul>

  {#if showLiveNote}
    <aside class="manager-essence-preview-live" data-essence-preview-live>
      <i class="fas fa-circle-check" aria-hidden="true"></i>
      <span
        >{text(
          'FABRICATE.Admin.Manager.Essence.Preview.LiveUpdate',
          'This preview updates live as you edit.'
        )}</span
      >
    </aside>
  {/if}
</aside>

<style>
  .manager-essence-preview {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* Embedded in the inspector: no panel padding of its own, because the inspector card it
     sits inside already supplies it. */
  .manager-essence-preview.is-embedded {
    gap: var(--fab-space-2);
  }

  .manager-essence-preview-identity {
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-03);
  }

  .manager-essence-preview-copy {
    min-width: 0;
  }

  .manager-essence-preview-copy h3 {
    overflow: hidden;
    margin: 0;
    font-size: 0.9rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-essence-preview-copy p {
    margin: 0;
    font-size: 0.7rem;
  }

  .manager-essence-preview-sample {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 0.7rem;
  }

  .manager-essence-preview-rules {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A suppressed row is dimmed as well as re-worded. The words carry the state; the
     dimming only reinforces them, exactly as the library row's Disabled pill does. */
  .manager-essence-preview-rules li[data-essence-preview-suppressed='true'] {
    opacity: 0.72;
  }

  .manager-essence-preview-live {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-03);
    color: var(--fab-text-muted);
    font-size: 0.7rem;
  }
</style>
