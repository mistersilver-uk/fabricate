/**
 * The View Lab case step runner, shared by the capture driver (`scripts/view-lab-screenshots.mjs`)
 * and the rendered suites that drive a case to its view state, so both run one set of semantics.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The click modifiers Playwright accepts. */
export const CLICK_MODIFIERS = ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'];
export const PRESS_KEYS = [
  'ArrowDown',
  'ArrowRight',
  'ArrowUp',
  'ContextMenu',
  'Enter',
  'Space',
  'Tab',
];

/** The verbs a `modifiers` step may not carry. */
export const MODIFIER_INCOMPATIBLE_VERBS = ['select', 'fill', 'upload', 'scroll', 'press'];

const RAIL_SELECTOR = '.manager-nav-button';

/**
 * Drive a case to its named view state. A `{selector}` step acts on a stable element; a string
 * step clicks the rail entry its label names. `scratch` is the directory an `upload` step writes
 * its payload to, and an `upload` without one throws.
 */
export async function runCaseSteps(page, steps, { label, scratch } = {}) {
  for (const step of steps) {
    if (typeof step === 'object') await runSelectorStep(page, step, label, scratch);
    else await clickRailEntry(page, step, label);
    await page.evaluate(() => globalThis.__FABRICATE_VIEW__.settle());
  }
}

async function runSelectorStep(page, step, label, scratch) {
  const element = page.locator(step.selector);
  if ((await element.count()) === 0) {
    throw new Error(
      `${label}: nothing matches "${step.selector}" — the case cannot reach its view state`
    );
  }
  const target = element.first();
  const modifiers = 'modifiers' in step ? [step.modifiers].flat() : null;
  if (modifiers) assertClickModifiers(step, modifiers, label);

  if ('select' in step) {
    await target.selectOption(step.select);
  } else if ('fill' in step) {
    // The only route to a dirty form: `data-system-details-dirty` appears on an `input` event.
    await target.fill(step.fill);
  } else if ('upload' in step) {
    if (!scratch) {
      throw new Error(
        `${label}: step for "${step.selector}" uploads a file, and no scratch directory was given`
      );
    }
    const payload = join(scratch, `${label}.json`);
    writeFileSync(payload, step.upload);
    await target.setInputFiles(payload);
  } else if (step.scroll) {
    await target.scrollIntoViewIfNeeded();
  } else if ('press' in step) {
    if (!PRESS_KEYS.includes(step.press)) {
      throw new Error(
        `${label}: step for "${step.selector}" names unknown key ${JSON.stringify(step.press)} — ` +
          `press accepts ${PRESS_KEYS.join(', ')}`
      );
    }
    await target.press(step.press);
  } else {
    await target.click(modifiers ? { modifiers } : {});
  }
}

/**
 * A modifier changes how the default click runs; paired with any other verb it would be dropped
 * silently and the case would publish a frame of the unmodified state under its own name.
 */
function assertClickModifiers(step, modifiers, label) {
  const paired = MODIFIER_INCOMPATIBLE_VERBS.filter((verb) => verb in step);
  if (paired.length > 0) {
    throw new Error(
      `${label}: step for "${step.selector}" pairs \`modifiers\` with \`${paired.join('`, `')}\` — ` +
        `a modifier only applies to a click, so it would be silently dropped and the case ` +
        `would publish a frame of the unmodified state. Split it into two steps.`
    );
  }
  const unknown = modifiers.filter((name) => !CLICK_MODIFIERS.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `${label}: step for "${step.selector}" names unknown modifier(s) ` +
        `${unknown.map((name) => JSON.stringify(name)).join(', ')} — ` +
        `Playwright accepts ${CLICK_MODIFIERS.join(', ')}`
    );
  }
}

/** Scoped to the rail and anchored at the label's start, ending at whitespace or the label's end. */
async function clickRailEntry(page, name, label) {
  const matches = page
    .locator(RAIL_SELECTOR)
    .filter({ hasText: new RegExp(String.raw`^\s*${escapeForRegExp(name)}(\s|$)`) });
  if ((await matches.count()) === 0) {
    const available = await page.locator(RAIL_SELECTOR).allInnerTexts();
    throw new Error(
      `${label}: no "${RAIL_SELECTOR}" element labelled "${name}" — the case cannot reach its view state.\n` +
        `  available: ${available.map((text) => JSON.stringify(text.replaceAll(/\s+/g, ' ').trim())).join(', ')}`
    );
  }
  await matches.first().click();
}

function escapeForRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
