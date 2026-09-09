<!-- Svelte 5 runes mode -->
<script>
  import Field from '../../../components/Field.svelte';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import { DEFAULT_GATHERING_ENVIRONMENT_IMG } from '../../../../../gatheringImageDefaults.js';
  import { formatList, localize } from '../../../util/foundryBridge.js';
  import { biomeChipStyle } from '../../../util/gatheringFormat.js';
  import CompositionModeControl from './CompositionModeControl.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';

  let {
    environment = null,
    realmRecords = [],
    realmsEnabled = false,
    biomeOptions = [],
    dangerOptions = [],
    linkedSceneImage = '',
    onPickImagePath = null,
    onUpdate = () => {},
    onSetCompositionMode = () => {},
  } = $props();

  const isSceneLinked = $derived(Boolean(String(environment?.sceneUuid || '').trim()));

  const DANGER_LEVELS = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];
  const DEFAULT_ENVIRONMENT_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function optId(option) {
    return String(option?.id ?? option ?? '').trim();
  }
  function optLabel(option) {
    return String(option?.label ?? option?.id ?? option ?? '').trim();
  }
  function defaultDangerLabel(id) {
    return text(
      `FABRICATE.Admin.Manager.EnvironmentEditor.Events.DangerTag.${id}`,
      id.charAt(0).toUpperCase() + id.slice(1)
    );
  }
  function dangerOption(option) {
    const id = optId(option);
    const label =
      option && typeof option === 'object' && optLabel(option)
        ? optLabel(option)
        : defaultDangerLabel(id);
    return { id, label };
  }

  const biomes = $derived(Array.isArray(environment?.biomes) ? environment.biomes : []);
  const availableBiomes = $derived(
    biomeOptions.filter((option) => !biomes.includes(optId(option)))
  );

  // Realm membership (geography). Mirrors the biome chip control but sourced
  // from the system's GatheringRealm records and gated on the Travel toggle.
  const includedRealmIds = $derived(
    Array.isArray(environment?.includedRealmIds) ? environment.includedRealmIds : []
  );
  const realmOptions = $derived(
    (Array.isArray(realmRecords) ? realmRecords : [])
      .map((realm) => ({
        id: String(realm?.id ?? '').trim(),
        label: String(realm?.name ?? realm?.id ?? '').trim(),
      }))
      .filter((option) => option.id)
  );
  const availableRealms = $derived(
    realmOptions.filter((option) => !includedRealmIds.includes(option.id))
  );

  function realmLabel(id) {
    return optLabel(realmOptions.find((option) => optId(option) === id)) || id;
  }
  function addRealm(event) {
    const id = String(event.currentTarget.value || '').trim();
    event.currentTarget.value = '';
    if (!id) return;
    if (!includedRealmIds.includes(id)) onUpdate({ includedRealmIds: [...includedRealmIds, id] });
  }
  function removeRealm(id) {
    onUpdate({ includedRealmIds: includedRealmIds.filter((value) => value !== id) });
  }
  // ONE live region per host row, and it is the CALLER'S to own: `Chip.svelte`'s `removable`
  // note records that a bare chip cannot have one, because neither adding nor removing a member
  // moves focus into the row, and a region wrapped around the row would read each added chip's
  // whole subtree on an add and say nothing at all on a removal. Restated on every change to
  // the set, through the active language's list conventions, exactly as `ModifierPillSelect`
  // states its own.
  function realmSummary() {
    if (includedRealmIds.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.NoRealms',
        'No realms selected'
      );
    }
    return formatList(includedRealmIds.map((id) => realmLabel(id)));
  }
  const dangerLevelOptions = $derived(
    (Array.isArray(dangerOptions) && dangerOptions.length > 0 ? dangerOptions : DANGER_LEVELS)
      .map(dangerOption)
      .filter((option) => option.id)
  );
  const dangerLevel = $derived(String(environment?.dangerLevel || '').trim() || 'safe');
  const renderedDangerOptions = $derived(
    dangerLevelOptions.some((option) => option.id === dangerLevel)
      ? dangerLevelOptions
      : [{ id: dangerLevel, label: defaultDangerLabel(dangerLevel) }, ...dangerLevelOptions]
  );
  const selectionMode = $derived(environment?.selectionMode === 'blind' ? 'blind' : 'targeted');

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    if (!id) return;
    if (!biomes.includes(id)) onUpdate({ biomes: [...biomes, id] });
    event.currentTarget.value = '';
  }
  function removeBiome(id) {
    onUpdate({ biomes: biomes.filter((value) => value !== id) });
  }
  // The biome row's own region, on the same terms as `realmSummary` above.
  function biomeSummary() {
    if (biomes.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.NoBiomes',
        'No biomes selected'
      );
    }
    return formatList(biomes.map((id) => biomeLabel(id)));
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || isSceneLinked) return;
    const value = await onPickImagePath(environment?.img || DEFAULT_ENVIRONMENT_IMAGE_DIR);
    if (value) onUpdate({ img: value });
  }

  function biomeLabel(id) {
    return optLabel(biomeOptions.find((option) => optId(option) === id)) || id;
  }
  function biomeColorStyle(id) {
    const option = biomeOptions.find((entry) => optId(entry) === id);
    return biomeChipStyle(option);
  }
  // The palette key `Chip`'s `tint` validates, defaulting exactly as `biomeChipStyle` does so
  // the two never disagree about which biome has no authored colour.
  function biomeTintKey(id) {
    const option = biomeOptions.find((entry) => optId(entry) === id);
    return String(option?.colorToken || 'sage');
  }
  function dangerLabel(id) {
    const option = renderedDangerOptions.find((option) => option.id === id);
    return option?.label || defaultDangerLabel(id);
  }
