/**
 * The page operations Phase E's chat card cases share (issues 2005 and 2006): seed a one-recipe
 * forge, rewrite its check per case, craft interactively, answer the prompt with a public roll,
 * and collect exactly the messages that craft created.
 */

import { chooseSelectOption } from './selectControl.mjs';

export const ROLL_PROMPT = '.manager-modal[data-roll-prompt]';

/**
 * Close every standing roll prompt through its own close control. Never Escape: with focus on the
 * page body Foundry answers it by opening its main menu over the next prompt. The click is the
 * DOM's own, because a prompt a failed case abandoned is the one Playwright could not act on, and
 * teardown must not depend on the actionability that just failed.
 */
export async function dismissStandingPrompts(page) {
  await page.evaluate((selector) => {
    for (const close of document.querySelectorAll(`${selector} [data-manager-modal-close]`)) {
      close.click();
    }
  }, ROLL_PROMPT);
}

/**
 * What a standing prompt looks like to the page when Playwright cannot act on it: how many stand,
 * where each is hosted, whether its box moves across frames, what covers its centre, and any
 * disabling ancestor. Diagnostic only; it never throws.
 */
export async function describeStandingPrompts(page) {
  return await page
    .evaluate(async (selector) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const prompts = [...document.querySelectorAll(selector)];
      const boxes = [];
      for (let sample = 0; sample < 4 && prompts.length > 0; sample += 1) {
        const { x, y, width, height } = prompts.at(-1).getBoundingClientRect();
        boxes.push([x, y, width, height].map(Math.round).join(','));
        await frame();
      }
      return {
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        boxes,
        prompts: prompts.map((prompt) => {
          const { x, y, width, height } = prompt.getBoundingClientRect();
          const top = document.elementFromPoint(x + width / 2, y + height / 2);
          const style = getComputedStyle(prompt);
          return {
            host: prompt.closest('.application')?.id || prompt.parentElement?.className || null,
            disabledBy: prompt
              .closest('[aria-disabled="true"], [inert], fieldset[disabled]')
              ?.outerHTML?.slice(0, 120),
            coveredBy: prompt.contains(top) ? null : (top?.outerHTML?.slice(0, 120) ?? null),
            animation: style.animationName,
            transition: style.transitionProperty,
          };
        }),
      };
    }, ROLL_PROMPT)
    .catch((error) => ({ unreadable: error.message }));
}

/** Close every standing prompt and resolve once none is left, so the next prompt is one craft's. */
export async function clearStandingPrompts(page, timeout = 30_000) {
  await dismissStandingPrompts(page);
  try {
    await page.locator(ROLL_PROMPT).first().waitFor({ state: 'detached', timeout });
  } catch (error) {
    const seen = JSON.stringify(await describeStandingPrompts(page));
    throw new Error(`a dismissed prompt still stands. The page saw: ${seen}`, { cause: error });
  }
}

/**
 * End a craft a failed case abandoned: dismiss its prompt whenever one shows, until the craft
 * itself settles, so a prompt that mounts late can never answer the next case's craft.
 */
export async function abandonCraft(page, crafted, timeout = 60_000) {
  let settled = false;
  const done = crafted.then(
    () => (settled = true),
    () => (settled = true)
  );
  const deadline = Date.now() + timeout;
  while (!settled && Date.now() < deadline) {
    const shown = page
      .locator(ROLL_PROMPT)
      .first()
      .waitFor({ state: 'visible', timeout: Math.max(deadline - Date.now(), 1) });
    await Promise.race([done, shown.catch(() => {})]);
    await clearStandingPrompts(page).catch(() => {});
  }
}

/**
 * Seed a forge: its token and charm, a one-token recipe whose one result group is named `group`,
 * and `crafts` tokens on the crafter. Returns `{ systemId, recipeId, recipeName, itemIds }`.
 */
