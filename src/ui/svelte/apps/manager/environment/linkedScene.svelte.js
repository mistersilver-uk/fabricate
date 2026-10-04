import { sceneDocumentImage } from '../../../util/sceneImages.js';

/**
 * The linked scene's name and thumbnail, resolved from `uuid()` through core `fromUuid`, which the
 * Overview's Linked scene card and the rail's summary both read (issue 1522). `missing` is true once
 * the resolution settles with no document. Call it while a component initialises: the resolution
 * is that component's effect, and a stale answer is dropped.
 */
export function linkedScene(uuid) {
  let sceneThumb = $state('');
  let sceneName = $state('');
  let sceneMissing = $state(false);
  $effect(() => {
    const value = uuid();
    sceneThumb = '';
    sceneName = '';
    sceneMissing = false;
    if (!value || typeof globalThis.fromUuid !== 'function') return;
    let cancelled = false;
    Promise.resolve(globalThis.fromUuid(value))
      .then((doc) => {
        if (cancelled) return;
        sceneMissing = !doc;
        sceneName = String(doc?.name || '');
        sceneThumb = doc ? sceneDocumentImage(doc) : '';
      })
      .catch(() => {
        if (!cancelled) sceneMissing = true;
      });
    return () => {
      cancelled = true;
    };
  });
  return {
    get thumb() {
      return sceneThumb;
    },
    get name() {
      return sceneName;
    },
    get missing() {
      return sceneMissing;
    },
  };
}
