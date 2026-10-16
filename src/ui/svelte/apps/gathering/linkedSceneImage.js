import { sceneDocumentImage } from '../../util/sceneImages.js';

/**
 * Report an environment's linked scene image to `onImage`: `''` at once, then the image
 * `resolveUuid` resolves. Returns the cancel function an `$effect` returns, so a lookup for a
 * superseded uuid never lands. The environment card and the centre header both draw from it.
 */
export function watchSceneImage(sceneUuid, onImage, resolveUuid = globalThis.fromUuid) {
  onImage('');
  const uuid = String(sceneUuid ?? '').trim();
  if (!uuid || typeof resolveUuid !== 'function') return () => {};
  let cancelled = false;
  Promise.resolve(resolveUuid(uuid))
    .then((doc) => {
      if (!cancelled && doc) onImage(sceneDocumentImage(doc) || '');
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}
