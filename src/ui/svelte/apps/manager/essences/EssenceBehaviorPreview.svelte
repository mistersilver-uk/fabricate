<!-- Svelte 5 runes mode -->
<!--
  What an essence DOES — the editor's live preview panel, and the browser inspector's
  ON CRAFT list (issue 1036).

  ONE component for both, because they are one list. The delta is explicit that
  `EssenceBrowserInspector` renders this rather than re-authoring the same three facts a
  second time; the difference between the two sites is the surrounding CHROME (the "How it
  appears" card and the live-update note), which the inspector suppresses through
  `showIdentity` / `showLiveNote`. There is no third `is-embedded` treatment: it declared
  the base rule's own `gap` and its comment described removing padding this block never had,
  so it changed nothing.

  ── "HOW IT APPEARS" MOUNTS THE REAL PLAYER TILE, NOT A CHIP (issue 1036, round 3) ──
  The maintainer's note: the schematic swatch-chips ("On a component", "As a recipe input")
  described the essence rather than showing it. This card now mounts the REAL player
  `InventoryItemCard` twice — once for the essence's own inventory tile, and once for a fake
  carrying component (a core Foundry icon item that carries the essence as a pip) — from
  synthetic rows built by the pure `buildEssencePreviewRow`, the same "feed the real player
  component a synthetic row so the preview can never drift" pattern `RecipeItemEditor` uses
  for its "How players see it" rail. Both mounts pass `interactive={false}` (issue 1036,
  round 4): `onSelect`/`onBulkToggle` are never wired here, and the card's real button is
  focusable and keyboard-operable, so left interactive it would drop two no-op traps into
  the editor's tab order.

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
  import IconFactRow from '../IconFactRow.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
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
    sampleComponentName = '',
    showIdentity = true,
    showLiveNote = true,
    // Whether the rules list titles ITSELF. In the editor's rail it must, because three
    // other kickers precede it. In the browser inspector the enclosing card already carries
    // an `On craft` heading, so the kicker rendered a second heading immediately under the
    // first for one list — which is the prototype's ONE `ON CRAFT` kicker drawn twice.
    showEffectiveKicker = true,
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
      { effectTransferEnabled, propertyMacrosEnabled, sourceName, macroName },
      text,
      format
    )
  );

  // The two synthetic rows the "How players see it" card mounts on the REAL player
  // `InventoryItemCard`. The carrying component's display name is the essence's first real
  // carrier when one exists (`sampleComponentName`), and the schematic fallback otherwise.
  const previewRows = $derived(
    buildEssencePreviewRow(
      {
        id: essence?.id,
        name,
        icon: essence?.icon || 'fas fa-mortar-pestle',
        colorToken: essence?.colorToken || null,
      },
      {
        sampleComponentName:
          sampleComponentName ||
          text('FABRICATE.Admin.Manager.Essence.Preview.SampleComponent', 'a carrying component'),
      }
    )
  );
</script>

<aside
  class="manager-essence-preview"
  data-essence-behavior-preview
  aria-label={text('FABRICATE.Admin.Manager.Essence.Preview.Label', 'Essence behaviour preview')}
>
  {#if showIdentity}
    <div class="manager-essence-preview-appears-head">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Essence.Preview.Kicker', 'How players see it')}
      </p>
      {#if disabled}
        <StatusPill
          tone="neutral"
          icon="fas fa-circle-pause"
          label={text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')}
        />
      {/if}
    </div>

    <!-- The REAL player tiles, fed synthetic rows — so the preview can never drift from
         what a player actually sees. LEFT: the essence's own inventory tile. RIGHT: a fake
         component (a core Foundry icon item) carrying the essence as a pip. -->
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
  {/if}

  {#if showEffectiveKicker}
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Essence.Preview.Effective', 'Effective behaviour')}
    </p>
  {/if}
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

  /* The "How players see it" header carries the kicker and, for a disabled essence, the
     Disabled pill that used to sit inside the retired identity well. */
  .manager-essence-preview-appears-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* Two real player tiles side by side — the essence's inventory tile and a fake carrying
     component — each in a labelled cell. They wrap to one column when the rail is narrow. */
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

  /* The mounted `InventoryItemCard` fills its player grid slot with `width: 100%`; the cap
     keeps the ~98px player thumbnail from stretching to the full rail width in this
     schematic context, so it reads as a sample tile rather than a hero image. */
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
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-overlay-light-03);
    color: var(--fab-text-muted);
    font-size: 0.7rem;
  }
</style>
