<!-- Svelte 5 runes mode -->
<!--
  The manager's page header, drawn by `PageHeader`: the breadcrumb trail `headerBreadcrumbs.js`
  derives, the eyebrow, one of eight identity headings and the trailing action group, plus the
  Tool library's own second header (issues 1720 and 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `header` | the `headerModel` instance | — | `headingVariant` selects the identity heading; passed WHOLE to the trail and the actions |
  | `isToolStudioRoute` | `boolean` | `false` | the two headers are exclusive, and the Tool Studio draws the second |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Rest spread:
  - `{...rest}` reaches the trail model and the action group; every prop this unit does not read
    itself belongs to one of them, and each declares its own.

  Invariants:
  - Two `<header>` elements under no wrapper, so the shell's own children are unchanged — pinned
    by the DOM census in `tests/components/manager-header-mounted.js`.
  - The identity heading is keyed on `header.headingVariant` alone; the order the eight variants
    are tested in is stated once, in `headerModel.svelte.js`.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import ManagerHeaderActions from './ManagerHeaderActions.svelte';
  import PageHeader from '../../components/PageHeader.svelte';
  import { headerBreadcrumbs } from './headerBreadcrumbs.js';

  let {
    header,
    isToolStudioRoute = false,
    currentView = '',
    text = () => '',
    selectedSystem = null,
    selectSystemAndShowBrowser = () => {},
    editSystem = () => {},
    recipeDraft = null,
    resolveRecipeImage = () => '',
    componentForEdit = null,
    downtimeHeaderArtwork = null,
    worldEssenceEntryIcon = '',
    worldEssenceEntryTint = '',
    worldEssenceEntryName = '',
    worldEssenceEntrySubtitle = '',
    essenceEditIcon = '',
    essenceEditTint = '',
    essenceEditName = '',
    essenceEditSubline = '',
    worldComponentEntryImage = '',
    worldComponentEntryName = '',
    worldComponentEntrySubtitle = '',
    worldToolEntryRecord = null,
    worldToolEntryName = '',
    worldToolEntrySubtitle = '',
    environmentDraftForDisplay = null,
    ...rest
  } = $props();

  const crumbs = $derived(
    headerBreadcrumbs({
      ...rest,
      header,
      currentView,
      text,
      selectedSystem,
      selectSystemAndShowBrowser,
      editSystem,
      recipeDraft,
      componentForEdit,
      essenceEditName,
    })
  );

  // The Tool library's trail, from its root (issue 1328) and with no `Crafting` crumb, because the
  // rail holds Tool Rules outside that group (issue 1373).
  const toolLibraryCrumbs = $derived([
    {
      label: text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems'),
      onSelect: () => selectSystemAndShowBrowser(),
    },
    { label: selectedSystem?.name, onSelect: () => editSystem(selectedSystem.id) },
    { label: text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules') },
  ]);
</script>

{#if !isToolStudioRoute}
  <!-- The trail row, then two blocks, always: the heading and the trailing actions. -->
  <PageHeader class="manager-header" breadcrumbs={crumbs} kicker={header.kicker}>
    {#snippet identity()}
      {#if header.headingVariant === 'recipe-edit'}
        <!-- The recipe editor's identity header: the recipe's own image, its name and the
             "<category> · <resolution mode>" subline. -->
        <div class="manager-recipe-edit-heading" data-recipe-edit-heading>
          <Medallion art={resolveRecipeImage(recipeDraft)} alt="" icon="fas fa-scroll" size={38} />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={recipeDraft.name || ''}>
              {recipeDraft.name || header.title}
            </h1>
            <p class="manager-subtitle" data-recipe-edit-subline>{header.subtitle}</p>
          </div>
        </div>
      {:else if header.headingVariant === 'component-edit'}
        <!-- The component editor's identity header, which must match the recipe editor's
             exactly, so it reuses that block's classes wholesale (issue 676). -->
        <div class="manager-recipe-edit-heading" data-component-edit-heading>
          <Medallion art={componentForEdit.img} alt="" icon="fas fa-cube" size={38} />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={componentForEdit.name || ''}>
              {componentForEdit.name || header.title}
            </h1>
            <p class="manager-subtitle" data-component-edit-subline>{header.subtitle}</p>
          </div>
        </div>
      {:else if header.headingVariant === 'downtime-artwork'}
        <!-- A companion's drill-down identity, drawn in core's header from the recipe editor's
             own block so a companion's editor is indistinguishable from one of Fabricate's.
             `image` and `icon` are validated mutually exclusive, so the fallback is decidable. -->
        <div class="manager-recipe-edit-heading" data-downtime-chrome-heading>
          <Medallion
            art={downtimeHeaderArtwork.image ?? ''}
            alt=""
            icon={downtimeHeaderArtwork.icon ?? 'fas fa-hourglass-half'}
            size={38}
          />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={header.title}>{header.title}</h1>
            <p class="manager-subtitle" data-downtime-chrome-subline>{header.subtitle}</p>
          </div>
        </div>
      {:else if header.headingVariant === 'world-essence-entry'}
        <!-- The essence's own identity header, from the recipe editor's block. `tint` recolours
             the glyph alone since issue 1506 and resolves to the accent when unset; `glyph` is
             the art ladder's 15 at the 38 rung. -->
        <div class="manager-recipe-edit-heading" data-world-essence-entry-heading>
          <Medallion
            icon={worldEssenceEntryIcon || 'fas fa-mortar-pestle'}
            tint={worldEssenceEntryTint}
            size={38}
            glyph={15}
          />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={worldEssenceEntryName}>
              {worldEssenceEntryName || header.title}
            </h1>
            <p class="manager-subtitle" data-world-essence-entry-subline>
              {worldEssenceEntrySubtitle}
            </p>
          </div>
        </div>
      {:else if header.headingVariant === 'essence-edit-rules'}
        <!-- The same identity header on the system rules route, from the same block rather
             than a fifth implementation of one meaning. -->
        <div class="manager-recipe-edit-heading" data-essence-edit-heading>
          <Medallion icon={essenceEditIcon} tint={essenceEditTint} size={38} glyph={15} />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={essenceEditName}>
              {essenceEditName || header.title}
            </h1>
            <p class="manager-subtitle" data-essence-edit-subline>{essenceEditSubline}</p>
          </div>
        </div>
      {:else if header.headingVariant === 'world-component-entry'}
        <!-- The component's own identity header, the twin of the two above (issue 1371). The
             medallion falls back to the glyph when the entry links no Item. -->
        <div class="manager-recipe-edit-heading" data-world-component-entry-heading>
          <!-- The `glyph-chip` variant is the borderless face `proto:5375` draws, which no other
               prop can ask for (issue 1371). -->
          <Medallion
            art={worldComponentEntryImage}
            alt=""
            icon="fas fa-cube"
            size={38}
            glyph={15}
            variant="glyph-chip"
          />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={worldComponentEntryName}>
              {worldComponentEntryName || header.title}
            </h1>
            <p class="manager-subtitle" data-world-component-entry-subline>
              {worldComponentEntrySubtitle}
            </p>
          </div>
        </div>
      {:else if header.headingVariant === 'world-tool-entry'}
        <!-- The Tool's own identity header, the twin of the essence branch above; the medallion
             falls back to the glyph when the entry links no Item. -->
        <div class="manager-recipe-edit-heading" data-world-tool-entry-heading>
          <Medallion
            art={worldToolEntryRecord.entity?.img ?? ''}
            alt=""
            icon="fas fa-screwdriver-wrench"
            size={38}
            glyph={15}
          />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={worldToolEntryName}>
              {worldToolEntryName || header.title}
            </h1>
            <p class="manager-subtitle" data-world-tool-entry-subline>
              {worldToolEntrySubtitle}
            </p>
          </div>
        </div>
      {:else if header.headingVariant === 'default'}
        <h1 class="manager-title">{header.title}</h1>
        <p class="manager-subtitle">{header.subtitle}</p>
      {/if}
      {#if currentView === 'environment-edit' && environmentDraftForDisplay}
        <div class="manager-environment-header-pills" data-environment-status-pills>
          <Chip
            tone={environmentDraftForDisplay.enabled === false ? 'neutral' : 'active'}
            data-status-pill="active"
          >
            {environmentDraftForDisplay.enabled === false
              ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
              : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
          </Chip>
          <Chip tone="info" data-status-pill="selection">
            {environmentDraftForDisplay.selectionMode === 'blind'
              ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind')
              : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}
          </Chip>
          <Chip tone="info" data-status-pill="composition">
            {environmentDraftForDisplay.compositionMode === 'manual'
              ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual')
              : text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic',
                  'Automatic'
                )}
          </Chip>
        </div>
      {/if}
    {/snippet}
    {#snippet actions()}
      <ManagerHeaderActions {header} {text} {currentView} {...rest} />
    {/snippet}
  </PageHeader>
{/if}

{#if currentView === 'tools' && selectedSystem}
  <PageHeader
    class="manager-header manager-tools-context-header"
    data-tool-library-context=""
    breadcrumbs={toolLibraryCrumbs}
    title={text('FABRICATE.Admin.Manager.Tools.LibraryTitle', 'Tool Studio')}
    subtitle={text(
      'FABRICATE.Admin.Manager.Tools.LibrarySubtitle',
      'Tools that recipes can require — from hand-held gear to fixed stations and places of power. Set how they break and who may wield them.'
    )}
  />
{/if}
