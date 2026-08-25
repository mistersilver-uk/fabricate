<!-- Svelte 5 runes mode -->
<!--
  System Overview page. A full-width tabbed shell (mirroring the environment
  editor's EnvironmentEditView) with two tabs: Settings (the system settings form
  and the issue 454 system-blocker banner) and Validation (the kind-grouped validation
  issue list rendered by SystemOverviewView). The standalone "Overview" route was
  folded in here; the Settings tab is the default, and callers that want the
  validation list open pass `requestedTab='validation'`. GM-only by construction:
  the whole crafting manager admin is GM-scoped.

  The Settings tab authors what belongs to THIS system: its identity, its optional features
  and the participation toggles. The world-scope libraries it used to host have moved out to
  their own routes — the coin ladder in issue 1278, and the modifier and character-prerequisite
  libraries in issue 1311, both now under World > Rules & Resources. Nothing of them is left
  behind here, disabled or otherwise; what stays is the per-system boolean, where there is one.
-->
<script>
  import Chip from './Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import SystemEditorTabs from './system/SystemEditorTabs.svelte';
  import SystemOverviewView from './SystemOverviewView.svelte';

  let {
    selectedSystem = null,
    // True when the system carries a `blocks:'system'` validation issue. Drives a
    // GM-only full-width callout above the identity card on the Settings tab. The
    // whole crafting manager admin is GM-scoped, so this is GM-only by
    // construction.
    systemBlocked = false,
    // The `evaluateSystemValidation` report driving the Validation tab's
    // kind-grouped issue list and the tab's open-issue badge.
    validationReport = {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    },
    // The tab the page should open on. The parent bumps `requestedTab` (and a
    // matching nonce) to request the Validation tab — e.g. from the blocker banner
    // link or a folded-in overview deep link.
    requestedTab = 'settings',
    // Bumped by the parent alongside `requestedTab` so re-requesting the same tab
    // (or re-selecting the same system) still re-applies the requested tab.
    requestedTabNonce = 0,
    onSelectIssue = () => {},
    onShowSystemOverview = () => {},
    onSaveDetails = () => {},
    // Lift the identity draft (Name + Description) up to the root so the Manager
    // route-exit guard can persist it on a Save-and-navigate. Emitted on every
    // input, mirroring the essence/component `onDraftChange` → root draft pattern.
    onDetailsChange = () => {},
    // Report the local dirty state up so the root can gate the route-exit guard. This
    // is the root's ONLY dirtiness signal: the comparison is against the live
    // `selectedSystem` projection and only this view holds the typed inputs, so the
    // root cannot re-derive it from the lifted draft alone.
    onDirtyChange = () => {},
    // Bumped by the root (discard branch of the guard) to force the local inputs to
    // re-seed from the persisted system even when the system id is unchanged. A
    // counter rather than a flag, so a second discard on the SAME system still
    // registers as a change (the `requestedTabNonce` idiom above).
    reseedNonce = 0,
    onToggleFeature = async () => true,
    // Currency's only remaining surface here is the participation toggle (issue 1278). The ladder,
    // spend strategy, provider and macro set are world scope and are authored under World > Currency.
    onToggleCurrency = async () => {},
    // Travel & Realms' only surface here is the participation toggle (issue 1282). The realm
    // library, its reveal mode and its modifier visibility are world scope and are authored
    // under World > Travel.
    onToggleGatheringRealms = async () => {},
    onToggleTime = async () => {},
  } = $props();

  // Settings is the default tab. A bumped `requestedTabNonce` re-applies the
  // parent's `requestedTab` (so the blocker-link / folded-in overview deep link
  // can force the Validation tab open even when this page is already mounted, and
  // re-selecting the same system resets the tab sensibly).
  let activeTab = $state('settings');
  let appliedRequestNonce = $state(-1);
  $effect(() => {
    if (requestedTabNonce !== appliedRequestNonce) {
      appliedRequestNonce = requestedTabNonce;
      activeTab = requestedTab === 'validation' ? 'validation' : 'settings';
    }
  });

  const validationCounts = $derived(
    validationReport?.counts || { critical: 0, warning: 0, info: 0, blockers: 0 }
  );
  const validationBadges = $derived([
    ...(validationCounts.critical > 0
      ? [{ label: String(validationCounts.critical), tone: 'danger' }]
      : []),
    ...(validationCounts.warning > 0
      ? [{ label: String(validationCounts.warning), tone: 'warning' }]
      : []),
  ]);
  const tabBadges = $derived({ validation: validationBadges });

  const currencyEnabled = $derived(selectedSystem?.requirements?.currency?.enabled === true);
  // Travel & Realms is meaningful only to a gathering system: everything the toggle governs —
  // location-gated environment access, the environment realm controls, party realm overrides —
  // is a gathering affordance. It moved here from the Gathering Settings tab (issue 1282),
  // which carried the same gate implicitly.
  const gatheringFeatureEnabled = $derived(selectedSystem?.features?.gathering === true);
  const gatheringRealmsEnabled = $derived(selectedSystem?.gatheringRealmSettings?.enabled === true);
  // Time requirements default ON (issue 714): an absent flag reads as enabled, so only
  // an explicit GM opt-out (`enabled === false`) turns the toggle off.
  const timeRequirementsEnabled = $derived(selectedSystem?.requirements?.time?.enabled !== false);

  async function handleToggleCurrency() {
    await onToggleCurrency(!currencyEnabled);
  }

  async function handleToggleGatheringRealms() {
    await onToggleGatheringRealms(!gatheringRealmsEnabled);
  }

  async function handleToggleTime() {
    await onToggleTime(!timeRequirementsEnabled);
  }

  // A system with no registered provider has nothing to drive the actorInventory strategy: the
  // resolved provider id is empty and its canonical ladder is empty. The store guards against
  // wiping the GM's units, and the editor surfaces a steer-to-macro callout in that case.

  let systemNameValue = $state('');
  let systemDescriptionValue = $state('');

  // Seed the local inputs from the persisted system on IDENTITY change only (or a
  // root-driven `reseedNonce` bump on discard), never on every `selectedSystem`
  // reference change. The admin store publishes `viewState` twice on refresh (a
  // sync publish then an async-enriched publish with a NEW `selectedSystem` object
  // of the same id); a reference-triggered reseed would overwrite the GM's
  // un-saved keystrokes on that second publish (and on any unrelated mid-edit
  // refresh, e.g. a feature toggle). Gating on id/nonce keeps the typed value and
  // lets `detailsDirty` clear naturally after Save re-publishes the projection.
  let lastSeededSystemId = $state(null);
  let appliedReseedNonce = $state(0);
  $effect(() => {
    const currentId = selectedSystem?.id ?? null;
    if (currentId !== lastSeededSystemId || reseedNonce !== appliedReseedNonce) {
      lastSeededSystemId = currentId;
      appliedReseedNonce = reseedNonce;
      systemNameValue = selectedSystem?.name ?? '';
      systemDescriptionValue = selectedSystem?.description ?? '';
    }
  });

  const detailsDirty = $derived(
    (systemNameValue ?? '') !== (selectedSystem?.name ?? '') ||
      (systemDescriptionValue ?? '') !== (selectedSystem?.description ?? '')
  );

  // One-way up: mirror the typed values into the root draft and report dirtiness so
  // the route-exit guard can Save (from the lifted draft) or Discard on navigate.
  $effect(() => {
    onDetailsChange(systemNameValue, systemDescriptionValue);
  });
  $effect(() => {
    onDirtyChange(detailsDirty);
  });

  const featureDefinitions = [
    {
      systemKey: 'gathering',
      storeKey: 'gathering',
      icon: 'fas fa-wheat-awn',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Gathering',
      fallback: 'Gathering',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Gathering',
      hintFallback: 'Shows gathering environments and player gathering flows for this system.',
    },
    {
      systemKey: 'salvage',
      storeKey: 'salvage',
      icon: 'fas fa-recycle',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Salvage',
      fallback: 'Salvage',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Salvage',
      hintFallback:
        'Enables component salvage and the salvage check configuration for this system.',
    },
    {
      systemKey: 'essences',
      storeKey: 'essences',
      icon: 'fas fa-flask',
      labelKey: 'FABRICATE.Admin.Manager.Feature.Essences',
      fallback: 'Essences',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Essences',
      hintFallback: 'Enables essence definitions and essence requirements.',
    },
    {
      systemKey: 'multiStepRecipes',
      storeKey: 'multiStepRecipes',
      icon: 'fas fa-diagram-project',
      labelKey: 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes',
      fallback: 'Multi-step recipes',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.MultiStepRecipes',
      hintFallback: 'Enables explicit recipe steps and step-level requirements.',
    },
    {
      systemKey: 'propertyMacros',
      storeKey: 'propertyMacros',
      icon: 'fas fa-code',
      labelKey: 'FABRICATE.Admin.Manager.Feature.PropertyMacros',
      fallback: 'Property macros',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.PropertyMacros',
      hintFallback: 'Allows macro-backed component property behavior.',
    },
    {
      systemKey: 'effectTransfer',
      storeKey: 'effectTransfer',
      icon: 'fas fa-wand-sparkles',
      labelKey: 'FABRICATE.Admin.Manager.Feature.EffectTransfer',
      fallback: 'Effect transfer',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.EffectTransfer',
      hintFallback: 'Allows crafted results to inherit effects from source components.',
    },
    {
      systemKey: 'chatOutput',
      storeKey: 'chatOutput',
      icon: 'fas fa-comment',
      labelKey: 'FABRICATE.Admin.Manager.Feature.ChatOutput',
      fallback: 'Chat output',
      hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.ChatOutput',
      hintFallback: 'Posts a summary chat card after crafting and gathering attempts.',
    },
  ];

  // Refund-on-player-cancel is authored NEXT TO Time requirements (rendered after it)
  // and only applies to a TIMED craft — a player can only cancel an in-progress timed
  // run — so its toggle is disabled while Time requirements is off (issue 848 follow-up).
  const refundOnCancelFeature = {
    systemKey: 'refundOnPlayerCancel',
    storeKey: 'refundOnPlayerCancel',
    labelKey: 'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
    fallback: 'Refund on player cancel',
  };
  const refundOnCancelVisible = $derived(hasFeatureKey(selectedSystem, 'refundOnPlayerCancel'));
  const refundOnCancelEnabled = $derived(selectedSystem?.features?.refundOnPlayerCancel === true);

  const visibleFeatures = $derived(
    featureDefinitions.filter((feature) => hasFeatureKey(selectedSystem, feature.systemKey))
  );

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function hasFeatureKey(system, featureKey) {
    return Object.prototype.hasOwnProperty.call(system?.features || {}, featureKey);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSaveDetails(systemNameValue, systemDescriptionValue);
  }

  async function handleToggleFeature(feature) {
    const next = !(selectedSystem?.features?.[feature.systemKey] === true);
    await onToggleFeature(feature.storeKey, next);
  }
