<!--
  The Overview tab's Linked scene card, the one place the scene link is authored (issue 1522): a
  Scene drop links or replaces it and the visible Unlink clears it, while the rail only reads it.
  `text(key, fallback)` is the host's localizer.
-->
<script>
  import ItemDropZone from '../../../components/ItemDropZone.svelte';
  import { resolveDropData } from '../../../util/dropUtils.js';
  import { linkedScene } from './linkedScene.svelte.js';

  let { environment = null, text = (_key, fallback) => fallback, onUpdate = () => {} } = $props();

  const title = $derived(
    text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Scene', 'Linked scene')
  );
  const sceneUuid = $derived(String(environment?.sceneUuid || ''));
  const scene = linkedScene(() => sceneUuid);
  // The address never renders: an unresolved scene reads as the card's own title.
  const item = $derived(sceneUuid ? { name: scene.name || title, img: scene.thumb } : null);

  function handleSceneDrop(data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Scene' || !uuid) return;
    onUpdate({ sceneUuid: uuid });
  }
</script>

<section class="manager-environment-card" data-overview-section="scene">
  <h3 class="manager-card-title">{title}</h3>
  <ItemDropZone
    {item}
    documentType="Scene"
    kind="scene"
    emptyIcon={sceneUuid ? 'fas fa-map' : 'fas fa-map-location-dot'}
    title={text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneDropHint',
      'Drag a scene here to link it.'
    )}
    hint={sceneUuid
      ? text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.SceneReplaceHint',
          'Drop another scene here to replace it.'
        )
      : ''}
    unlinkLabel={text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Overview.UnlinkScene',
      'Unlink scene'
    )}
    hookAttrs={{
      root: sceneUuid ? { 'data-overview-scene-linked': '' } : {},
      unlink: { 'data-overview-scene-unlink': '' },
    }}
    onDrop={handleSceneDrop}
    onUnlink={() => onUpdate({ sceneUuid: '' })}
  />
</section>
