<!-- Svelte 5 runes mode -->
<!--
  The "Preview as" character picker: the shipped `SearchablePopover` over the world's player
  characters, led by an explicit "No actor" option, each actor shown by portrait. The Checks Studio's
  rail and the salvage and gathering-task check overrides render this one control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `actors` | `[{ id, name, img }]` | `[]` | The roster, already filtered to player characters by `listPreviewActors`. |
  | `value` | actor id \| `NO_ACTOR_ID` | `NO_ACTOR_ID` | The chosen character. |
  | `triggerData` | attribute bag | `{ 'data-checks-preview-actor': '' }` | The trigger's hook; the default is the Studio's, which suites and View Lab cases address. |

  Callbacks:
  - `onChoose(id)` — the chosen actor id, or `NO_ACTOR_ID` for "No actor".
-->
<script>
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { NO_ACTOR_ID } from './previewActorId.js';

  let {
    actors = [],
    value = NO_ACTOR_ID,
    triggerData = { 'data-checks-preview-actor': '' },
    onChoose = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const noActorLabel = text('FABRICATE.Admin.Manager.Checks.PreviewAs.NoActor', 'No actor');
  const actorLabel = text('FABRICATE.Admin.Manager.Checks.PreviewAs.Actor', 'Preview as actor');
  const selected = $derived(
    value === NO_ACTOR_ID ? null : (actors.find((actor) => actor.id === value) ?? null)
  );
  // "No actor" LEADS and is a real option rather than a search's empty state, with its own
  // `data-popover-option` handle.
  const options = $derived([
    { id: NO_ACTOR_ID, label: noActorLabel, icon: 'fas fa-user-slash', dataId: 'no-actor' },
    ...actors.map((actor) => ({
      id: actor.id,
      label: actor.name,
      icon: 'fas fa-user',
      img: actor.img || '',
      dataId: actor.id,
    })),
  ]);
</script>

<SearchablePopover
  {value}
  {options}
  pickerClass="manager-checks-preview-actor"
  triggerClass="fabricate-button manager-button manager-travel-picker-trigger manager-checks-preview-actor-trigger"
  {triggerData}
  triggerIcon={selected ? '' : 'fas fa-user-slash'}
  triggerImg={selected?.img || ''}
  triggerLabel={selected?.name || noActorLabel}
  triggerAriaLabel={actorLabel}
  dialogAriaLabel={actorLabel}
  searchPlaceholder={text(
    'FABRICATE.Admin.Manager.Checks.PreviewAs.ActorSearchPlaceholder',
    'Search characters...'
  )}
  searchAriaLabel={text(
    'FABRICATE.Admin.Manager.Checks.PreviewAs.ActorSearchLabel',
    'Search characters'
  )}
  emptyHint={text(
    'FABRICATE.Admin.Manager.Checks.PreviewAs.NoActorMatches',
    'No characters match your search.'
  )}
  onChoose={(id) => onChoose(id)}
/>
