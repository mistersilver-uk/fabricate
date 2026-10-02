<!--
  The selected-essence inspector, under the BROWSER's directory, which the screenshot evidence map
  globs for the essence views. THREE THINGS ARE RETAINED THAT THE PROTOTYPE DOES NOT DEPICT, each a
  shipped affordance with no replacement: the component-usage THUMB GRID and its click-through, the
  only route from "34 components carry this" to any one of them; copy-source-UUID, unlink-source and
  the `EssenceSourceSelector` drop target, deliberately NOT `ItemDropZone` because an essence source
  is an in-system managed COMPONENT; and the delete-impact note, because the delete is warned.

  ON CRAFT ANSWERS A DIFFERENT QUESTION FROM THE PREVIEW, AND NOW SAYS SO: rendering
  `EssenceBehaviorPreview` here left the rail with NO PROVENANCE on a screen whose whole subject is
  inherit-versus-override. THE SYSTEM ROSTER IS `SystemRulesRoster`, the world catalogue's own panel.
-->
<script>
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import Chip from '../../../components/Chip.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import SystemRulesRoster from '../scoped/SystemRulesRoster.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import { essenceColourName, essenceShortValueName } from '../scoped/essenceScoped.js';
  import { projectEssenceOnCraftCards } from './essenceStudio.js';
  import { resolveMacroName } from '../../../../model/macroReference.js';

  let {
    essence = null,
    showSourceUi = false,
    showPropertyMacroUi = false,
    managedItemOptions = [],
    sourceUuid = '',
    // `systemName` heads the on-craft section, and `inherited` is the per-section inherit map that
    // turns a resolved value into a resolved value AND its layer. `null` with no membership
    // record, which suppresses the layer clause rather than guessing one.
    systemName = '',
    inherited = null,
    // The `SYSTEM RULES n / m` panel's own three facts, threaded from the world-scope join the
    // shell already holds. `systemRows` is that join — one row per crafting system, carrying
    // `member` and `enabled` — never the narrowed `{id, name}` roster, which answers neither.
    systemRows = [],
    memberCount = 0,
    rosterSize = 0,
    onOpenSystemRules = null,
    onEdit = () => {},
    // THE DEEP LINK OUT TO THE WORLD DEFINITION: one callback, attachable only where the
    // inspector is rendered with explicit props and no bundle spread.
    onOpenWorldDefinition = () => {},
    onDelete = () => {},
    onEditComponent = () => {},
    onCopySource = () => {},
    onUnlinkSource = () => {},
    onSourceDrop = () => {},
    onSourceSelect = () => {},
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

  const DESCRIPTION_LIMIT = 160;

  const disabled = $derived(essence?.enabled === false);
  const description = $derived(truncate(essence?.description));
  // THE META LINE under the name: the colour's display name and this system's carrier count. The
  // name is the shared `essenceColourName`, so this and the catalogue's caption cannot disagree.
  const colourName = $derived(essenceColourName(essence?.colorToken));
  const carrierLine = $derived(
    format('FABRICATE.Admin.Manager.Essence.CarriersHere', '{count} components here', {
      count: essence?.componentUsageCount || 0,
    })
  );
  const identityMeta = $derived(colourName ? `${colourName} · ${carrierLine}` : carrierLine);
  // AGREEING WITH ITS NUMBER: a `…One` sibling carrying the singular written out, the same pair
  // `EssenceRow` selects for the same two keys.
  const componentUsageSentence = $derived(
    (essence?.componentUsageCount || 0) === 1
      ? format('FABRICATE.Admin.Manager.Essence.ComponentUsageCountOne', '1 component', {
          count: 1,
        })
      : format('FABRICATE.Admin.Manager.Essence.ComponentUsageCount', '{count} components', {
          count: essence?.componentUsageCount || 0,
        })
  );
  const usageItems = $derived(
    Array.isArray(essence?.componentUsageItems) ? essence.componentUsageItems : []
  );

  // Resolved cancellably through the SAME leaf the editor uses: selecting another essence mid
  // lookup is ordinary here, so the `cancelled` latch stops the previous macro landing on it.
  let macroName = $state('');
  $effect(() => {
    const uuid = essence?.propertyMacroUuid || '';
    return resolveMacroName(uuid, ({ name: resolved }) => {
      macroName = resolved;
    });
  });

  // THE MACRO NAME FALLS BACK TO ITS ID, as the row's summary line does: until `fromUuid` answers,
  // an empty name made a CONFIGURED macro's card read `No macro` beside a row that named it.
  const macroLabel = $derived(macroName || essenceShortValueName(essence?.propertyMacroUuid));
  const onCraftCards = $derived(
    projectEssenceOnCraftCards(
      essence,
      {
        effectTransferEnabled: showSourceUi,
        propertyMacrosEnabled: showPropertyMacroUi,
        sourceName: essence?.associatedItem?.name || essence?.sourceName || '',
        macroName: macroLabel,
        inherited,
      },
      text,
      format
    )
  );

  function truncate(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (trimmed.length <= DESCRIPTION_LIMIT) return trimmed;
    return `${trimmed.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
  }

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }
</script>

<section class="manager-essence-inspector-section" data-essence-browser-inspector>
  <div class="manager-inspector-title-row is-hero-large">
    <!-- The tile carries the essence's own colour here too, so the inspector and the row
         cannot disagree about what colour an essence is. -->
    <Medallion
      icon={essence.icon || 'fas fa-mortar-pestle'}
      tint={essence.colorToken || ''}
      size={52}
    />
    <div class="manager-inspector-copy">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Essence.Selected', 'Selected essence')}
      </p>
      <h2 class="manager-inspector-name" title={essence.name}>{essence.name}</h2>
      <!-- THE META LINE: not the colour-name CHIP that was removed, which was a tinted pill
           restating the medallion beside it, but a caption whose second half is a fact no other
           control on the rail states. -->
      <p class="manager-essence-inspector-meta" data-essence-inspector-meta>{identityMeta}</p>
      <div class="manager-chip-row">
        <Chip
          tone={statusChipTone(disabled ? 'subtle' : 'success')}
          icon={disabled ? 'fas fa-circle-pause' : 'fas fa-circle-check'}
          >{disabled
            ? text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')
            : text('FABRICATE.Admin.Manager.Essence.Status.Enabled', 'Enabled')}</Chip
        >
      </div>
    </div>
  </div>
  <p class="manager-muted">
    {description ||
      text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
  </p>
</section>

<!--
  WHICH LAYER THE GM IS LOOKING AT, AND THE WAY OUT TO THE OTHER ONE. This describes ONE system's
  rules for an essence whose name, icon and colour are a world record every system shares, and
  nothing on the panel said so, so `Edit essence` beside a shared name read as "edit the essence".

  THE SENTENCE IS SYSTEM-AGNOSTIC, A STATED LIMIT: `EssenceEditView` renders the same sentence
  counted and named, and that key needs the roster size and the system's name here — both further
  props. The two keys collapse into one the moment the inspector holds those values.
-->
<InspectorCard class="manager-essence-shared" data-essence-section="shared">
  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Essence.SharedDefinition', 'Shared definition')}
  </p>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Essence.SharedDefinitionNote',
      'Name, icon and colour come from the Essence Catalogue and are shared by every system. Everything below belongs to this system alone.'
    )}
  </p>
  <!-- `.manager-link-button` is the shipped inline text-link button; only its colour is restated. -->
  <button
    type="button"
    class="manager-link-button manager-essence-shared-link"
    data-essence-action="open-world-definition"
    onclick={() => onOpenWorldDefinition(essence.id)}
  >
    <span
      >{text('FABRICATE.Admin.Manager.Essence.OpenWorldDefinition', 'Open world definition')}</span
    >
    <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
  </button>
</InspectorCard>

<!-- Two stats, two questions: components CARRY the essence and recipes REQUIRE it, and neither
     number is derivable from the other. -->
<section class="manager-essence-inspector-section" data-essence-section="stats">
  <!-- The SHIPPED two-stat grid, joined into the sibling selector lists in
       `styles/fabricate.css` rather than re-authored: a hand-rolled copy had already drifted on
       radius, background, value size and both halves of the typographic contract. -->
  <div class="manager-essence-stat-grid">
    <div class="manager-essence-stat" data-essence-stat="components">
      <strong class="manager-essence-stat-value">{essence.componentUsageCount || 0}</strong>
      <span class="manager-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Essence.StatComponents', 'Components')}</span
      >
    </div>
    <div class="manager-essence-stat" data-essence-stat="recipes">
      <strong class="manager-essence-stat-value">{essence.recipeUsageCount || 0}</strong>
      <span class="manager-essence-stat-label"
        >{text('FABRICATE.Admin.Manager.Essence.StatRecipes', 'Recipes require it')}</span
      >
    </div>
  </div>
</section>

{#if onCraftCards.length > 0}
  <section class="manager-essence-inspector-section" data-essence-section="oncraft">
    <p class="manager-kicker">
      {#if systemName}
        {format('FABRICATE.Admin.Manager.Essence.OnCraftIn', 'On craft in {system}', {
          system: systemName,
        })}
      {:else}
        {text('FABRICATE.Admin.Manager.Essence.Tabs.OnCraft', 'On craft')}
      {/if}
    </p>
    <ul class="manager-essence-oncraft-cards">
      {#each onCraftCards as card (card.id)}
        <li data-essence-oncraft-card={card.id} data-essence-oncraft-suppressed={card.suppressed}>
          <IconFactRow icon={card.icon} title={card.title} subtitle={card.subtitle} />
        </li>
      {/each}
    </ul>
  </section>
{/if}

<!--
  `SYSTEM RULES n / m` answers the one question this rail could not: which OTHER crafting systems
  have rules for this essence. It renders only when the world corpus answered, because an empty
  `systemRows` over an unreadable corpus reports the essence as held by no system at all.
-->
{#if systemRows.length > 0}
  <section class="manager-essence-inspector-section" data-essence-section="systems">
    <SystemRulesRoster
      rows={systemRows}
      {memberCount}
      {rosterSize}
      entityId={essence.id}
      entityName={essence.name}
      entityType="essence"
      enableable={true}
      systemRowAction="navigate"
      {onOpenSystemRules}
      resetKey={essence.id}
    />
  </section>
{/if}

<!-- THE ACTIONS SIT ABOVE `Source` AND `Usage`: ordered after two detail cards the primary fell
     past the fold, so the rail's one loud control was invisible in every captured frame. -->
<section class="manager-essence-inspector-section" data-essence-section="actions">
  <!-- The three verbs render through `InspectorActionButton`, the extracted point-of-arrival
       button for every right inspector. The primary was `.manager-button.is-primary`, the SUCCESS
       family, so `Edit essence` painted green where the design's primary is the accent. -->
  <!--
    NO DUPLICATE. `store.duplicateEssence` minted a SYSTEM-owned essence with its own name, icon and
    colour from a rail whose banner two cards above says those come from the Essence Catalogue and
    are shared by every system — both claims on screen at once. What the reference offers instead is
    `Reuse these rules` on the system rules editor, copying THIS system's effect source and macro
    into another system's rules for the SAME essence, already shipped one click away.
  -->
  <div class="manager-essence-inspector-actions">
    <InspectorActionButton
      tone="primary"
      icon="fas fa-pen"
      label={text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}
      data-essence-action="edit"
      onClick={() => onEdit(essence.id)}
    />
    <!-- The SINGLE delete keeps the `confirmDialog` the store owns; the two-step ARM is the BULK
         panel's alone. It is WARNED, not BLOCKED: never disabled by component usage, with the
         cascade's counts stated in the dialog and previewed below. -->
    <InspectorActionButton
      tone="danger"
      icon="fas fa-trash"
      label={text('FABRICATE.Admin.Manager.Essence.Delete', 'Delete essence')}
      ariaLabel={format('FABRICATE.Admin.Manager.Essence.DeleteNamed', 'Delete {name}', {
        name: essence.name,
      })}
      data-essence-action="delete"
      onClick={() => onDelete(essence.id)}
    />
  </div>
  {#if essence.componentUsageCount > 0}
    <p class="manager-muted manager-essence-delete-note" data-essence-delete-impact>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {format(
        'FABRICATE.Admin.Manager.Essence.DeleteImpact',
        'Deleting removes this essence from {components} components and rewrites {recipes} recipes.',
        {
          components: essence.componentUsageCount || 0,
          recipes: essence.recipeUsageCount || 0,
        }
      )}
    </p>
  {:else if essence.deleteRewritesRecipes}
    <p class="manager-muted manager-essence-delete-note" data-essence-delete-rewrites>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {format(
        'FABRICATE.Admin.Manager.Essence.DeleteRewritesRecipes',
        'Deleting this essence rewrites {count} recipes that require it.',
        { count: essence.recipeUsageCount || 0 }
      )}
    </p>
  {/if}
</section>

{#if showSourceUi}
  <section class="manager-essence-inspector-section" data-essence-section="source">
    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.Source', 'Source')}</p>
    {#if essence.associatedItem}
      <div class="manager-essence-source-summary manager-essence-inspector-source-summary">
        <img
          class="manager-essence-source-thumb"
          src={essence.associatedItem.img || 'icons/svg/item-bag.svg'}
          alt=""
        />
        <div class="manager-essence-source-copy">
          <strong>{essence.associatedItem.name || essence.sourceName}</strong>
        </div>
      </div>
      <!-- The SAME primitive as the three verbs above, paired in a two-column grid: a rail sizing
           its source actions differently from its entity actions is the drift the extraction
           removes. `warning` carries the amber `Unlink Source` wore — it breaks a reference. -->
      <div class="manager-essence-inspector-source-actions">
        <InspectorActionButton
          icon="fas fa-copy"
          label={text('FABRICATE.Admin.Manager.Essence.CopySource', 'Copy source UUID')}
          title={sourceUuid ||
            text(
              'FABRICATE.Admin.Manager.Essence.SourceNoUuid',
              'This component has no source item UUID.'
            )}
          disabled={!sourceUuid}
          data-essence-action="copy-source"
          onClick={() => onCopySource()}
        />
        <InspectorActionButton
          tone="warning"
          icon="fas fa-unlink"
          label={text('FABRICATE.Admin.Manager.Essence.UnlinkSource', 'Unlink Source')}
          data-essence-action="unlink-source"
          onClick={() => onUnlinkSource()}
        />
      </div>
    {:else}
      <div class="manager-essence-source-drop-zone manager-essence-inspector-source-drop-zone">
        <EssenceSourceSelector
          value={null}
          items={managedItemOptions}
          onDrop={onSourceDrop}
          onSelect={onSourceSelect}
          onClear={() => onSourceSelect(null)}
        />
      </div>
    {/if}
  </section>
{/if}

<section class="manager-essence-inspector-section" data-essence-section="usage">
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</p>
  <div class="fab-stack" data-gap="2">
    <div class="manager-requirement-row">
      <span>{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</span>
      <strong>{componentUsageSentence}</strong>
    </div>
  </div>
  {#if usageItems.length > 0}
    <div
      class="manager-essence-usage-grid"
      aria-label={text(
        'FABRICATE.Admin.Manager.Essence.ComponentUsageGrid',
        'Components using this essence'
      )}
    >
      {#each usageItems as component (component.id)}
        <button
          type="button"
          class="manager-essence-usage-item"
          title={component.name}
          aria-label={format('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}', {
            name: component.name,
          })}
          onclick={() => onEditComponent(component.id)}
        >
          <img src={componentImage(component)} alt="" />
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* No stat-grid block here: the classes joined the sibling selector lists in
     `styles/fabricate.css` instead, so there is one shape and one definition. */

  /* The shared-definition block is INFO-toned, the one panel on the rail that is an explanation
     rather than a control. It reuses the inspector card's geometry and restates only the tint.

     `:global()` AND CHAINED, for the reason `ItemPageInspector` states: the class rides a `class`
     prop onto an element THIS component does not write, so it carries no `svelte-<hash>`, and
     `.manager-inspector-card` is chained so the selector stays at (0,2,0). */
  :global(.manager-inspector-card.manager-essence-shared) {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  /* Colour only: `.manager-link-button` owns the shape and paints muted, and this link takes the
     accent because it LEAVES the screen. Compounded through `.manager-inspector-card` so the rule
     is (0,3,0) and beats the global outright rather than tying and being decided by injection order.
     WHOLLY `:global()`, not a global ancestor with a scoped descendant — the form that looks right
     and quietly changes the cascade — because the ANCESTOR is what stopped matching. */
  :global(.manager-inspector-card.manager-essence-shared .manager-essence-shared-link) {
    color: var(--fab-accent);
    font-weight: 600;
  }

  :global(.manager-inspector-card.manager-essence-shared .manager-essence-shared-link:hover) {
    color: var(--fab-text);
  }

  :global(.manager-inspector-card.manager-essence-shared .manager-essence-shared-link i) {
    font-size: 0.6rem;
  }

  /* THE META LINE under the inspected name, at the world catalogue caption's own size and colour,
     so a GM reading one rail and then the other sees one treatment. */
  .manager-essence-inspector-meta {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
  }

  /* The `ON CRAFT IN <system>` cards. `IconFactRow` owns each card's own anatomy; this owns only
     the stack and the suppression dim, exactly as the behaviour preview's list does. */
  .manager-essence-oncraft-cards {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A suppressed card is dimmed as well as re-worded. The words carry the state; the dimming
     only reinforces them. */
  .manager-essence-oncraft-cards li[data-essence-oncraft-suppressed='true'] {
    opacity: 0.72;
  }

  /* A BARE COLUMN, NOT A STACK OF BOXES. Every section wore `.manager-inspector-card` and four of
     them CONTAIN cards, so one border became three nested ones. The rail is a column on the pane's
     own surface with a micro-label per section, and only the things that ARE objects keep a box, as
     `RecipeBrowserInspector` already does. THE SHARED-DEFINITION CALLOUT KEEPS ITS BOX, because it
     IS an object, and is therefore the ONE site here calling `<InspectorCard>`. */
  .manager-essence-inspector-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-essence-inspector-actions {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-essence-delete-note {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-3);
    font-size: 0.7rem;
  }
</style>
