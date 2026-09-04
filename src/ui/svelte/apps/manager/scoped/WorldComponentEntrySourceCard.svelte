<!-- Svelte 5 runes mode -->
<!--
  The world Component entry's `Source identity` card (issue 1371, maintainer parity round 4).

  == IT IS A CARD WITH A HEAD, NOT A KICKERED BLOCK =========================================
  `proto:845-879` draws a `fa-fingerprint` glyph in INFO ink, an `h3` at 14px serif and a
  subtitle sentence, over four stacked regions: the uuid well with its two controls, a compact
  replace target, the alias label and its add row, and the alias chips. Round 3 shipped a bare
  8.5px `Linked item` kicker over the shared `ItemDropZone` in its LINKED form, which repeats
  the art and the name the identity card above it already draws.

  == IT IS A SEPARATE FILE BECAUSE THE PAGE IS ONE ==========================================
  The entry page holds five cards, a rail and a buffered draft. Each card lifted out of it is
  markup the page no longer has to interleave with the draft wires, and this one carries the
  most state of the five: the copy acknowledgement, the alias draft and the duplicate scan.

  == EVERY WRITE HERE IS IMMEDIATE, NOT BUFFERED ============================================
  A drop, an unlink and an alias edit all rewrite the world entity's SOURCE-LINK fields, which
  `IDENTITY_FIELDS` deliberately does not buffer: they are resolved from a Foundry document
  through the shell rather than typed, so there is nothing for a Save to hold.
