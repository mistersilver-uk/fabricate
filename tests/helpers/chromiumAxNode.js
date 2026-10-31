/**
 * One element's node in Chromium's own accessibility tree, read over CDP rather than through
 * Playwright's snapshot: its role, name and whether it is ignored, and each descendant the tree
 * does not ignore, in tree order (issues 2856, 2858).
 */
export async function chromiumAxNode(page, selector) {
  const session = await page.context().newCDPSession(page);
  try {
    const expression = `document.querySelector(${JSON.stringify(selector)})`;
    const { result } = await session.send('Runtime.evaluate', { expression });
    const { node } = await session.send('DOM.describeNode', { objectId: result.objectId });
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map((each) => [each.nodeId, each]));
    const below = (each) =>
      (each.childIds ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .flatMap((child) => [child, ...below(child)]);
    const read = (each) => ({
      role: each.role?.value,
      name: each.name?.value ?? '',
      ignored: each.ignored === true,
    });
    const own = nodes.find((each) => each.backendDOMNodeId === node.backendNodeId);
    if (!own) throw new Error(`no accessibility node for ${selector}`);
    return {
      ...read(own),
      descendants: below(own)
        .filter((each) => !each.ignored)
        .map(read),
    };
  } finally {
    await session.detach();
  }
}
