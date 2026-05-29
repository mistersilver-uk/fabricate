function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (collection instanceof Map) return Array.from(collection.values());
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (Array.isArray(collection.contents)) return collection.contents;
  return [];
}

function ownDataValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function sourceObject(document) {
  if (!document || typeof document !== 'object') return null;
  try {
    if (typeof document.toObject === 'function') return document.toObject();
  } catch {
    // Ignore malformed document shims; the runtime fallback below is enough.
  }
  return ownDataValue(document, '_source') || ownDataValue(document, 'source') || null;
}

function backgroundSource(background) {
  if (!background) return '';
  if (typeof background === 'string') return stringValue(background);
  return stringValue(background.src) || stringValue(background.texture?.src);
}

function textureSource(texture) {
  if (!texture) return '';
  if (typeof texture === 'string') return stringValue(texture);
  return stringValue(texture.src) || stringValue(texture.texture?.src);
}

function firstLevelImage(scene) {
  for (const level of collectionValues(scene?.levels)) {
    const background = backgroundSource(level?.background);
    if (background) return background;
    for (const texture of collectionValues(level?.textures)) {
      const src = textureSource(texture);
      if (src) return src;
    }
  }
  return '';
}

function plainSceneImage(scene, source) {
  const ownBackground = ownDataValue(scene, 'background');
  return backgroundSource(ownBackground)
    || stringValue(ownDataValue(scene, 'img'))
    || backgroundSource(source?.background)
    || stringValue(source?.img);
}

export function sceneDocumentImage(scene) {
  const source = sourceObject(scene);
  return firstLevelImage(scene)
    || plainSceneImage(scene, source)
    || stringValue(scene?.thumb)
    || stringValue(scene?.thumbnail)
    || stringValue(source?.thumb)
    || stringValue(source?.thumbnail);
}

export function normalizeSceneOption(scene) {
  const source = sourceObject(scene);
  const thumbnail = stringValue(scene?.thumb)
    || stringValue(scene?.thumbnail)
    || stringValue(source?.thumb)
    || stringValue(source?.thumbnail);
  return {
    uuid: stringValue(scene?.uuid) || stringValue(source?.uuid),
    name: stringValue(scene?.name) || stringValue(source?.name),
    img: sceneDocumentImage(scene),
    thumbnail
  };
}