</script>

{#if selectedSystem}
  <div class="manager-environment-edit-view manager-system-edit-view" data-system-editor>
    <SystemEditorTabs
      {activeTab}
      badges={tabBadges}
      onSelect={(tab) => {
        activeTab = tab;
      }}
    />

    <div class="manager-environment-workspace manager-system-workspace is-inspector-hidden">
      <div
        class="manager-environment-tab-panel manager-system-tab-panel"
        role="tabpanel"
        id={`system-panel-${activeTab}`}
        aria-labelledby={`system-tab-${activeTab}`}
      >
        {#if activeTab === 'settings'}
          <main
            class="manager-main manager-system-edit-main"
            aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}
          >
            <section class="manager-section-header">
              <div class="manager-heading">
                <p class="manager-kicker">{selectedSystem.name}</p>
                <h2 class="manager-title">
                  {text(
                    'FABRICATE.Admin.Manager.SystemEdit.EditBaseSettings',
                    'Edit base settings'
                  )}
                </h2>
                <p class="manager-subtitle">
                  {text(
                    'FABRICATE.Admin.Manager.SystemEdit.EditBaseSettingsHint',
                    'Changes use the existing admin store persistence and confirmation flows.'
                  )}
                </p>
              </div>
            </section>

            <form class="manager-system-edit-form" onsubmit={handleSubmit}>
              {#if systemBlocked}
                <div
                  class="manager-environment-comp-callout manager-system-edit-blocker"
                  role="note"
                  data-system-edit-blocker
                >
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  <div class="manager-system-edit-blocker-copy">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.SystemEdit.BlockerTitle',
                        'This system has a blocker'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.SystemEdit.BlockerBody',
                        "Players cannot see or use any of this system's recipes until the blocker is resolved. Open the system overview to review and fix it."
                      )}</span
                    >
                  </div>
                  <!-- Ghost (issue 1118, row 8). `ui-integration/spec.md` defines the role
                       as the quiet NAVIGATIONAL verb — "Back, Open, View" — which moves the
                       GM and changes no record, and this control is literally an Open. It
                       sits inside a blocker callout that already carries the alarm, so at
                       the base weight it competed with the copy explaining it. -->
                  <ManagerButton
                    role="ghost"
                    class="manager-system-edit-blocker-link"
                    data-system-edit-blocker-link
                    onclick={() => {
                      activeTab = 'validation';
                      onShowSystemOverview();
                    }}
                  >
                    {text('FABRICATE.Admin.Manager.SystemEdit.BlockerLink', 'Open system overview')}
                  </ManagerButton>
                </div>
              {/if}
              <section class="manager-edit-card">
                <div class="manager-edit-card-heading">
                  <h3 class="manager-card-title">
                    {text('FABRICATE.Admin.Manager.SystemEdit.Identity', 'Identity')}
                  </h3>
                  <!--
            The heading is `justify-content: space-between`, so the chip must share a
            flex-end action group with the Save button to hug it (the house idiom every
            other dirty chip uses); a bare third child would float mid-heading.
          -->
                  <div class="manager-action-group">
                    {#if detailsDirty}
                      <Chip tone="warning" data-system-details-dirty
                        >{text('FABRICATE.Admin.Manager.SystemEdit.Dirty', 'Unsaved')}</Chip
                      >
                    {/if}
                    <ManagerButton role="primary" type="submit" data-system-details-save>
                      <i class="fas fa-save" aria-hidden="true"></i>
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.SaveDetails',
                          'Save details'
                        )}</span
                      >
                    </ManagerButton>
                  </div>
                </div>
                <div class="manager-edit-grid">
                  <label class="manager-field" for="manager-system-name">
                    <span>{text('FABRICATE.Admin.SystemSettings.Name', 'Name')}</span>
                    <input id="manager-system-name" type="text" bind:value={systemNameValue} />
                  </label>
                  <label class="manager-field is-wide" for="manager-system-description">
                    <span>{text('FABRICATE.Admin.SystemSettings.Description', 'Description')}</span>
                    <textarea
                      id="manager-system-description"
                      rows="4"
                      bind:value={systemDescriptionValue}></textarea>
                  </label>
                </div>
              </section>

              <section class="manager-edit-card" data-edit-control="advanced-options">
                <h3 class="manager-card-title">
                  {text('FABRICATE.Admin.Manager.SystemEdit.OptionalFeatures', 'Optional features')}
                </h3>
                <div class="manager-toggle-list">
                  {#each visibleFeatures as feature (feature.systemKey)}
                    <div class="manager-feature-tile" data-feature-key={feature.systemKey}>
                      <span
                        class={`manager-feature-tile-icon ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class={feature.icon}></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong>{text(feature.labelKey, feature.fallback)}</strong>
                          <button
                            type="button"
                            class={`manager-status-toggle ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                            aria-pressed={selectedSystem.features?.[feature.systemKey] === true}
                            aria-label={text(feature.labelKey, feature.fallback)}
                            onclick={() => handleToggleFeature(feature)}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{selectedSystem.features?.[feature.systemKey] === true
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small>{text(feature.hintKey, feature.hintFallback)}</small>
                      </div>
                    </div>
                  {/each}
                  <div class="manager-feature-tile" data-feature-key="time">
                    <span
                      class={`manager-feature-tile-icon ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`}
                      aria-hidden="true"><i class="fas fa-clock"></i></span
                    >
                    <div class="manager-feature-tile-body">
                      <div class="manager-feature-tile-head">
                        <strong
                          >{text(
                            'FABRICATE.Admin.Manager.Feature.Time',
                            'Time requirements'
                          )}</strong
                        >
                        <button
                          type="button"
                          class={`manager-status-toggle ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`}
                          aria-pressed={timeRequirementsEnabled}
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Feature.Time',
                            'Time requirements'
                          )}
                          data-system-time-toggle
                          onclick={handleToggleTime}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true"
                            ><span class="manager-status-toggle-knob"></span></span
                          >
                          <span class="manager-status-toggle-label"
                            >{timeRequirementsEnabled
                              ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                              : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span
                          >
                        </button>
                      </div>
                      <small
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Time',
                          'Enables recipe and step duration (time requirement) authoring, and applies those durations when crafting.'
                        )}</small
                      >
                    </div>
                  </div>
                  {#if refundOnCancelVisible}
                    <div
                      class="manager-feature-tile"
                      class:is-feature-disabled={!timeRequirementsEnabled}
                      data-feature-key="refundOnPlayerCancel"
                    >
                      <span
                        class={`manager-feature-tile-icon ${refundOnCancelEnabled ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class="fas fa-rotate-left"></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong
                            >{text(
                              'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
                              'Refund on player cancel'
                            )}</strong
                          >
                          <button
                            type="button"
                            class={`manager-status-toggle ${refundOnCancelEnabled ? 'is-on' : 'is-off'}`}
                            aria-pressed={refundOnCancelEnabled}
                            aria-label={text(
                              'FABRICATE.Admin.Manager.Feature.RefundOnPlayerCancel',
                              'Refund on player cancel'
                            )}
                            data-system-refund-toggle
                            disabled={!timeRequirementsEnabled}
                            onclick={() => {
                              if (timeRequirementsEnabled)
                                handleToggleFeature(refundOnCancelFeature);
                            }}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{refundOnCancelEnabled
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small
                          >{timeRequirementsEnabled
                            ? text(
                                'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.RefundOnPlayerCancel',
                                'Returns consumed ingredients and spent currency when a player cancels their in-progress craft. Turn off to forfeit inputs on cancel.'
                              )
                            : text(
                                'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.RefundOnPlayerCancelDisabled',
                                'Enable Time requirements to configure this — a player can only cancel a timed craft in progress.'
                              )}</small
                        >
                      </div>
                    </div>
                  {/if}
                  <div class="manager-feature-tile" data-feature-key="currency">
                    <span
                      class={`manager-feature-tile-icon ${currencyEnabled ? 'is-on' : 'is-off'}`}
                      aria-hidden="true"><i class="fas fa-coins"></i></span
                    >
                    <div class="manager-feature-tile-body">
                      <div class="manager-feature-tile-head">
                        <strong
                          >{text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}</strong
                        >
                        <button
                          type="button"
                          class={`manager-status-toggle ${currencyEnabled ? 'is-on' : 'is-off'}`}
                          aria-pressed={currencyEnabled}
                          aria-label={text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}
                          data-system-currency-toggle
                          onclick={handleToggleCurrency}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true"
                            ><span class="manager-status-toggle-knob"></span></span
                          >
                          <span class="manager-status-toggle-label"
                            >{currencyEnabled
                              ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                              : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span
                          >
                        </button>
                      </div>
                      <small
                        >{text(
                          'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency',
                          "Lets this system's recipes charge the world's currency. Configure the coins under World > Currency."
                        )}</small
                      >
                    </div>
                  </div>
                  {#if gatheringFeatureEnabled}
                    <div class="manager-feature-tile" data-feature-key="gatheringRealms">
                      <span
                        class={`manager-feature-tile-icon ${gatheringRealmsEnabled ? 'is-on' : 'is-off'}`}
                        aria-hidden="true"><i class="fas fa-route"></i></span
                      >
                      <div class="manager-feature-tile-body">
                        <div class="manager-feature-tile-head">
                          <strong
                            >{text(
                              'FABRICATE.Admin.Manager.Feature.GatheringRealms',
                              'Travel & Realms'
                            )}</strong
                          >
                          <button
                            type="button"
                            class={`manager-status-toggle ${gatheringRealmsEnabled ? 'is-on' : 'is-off'}`}
                            aria-pressed={gatheringRealmsEnabled}
                            aria-label={text(
                              'FABRICATE.Admin.Manager.Feature.GatheringRealms',
                              'Travel & Realms'
                            )}
                            data-gathering-realm-toggle
                            onclick={handleToggleGatheringRealms}
                          >
                            <span class="manager-status-toggle-track" aria-hidden="true"
                              ><span class="manager-status-toggle-knob"></span></span
                            >
                            <span class="manager-status-toggle-label"
                              >{gatheringRealmsEnabled
                                ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                                : text(
                                    'FABRICATE.Admin.Manager.SystemEdit.FeatureOff',
                                    'Off'
                                  )}</span
                            >
                          </button>
                        </div>
                        <small
                          >{text(
                            'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.GatheringRealms',
                            "Gates this system's environments on where the party is, and gives them realm controls. Realms themselves are authored under World > Travel and shared by every system that turns this on."
                          )}</small
                        >
                      </div>
                    </div>
                  {/if}
                </div>
              </section>
            </form>
          </main>
        {:else if activeTab === 'validation'}
          <SystemOverviewView report={validationReport} {onSelectIssue} />
        {/if}
      </div>
    </div>
  </div>
{/if}
