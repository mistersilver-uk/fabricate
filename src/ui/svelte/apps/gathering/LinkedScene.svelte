<!-- Svelte 5 runes mode -->
<!--
  LinkedScene renders the gathering environment's linked scene inside an expanded
  task card: a rectangular scene thumbnail next to the scene name, plus either a
  "View Scene" button (when the player is allowed to navigate there) or a "Wait
  until the GM activates the linked scene" hint.

  Scene display metadata is resolved CLIENT-SIDE from the sceneUuid via Foundry's
  fromUuid() (the engine listing only carries the uuid) using the shared
  sceneDocumentImage helper; navigation uses the shared viewScene() bridge
  (scene.view(), the player-safe call). canView is derived from the scene's
  player permission.
-->
<script>
  import { localize, viewScene } from '../../util/foundryBridge.js';
  import { sceneDocumentImage } from '../../util/sceneImages.js';

  let { sceneUuid = '', services = null } = $props();

  let sceneName = $state('');
  let sceneThumb = $state('');
  let canView = $state(false);
  let resolved = $state(false);

  function playerCanView(doc) {
    try {
      if (typeof doc?.testUserPermission === 'function') {
        const user = globalThis.game?.user ?? null;
        const limited = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 'LIMITED';
        return doc.testUserPermission(user, limited) === true;
      }
    } catch (_err) {
      return false;
    }
    return false;
  }

  $effect(() => {
    const uuid = String(sceneUuid || '').trim();
    sceneName = '';
    sceneThumb = '';
    canView = false;
    resolved = false;
    if (!uuid || typeof globalThis.fromUuid !== 'function') {
      resolved = true;
      return;
    }
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid))
      .then(doc => {
        if (cancelled) return;
        if (doc) {
          sceneName = String(doc.name || '');
          sceneThumb = sceneDocumentImage(doc) || '';
          canView = playerCanView(doc);
        }
        resolved = true;
      })
      .catch(() => {
        if (!cancelled) resolved = true;
      });
    return () => { cancelled = true; };
  });

  async function handleView() {
    const uuid = String(sceneUuid || '').trim();
    if (!uuid) return;
    if (typeof services?.viewScene === 'function') {
      await services.viewScene(uuid);
      return;
    }
    await viewScene(uuid);
  }
</script>

<div class="gathering-linked-scene" data-gathering-scene>
  <div class="gathering-linked-scene-body">
    <span class="gathering-linked-scene-thumb-wrap">
      {#if sceneThumb}
        <img class="gathering-linked-scene-thumb" src={sceneThumb} alt="" />
      {:else}
        <span class="gathering-linked-scene-thumb is-fallback" aria-hidden="true">
          <i class="fas fa-map"></i>
        </span>
      {/if}
    </span>
    <span class="gathering-linked-scene-name" title={sceneName}>
      {sceneName || localize('FABRICATE.App.Gathering.Detail.LinkedSceneHeading')}
    </span>
  </div>

  {#if canView}
    <button type="button" class="gathering-linked-scene-visit" data-gathering-scene-visit onclick={(event) => { event.stopPropagation(); handleView(); }}>
      <i class="fas fa-location-arrow" aria-hidden="true"></i>
      {localize('FABRICATE.App.Gathering.Detail.SceneVisit')}
    </button>
  {:else}
    <p class="gathering-linked-scene-wait" data-gathering-scene-wait>
      {localize('FABRICATE.App.Gathering.Detail.SceneWait')}
    </p>
  {/if}
</div>

<style>
  .gathering-linked-scene {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .gathering-linked-scene-body {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .gathering-linked-scene-thumb-wrap {
    flex: 0 0 auto;
  }

  .gathering-linked-scene-thumb {
    display: block;
    width: 84px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--fab-surface-raised);
  }

  .gathering-linked-scene-thumb.is-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fab-text-muted);
  }

  .gathering-linked-scene-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .gathering-linked-scene-visit {
    align-self: flex-start;
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .gathering-linked-scene-visit:hover {
    border-color: var(--fab-accent);
  }

  .gathering-linked-scene-visit:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .gathering-linked-scene-wait {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
    font-style: italic;
  }
</style>
