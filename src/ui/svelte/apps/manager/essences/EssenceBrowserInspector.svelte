<!-- Svelte 5 runes mode -->
<!--
  The selected-essence inspector (issue 1036), extracted from ~200 inlined lines in
  `CraftingSystemManagerRoot.svelte`. It is the last of the four library inspectors to
  become a component; `ComponentBrowserInspector`, `RecipeBrowserInspector` and
  `ToolBrowserInspector` were already extracted.

  It lives under `essences/` — the BROWSER's directory, which the screenshot evidence map
  globs for the essence views.

  ── WHAT IS RETAINED, AND WHY THE PROTOTYPE IS NOT AUTHORITY FOR ITS REMOVAL ──────
  The prototype depicts none of these, and each is a shipped affordance with no replacement:

   - the component-usage THUMB GRID, and its click-through to the component editor. It is
     the only route from "34 components carry this" to any one of them.
   - copy-source-UUID, unlink-source and the `EssenceSourceSelector` drop target, still
     gated on `features.effectTransfer` and moved here verbatim. `EssenceSourceSelector` is
     deliberately NOT `ItemDropZone`: an essence source is an in-system managed COMPONENT,
     not a document uuid.
   - the delete-impact note, which tells the GM in advance how far a delete's cascade
     reaches — how many components it strips the essence from and how many recipes it
     rewrites — because the delete is warned, not blocked.

  ── ON CRAFT ANSWERS A DIFFERENT QUESTION FROM THE PREVIEW, AND NOW SAYS SO ───────
  This section rendered `EssenceBehaviorPreview` with its kicker suppressed, on the reading that
  the editor's preview and this panel are one list. They are not, and treating them as one is
  what left this rail with NO PROVENANCE on a screen whose whole subject is inherit-versus-
  override. The preview answers "what does this essence DO to a crafted result"; the reference's
  cards answer "what does THIS SYSTEM resolve each section to, and did it author that or inherit
  it" — titled after the value and ending in `· overridden here` or `· world default`
  (`tmp/proto/essence-rules.png`, data at `proto:5093`-`5098`). Two meanings had been collapsed
  rather than shared, so the second one is projected in `essenceStudio.projectEssenceOnCraftCards`
  and drawn with the SAME `IconFactRow` primitive the preview uses.

  ── THE SYSTEM ROSTER IS `SystemRulesRoster`, THE CATALOGUE'S OWN PANEL ───────────
  The reference draws `SYSTEM RULES n / m` — a count, a system search, five named rows each with
  a `Rules ↗` link out, and a pager — on this rail as well as on the world catalogue's. The
  catalogue's was inlined in `EntityCatalogueShell`; it is now a component, and this composes it
  rather than growing a second one.