</script>

<section
  class="manager-environment-tab manager-environment-overview"
  data-environment-tab="overview"
  aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Title', 'Overview')}
>
  {#if !environment}
    <p class="manager-muted">
      {text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Empty', 'No environment loaded.')}
    </p>
  {:else}
    <div class="manager-environment-overview-stack">
      <section class="manager-task-core-card" data-overview-section="identity">
        <div class="manager-task-card-heading">
          <div>
            <h3>
              {text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Identity',
                'Environment identity'
              )}
            </h3>
            <p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.IdentityHint',
                'Name the environment, describe it, choose an image, and toggle whether it is active.'
              )}
            </p>
          </div>
        </div>
        <div class="manager-task-core-grid">
          <div class="manager-task-media-column">
            {#if isSceneLinked}
              <span
                class="manager-task-image-picker is-scene-linked"
                data-scene-locked-image
                title={text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneLockedImageTooltip',
                  "This image comes from the linked scene and can't be edited. Unlink the scene to choose a custom image."
                )}
                aria-label={text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneLockedImage',
                  'Image provided by the linked scene'
                )}
              >
                <img
                  src={linkedSceneImage || environment.img || DEFAULT_GATHERING_ENVIRONMENT_IMG}
                  alt=""
                />
                <i class="fas fa-lock" aria-hidden="true"></i>
              </span>
            {:else}
              <button
                type="button"
                class="manager-task-image-picker"
                aria-label={text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ChooseImage',
                  'Choose environment image'
                )}
                onclick={chooseImage}
                disabled={typeof onPickImagePath !== 'function'}
              >
                <img src={environment.img || DEFAULT_GATHERING_ENVIRONMENT_IMG} alt="" />
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
            {/if}
            <div class="manager-task-core-status">
              <StatusToggle
                on={environment.enabled !== false}
                label={environment.enabled === false
                  ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
                  : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                data-environment-field="enabled"
                onclick={() => onUpdate({ enabled: environment.enabled === false })}
              />
              <p class="manager-muted">
                {environment.enabled === false
                  ? text(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.DraftHint',
                      'Hidden from players while off.'
                    )
                  : text(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.ActiveHint',
                      'Available to players while on.'
                    )}
              </p>
            </div>
          </div>
          <div class="manager-task-identity-fields">
            <Field as="label">
              <span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Name', 'Name')}</span>
              <input
                data-environment-field="name"
                value={environment.name || ''}
                oninput={(event) => onUpdate({ name: event.currentTarget.value })}
              />
            </Field>
            <Field as="label">
              <span
                >{text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Description',
                  'Description'
                )}</span
              >
              <textarea
                data-environment-field="description"
                value={environment.description || ''}
                oninput={(event) => onUpdate({ description: event.currentTarget.value })}
              ></textarea>
            </Field>
          </div>
        </div>
      </section>

      <section class="manager-environment-card" data-overview-section="context">
        <h3 class="manager-card-title">
          {text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Context',
            'Environment context'
          )}
        </h3>
        <div class="manager-environment-context-split">
          <div class="fab-stack" data-gap="3">
            {#if realmsEnabled}
              <Field
                as="div"
                class="manager-environment-context-field"
                data-environment-field="includedRealmIds"
              >
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Realms',
                    'Realms'
                  )}</span
                >
                <p class="manager-muted manager-environment-context-hint">
                  {text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RealmsHint',
                    'Which realms this environment belongs to. Players can gather here when their party is in one of these realms.'
                  )}
                </p>
                {#if realmOptions.length === 0}
                  <p
                    class="manager-muted manager-environment-realm-empty"
                    data-environment-realm-empty
                  >
                    {text(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RealmsEmpty',
                      'No realms yet. Create them under World > Travel first \u2014 they are shared by every crafting system.'
                    )}
                  </p>
                {:else}
                  {#if availableRealms.length > 0}
                    <select
                      aria-label={text(
                        'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddRealm',
                        'Add realm'
                      )}
                      onchange={addRealm}
                      data-chip-remove-fallback=""
                    >
                      <option value=""
                        >{text(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddRealm',
                          'Add realm'
                        )}</option
                      >
                      {#each availableRealms as option (optId(option))}
                        <option value={optId(option)}>{optLabel(option)}</option>
                      {/each}
                    </select>
                  {/if}
                  <!-- THE ROW IS THE LAST RUNG OF THE CHIP'S FOCUS LADDER (issue 1515).
                       `Chip` takes the focus destination BEFORE it removes the chip - the next
                       remove control, else the previous one, else the nearest
                       `[data-chip-remove-fallback]` - and the `<select>` above carries that hook
                       only while an unselected realm remains. Remove the LAST chip with every
                       realm already selected and the select is gone, so the ladder ran out and
                       focus fell to `<body>`: the unfocused-window state, with the keyboard user
                       stranded at the top of the document. The row is always rendered inside this
                       branch, so it is the rung that cannot disappear; `tabindex="-1"` is what
                       makes it focusable without adding a tab stop. The select still wins while it
                       exists, because the search runs outwards from the chip and finds both at the
                       same ancestor in document order. -->
                  <div
                    class="manager-chip-row"
                    tabindex="-1"
                    data-keyboard-focus="true"
                    data-chip-remove-fallback=""
                    data-environment-field-pills="includedRealmIds"
                  >
                    {#if includedRealmIds.length > 0}
                      {#each includedRealmIds as id (id)}
                        <Chip
                          tone="info"
                          removable
                          removeLabel={text(
                            'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RemoveRealm',
                            'Remove {name}'
                          ).replace('{name}', realmLabel(id))}
                          onRemove={() => removeRealm(id)}
                          data-environment-realm-pill={id}>{realmLabel(id)}</Chip
                        >
                      {/each}
                    {:else}
                      <!-- THE EMPTY BRANCH OF A CHIP ROW IS THE SHARED NO-STATE PRIMITIVE
                           (issue 1515), in its `inline` one-line form - the same shape the
                           gathering task and event editors already draw beside their own chip
                           rows. A bare `<span class="manager-muted">` painted the sentence from
                           a utility class instead, so this row said "nothing here" in a
                           vocabulary no other empty on the screen uses. `inline`, never `note`:
                           `note` is the popover form and releases the panel entirely. -->
                      <EmptyState
                        inline
                        hint={text(
                          'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.NoRealms',
                          'No realms selected'
                        )}
                      />
                    {/if}
                  </div>
                  <p class="visually-hidden" aria-live="polite" data-environment-realm-status>
                    {realmSummary()}
                  </p>
                {/if}
              </Field>
            {/if}

            <Field as="label" class="manager-environment-context-field">
              <span
                >{text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Danger',
                  'Danger level'
                )}</span
              >
              <p class="manager-muted manager-environment-context-hint">
                {text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.DangerHint',
                  'A ceiling — events up to and including this level can appear.'
                )}
              </p>
              <select
                data-environment-field="dangerLevel"
                value={dangerLevel}
                onchange={(event) => onUpdate({ dangerLevel: event.currentTarget.value })}
              >
                {#each renderedDangerOptions as option (option.id)}
                  <option value={option.id}>{dangerLabel(option.id)}</option>
                {/each}
              </select>
            </Field>
          </div>

          <Field
            as="div"
            class="manager-environment-context-field manager-environment-context-biomes"
          >
            <span
              >{text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Biomes', 'Biomes')}</span
            >
            <p class="manager-muted manager-environment-context-hint">
              {text(
                'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BiomesHint',
                'The terrain here. Tasks and events match if they share one or more biomes.'
              )}
            </p>
            {#if availableBiomes.length > 0}
              <select
                aria-label={text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddBiome',
                  'Add biome'
                )}
                onchange={addBiome}
                data-chip-remove-fallback=""
              >
                <option value=""
                  >{text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.AddBiome',
                    'Add biome'
                  )}</option
                >
                {#each availableBiomes as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            {/if}
            <!-- `tint` AND a `style`, and both are load-bearing (issue 1515). `tint` is what
                 arms the primitive's tinted face; the `style` states the colour that face
                 reads, because a biome may carry an authored HEX rather than a palette key and
                 `Chip`'s validator takes bare `--fab-tag-*` keys only. Both write the SAME
                 custom property the primitive's own tint rides, and the rest spread lands after
                 the primitive's own `style`, so the authored colour is the one that survives. -->
            <!-- The realms row above records why the row itself is the last focus rung. -->
            <div
              class="manager-chip-row"
              tabindex="-1"
              data-keyboard-focus="true"
              data-chip-remove-fallback=""
              data-environment-field="biomes"
            >
              {#if biomes.length > 0}
                {#each biomes as id (id)}
                  <Chip
                    tint={biomeTintKey(id)}
                    style={biomeColorStyle(id)}
                    removable
                    removeLabel={text(
                      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.RemoveBiome',
                      'Remove {name}'
                    ).replace('{name}', biomeLabel(id))}
                    onRemove={() => removeBiome(id)}
                    data-environment-biome-pill={id}>{biomeLabel(id)}</Chip
                  >
                {/each}
              {:else}
                <!-- The realms row's empty branch above records why this is the primitive and
                     not a muted span (issue 1515). -->
                <EmptyState
                  inline
                  hint={text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.NoBiomes',
                    'No biomes selected'
                  )}
                />
              {/if}
            </div>
            <p class="visually-hidden" aria-live="polite" data-environment-biome-status>
              {biomeSummary()}
            </p>
          </Field>
        </div>
      </section>

      <div class="manager-environment-overview-duo">
        <section class="manager-environment-card" data-overview-section="player">
          <h3 class="manager-card-title">
            {text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.PlayerFacing',
              'Player-facing behaviour'
            )}
          </h3>
          <div
            class="manager-environment-mode-control"
            role="radiogroup"
            aria-label={text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SelectionMode',
              'Task selection mode'
            )}
          >
            {#each [['targeted', 'Targeted', 'fas fa-eye'], ['blind', 'Blind', 'fas fa-eye-slash']] as option (option[0])}
              <button
                type="button"
                role="radio"
                class={`manager-environment-mode-option ${selectionMode === option[0] ? 'is-selected' : ''}`}
                aria-checked={selectionMode === option[0]}
                data-selection-mode-option={option[0]}
                onclick={() => onUpdate({ selectionMode: option[0] })}
              >
                <span class="manager-environment-mode-head"
                  ><i class={option[2]} aria-hidden="true"></i><span
                    >{text(
                      `FABRICATE.Admin.Manager.EnvironmentEditor.Overview.${option[1]}`,
                      option[1]
                    )}</span
                  ></span
                >
              </button>
            {/each}
          </div>
          <p class="manager-muted manager-environment-mode-hint">
            {selectionMode === 'blind'
              ? text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.BlindHint',
                  'Players get a generic gather action unless tasks are revealed.'
                )
              : text(
                  'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.TargetedHint',
                  'Players choose a visible task.'
                )}
          </p>
        </section>

        <section class="manager-environment-card" data-overview-section="composition">
          <h3 class="manager-card-title">
            {text(
              'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.CompositionMode',
              'Composition mode'
            )}
          </h3>
          <CompositionModeControl
            mode={environment.compositionMode || 'automatic'}
            onChange={onSetCompositionMode}
          />
        </section>
      </div>
    </div>
  {/if}
</section>
