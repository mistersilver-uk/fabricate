/**
 * A footer note is already its button's accessible name (issue 2007): a `title` equal to an
 * untruncated note makes some assistive tech announce it twice, so a `title` is worth adding only
 * when the one-line ellipsis actually clips the note. This action measures that per note.
 */
export function noteOverflow(node, params) {
  let current = params;
  const measure = () => current.onMeasure(current.key, node.scrollWidth > node.clientWidth + 0.5);
  measure();
  return {
    update(next) {
      current = next;
      measure();
    },
  };
}
