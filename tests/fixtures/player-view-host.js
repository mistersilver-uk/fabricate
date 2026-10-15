/**
 * A host the size of the player window's content area, `?width=` wide (1200 by default) and
 * `?height=` tall (820 by default), beside a stand-in nav rail inside a `fabricate fabricate-app`
 * root, so a mounted view's pickers find their portal root. Shared by the `*-view/mount.js`
 * rail-footer fixtures.
 */
export function playerViewHost() {
  const params = new URLSearchParams(location.search);
  const width = Number(params.get('width') ?? 1200);
  const height = Number(params.get('height') ?? 820);
  const root = document.createElement('div');
  root.className = 'fabricate fabricate-app';
  root.style.cssText = `display:flex;width:${width}px;height:${height}px`;
  const rail = document.createElement('nav');
  rail.style.cssText = 'flex:none;width:72px';
  const host = document.createElement('div');
  host.dataset.host = '';
  host.style.cssText = 'flex:1;min-width:0;height:100%';
  root.append(rail, host);
  document.body.append(root);
  return host;
}