-->
<script>
  import Callout from '../Callout.svelte';
  import Chip from '../Chip.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';

  let {
    entryId = '',
    sourceUuid = '',
    aliasUuids = [],
    duplicateCount = 0,
    text = (key, fallback) => fallback,
    phrase = (key, fallback) => fallback,
    onSourceDrop = () => {},
    onUnlinkSource = null,
    onCopySourceUuid = () => {},
    onAddAlias = () => {},
    onRemoveAlias = () => {},
    // THE MERGE ROUTE, WITHHELD WHEN THERE IS NONE. `proto:872-878` puts a `Review & merge`
    // action in the duplicate band; this repository has no merge screen to route to, and the
    // shipped rule at every other exit on this page — `onUnlink`, `onOpenWorldVocabulary` — is
    // that a call site with no destination renders no dead affordance. The BAND still draws,
    // because the state it reports is real whether or not a screen exists to resolve it.
    onReviewDuplicates = null,
  } = $props();

  // THE COPY ACKNOWLEDGEMENT (`Copy` -> `Copied`), which is the whole feedback this control has:
  // the clipboard write is silent, so without the label change a GM cannot tell a successful copy
  // from a dead button. It resets on a timer rather than on a second click, because the state it
  // reports is "this just happened" rather than a mode.
  let copied = $state(false);
  let aliasDraft = $state('');

  function copyUuid() {
    if (!sourceUuid) return;
    onCopySourceUuid(sourceUuid);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1600);
  }

  function commitAlias() {
    const uuid = aliasDraft.trim();
    if (!uuid) return;
    aliasDraft = '';
    onAddAlias(uuid);
  }

  /**
   * Commit the alias on Enter, which is what the placeholder promises.
   *
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  function onAliasKey(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitAlias();
  }
</script>

<InspectorCard
  class="manager-component-entry-card manager-component-entry-source"
  data-scoped-entry-source={entryId}
  data-scoped-entry-source-card=""
>
  <div class="manager-component-entry-card-head">
    <i class="fas fa-fingerprint manager-card-glyph is-info" aria-hidden="true"></i>
    <div class="manager-component-entry-card-head-copy">
      <h3 class="manager-card-heading">
        {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.SourceTitle', 'Source identity')}
      </h3>
      <p class="manager-subtitle">
        {text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.SourceSubtitle',
          'How the world recognises this item on import, so two copies never become two entries.'
        )}
      </p>
    </div>
  </div>

  {#if sourceUuid}
    <div class="manager-component-entry-uuid-well">
      <div class="manager-component-entry-uuid-copy">
        <p class="manager-micro-label" data-scoped-entry-source-uuid-label>
          {text(
            'FABRICATE.Admin.Manager.Scoped.Component.Entry.SourceUuidLabel',
            'Source item uuid'
          )}
        </p>
        <span class="manager-component-entry-uuid" data-scoped-entry-source-uuid>{sourceUuid}</span>
      </div>
      <div class="manager-component-entry-uuid-actions">
        <ManagerButton
          class="manager-component-entry-mini-action"
          data-scoped-entry-source-copy
          onclick={copyUuid}
        >
          <i class={copied ? 'fas fa-check' : 'far fa-copy'} aria-hidden="true"></i>
          <span
            >{copied
              ? text('FABRICATE.Admin.Manager.Scoped.Component.Copied', 'Copied')
              : text('FABRICATE.Admin.Manager.Scoped.Component.Copy', 'Copy')}</span
          >
        </ManagerButton>
        {#if onUnlinkSource}
          <ManagerButton
            class="manager-component-entry-mini-action"
            data-scoped-entry-source-unlink
            onclick={() => onUnlinkSource()}
          >
            <i class="fas fa-link-slash" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Scoped.Component.UnlinkItem', 'Unlink Item')}</span
            >
          </ManagerButton>
        {/if}
      </div>
    </div>
  {/if}

  <!-- THE COMPACT PROMPT, never the linked-item summary: `proto:856-861` draws a glyph over a
       one-line title and a one-line note, and the art, name and uuid the default form repeats are
       already drawn by the identity card above and the well above this. -->
  <ItemDropZone
    compact
    kind="component-source"
    emptyIcon="fas fa-right-left"
    title={text(
      'FABRICATE.Admin.Manager.Scoped.Component.Entry.SourceDropTitle',
      'Drop an item to replace the source'
    )}
    hint={text(
      'FABRICATE.Admin.Manager.Scoped.Component.Entry.SourceDropNote',
      'World item, compendium entry, or pack — the uuid, name, art and description come from it. Every system sees the change at once.'
    )}
    onDrop={onSourceDrop}
  />

  <p class="manager-micro-label" data-scoped-entry-alias-label>
    {text(
      'FABRICATE.Admin.Manager.Scoped.Component.Entry.AliasesLabel',
      'Aliases · matched on import'
    )}
  </p>

  <!--
    THE ALIAS LIST IS AUTHORED, NOT DISPLAYED. `aliasItemUuids` is a real source-link field that a
    merge UNIONS across its group, and it is what keeps a re-pointed link matching the Item a
    player already owns.
  -->
  <div class="manager-component-entry-alias-row">
    <div class="manager-component-entry-alias-field">
      <i class="fas fa-fingerprint" aria-hidden="true"></i>
      <input
        type="text"
        value={aliasDraft}
        placeholder={text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.AliasPlaceholder',
          'Paste an item uuid, then Enter'
        )}
        aria-label={text(
          'FABRICATE.Admin.Manager.Scoped.Component.Entry.AliasPlaceholder',
          'Paste an item uuid, then Enter'
        )}
        data-scoped-entry-alias-input
        oninput={(event) => (aliasDraft = event.currentTarget.value)}
        onkeydown={onAliasKey}
      />
    </div>
    <ManagerButton
      role="ghost"
      class="manager-component-entry-mini-action"
      disabled={aliasDraft.trim() === ''}
      data-scoped-entry-alias-add
      onclick={commitAlias}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Scoped.Component.AliasAdd', 'Add alias')}</span>
    </ManagerButton>
  </div>

  <div class="manager-component-entry-chips" data-scoped-entry-aliases={entryId}>
    {#each aliasUuids as alias (alias)}
      <Chip
        tag="button"
        type="button"
        tone="neutral"
        icon="fas fa-xmark"
        mono
        data-scoped-entry-alias={alias}
        aria-label={phrase(
          'FABRICATE.Admin.Manager.Scoped.Component.AliasRemove',
          'Stop matching {uuid}',
          { uuid: alias }
        )}
        onclick={() => onRemoveAlias(alias)}>{alias}</Chip
      >
    {/each}
    {#if aliasUuids.length === 0}
      <span class="manager-component-entry-alias-empty" data-scoped-entry-aliases-empty
        >{text('FABRICATE.Admin.Manager.Scoped.Component.AliasesEmpty', 'No aliases yet.')}</span
      >
    {/if}
  </div>

  {#if duplicateCount > 0}
    <!-- THE BAND IS A `Callout` AND THE ACTION IS ITS SIBLING, not its child: `Callout` renders a
         `<p>` with no snippet slot, and a control nested inside a paragraph is invalid markup a
         primitive extension would have to introduce for one call site with no route to offer. -->
    <div class="manager-component-entry-duplicate">
      <Callout
        tone="warning"
        icon="fas fa-clone"
        text={phrase(
          duplicateCount === 1
            ? 'FABRICATE.Admin.Manager.Scoped.Component.Entry.DuplicateNoteOne'
            : 'FABRICATE.Admin.Manager.Scoped.Component.Entry.DuplicateNote',
          duplicateCount === 1
            ? '{count} other catalogue entry names the same source item, so an import can create a second record for one item.'
            : '{count} other catalogue entries name the same source item, so an import can create a second record for one item.',
          { count: duplicateCount }
        )}
        dataAttr="data-scoped-entry-duplicate-source"
      />
      {#if onReviewDuplicates}
        <ManagerButton
          role="warning"
          class="manager-component-entry-mini-action"
          data-scoped-entry-duplicate-review
          onclick={() => onReviewDuplicates()}
        >
          {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.DuplicateReview', 'Review & merge')}
        </ManagerButton>
      {/if}
    </div>
  {/if}
</InspectorCard>
