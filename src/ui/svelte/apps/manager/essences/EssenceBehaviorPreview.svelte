<!--
  What an essence DOES — the editor's live preview panel. TWO CALLERS, ONE SHAPE: the system-scope
  rules editor's rail and the world entry editor's preview panel. Both are EDITORS drawing the whole
  panel, and `scope` is the only thing that differs — which layer the two behaviour rows are worded
  for. It carries no suppression props: the one caller that rendered it with its identity, live note
  and kicker all off now draws the `ON CRAFT IN <system>` cards instead, so configuration that
  cannot be reached was removed rather than kept "in case".

  "HOW IT APPEARS" MOUNTS THE REAL PLAYER TILE, NOT A CHIP: schematic swatch-chips described the
  essence rather than showing it. It mounts the REAL `InventoryItemCard` twice — the essence's own
  inventory tile, and a carrying component — from synthetic rows built by the pure
  `buildEssencePreviewRow`, the same pattern `RecipeItemEditor` uses so a preview cannot drift. Both
  pass `interactive={false}`, because the card's real button is focusable and no handler is wired
  here, so left interactive it would drop two no-op traps into the editor's tab order.

  SUPPRESSION IS RENDERED, NOT REMOVED: a disabled essence's behaviour rows still render and state
  that they will not run, where a removed row would say "this essence has no macro", a different and
  false fact. The arithmetic row comes first and is never suppressed. The panel says NOTHING about
  stacking, because the two suppressions differ in exactly one observable way and claiming the
  outcomes are identical would be untrue.
-->
<script>
  import IconFactRow from '../IconFactRow.svelte';
  import Chip from '../../../components/Chip.svelte';
  import InventoryItemCard from '../../inventory/InventoryItemCard.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { buildEssencePreviewRow } from '../../../util/essencePreviewRow.js';
  import { projectEssenceBehaviourFacts } from './essenceStudio.js';

  let {
    essence = null,
    effectTransferEnabled = false,
    propertyMacrosEnabled = false,
    sourceName = '',
    macroName = '',
    previewCarrier = null,
    // WHICH LAYER THIS PANEL DESCRIBES. `'world'` words the two behaviour rows as defaults with
    // an inheritance clause, so a GM editing a record every system resolves against is told so;
    // `'system'` keeps the shipped wording verbatim.
    scope = 'system',
    // THIS SYSTEM'S PER-SECTION INHERIT MAP, or `null` with no membership record. With it the two
    // rows become resolved-rule cards named after the value and ending in the layer; without it
    // they keep the capability wording, because there is no layer to attribute.
    inherited = null,
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
  const facts = $derived(
    projectEssenceBehaviourFacts(
      essence,
      { effectTransferEnabled, propertyMacrosEnabled, sourceName, macroName, scope, inherited },
      text,
      format
    )
  );

  // The carrying component's name and art come from the same world-wide carrier object.
  const previewRows = $derived(
    buildEssencePreviewRow(
      {
        id: essence?.id,
        name,
        icon: essence?.icon || 'fas fa-mortar-pestle',
        colorToken: essence?.colorToken || null,
      },
      {
        previewCarrier,
        fallbackComponentName: text(
          'FABRICATE.Admin.Manager.Essence.Preview.InventoryTileName',
          'Inventory tile'
        ),
      }
    )
  );
</script>

<aside
  class="manager-essence-preview"
  data-essence-behavior-preview
  aria-label={text('FABRICATE.Admin.Manager.Essence.Preview.Label', 'Essence behaviour preview')}
>
  <div class="manager-essence-preview-appears-head">
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Essence.Preview.Kicker', 'How players see it')}
    </p>
    {#if disabled}
      <Chip tone="subtle" icon="fas fa-circle-pause"
        >{text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}</Chip
      >
    {/if}
  </div>

  <!-- The REAL player tiles, fed synthetic rows so the preview cannot drift: the essence's own
         inventory tile, and a component carrying the essence as a pip. -->
  <div class="manager-essence-preview-appears" data-essence-preview-appears>
    <div class="manager-essence-preview-appears-cell" data-essence-preview-tile>
      <span class="manager-muted"
        >{text(
          'FABRICATE.Admin.Manager.Essence.Preview.InventoryTile',
          'As an inventory tile'
        )}</span
      >
      <div class="manager-essence-preview-card">
        <InventoryItemCard item={previewRows.essence} interactive={false} />
      </div>
    </div>
    <div class="manager-essence-preview-appears-cell" data-essence-preview-component>
      <span class="manager-muted"
        >{text('FABRICATE.Admin.Manager.Essence.Preview.OnAComponent', 'On a component')}</span
      >
      <div class="manager-essence-preview-card">
        <InventoryItemCard item={previewRows.component} interactive={false} />
      </div>
    </div>
  </div>

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

  <!-- Both callers are editors whose preview recomputes on every keystroke, so both say so. -->
  <aside class="manager-essence-preview-live" data-essence-preview-live>
    <i class="fas fa-circle-check" aria-hidden="true"></i>
    <span
      >{text(
        'FABRICATE.Admin.Manager.Essence.Preview.LiveUpdate',
        'This preview updates live as you edit.'
      )}</span
    >
  </aside>
</aside>

<style>
  .manager-essence-preview {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The "How players see it" header carries the kicker and, for a disabled essence, the
     Disabled pill that used to sit inside the retired identity well. */
  .manager-essence-preview-appears-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* Two real player tiles side by side, each in a labelled cell, wrapping to one column. */
  .manager-essence-preview-appears {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--fab-space-3);
  }

  .manager-essence-preview-appears-cell {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    font-size: 0.7rem;
  }

  /* The mounted card stretches across its grid cell, so the cap keeps the thumbnail from
     stretching to the rail's width and reading as a hero image. The card keeps its name to one
     line itself (issue 1778), so the two samples stand the same height. */
  .manager-essence-preview-card {
    max-width: 132px;
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
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-overlay-light-03);
    color: var(--fab-text-muted);
    font-size: 0.7rem;
  }
</style>
