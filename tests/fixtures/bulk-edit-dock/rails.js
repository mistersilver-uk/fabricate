/**
 * The two scrollers the bulk dock ships in, as the manager markup a probe mounts into (issue 2500):
 * the system `.manager-inspector` aside, or a world catalogue's flush bulk scroller inside the
 * frame's 340px inspector column. `scope` is `EntityListInspectorFrame`'s Svelte hash class, so the
 * frame's own scoped rules style the world skeleton; `[data-probe-inspector]` is the scroller.
 */
export function railMarkup({ frame = 'system', view = '', scope = '', height, content = '' }) {
  const world = frame === 'world';
  const rail = world
    ? `<div style="display:grid;width:340px;height:${height}px">` +
      `<aside class="manager-scoped-list-inspector ${scope}" data-probe-column>` +
      `<div class="manager-scoped-list-inspector-scroll is-flush-bulk ${scope}" data-probe-inspector>` +
      `${content}</div></aside></div>`
    : '<div></div><div></div><div class="manager-body"><div class="manager-rail"></div>' +
      `<div class="manager-main"></div><aside class="manager-inspector" data-probe-inspector>${content}</aside></div>`;
  const managerView = view || (world ? 'world-components' : 'components');
  return (
    `<div class="fabricate fabricate-manager" data-fabricate-theme="dark" data-manager-view="${managerView}">` +
    `${rail}</div>`
  );
}
