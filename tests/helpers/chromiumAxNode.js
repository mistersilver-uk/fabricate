/**
 * One element's node in Chromium's own accessibility tree, read over CDP rather than through
 * Playwright's snapshot: its role, name and whether it is ignored, and each descendant the tree
 * does not ignore, in tree order (issues 2856, 2858); `chromiumAxState` reads its role, name and
 * state properties instead (issue 2836).
 */
async function axTreeOf(page, selector, read) {
  const session = await page.context().newCDPSession(page);
  try {
    const expression = `document.querySelector(${JSON.stringify(selector)})`;
    const { result } = await session.send('Runtime.evaluate', { expression });
    const { node } = await session.send('DOM.describeNode', { objectId: result.objectId });
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const own = nodes.find((each) => each.backendDOMNodeId === node.backendNodeId);
    if (!own) throw new Error(`no accessibility node for ${selector}`);
    return read(own, new Map(nodes.map((each) => [each.nodeId, each])));
  } finally {
    await session.detach();
  }
}

const roleAndName = (each) => ({
  role: each.role?.value,
  name: each.name?.value ?? '',
  ignored: each.ignored === true,
});

export function chromiumAxNode(page, selector) {
  return axTreeOf(page, selector, (own, byId) => {
    const below = (each) =>
      (each.childIds ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .flatMap((child) => [child, ...below(child)]);
    return {
      ...roleAndName(own),
      descendants: below(own)
        .filter((each) => !each.ignored)
        .map(roleAndName),
    };
  });
}

/** The node's role and name beside each property the tree states on it, `checked` and `disabled` among them. */
export function chromiumAxState(page, selector) {
  return axTreeOf(page, selector, (own) => ({
    ...roleAndName(own),
    ...Object.fromEntries((own.properties ?? []).map(({ name, value }) => [name, value?.value])),
  }));
}
