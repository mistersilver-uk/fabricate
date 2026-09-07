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

  TWO FAILURES ARE SURFACED RATHER THAN SWALLOWED (issue 1514), and they are kept
  APART from each other and from the ordinary refusal:

   - the uuid does not resolve. The `.catch` used to leave the cleared placeholder
     standing, which renders a nameless card with a map glyph — indistinguishable
     from a scene that simply has no name yet, and silent about the fact that the
     GM's link is broken.
   - the PERMISSION CHECK ITSELF throws. `playerCanView` returned the same `false`
     for "you may not view this scene" and for "asking the question failed", so a
     broken `testUserPermission` was reported to the player as the GM not having
     activated the scene. It returns a three-outcome result now, and the third
     outcome has its own sentence and its own hook.
-->
<script>
  import { localize, viewScene } from '../../util/foundryBridge.js';
  import { sceneDocumentImage } from '../../util/sceneImages.js';

  let { sceneUuid = '', services = null } = $props();

  let sceneName = $state('');
  let sceneThumb = $state('');
  let canView = $state(false);
  // The scene uuid did not resolve at all.
  let sceneUnresolved = $state(false);
  // The scene resolved and the PERMISSION QUESTION failed, which is not the same thing as
  // being told no.
  let permissionUnknown = $state(false);

  /**
   * Whether this player may view the scene, as THREE outcomes rather than a boolean.
   *
   * `permitted: false, failed: false` is the ordinary refusal — the GM has not shared the
   * scene. `failed: true` is the check itself throwing or being absent, which the caller
   * reports differently, because telling a player to "wait for the GM" when the question was
   * never actually answered sends them to the wrong person.
   *
   * @param {object|null} doc The resolved Scene document.
   * @returns {{ permitted: boolean, failed: boolean }} The outcome.
   */
  function playerCanView(doc) {
    if (typeof doc?.testUserPermission !== 'function') return { permitted: false, failed: true };
    try {
      const user = globalThis.game?.user ?? null;
      const limited = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 'LIMITED';
      return { permitted: doc.testUserPermission(user, limited) === true, failed: false };
    } catch (_err) {
      return { permitted: false, failed: true };
    }
  }

  $effect(() => {
    const uuid = String(sceneUuid || '').trim();
    sceneName = '';
    sceneThumb = '';
    canView = false;
    sceneUnresolved = false;
    permissionUnknown = false;
    if (!uuid || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(uuid))
      .then((doc) => {
        if (cancelled) return;
        if (!doc) {
          // A uuid that resolves to NOTHING is the same broken link as a uuid that throws,
          // and it used to fall through to the cleared placeholder just as quietly.
          sceneUnresolved = true;
          return;
        }
        sceneName = String(doc.name || '');
        sceneThumb = sceneDocumentImage(doc) || '';
        const access = playerCanView(doc);
        canView = access.permitted;
        permissionUnknown = access.failed;
      })
      .catch(() => {
        if (cancelled) return;
        sceneUnresolved = true;
      });
    return () => {
      cancelled = true;
    };
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
  <span class="gathering-linked-scene-thumb-wrap">
    {#if sceneThumb}
      <img class="gathering-linked-scene-thumb" src={sceneThumb} alt="" />
    {:else}
      <span class="gathering-linked-scene-thumb is-fallback" aria-hidden="true">
        <i class="fas fa-map"></i>
      </span>
    {/if}
  </span>

  <span class="gathering-linked-scene-copy">
    <span class="gathering-linked-scene-label">
      <i class="fas fa-location-dot" aria-hidden="true"></i>
      {localize('FABRICATE.App.Gathering.Detail.LinkedSceneHeading')}
    </span>
    {#if sceneUnresolved}
      <span class="gathering-linked-scene-name is-fault" data-gathering-scene-unresolved>
        {localize('FABRICATE.App.Gathering.Detail.SceneUnresolved')}
      </span>
    {:else}
      <span class="gathering-linked-scene-name" title={sceneName}>{sceneName}</span>
    {/if}
  </span>

  {#if canView}
    <button
      type="button"
      class="gathering-linked-scene-visit"
      data-gathering-scene-visit
      onclick={(event) => {
        event.stopPropagation();
        handleView();
      }}
    >
      <i class="fas fa-location-arrow" aria-hidden="true"></i>
      {localize('FABRICATE.App.Gathering.Detail.SceneVisit')}
    </button>
  {:else if permissionUnknown}
    <p class="gathering-linked-scene-wait is-fault" data-gathering-scene-permission-unknown>
      {localize('FABRICATE.App.Gathering.Detail.ScenePermissionUnknown')}
    </p>
  {:else}
    <p class="gathering-linked-scene-wait" data-gathering-scene-wait>
      {localize('FABRICATE.App.Gathering.Detail.SceneWait')}
    </p>
  {/if}
</div>

<style>
  .gathering-linked-scene {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface-soft);
  }

  .gathering-linked-scene-thumb-wrap {
    flex: 0 0 auto;
  }

  .gathering-linked-scene-copy {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .gathering-linked-scene-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--fab-text-muted);
  }

  .gathering-linked-scene-label i {
    font-size: 10px;
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

  /* The two surfaced faults (issue 1514) take the danger ink and nothing else: each replaces a
     line that already exists in the row, so neither adds a box or moves the row's height. */
  .gathering-linked-scene-name.is-fault,
  .gathering-linked-scene-wait.is-fault {
    color: var(--fab-danger-text);
  }

  .gathering-linked-scene-visit {
    flex: 0 0 auto;
    margin-left: auto;
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
    flex: 0 1 auto;
    margin: 0 0 0 auto;
    max-width: 45%;
    text-align: right;
    font-size: 12px;
    color: var(--fab-text-muted);
    font-style: italic;
  }
</style>
