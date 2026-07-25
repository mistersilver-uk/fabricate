# Real Browser Pointer Hit-Tests

DOM presence is not enough for overlays, menus, disabled states, card actions, and icon-only controls: CSS stacking, global Foundry styles, or a transparent overlay can swallow the click even though the element exists.
Use browser hit-testing to prove the rendered element actually receives the pointer.

Add these checks inside the Foundry smoke harness (`scripts/foundry-test-run.mjs`), which already drives a real page via Playwright — see `exerciseManagerEnvironmentPointerTargets` in that file for the in-tree usage pattern.
Do not stand up a separate Playwright runner for this.

```javascript
async function assertPointerTarget(page, locator, targetSelector, label) {
  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No pointer box found for ${label}`);

  const hit = await page.evaluate(({ x, y, targetSelector }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName || '',
      className: String(element?.className || ''),
      matched: Boolean(element?.closest?.(targetSelector)),
    };
  }, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    targetSelector,
  });

  if (!hit.matched) {
    throw new Error(
      `${label} pointer target missed ${targetSelector}; ` +
      `hit ${hit.tag || 'none'} ${hit.className}`,
    );
  }
}

await assertPointerTarget(page, page.locator('.card .edit-button').first(), '.edit-button', 'card edit');
```

The failure message names what actually intercepted the point, which is usually the overlay or global style at fault.
When a hit-test fails, inspect stacking context and Foundry's global button/overlay CSS before touching event handlers.
