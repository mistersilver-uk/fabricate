/** Drives the shared `<Select>` trigger and its popover rows; shared by page-ops modules that must not import each other. */

/** Issue 1504 — choose an option from a shared `<Select>`, the way a GM does. */
export async function chooseSelectOption(page, trigger, option) {
  // Naming neither row is A caller's defect, and it is refused here rather than carried into
  // Playwright.
  if (option.value === undefined && !Number.isInteger(option.index)) {
    throw new Error(
      'chooseSelectOption was given neither a `value` nor an integer `index`, so it names no row. ' +
        'Address the row by its own `data-popover-option` handle, or positionally by index.'
    );
  }
  await trigger.waitFor({ state: 'visible', timeout: 5000 });
  await trigger.click();
  // `.first()` is safe though it is not bound to this trigger the way `select-control.js` is:
  // the click above fires `dismissOnOutsideClick`, so any other panel is already shut.
  const panel = page.locator('.fabricate-select-popover').first();
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  if (option.value !== undefined) {
    const row = panel.locator(`[data-popover-option="${option.value}"]`).first();
    await row.waitFor({ state: 'visible', timeout: 5000 });
    await row.click();
    return;
  }
  const rows = panel.locator('[role="option"]');
  const count = await rows.count();
  if (count <= option.index) {
    throw new Error(
      `The option list rendered ${count} row(s); index ${option.index} was asked for. A positional ` +
        'choice here means the world authored no vocabulary for this axis, not that the control broke.'
    );
  }
  await rows.nth(option.index).click();
}