export async function seedChatCardForge(page, crafterId, forge) {
  return await page.evaluate(
    async ({ crafterId, forge }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const rm = game.fabricate.getRecipeManager();
      const crafter = game.actors.get(crafterId);
      const types = [...(game.documentTypes?.Item ?? [])];
      const type = types.includes('loot') ? 'loot' : types[0] || 'loot';
      const [token, charm] = await Item.createDocuments([
        { name: forge.tokenName, type, img: 'icons/commodities/gems/gem-fragments-red.webp' },
        {
          name: forge.charmName,
          type,
          img: 'icons/equipment/neck/amulet-round-engraved-gold.webp',
        },
      ]);
      const system = await csm.createSystem({ name: forge.name, description: forge.description });
      const tokenId = (await csm.addItemFromUuid(system.id, token.uuid)).item.id;
      const charmId = (await csm.addItemFromUuid(system.id, charm.uuid)).item.id;
      await csm.updateSystem(system.id, { resolutionMode: 'simple' });
      const recipe = await rm.createRecipe({
        name: forge.charmName,
        description: 'One token, made into a charm.',
        craftingSystemId: system.id,
        img: charm.img,
        ingredientSets: [
          {
            ingredientGroups: [
              {
                name: 'Token',
                options: [{ quantity: 1, match: { type: 'component', componentId: tokenId } }],
              },
            ],
          },
        ],
        resultGroups: [
          {
            name: forge.group ?? 'Charm',
            ...(forge.outcomeIds && { checkOutcomeIds: forge.outcomeIds }),
            results: [{ componentId: charmId, quantity: 1 }],
          },
        ],
      });
      const copy = { name: token.name, type: token.type, img: token.img };
      await crafter.createEmbeddedDocuments(
        'Item',
        Array.from({ length: forge.crafts }, () => ({
          ...copy,
          flags: { core: { sourceId: token.uuid } },
        }))
      );
      return {
        systemId: system.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
        itemIds: [token.id, charm.id],
      };
    },
    { crafterId, forge }
  );
}

/** Rewrite the forge's check so the next craft rolls one case: `check` lands in `slot`. */
export async function writeCaseCheck(
  page,
  systemId,
  { check, slot = 'simple', resolutionMode = 'simple' }
) {
  await page.evaluate(
    async ({ systemId, check, slot, resolutionMode }) => {
      const csm = game.fabricate.getCraftingSystemManager();
      const system = csm.getSystem(systemId);
      await csm.updateSystem(systemId, {
        resolutionMode,
        craftingCheck: {
          ...system.craftingCheck,
          enabled: true,
          defaultModifierIds: [],
          [slot]: { ...system.craftingCheck?.[slot], ...check },
        },
      });
    },
    { systemId, check, slot, resolutionMode }
  );
}

/**
 * Craft interactively and resolve with the messages that craft created: each one's id, content,
 * first Roll (`roll`) and every Roll (`rolls`, `{ className, formula, total, results }`). It
 * settles only once the prompt is answered, so it is started unawaited. `result` is the craft's
 * own answer.
 */
