<!--
  The system Component Rules list's inspector. It lives under the BROWSER's directory, NOT
  `component/`, which the screenshot evidence map globs for the EDITOR's frames, and it renders into
  the shell's existing `.manager-inspector` column owning no grid, so it cannot nest a second one.

  In the reference's order: the `SELECTED COMPONENT` kicker; the medallion, the name and the
  `{n} tags · {m} essences` subline — no stat tiles, since the subline states both numbers and a
  panel about to list them would say each three times; `Shared identity`, the info card that used to
  head the LIST pane; `Tags in effect` with its `{w} world · {s} system` split counter; `Category`
  with its source line; `Salvage in {system}`; and a PINNED foot carrying ONE primary action.

  ONE PINNED PRIMARY, AND A KEBAB FOR THE REST. A four-button stack scrolled inline and gave four
  commands equal weight where the design pins one, so `Edit system rules` is the pinned primary and
  the other three move onto the shared `ActionMenu` — the primitive `openspec/specs/design-system/
  spec.md` gives "two or more commands behind one trigger". Nothing is lost and nothing is a link.

  Strings are localized here; the CALLER resolves only the actions and the world facts this
  screen's own row set cannot answer.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EssenceChip from './EssenceChip.svelte';
  import ActionMenu from '../../../components/ActionMenu.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import { getComponentCategoryLabel } from '../../../../../utils/componentCategories.js';
  import {
    componentAttributionNote,
    componentCategorySourceText,
    componentInspectorSubline,
    componentSalvageInLabel,
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

  const salvageHeading = $derived(componentSalvageInLabel(systemName, text));
  const systemTags = $derived(Array.isArray(selectedComponent?.tags) ? selectedComponent.tags : []);
  // The DRAWN run, for `ComponentRow`'s reason (issue 1371 r22-store4): the card's `essences` is
  // the whole resolved map the component editor is seeded from, and `essenceChips` is what the
  // shared chip model draws from it.
  const essenceRun = $derived(selectedComponent?.essenceChips ?? selectedComponent?.essences);
  const essences = $derived(Array.isArray(essenceRun) ? essenceRun : []);
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
          art={selectedComponent.img}
          alt=""
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

      <!-- THE ESSENCE RUN (issue 1371 r18-colour, maintainer ruling M29). The subline above counts
           the essences and, before this revision, that count was the whole of what the inspector
           said about them: `1 essence`, in plain text, for a fact the rules library's row draws as
           a chip and the world bulk panel draws in colour. Each essence is now drawn under the
           subline as the shared `EssenceChip` — its glyph, its name and its quantity, inked in the
           colour the Essence Catalogue gave it — at the inspector's own chip scale, the one the
           `Tags in effect` run below uses. It is gated on there BEING any: an empty run under
           `0 essences` would say the same nothing twice. -->
      {#if essences.length > 0}
        <div class="manager-chip-row" data-component-essence-list>
          {#each essences as essence (essence.id)}
            <EssenceChip {essence} showName density="inspector" />
          {/each}
        </div>
      {/if}

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
                <!-- Each chip NAMES ITS ORIGIN in a `title` and in COLOUR: the split counter above
                     says how many came from where, and the chips say which. World is blue and the
                     system's own is purple, the same pairing the rules editor's two runs use; this
                     run had them inverted, so the two screens disagreed about what purple means.

                     `density="inspector"` is a MEASUREMENT, not a preference: the reference's pill
                     lays out at the default chip's height, and neither micro variant is nearer
                     (`list` 13px, `tag-run` 25px). What a `compare` run measured was never a size
                     but the base scale's weight, size and inset. It goes on BOTH halves, and is
                     deliberately geometry-only: the halves are differently TONED on purpose, and a
                     scale on one would draw the run at two sizes. -->
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
        THE ONE STATE THIS PANEL KEEPS THAT THE REFERENCE'S AT-REST FRAME DOES NOT DRAW. The source
        register is gone with the rest of the world data, but a DANGLING LINK is not that: it is the
        component claiming a document that no longer exists, and the only thing on this screen a GM
        has to act on. It renders ONLY in that state, so the at-rest anatomy stays exact.
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
        <!-- `Salvage in` and the name as TWO nodes, as `proto:1263` draws them (issue 1371
             r12-list). No whitespace between the parts: the lead carries its own trailing
             space, so the sentence is byte-identical to the one-string form it replaces. -->
        <p class="manager-micro-label" data-component-salvage-label>
          {salvageHeading.lead}<span data-component-salvage-system>{salvageHeading.name}</span
          >{salvageHeading.trail}
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
