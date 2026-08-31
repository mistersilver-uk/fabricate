<!-- Svelte 5 runes mode -->
<!--
  The world ESSENCE ENTRY editor (issue 1372, epic 1357): one essence's shared identity, its two
  world defaults, and the crafting systems that hold it.

  ── ONLY TWO FIELDS TAKE A WORLD DEFAULT ──────────────────────────────────────────────────────
  `effectSource` and `macro`, which are exactly `ESSENCE_SECTIONS`. Everything else Fabricate
  carries for an essence — its per-system `enabled` flag above all — stays on the in-system record
  and takes none, so this screen draws no control for it. A switch over a field the resolver does
  not read through writes a key `normalizeMembership` discards on the next `load()`.

  ── THE `effectSource` PICKER IS THE ENFORCEMENT POINT, AND NOTHING BELOW IT IS ───────────────
  `updateWorldDefaultSection` writes the section value OPAQUELY by design and the normalizer
  coerces SHAPE rather than addressability, so neither can refuse a system-local component id.
  `### Essence scope` requirement 5 binds a world default's `effectSource` to a WORLD-ADDRESSABLE
  referent, and the only place that can be met is where the value is chosen. This screen refuses a
  non-addressable value at the control, states why, and writes nothing.

  A KNOWN LIMIT, RECORDED RATHER THAN WORKED AROUND: `essenceScopeProps` carries the ESSENCE
  corpus alone, so this screen cannot ENUMERATE the world component catalogue and therefore cannot
  offer its ids as options. What it offers is what it can address without that corpus — a document
  UUID — and it validates anything entered through the same predicate the offer filter uses. The
  rule is one function (`worldAddressableEffectSources`), unit-tested against a world component
  roster, so the addressability decision is exercised even where this screen cannot enumerate one.

  ── TWO TABS, THROUGH THE SHARED `EditorTabs` ────────────────────────────────────────────────
  Definition and Validation. `EssenceEditorTabs` is the pre-promotion hand-rolled strip and is NOT
  converted here: converting a shipped site changes its rendered ids, which
  `ui-integration/spec.md` calls a defect. A NEW editor uses the promoted primitive directly.

  ── NO PAGE TITLE ────────────────────────────────────────────────────────────────────────────
  The shell's header renders the `<h1>` and the three-crumb trail; a second title here is the
  duplication `ScopedPlaceholderPage` records against the first frame of a world page.

  Declared props are EXACTLY the four bundle keys plus the two static attributes the call site
  passes. See `CraftingSystemManagerRoot.svelte`: a name declared here that the site does not pass
  falls through to the spread and subscribes its readers to the whole bundle.

  Props:
   - scope / actions: from `essenceScopeProps`. The `systems` roster is deliberately NOT declared:
     the membership rows come from `entry.systems`, which is the projection's JOIN and the only
     source that can answer `member`, `inherited` and `enabled`, so declaring the narrowed
     `{id, name}` roster beside it would offer a second answer to one question.
   - entityId: which essence this entry is open on.
   - onBackToCatalogue(): the middle breadcrumb's target, also offered as a control here.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import EditorTabs from '../EditorTabs.svelte';
  import EmptyState from '../EmptyState.svelte';
  import EssenceBehaviorPreview from '../essences/EssenceBehaviorPreview.svelte';
  import { essenceValidationPresentation } from '../essences/essenceStudio.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import ManagerColorPopover from '../../../components/ManagerColorPopover.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../../util/essenceIcons.js';
  import MembershipActions from './MembershipActions.svelte';
  import ScopedValidationTab from './ScopedValidationTab.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';
  import {
    essenceInheritLine,
    essenceSectionValueName,
    isWorldAddressableEffectSource,
    isDocumentUuid,
  } from './essenceScoped.js';

  let { scope = null, actions = null, entityId = '', onBackToCatalogue = () => {} } = $props();

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders for
  // this route. See the twin block in `WorldEssenceCataloguePage.svelte`.
  const PAGE_ID = 'world-essence-entry';
  const PAGE_ICON = 'fas fa-vial';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle';
  const TITLE_FALLBACK = 'Essence entry';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  let activeTab = $state('definition');
  let armedToken = $state('');
  /** @type {{[section: string]: string}} */
  let sectionDraft = $state({});
  /** @type {{[section: string]: string}} */
  let sectionRefusal = $state({});

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const entry = $derived(
    (scope?.entries ?? []).find((candidate) => candidate.id === entityId) ?? null
  );
  const entity = $derived(entry?.entity ?? null);
  const normalizedIcon = $derived(normalizeEssenceIcon(entity?.icon || DEFAULT_ESSENCE_ICON));
  const defaults = $derived(entry?.defaults ?? null);
  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);

  const validationContext = $derived({
    scope: 'world',
    memberSystemCount: Number(entry?.membershipCount) || 0,
    worldEffectSource: defaults?.effectSource ?? null,
    worldMacro: defaults?.macro ?? null,
    worldEffectSourceName: essenceSectionValueName(defaults?.effectSource),
    worldMacroName: essenceSectionValueName(defaults?.macro),
  });
  const presentation = $derived(
    essenceValidationPresentation(entity, validationContext, text, format)
  );
  const counts = $derived(presentation.counts);

  const previewEssence = $derived({
    id: entity?.id ?? '',
    name: entity?.name ?? '',
    icon: entity?.icon || PAGE_ICON,
    colorToken: entity?.colorToken || '',
    description: entity?.description ?? '',
    enabled: true,
    hasEffectTransfer: Boolean(defaults?.effectSource),
    hasPropertyMacro: Boolean(defaults?.macro),
  });

  const TABS = [
    { id: 'definition', icon: 'fas fa-fingerprint', label: 'Definition' },
    { id: 'validation', icon: 'fas fa-clipboard-check', label: 'Validation' },
  ];

  const tabs = $derived(
    TABS.map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      labelKey:
        tab.id === 'definition'
          ? 'FABRICATE.Admin.Manager.Scoped.Essence.TabDefinition'
          : 'FABRICATE.Admin.Manager.Scoped.Essence.TabValidation',
      label: tab.label,
    }))
  );

  const badges = $derived({ validation: validationBadge(counts) });
  const summaryStatus = $derived(worstStatus(counts));

  /**
   * The Validation tab's badge. An early-return chain rather than a nested ternary, which
   * SonarCloud reports as S3358.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {{label: string, tone: string}|string}
   */
  function validationBadge(current) {
    if (current.blocking > 0) return { label: String(current.blocking), tone: 'danger' };
    if (current.warnings > 0) return { label: String(current.warnings), tone: 'warning' };
    return '';
  }

  /**
   * The summary row's status word, by the WORST outcome present.
   *
   * @param {{blocking: number, warnings: number}} current
   * @returns {string}
   */
  function worstStatus(current) {
    if (current.blocking > 0) return 'block';
    return current.warnings > 0 ? 'warn' : 'pass';
  }

  function systemLabel(row) {
    const named = typeof row?.systemName === 'string' ? row.systemName.trim() : '';
    return named || String(row?.systemId ?? '');
  }

  function sectionValueName(section) {
    return essenceSectionValueName(defaults?.[section]);
  }

  /**
   * Whether a candidate value may be written as this section's world default.
   *
   * `effectSource` goes through the addressability predicate; `macro` requires a document UUID
   * for the same reason and by the same test — a Macro is addressed by UUID everywhere else in
   * this product, and a bare token names nothing outside the system that minted it.
   *
   * @param {string} section
   * @param {string} value
   * @returns {boolean}
   */
  function acceptable(section, value) {
    if (section === 'effectSource') return isWorldAddressableEffectSource(value, []);
    return isDocumentUuid(value);
  }

  async function applySection(section) {
    const value = String(sectionDraft[section] ?? '').trim();
    if (!acceptable(section, value)) {
      sectionRefusal = {
        ...sectionRefusal,
        [section]: text(
          'FABRICATE.Admin.Manager.Scoped.Essence.NotAddressable',
          'A world default must name something every system can address — a document UUID. A component id belongs to one system alone.'
        ),
      };
      return;
    }
    sectionRefusal = { ...sectionRefusal, [section]: '' };
    await actions?.updateWorldDefaultSection?.(entityId, section, value);
    sectionDraft = { ...sectionDraft, [section]: '' };
  }

  async function clearSection(section) {
    sectionRefusal = { ...sectionRefusal, [section]: '' };
    await actions?.updateWorldDefaultSection?.(entityId, section, null);
  }

  async function patchIdentity(field, value) {
    await actions?.updateEntity?.(entityId, { [field]: value });
  }