export function craftAndCollect(page, { recipeId, crafterId }) {
  return page.evaluate(
    async ({ recipeId, crafterId }) => {
      const before = new Set(game.messages.contents.map((message) => message.id));
      const crafter = game.actors.get(crafterId);
      const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
      const answer = await game.fabricate.craft(crafter, recipe, {
        interactive: true,
        componentSourceActors: [crafter],
      });
      const created = () => game.messages.contents.filter((message) => !before.has(message.id));
      const pause = () => new Promise((resolve) => setTimeout(resolve, 250));
      // The card and its roll post in either order, so wait for the card and then for the created
      // messages to hold still for a second. A refusal posts nothing and never will, so it gets
      // the short deadline; the public craft refuses with `success: false` and no `misconfigured`
      // flag (issue 2005's versioned lifecycle), so key on the answer's success, not that flag.
      const deadline = Date.now() + (answer?.success === false ? 3000 : 10_000);
      while (created().every((m) => !m.content?.includes('fabricate-craft-chat'))) {
        if (Date.now() > deadline) break;
        await pause();
      }
      let settled = 0;
      for (let seen = created().length; settled < 4 && Date.now() < deadline; ) {
        await pause();
        const now = created().length;
        settled = now === seen ? settled + 1 : 0;
        seen = now;
      }
      const rollOf = (roll) => ({
        className: roll.constructor?.name ?? null,
        formula: roll.formula ?? null,
        total: roll.total ?? null,
        results: (roll.dice?.[0]?.results ?? []).map(
          ({ result, active, success, failure, exploded }) => ({
            result,
            active,
            success,
            failure,
            exploded,
          })
        ),
      });
      const messages = created().map((message) => {
        const rolls = (message.rolls ?? []).map(rollOf);
        return {
          id: message.id,
          content: String(message.content ?? ''),
          roll: rolls[0] ?? null,
          rolls,
        };
      });
      return {
        messages,
        result: {
          success: answer?.success ?? null,
          misconfigured: answer?.misconfigured === true,
          reason: answer?.reason ?? null,
          data: answer?.data ?? null,
          message: answer?.message ?? null,
        },
      };
    },
    { recipeId, crafterId }
  );
}

/** `promise`, or a rejection naming `what` once `ms` pass, so an unanswered prompt cannot hang. */
export function withinTime(promise, ms, what) {
  let timer;
  const expiry = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} within ${ms}ms`)), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Answer the prompt with a public roll, since only a public card states its evidence, first
 * typing `bonus` into the situational-bonus field when one is given. `choice` picks the footer
 * button by its `data-action` (issue 2007's `advantage`/`disadvantage`/`normal`/`roll`); the
 * default finds the one submit button, whichever of those it is labelled.
 */
export async function rollPublicly(page, { bonus = '', choice = null } = {}) {
  const prompt = page.locator(ROLL_PROMPT).last();
  await prompt.waitFor({ state: 'visible', timeout: 15_000 });
  try {
    if (bonus) await prompt.locator('input[name="situationalBonus"]').fill(bonus);
    await chooseSelectOption(page, prompt.locator('.mode-field .fabricate-select-trigger'), {
      value: 'publicroll',
    });
    const button = choice
      ? prompt.locator(`button[data-action="${choice}"]`)
      : prompt.locator('button[type="submit"]');
    await button.click();
  } catch (error) {
    const seen = JSON.stringify(await describeStandingPrompts(page));
    throw new Error(`${error.message.split('\n', 1)[0]} The page saw: ${seen}`, { cause: error });
  }
  await prompt.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

/**
 * The rolls the messages `messageIds` name actually carry, read back through `game.messages.get`
 * (which reconstructs each via `Roll.fromData`) rather than the live objects `craftAndCollect`
 * captured — issue 2007's proof that the round trip preserves the keep transform's formula and
 * dice, and issue 1516's that a rolled amount's total survives it.
 */
export async function readBackAllRolls(page, messageIds) {
  return await page.evaluate(
    (ids) =>
      ids.flatMap((id) =>
        (game.messages.get(id)?.rolls ?? []).map((roll) => ({
          className: roll.constructor?.name ?? null,
          formula: roll.formula ?? null,
          total: roll.total ?? null,
          results: (roll.dice?.[0]?.results ?? []).map(({ result, active }) => ({
            result,
            active: active !== false,
          })),
        }))
      ),
    messageIds
  );
}

/** Show the chat log with `messageId` in view; resolves to the sidebar's clip for a frame. */
export async function showChatMessage(page, messageId) {
  await page
    .locator('#sidebar [data-tab="chat"]')
    .first()
    .click({ force: true })
    .catch(() => {});
  const card = page.locator(`[data-message-id="${messageId}"]`).last();
  await card.waitFor({ state: 'visible', timeout: 10_000 });
  await card.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  const box = await page.locator('#sidebar').first().boundingBox();
  return box ? { clip: box } : {};
}
