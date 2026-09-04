<!-- Svelte 5 runes mode -->
<!--
  The system Component Rules list's inspector (issue 676; rebuilt to the design reference for
  issue 1371, maintainer parity round 4 — `rebuild-spec.md` C7, `proto:1247-1275`).

  It lives under `apps/manager/components/` (the BROWSER's dir), NOT `component/`, which the
  screenshot evidence map globs for the EDITOR's frames, and it is named ComponentBrowserInspector
  so it cannot be confused with the editor's own surfaces. It renders into the shell's existing
  `.manager-inspector` column and owns no grid, so it cannot introduce a nested second inspector.

  ── WHAT IT SAYS, IN THE REFERENCE'S ORDER ────────────────────────────────────────────────
   1. the `SELECTED COMPONENT` kicker (gap-list row 117 — there was none);
   2. the medallion, the name at 16px serif and the `{n} tags · {m} essences` subline (row 118).
      The two stat tiles are gone: the subline states both numbers, and a tile per number over a
      panel that is about to list them is the same fact three times;
   3. `Shared identity` — the info card that used to sit at the head of the LIST pane, which is
      the screen the reference does NOT draw it on (row 119, and row 101 for where it came from);
   4. `Tags in effect`, with the `{w} world · {s} system` split counter (row 120);
   5. `Category`, with its source line and boxed value (row 121);
   6. `Salvage in {system}`, with its boxed note (row 122);
   7. a PINNED foot carrying ONE primary action (row 123).

  ── ONE PINNED PRIMARY, AND A KEBAB FOR THE REST ─────────────────────────────────────────
  The four-button stack (`Edit component`, `Copy source UUID`, `Unlink component`,
  `Delete component`) scrolled inline with the body and gave four commands equal weight where
  the design pins one. `Edit system rules` is the pinned primary; the other three move onto the
  shared `ActionMenu`, which is the primitive that owns "two or more commands behind one
  trigger" (`design-system/spec.md:466-495`). Nothing is lost and nothing is a text link.

  Strings are localized here; the CALLER resolves nothing but the actions and the world facts
  this screen's own row set cannot answer.
-->
<script>
  import Chip from '../Chip.svelte';
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  import {
    componentAttributionNote,
    componentCategorySourceText,
    componentInspectorSubline,
    componentSalvageSummary,
    componentTagSplitText,
  } from '../scoped/componentScoped.js';

  let {
    selectedComponent = null,
    showTags = false,
    // THE WORLD RECORD BEHIND THE SELECTED ROW, or `null` when the world corpus holds none.
    // Three of this panel's blocks are about the relationship between the two scopes, and none
    // of them can be answered from the in-system card alone: the read union re-derives identity
    // from the in-system record on every row, so the card cannot say how many OTHER systems
    // share it, which of its tags came from the world, or whether its category was inherited.
    worldEntry = null,
    // The world projection's row for THIS `(component, system)` pair — `inherited.category` and
    // `mutedTags`. Passed rather than found here: the caller already indexes the projection.
    worldSystemRow = null,
    systemName = '',
    // The SYSTEM's salvage feature switch and its resolution-mode label, for the boxed note.
    salvageFeatureEnabled = false,
    salvageModeLabel = '',
    onEditSystemRules = () => {},
    onOpenWorldEntry = () => {},
    onCopySourceUuid = () => {},
    onUnlink = () => {},
    onDelete = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const systemTags = $derived(Array.isArray(selectedComponent?.tags) ? selectedComponent.tags : []);
  const essences = $derived(
    Array.isArray(selectedComponent?.essences) ? selectedComponent.essences : []
  );
  const hasRegisteredItemUuid = $derived(Boolean(selectedComponent?.hasRegisteredItemUuid));
  const sourceMissing = $derived(Boolean(selectedComponent?.sourceMissing));
  const registeredItemUuid = $derived(String(selectedComponent?.registeredItemUuidDisplay || ''));

  // ── TAGS IN EFFECT, WHICH IS NOT THE UNION ─────────────────────────────────────────────
  // A world tag this system MUTES is not in effect here, so it is not listed and not counted:
  // the block is titled by what it states. A world tag the system also carries its own copy of
  // is listed ONCE, as world-sourced, because that is where a GM must go to change it.
  const mutedWorldTags = $derived(
    Array.isArray(worldSystemRow?.mutedTags) ? worldSystemRow.mutedTags : []
  );
  const worldTagsInEffect = $derived(
    (Array.isArray(worldEntry?.defaults?.tags) ? worldEntry.defaults.tags : []).filter(
      (tag) => !mutedWorldTags.includes(tag)
    )
  );
  const systemOnlyTags = $derived(systemTags.filter((tag) => !worldTagsInEffect.includes(tag)));
  const tagsInEffect = $derived([
    ...worldTagsInEffect.map((tag) => ({ tag, source: 'world' })),
    ...systemOnlyTags.map((tag) => ({ tag, source: 'system' })),
  ]);

  const subline = $derived(
    componentInspectorSubline({ tags: tagsInEffect.length, essences: essences.length }, format)
  );
  const tagSplit = $derived(
    componentTagSplitText(
      { world: worldTagsInEffect.length, system: systemOnlyTags.length },
      format
    )
  );
  const categorySource = $derived(componentCategorySourceText(worldSystemRow, format));
  const salvageNote = $derived(
    componentSalvageSummary(
      {
        featureEnabled: salvageFeatureEnabled === true,
        componentEnabled: Boolean(selectedComponent?.salvageSummary),
        modeLabel: salvageModeLabel,
        dc: selectedComponent?.difficulty ?? null,
        resultCount: Number(selectedComponent?.salvageSummary?.resultCount) || 0,
      },
      format
    )
  );

  // The three commands the pinned foot does NOT carry. Built as data so the shared `ActionMenu`
  // can own the trigger, the popover and the keyboard behaviour; gated on there BEING a stored
  // source, exactly as the four-button stack gated them.
  const menuItems = $derived(
    [
      hasRegisteredItemUuid
        ? {
            id: 'copy-source',
            label: text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID'),
            icon: 'fas fa-copy',
          }
        : null,
      hasRegisteredItemUuid
        ? {
            id: 'unlink',
            label: text('FABRICATE.Admin.Manager.Component.UnlinkAction', 'Unlink component'),
            icon: 'fas fa-link-slash',
          }
        : null,
      {
        id: 'delete',
        label: text('FABRICATE.Admin.Manager.Component.Delete', 'Delete component'),
        icon: 'fas fa-trash',
        danger: true,
      },
    ].filter(Boolean)
  );

  function runMenuItem(id) {
    if (id === 'copy-source') onCopySourceUuid(registeredItemUuid);
    if (id === 'unlink') onUnlink(selectedComponent?.id);
    if (id === 'delete') onDelete(selectedComponent?.id);
  }
</script>

{#if selectedComponent}
  <section class="manager-component-browser-inspector" data-component-inspector>
    <div class="manager-component-inspector-body">
      <div class="manager-component-inspector-title-row">
        <p class="manager-kicker" data-component-inspector-kicker>
          {text('FABRICATE.Admin.Manager.Component.Selected', 'Selected component')}
        </p>
        <!-- The overflow the four-button stack collapsed into. It sits beside the kicker rather
             than in the foot, because the foot pins the ONE act this panel is for. -->
        {#if menuItems.length > 0}
          <ActionMenu
            items={menuItems}
            triggerLabel={text(
              'FABRICATE.Admin.Manager.Component.MoreActions',
              'More component actions'
            )}
            triggerData={{ 'data-component-inspector-menu': '' }}
            menuAriaLabel={text(
              'FABRICATE.Admin.Manager.Component.MoreActions',
              'More component actions'
            )}
            onSelect={(id) => runMenuItem(id)}
          />
        {/if}
      </div>

      <div class="manager-component-inspector-identity">
        <Medallion
          src={selectedComponent.img}
          icon="fas fa-cube"
          size={40}
          tint={selectedComponent.color || ''}
        />
        <div class="manager-component-inspector-identity-copy">
          <h2 class="manager-component-inspector-name" title={selectedComponent.name}>
            {selectedComponent.name}
          </h2>
          <p class="manager-component-inspector-subline" data-component-inspector-subline>
            {subline}
          </p>
        </div>
      </div>

      <!-- SHARED IDENTITY. This card carries the content that used to head the LIST pane; the
           reference draws that callout on the rules editor and this card here. -->
      {#if worldEntry}
        <div class="manager-component-shared-identity" data-component-shared-identity>
          <p class="manager-micro-label is-info" data-component-shared-identity-label>
            {text('FABRICATE.Admin.Manager.Component.SharedIdentity', 'Shared identity')}
          </p>
          <p class="manager-component-shared-identity-note">
            {componentAttributionNote(
              { surface: 'list', memberCount: Number(worldEntry.membershipCount) || 0 },
              format
            )}
          </p>
          <button
            type="button"
            class="manager-inline-link"
            data-keyboard-focus="true"
            data-component-open-catalogue
            onclick={() => onOpenWorldEntry(worldEntry.id)}
          >
            <span
              >{text(
                'FABRICATE.Admin.Manager.Component.OpenCatalogueEntry',
                'Open catalogue entry'
              )}</span
            >
            <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </button>
        </div>
      {/if}

      {#if showTags}
        <div class="manager-component-inspector-block">
          <div class="manager-component-inspector-block-head">
            <p class="manager-micro-label" data-component-tags-in-effect-label>
              {text('FABRICATE.Admin.Manager.Component.TagsInEffect', 'Tags in effect')}
            </p>
            <span class="manager-component-inspector-split" data-component-tag-split
              >{tagSplit}</span
            >
          </div>
          {#if tagsInEffect.length === 0}
            <p class="manager-component-inspector-empty" data-component-tags-empty>
              {text('FABRICATE.Admin.Manager.Component.NoTagsInEffect', 'No tags in effect here.')}
            </p>
          {:else}
            <div class="manager-chip-row" data-component-tag-list>
              {#each tagsInEffect as entry (entry.tag)}
                <!-- Each chip NAMES ITS ORIGIN in a `title`, because the split counter above
                     says how many came from where and the chips themselves must say which — and
                     it names it in COLOUR too, which is the half that was inverted. `proto:5663`
                     inks a WORLD tag blue and `proto:5665` inks the system's OWN tag purple, the
                     same pairing the rules editor's two runs use (`proto:5692`/`proto:5711`);
                     this run had world purple and own neutral, so the two screens disagreed
                     about what purple means. Measured by the `sys-inspector-tag-chip` region.

                     THE SCALE IS THE DEFAULT CHIP SPOKEN MORE QUIETLY, and that is a
                     measurement rather than a preference. `proto:5663` draws this pill at
                     `padding: 3px 9px; border-radius: 999px; font: 600 10px` with no
                     line-height, which lays out ~20px tall — exactly the default chip's height.
                     Neither micro variant is nearer: `list` would draw it 13px tall and
                     `tag-run` 25px. What a `compare` run actually measured open was never a
                     size: it was the base scale's `font-weight: 700` against the reference's
                     600, its `0.62rem` against 10px, and its `--fab-space-chip` inset against a
                     wider one — which is `density="inspector"`, the primitive's name for this
                     exact pill, added rather than a fourth micro scale invented.

                     IT GOES ON BOTH HALVES, and the density is deliberately geometry-only: the
                     run's two halves are DIFFERENTLY toned on purpose, and a scale applied to
                     one of them would draw the run at two sizes and read as the origin split
                     the colours already state. -->
                <Chip
                  tone={entry.source === 'world' ? 'info' : 'tag'}
                  density="inspector"
                  data-component-tag={entry.tag}
                  data-component-tag-source={entry.source}
                  title={entry.source === 'world'
                    ? text(
                        'FABRICATE.Admin.Manager.Component.TagFromWorld',
                        'From the world catalogue'
                      )
                    : format('FABRICATE.Admin.Manager.Component.TagFromSystem', 'Set in {system}', {
                        system: systemName,
                      })}>{entry.tag}</Chip
                >
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="manager-component-inspector-block">
        <div class="manager-component-inspector-block-head">
          <p class="manager-micro-label">
            {text('FABRICATE.Admin.Manager.Component.Category.Title', 'Category')}
          </p>
          {#if categorySource}
            <span class="manager-component-inspector-split" data-component-category-source
              >{categorySource}</span
            >
          {/if}
        </div>
        <p class="manager-component-inspector-well" data-component-category>
          {getComponentCategoryLabel(selectedComponent.category, localize)}
        </p>
      </div>

      <!--
        THE ONE STATE THIS PANEL KEEPS THAT THE REFERENCE'S AT-REST FRAME DOES NOT DRAW.

        `rebuild-spec.md` C7 enumerates five blocks and this is not one of them, and the source
        Item is world data under epic 1357 — so the panel's `Linked` / `Compendium` pill and its
        whole description paragraph are gone with the rest of the source register. A DANGLING
        LINK IS NOT THAT: it is the component claiming a document that no longer exists, and it
        is the only thing on this screen a GM has to act on. It renders ONLY in that state, so
        the reference's at-rest anatomy is exact and this is a warning the frame never had to
        show. Reported to the driver as a retained subject-only element.
      -->
      {#if sourceMissing}
        <p class="manager-component-inspector-warning" data-component-source-missing>
          {text(
            'FABRICATE.Admin.Manager.Component.SourceMissingHint',
            'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.'
          )}
        </p>
      {/if}

      <div class="manager-component-inspector-block">
        <p class="manager-micro-label" data-component-salvage-label>
          {format('FABRICATE.Admin.Manager.Component.SalvageIn', 'Salvage in {system}', {
            system: systemName,
          })}
        </p>
        <p
          class="manager-component-inspector-well manager-component-inspector-note"
          data-component-salvage-note
        >
          {salvageNote}
        </p>
      </div>
    </div>

    <!-- THE PINNED FOOT. One action, and it is the act this whole screen exists to reach. -->
    <div class="manager-component-inspector-foot" data-component-inspector-foot>
      <InspectorActionButton
        tone="primary"
        label={text('FABRICATE.Admin.Manager.Component.EditSystemRules', 'Edit system rules')}
        data-component-edit-system-rules=""
        onClick={() => onEditSystemRules(selectedComponent?.id)}
      />
    </div>
  </section>
{/if}
