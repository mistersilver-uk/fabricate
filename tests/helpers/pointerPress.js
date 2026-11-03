/**
 * A pointer press as Chromium dispatches it (issue 2879): `mousedown` on `from`, `mouseup` on `to`,
 * then, for the primary button, a `click` on their nearest common ancestor, and an `auxclick` for
 * any other, each with the `detail` of one press. Returns the `mousedown`, so a caller can read
 * whether its default was prevented.
 */
export function pressPointer(from, to = from, { button = 0 } = {}) {
  const { MouseEvent } = from.ownerDocument.defaultView;
  const fire = (node, type) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button,
      detail: 1,
    });
    node.dispatchEvent(event);
    return event;
  };
  const down = fire(from, 'mousedown');
  fire(to, 'mouseup');
  let common = from;
  while (common && !common.contains(to)) common = common.parentNode;
  fire(common ?? to, button === 0 ? 'click' : 'auxclick');
  return down;
}