</script>

<main class="manager-main" data-scoped-page="world-essence-entry" aria-label={title}>
  {#if !entry}
    <EmptyState
      icon={PAGE_ICON}
      title={text('FABRICATE.Admin.Manager.Scoped.Essence.EntryMissingTitle', 'No essence chosen')}
      hint={text(
        'FABRICATE.Admin.Manager.Scoped.Essence.EntryMissingHint',
        'This entry is open on an essence the world corpus no longer holds. Return to the catalogue and choose one.'
      )}
      dataAttr="data-scoped-entry-state"
      dataValue="missing"
    >
      <ManagerButton data-scoped-entry-back onclick={() => onBackToCatalogue()}>
        {text('FABRICATE.Admin.Manager.Scoped.Essence.BackToCatalogue', 'Back to the catalogue')}
      </ManagerButton>
    </EmptyState>
  {:else}
    <!--
    ONE CHILD OF `<main>`, WITH ITS OWN TWO-ROW GRID.

    `.manager-main` is `display: grid` with a single `minmax(0, 1fr)` row for a full-width world
    route, so TWO children land in the same grid area and paint over each other: measured in the
    View Lab, the identity fields's label sat under the shell's search box and the tab strip sat under them. `styles/fabricate.css` is closed to this lane by
    `### GM World Scoped Entity Routes` requirement 7, so the row split belongs here — and it
    belongs here anyway, because it is this page's composition rather than the route's.
  -->
    <div class="manager-scoped-entry-page">
      <EditorTabs
        {tabs}
        {activeTab}
        {badges}
        onSelect={(tab) => (activeTab = tab)}
        ariaLabelKey="FABRICATE.Admin.Manager.Scoped.Essence.EntryTabsLabel"
        ariaLabel="Essence definition sections"
        idStem="scoped-essence-entry"
        hookAttribute="data-scoped-entry-tab"
        badgeAttribute="data-scoped-entry-tab-badge"
      />

      <div
        class="manager-scoped-entry-panel"
        data-scoped-entry={PAGE_ID}
        id={`scoped-essence-entry-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`scoped-essence-entry-tab-${activeTab}`}
        tabindex="-1"
        data-keyboard-focus="true"
      >
        {#if activeTab === 'definition'}
          <section class="manager-scoped-entry-identity" data-scoped-entry-identity={entry.id}>
            <label class="manager-scoped-entry-field">
              <span class="manager-scoped-entry-label"
                >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldName', 'Name')}</span
              >
              <input
                type="text"
                value={entity?.name ?? ''}
                data-scoped-entry-name
                onchange={(event) => patchIdentity('name', event.currentTarget.value)}
              />
            </label>
            <!--
              THE SAME THREE CONTROLS THE SYSTEM-SCOPE IDENTITY TAB USES, and for the reason the
              shells were built on: a GM authors one essence's identity, and it must not be a
              searchable picker in one scope and a text box in the other.

              This shipped as `<input type="text">` for both, which asked a GM to type a
              FontAwesome class (`fas fa-atom`) and a palette token (`lavender`) from memory,
              with no validation and no way to discover either. `getEssenceIconOptions` and
              `ESSENCE_COLOR_TOKENS` were already shipped and already unused.

              `ManagerColorPopover` takes `layout="inline"` here exactly as
              `EssenceIdentityTab` does: the popover chrome is applied by the global sheet,
              which this lane may not open, and inline strips it and nothing else.
            -->
            <div class="manager-scoped-entry-identity-tile">
              <span class="manager-scoped-entry-label"
                >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldIcon', 'Icon')}</span
              >
              <Medallion
                icon={normalizedIcon}
                tint={entity?.colorToken || ''}
                size={96}
                glyph={36}
              />
              <IconPicker
                value={normalizedIcon}
                buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
                onChange={(iconClass) => patchIdentity('icon', iconClass)}
              />
            </div>
            <div class="manager-scoped-entry-field" data-scoped-entry-colour>
              <span class="manager-scoped-entry-label"
                >{text('FABRICATE.Admin.Manager.Scoped.Essence.FieldColour', 'Colour')}</span
              >
              <ManagerColorPopover
                layout="inline"
                allowNone
                allowCustom={false}
                manageDismiss={false}
                colorToken={entity?.colorToken || ''}
                unset={!entity?.colorToken}
                customColor=""
                presetGridLabel={text(
                  'FABRICATE.Admin.Manager.Essence.Colour.Presets',
                  'Essence colour presets'
                )}
                noneLabel={text('FABRICATE.Admin.Manager.Essence.Colour.None', 'No colour')}
                onClear={() => patchIdentity('colorToken', '')}
                onChange={(next) => patchIdentity('colorToken', next?.colorToken || '')}
              />
            </div>
            <label class="manager-scoped-entry-field is-wide">
              <span class="manager-scoped-entry-label"
                >{text(
                  'FABRICATE.Admin.Manager.Scoped.Essence.FieldDescription',
                  'Description'
                )}</span
              >
              <textarea
                rows="2"
                value={entity?.description ?? ''}
                data-scoped-entry-description
                onchange={(event) => patchIdentity('description', event.currentTarget.value)}
              ></textarea>
            </label>
          </section>

          <!-- THE TWO WORLD DEFAULTS. Each states how many member systems inherit it and how many
               override it locally BEFORE the change lands, because that count is the whole reach of
               the edit and a GM cannot recover it after the fact. -->
          <section class="manager-scoped-entry-defaults">
            {#each sections as section (section)}
              {@const value = sectionValueName(section)}
              <div
                class="manager-scoped-entry-default"
                data-scoped-world-default={section}
                data-scoped-world-default-state={value ? 'set' : 'unset'}
              >
                <h3 class="manager-scoped-entry-default-head">
                  {scopedSectionLabel(section, text)}
                </h3>
                <p
                  class="manager-scoped-entry-default-value"
                  data-scoped-world-default-value={section}
                >
                  {value ||
                    text(
                      'FABRICATE.Admin.Manager.Scoped.Essence.DefaultUnset',
                      'No world default set'
                    )}
                </p>
                <p class="manager-muted" data-scoped-world-default-inherit={section}>
                  {essenceInheritLine(entry, section, format)}
                </p>
                <div class="manager-scoped-entry-default-controls">
                  <input
                    type="text"
                    value={sectionDraft[section] ?? ''}
                    data-scoped-world-default-input={section}
                    aria-label={format(
                      'FABRICATE.Admin.Manager.Scoped.Essence.DefaultInputLabel',
                      'A document UUID for {section}',
                      { section: scopedSectionLabel(section, text) }
                    )}
                    placeholder="Item.abc123"
                    oninput={(event) =>
                      (sectionDraft = { ...sectionDraft, [section]: event.currentTarget.value })}
                  />
                  <ManagerButton
                    data-scoped-world-default-set={section}
                    onclick={() => applySection(section)}
                  >
                    {text('FABRICATE.Admin.Manager.Scoped.Essence.DefaultSet', 'Set default')}
                  </ManagerButton>
                  {#if value}
                    <ManagerButton
                      data-scoped-world-default-clear={section}
                      onclick={() => clearSection(section)}
                    >
                      {text('FABRICATE.Admin.Manager.Scoped.Essence.DefaultClear', 'Clear')}
                    </ManagerButton>
                  {/if}
                </div>
                {#if sectionRefusal[section]}
                  <p
                    class="manager-muted manager-form-warning"
                    role="alert"
                    data-scoped-world-default-refused={section}
                  >
                    {sectionRefusal[section]}
                  </p>
                {/if}
              </div>
            {/each}
          </section>

          <!-- THE MEMBERSHIP LIST. Rows come from `entry.systems` — the projection's JOIN — and
               never from the `systems` prop, which is a narrowed `{id, name}` roster and cannot
               answer `member`, `inherited` or `enabled`. -->
          <section class="manager-scoped-entry-systems">
            <h3 class="manager-scoped-entry-default-head">
              {text('FABRICATE.Admin.Manager.Scoped.Essence.SystemsHead', 'Crafting systems')}
            </h3>
            <ul class="manager-scoped-entry-system-list" role="list">
              {#each entry.systems ?? [] as row (row.systemId)}
                <li class="manager-scoped-entry-system" data-scoped-entry-system={row.systemId}>
                  <span class="manager-scoped-entry-system-name">{systemLabel(row)}</span>
                  <MembershipActions
                    entityType="essence"
                    entityId={entry.id}
                    systemId={row.systemId}
                    entityName={entity?.name ?? entry.id}
                    systemName={systemLabel(row)}
                    member={row.member === true}
                    enabled={row.enabled === true}
                    {armedToken}
                    onArm={(token) => (armedToken = token)}
                    onDisarm={() => (armedToken = '')}
                    onAdd={() => actions?.addToSystem?.(entry.id, row.systemId)}
                    onRemove={() => actions?.removeFromSystem?.(entry.id, row.systemId)}
                    onToggleEnabled={(next) => actions?.setEnabled?.(entry.id, row.systemId, next)}
                  />
                </li>
              {/each}
            </ul>
          </section>

          <section class="manager-scoped-entry-preview" data-scoped-entry-preview>
            <EssenceBehaviorPreview
              essence={previewEssence}
              effectTransferEnabled={Boolean(defaults?.effectSource)}
              propertyMacrosEnabled={Boolean(defaults?.macro)}
              sourceName={sectionValueName('effectSource')}
              macroName={sectionValueName('macro')}
              showLiveNote={false}
            />
          </section>
        {:else}
          <ScopedValidationTab
            stackClass="manager-scoped-tab-stack"
            hookAttribute="data-scoped-entry-tab-panel"
            hookValue="validation"
            title={text('FABRICATE.Admin.Manager.Scoped.Essence.TabValidation', 'Validation')}
            intro={text(
              'FABRICATE.Admin.Manager.Scoped.Essence.ValidationIntro',
              'A world essence always saves. These checks report what is unfinished for the systems that share it.'
            )}
            summary={{
              status: summaryStatus,
              icon: 'fas fa-clipboard-check',
              title: text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ValidationTitle',
                'World defaults'
              ),
              sub: text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ValidationSub',
                'Every system that inherits reads what is set here.'
              ),
            }}
            {counts}
            groups={presentation.groups}
            rowDataAttr="data-scoped-entry-validation-check"
            blockLabel={text(
              'FABRICATE.Admin.Manager.Essence.Validation.StatusBlock',
              'INCOMPLETE'
            )}
          />
        {/if}
      </div>
    </div>
  {/if}
</main>

<style>
  /* STATIC class names, so `lint:svelte:warnings` stays at zero and `styles/fabricate.css` —
     closed to this lane by `### GM World Scoped Entity Routes` requirement 7 — is not reopened. */
  .manager-scoped-entry-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-entry-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-entry-identity {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The medallion and its picker travel together as one control, so the picker sits under the
     swatch it changes rather than beside an unrelated field. Matches the system-scope identity
     tab's tile, at the smaller size this panel's column allows. */
  .manager-scoped-entry-identity-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-field {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    flex: 1 1 12rem;
    min-width: 0;
  }

  .manager-scoped-entry-field.is-wide {
    flex: 1 1 100%;
  }

  .manager-scoped-entry-label {
    color: var(--fab-mv2-text);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .manager-scoped-entry-defaults {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-default {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-scoped-entry-default-head {
    margin: 0;
    color: var(--fab-mv2-text);
    font-family: var(--fab-font-serif);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .manager-scoped-entry-default-value {
    margin: 0;
    color: var(--fab-mv2-text);
    font-size: 0.82rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-scoped-entry-default-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    align-items: center;
    min-width: 0;
  }

  .manager-scoped-entry-systems {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-scoped-entry-system-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  /*
     NAME AND ACTIONS ON ONE LINE.

     This stacked them, so each system cost roughly 68px and six systems pushed the preview and
     everything below it off the screen. The membership row is a label and its controls, which is
     the shape the shell's own membership rows use, and there is nothing in it that needs two
     lines at this width. Wrapping is still allowed so a long system name breaks rather than
     forcing the controls out of the panel.
  */
  .manager-scoped-entry-system {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-chip) 0;
  }

  .manager-scoped-entry-system + .manager-scoped-entry-system {
    border-top: 1px solid var(--fab-mv2-border);
  }

  .manager-scoped-entry-system-name {
    flex: 1 1 auto;
    color: var(--fab-mv2-text);
    font-size: 0.78rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  .manager-scoped-entry-preview {
    min-width: 0;
  }
</style>
