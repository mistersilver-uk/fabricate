<!-- Svelte 5 runes mode -->
<!--
  What an essence DOES — the editor's live preview panel, and the browser inspector's
  ON CRAFT list (issue 1036).

  TWO CALLERS, ONE SHAPE: the system-scope essence rules editor's rail and the world essence
  entry editor's preview panel. Both are EDITORS, both draw the whole panel, and the only thing
  that differs between them is which layer the two behaviour rows are worded for — `scope`.

  ── THE THREE SUPPRESSION PROPS ARE GONE (issue 1372, maintainer parity round 8) ───
  `showIdentity`, `showLiveNote` and `showEffectiveKicker` existed for ONE caller,
  `EssenceBrowserInspector`, which rendered this panel with all three off. That rail now draws
  the reference's `ON CRAFT IN <system>` cards instead — resolved values with the layer each came
  from, which is a different question from this panel's facts — so all three props had exactly no
  caller left. Configuration that cannot be reached is not a capability, and a prop kept "in case"
  is the shape the design-system spec refuses; a future embedder that genuinely needs one adds it
  back with its call site in the same change.

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
    // WHICH LAYER THIS PANEL DESCRIBES (issue 1372, maintainer parity round 8). `'world'` words
    // the two behaviour rows as the reference words them on the world essence entry — `Default
    // effects from X` over `Systems that inherit copy these onto anything crafted with it` — so
    // a GM editing a record every crafting system resolves against is told so on the one panel
    // that shows them the consequence. `'system'` keeps the shipped wording verbatim.
    scope = 'system',
    // THIS SYSTEM'S PER-SECTION INHERIT MAP, or `null` when there is no membership record. With
    // it the two behaviour rows become the reference's resolved-rule cards — named after the
    // value and ending in the layer — which is what the system rules EDITOR rail draws. Without
    // it they keep the shipped capability wording, because there is no layer to attribute.
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
  <div class="manager-essence-preview-appears-head">
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Essence.Preview.Kicker', 'How players see it')}
    </p>
    {#if disabled}
      <StatusPill
        tone="subtle"
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

  /* A MATCHED PAIR, AND IT TAKES A RULE TO MAKE THEM ONE (issue 1372, maintainer parity round 8).

     The reference draws two identical tiles with their captions below them and their bottom
     edges level (`tmp/proto/essence-entry.png`). Measured on `world-essence-entry`, the two cells
     were the same 149x196 and the two cards the same 132 wide — and 154px against 169px TALL,
     because `InventoryItemCard`'s name wraps and one of the two names is three words. So the
     right tile's caption sat lower than the left's, its frame ran deeper, and the pair read as
     two differently-sized samples rather than as one before/after.

     The name is clamped to ONE line here rather than in `InventoryItemCard`, which is the PLAYER
     grid's card: there a wrapped two-line name is correct and the whole grid wraps with it. What
     is specific to this panel is that exactly two of them stand side by side as a comparison, so
     the equality is a property of the comparison and not of the card.

     `:global()` because the element belongs to `InventoryItemCard`, scoped under this panel's own
     class so it reaches no other mount of that component. */
  .manager-essence-preview-card :global(.inventory-card-name) {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    text-overflow: ellipsis;
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
    border-radius: 8px;
    background: var(--fab-overlay-light-03);
    color: var(--fab-text-muted);
    font-size: 0.7rem;
  }
</style>