-->
<script>
  import EssenceSourceSelector from '../../../components/EssenceSourceSelector.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import SystemRulesRoster from '../scoped/SystemRulesRoster.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { essenceColourName, essenceShortValueName } from '../scoped/essenceScoped.js';
  import { projectEssenceOnCraftCards } from './essenceStudio.js';
  import { resolveMacroName } from '../../../../../utils/macroReference.js';

  let {
    essence = null,
    showSourceUi = false,
    showPropertyMacroUi = false,
    managedItemOptions = [],
    sourceUuid = '',
    // ── WHAT THE SYSTEM LAYER NEEDS TO NAME ITSELF (issue 1372, maintainer parity round 8) ──
    // `systemName` heads the on-craft section, as the reference's `ON CRAFT IN MYTHWRIGHT FORGE`
    // does; `inherited` is this system's per-section inherit map from the world-scope join, and
    // it is what turns a resolved value into a resolved value AND the layer it came from. It is
    // `null` for a system with no membership record, which suppresses the layer clause rather
    // than guessing one.
    systemName = '',
    inherited = null,
    // The `SYSTEM RULES n / m` panel's own three facts, threaded from the world-scope join the
    // shell already holds. `systemRows` is that join — one row per crafting system, carrying
    // `member` and `enabled` — never the narrowed `{id, name}` roster, which answers neither.
    systemRows = [],
    memberCount = 0,
    rosterSize = 0,
    membershipActions = null,
    onOpenSystemRules = null,
    onEdit = () => {},
    // THE DEEP LINK OUT TO THE WORLD DEFINITION (issue 1372, `proto:1678`). One callback, and
    // the only reason `CraftingSystemManagerRoot.svelte` is reopened at all: the shell already
    // owns `openWorldScopedEntry`, and this site is the one place the seam can be attached
    // because the inspector is rendered there with explicit props and no bundle spread.
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
  // THE META LINE the reference puts under the name: the colour's own display name and how many
  // components in THIS system carry the essence (`proto:5086`). The colour name is the shared
  // `essenceColourName`, so this line and the world catalogue's caption cannot disagree about
  // what a token is called; the hex is the world screen's, because that screen owns the colour.
  const colourName = $derived(essenceColourName(essence?.colorToken));
  const carrierLine = $derived(
    format('FABRICATE.Admin.Manager.Essence.CarriersHere', '{count} components here', {
      count: essence?.componentUsageCount || 0,
    })
  );
  const identityMeta = $derived(colourName ? `${colourName} · ${carrierLine}` : carrierLine);
  // AGREEING WITH ITS NUMBER (issue 1372). One key served every count, so the Usage row read
  // `1 components`. The corpus's convention is a `…One` sibling carrying the singular written
  // out; `EssenceRow` selects the same pair for the same two keys.
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

  // The macro's display NAME, resolved cancellably through the SAME leaf the editor uses.
  // Selecting another essence while a lookup is in flight is the ordinary case here, so the
  // `cancelled` latch is what stops a slow resolution of the previous essence's macro
  // landing on the newly selected one.
  let macroName = $state('');
  $effect(() => {
    const uuid = essence?.propertyMacroUuid || '';
    return resolveMacroName(uuid, ({ name: resolved }) => {
      macroName = resolved;
    });
  });

  // THE MACRO NAME FALLS BACK TO ITS ID, exactly as the row's summary line does. `resolveMacroName`
  // needs `fromUuid`, and until it answers — or where it cannot — an empty name made a CONFIGURED
  // macro's card read `No macro` while the row two columns left printed `Macro: lab-aether-binding`.
  // The terminal segment is the closest true thing either surface can say.
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
      <!-- THE META LINE (issue 1372, maintainer parity round 8, `proto:5086`): the colour's
           display name and how many components in THIS system carry the essence. It is not the
           colour-name CHIP that issue 1036 removed — that was a tinted pill restating the
           medallion beside it. This is a one-line caption whose second half is a fact no other
           control on the rail states, and the reference draws it in exactly this slot. -->
      <p class="manager-essence-inspector-meta" data-essence-inspector-meta>{identityMeta}</p>
      <div class="manager-chip-row">
        <StatusPill
          tone={disabled ? 'subtle' : 'success'}
          icon={disabled ? 'fas fa-circle-pause' : 'fas fa-circle-check'}
          label={disabled
            ? text('FABRICATE.Admin.Manager.Essence.Status.Disabled', 'Disabled')
            : text('FABRICATE.Admin.Manager.Essence.Status.Enabled', 'Enabled')}
        />
      </div>
    </div>
  </div>
  <p class="manager-muted">
    {description ||
      text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
  </p>
</section>

<!--
  WHICH LAYER THE GM IS LOOKING AT, AND THE WAY OUT TO THE OTHER ONE (`proto:1676`-`1678`).

  This inspector describes ONE system's rules for an essence whose name, icon and colour are a
  world record every system shares. Nothing on the panel said so, and nothing offered a route
  to the record — so `Edit essence` beside a shared name read as "edit the essence" when what
  it opens is this system's rules. The prototype answers both with an info-toned block: the
  kicker names the layer, a sentence says what is shared, and an accent link opens the world
  definition.

  THE SENTENCE IS SYSTEM-AGNOSTIC, AND THAT IS A STATED LIMIT rather than an oversight, and it
  is the ONE place this block is not already shipped copy. `EssenceEditView` renders the SAME
  sentence, counted and named, from `FABRICATE.Admin.Manager.Scoped.Essence.IdentityBanner`
  ("shared with {count} other system(s). Everything below belongs to {system} alone."), which
  is what the prototype draws at `proto:5091`. Rendering that key here needs the roster size
  and the selected system's name, and both would have to arrive as further props from
  `CraftingSystemManagerRoot.svelte` — a gateway file this change reopens for ONE callback and
  nothing else. So this is the uncounted variant of one sentence, deliberately, and the two
  keys collapse into that one the moment the inspector legitimately holds those two values.
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
  <!-- `.manager-link-button` is the manager's shipped inline text-link button; only its
       colour is restated below, because the prototype paints this one in the accent. -->
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

<!-- Two stats, two different questions. Components CARRY the essence, which is what blocks
     a delete; recipes REQUIRE it, which is what a delete rewrites. Neither number is
     derivable from the other. -->
<section class="manager-essence-inspector-section" data-essence-section="stats">
  <!-- The SHIPPED two-stat grid, joined rather than re-authored: `.manager-essence-stat-*`
       is added to the `.manager-recipe-stat-*` / `.manager-component-stat-*` selector lists
       in `styles/fabricate.css`. This inspector is one click from those two, and a
       hand-rolled copy had already drifted on radius, background, value size and both
       halves of the typographic contract (serif + `tabular-nums`). -->
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
  `SYSTEM RULES n / m` (issue 1372, maintainer parity round 8, `proto:1694`-`1716`).

  It answers the one question this rail could not: which OTHER crafting systems have rules for
  this essence, and how to get to each one's. The reference gives it a count over the whole
  roster, a `Search systems` field, five named rows each ending in `Rules ↗`, and a pager — the
  same panel the world Essence Catalogue's inspector already draws, which is why this composes
  `SystemRulesRoster` rather than authoring a second one.

  It renders only when the world corpus answered: `systemRows` is the world-scope join, and an
  empty one over an unreadable corpus would report this essence as held by no system at all,
  which is a false statement rather than an unavailable one.
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
      actions={membershipActions}
      {onOpenSystemRules}
      resetKey={essence.id}
    />
  </section>
{/if}

<!--
  THE ACTIONS SIT ABOVE `Source` AND `Usage`, not below them (issue 1036 fidelity pass).
  The prototype's rail is hero, stats, `On craft`, then the actions — the primary `Edit
  essence` is the loudest control on the panel and it is on screen. Ordered after two
  supplementary detail cards it fell past the fold at the 1280×820 capture size, so the
  rail's one loud thing was invisible in every frame of it. `Source` and `Usage` are
  reference, so they follow the verb rather than delaying it.
-->
<section class="manager-essence-inspector-section" data-essence-section="actions">
  <!-- The three verbs render through `InspectorActionButton`, the extracted point-of-arrival
       button for every right inspector (issue 1036, maintainer round 2). What changes here
       is not only the size: the primary was `.manager-button.is-primary`, which is the
       SUCCESS family, so `Edit essence` painted green where the design's primary — and the
       recipe and component inspectors a click away — is the accent. -->
  <!--
    NO DUPLICATE (issue 1372, maintainer parity round 8).

    `store.duplicateEssence` wrote a second `system.essenceDefinitions` entry with a fresh id and
    a `(copy)` name — a SYSTEM-owned essence carrying its own name, icon and colour, minted from a
    rail whose own banner two cards above says that name, icon and colour come from the Essence
    Catalogue and are shared by every system. Both claims were on screen at once.

    The reference offers no essence duplicate on any of its four essence screens. What it offers
    instead is `Reuse these rules` on the system rules editor (`proto:3600`+), which copies THIS
    system's effect source and macro into another system's own rules for the SAME essence — the
    verb a GM actually wants, without minting an identity. That card is already shipped in
    `EssenceEditView.svelte` and is one click away through `Edit essence` below.
  -->
  <div class="manager-essence-inspector-actions">
    <InspectorActionButton
      tone="primary"
      icon="fas fa-pen"
      label={text('FABRICATE.Admin.Manager.Essence.Edit', 'Edit essence')}
      data-essence-action="edit"
      onClick={() => onEdit(essence.id)}
    />
    <!-- The SINGLE delete keeps the `confirmDialog` the store already owns. The two-step
         ARM is the BULK panel's, per the maintainer's decision for that action alone;
         wearing both idioms on one screen for one verb would teach the GM neither. The
         delete is WARNED, not BLOCKED (maintainer round): the control is never disabled by
         component usage, and `store.deleteEssence` states the cascade's impact counts in
         its confirm dialog rather than refusing. The impact note below previews the same
         counts on the panel. -->
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
      <!-- The SAME primitive as the three verbs above. These two are a pair in a two-column
           grid rather than a stack, but they are the same meaning in the same rail, and a
           rail that sized its source actions differently from its entity actions is the
           drift the extraction exists to remove. `warning` carries the amber the shipped
           `Unlink Source` wore: unlinking breaks a reference, it destroys nothing. -->
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
  <div class="manager-requirements-list">
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
  /* No stat-grid block here. The four rules this file used to declare are the shipped
     `.manager-recipe-stat-*` / `.manager-component-stat-*` rules with four visible
     divergences, so the classes joined those selector lists in `styles/fabricate.css`
     instead — one shape, one definition, and the essence inspector's numbers now match the
     recipe and component inspectors a click away. */

  /* The prototype's shared-definition block is INFO-toned — the one panel on the rail that is
     an explanation rather than a control (`proto:1676`). It reuses the inspector card's own
     geometry and restates only the tint, so no second card shape enters the rail.

     `:global()` AND CHAINED (issue 1427), for the reason `ItemPageInspector` states at length.
     That block is an `<InspectorCard>` now, so `manager-essence-shared` rides the `class` prop
     onto an element THIS component does not write, and Svelte stamps its `svelte-<hash>` only
     onto the ones it does. `.manager-inspector-card` is chained rather than left off so the
     selector stays at (0,2,0), exactly where the scoped form put it, and it still beats nothing
     it did not beat before. */
  :global(.manager-inspector-card.manager-essence-shared) {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
  }

  /* Colour only. `.manager-link-button` in `styles/fabricate.css` owns the shape, and it
     paints muted; the prototype paints this link in the accent because it LEAVES the screen.
     Compounded through `.manager-inspector-card` so the rule is (0,3,0) and beats the global
     `.fabricate-manager .manager-link-button` outright instead of tying it at (0,2,0) and
     being decided by stylesheet injection order.

     WHOLLY `:global()` for the same issue-1427 reason, rather than a `:global()` ancestor with a
     scoped descendant — which is the form that looks right and quietly changes the cascade. The
     ANCESTOR compound is the one that stopped matching: `.manager-inspector-card` is now written
     by the primitive and carries no hash, and the button, which this component does still write,
     cannot rescue a selector whose left half matches nothing. `.manager-essence-shared` replaces
     the hash as the compound that narrows the match set to this card, so the count of classes —
     and therefore the specificity — is unchanged at (0,3,0). */
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

  /* THE META LINE under the inspected name: the colour and this system's carrier count. It is
     the same size and colour as the world catalogue's own caption
     (`.manager-scoped-list-inspector-caption`), so a GM reading one rail and then the other sees
     one treatment rather than two. */
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

  /* A BARE COLUMN, NOT A STACK OF BOXES (issue 1372, maintainer parity round 8).

     `.manager-inspector-card` draws a 1px border, an 8px radius and `--fab-space-3` of padding.
     Every section on this rail wore it, and four of those sections CONTAIN cards — two on-craft
     cards, two stat tiles, five system rows — so the reference's one border became three nested
     ones and the whole right third read as a panel inside a panel inside a window.

     The reference draws the rail as a column on the pane's own surface with a micro-label per
     section, and only the things that ARE objects keep a box (`tmp/proto/essence-rules.png`).
     That is also exactly what `RecipeBrowserInspector` already does one click away, and its own
     header records the same correction — so this brings the fourth library inspector onto the
     shape the other one already has rather than inventing a treatment.

     THE SHARED-DEFINITION CALLOUT KEEPS ITS BOX, because it IS an object: an info-toned
     explanation the reference draws as a filled, bordered block. It is therefore the ONE site
     in this file that calls `<InspectorCard>` (issue 1427). The other six are not unconverted
     callers of that primitive — they stopped being cards at all, so there is no shell for them
     to ask for, and calling the primitive to then unpaint its border, radius and padding would
     be a worse hand-roll than writing the column. */
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
